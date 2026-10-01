'use server'

import { createHash } from "node:crypto"
import { and, count, eq, inArray, or } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  account,
  developmentAssignments,
  developments,
  members,
  organizationInvitations,
  organizations,
  session,
  user,
} from "@/lib/db/schema"
import { recordAudit, requirePlatformManager } from "@/lib/organization"

const hashToken=(token:string)=>createHash("sha256").update(token).digest("hex")

export type ManagerActionResult<T=undefined>=
  | {ok:true;message:string;data?:T}
  | {ok:false;message:string}

function failure(error:unknown,fallback:string):ManagerActionResult{
  return {ok:false,message:error instanceof Error&&error.message?error.message:fallback}
}

async function ensureDevelopmentSelection(organizationId:string,developmentIds:string[]){
  const unique=[...new Set(developmentIds.filter(Boolean))]
  if(!unique.length)throw new Error("Selecione ao menos um empreendimento para o Construtor")
  const rows=await db.select({id:developments.id}).from(developments)
    .where(and(eq(developments.organizationId,organizationId),inArray(developments.id,unique)))
  if(rows.length!==unique.length)throw new Error("Um ou mais empreendimentos selecionados não pertencem à construtora")
  return unique
}

async function setAssignments(organizationId:string,memberId:string,role:"admin"|"editor",developmentIds:string[]){
  await db.delete(developmentAssignments).where(and(
    eq(developmentAssignments.organizationId,organizationId),
    eq(developmentAssignments.memberId,memberId),
  ))
  if(role==="admin")return
  const selected=await ensureDevelopmentSelection(organizationId,developmentIds)
  await db.insert(developmentAssignments).values(selected.map(developmentId=>({
    id:crypto.randomUUID(),
    organizationId,
    developmentId,
    memberId,
    role:"editor",
  })))
}

async function ensureAdministratorCoverage(memberId:string,organizationId:string,nextRole?:string,nextDisabled=false){
  const target=await db.select({role:members.role,status:members.status}).from(members)
    .where(and(eq(members.id,memberId),eq(members.organizationId,organizationId))).limit(1)
  if(!target[0])throw new Error("Usuário não encontrado")
  if(!["owner","admin"].includes(target[0].role)||target[0].status!=="active")return
  const losingAdmin=(nextRole!==undefined&&!["owner","admin"].includes(nextRole))||nextDisabled
  if(!losingAdmin)return
  const roster=await db.select({role:members.role,status:members.status,accessStatus:user.accessStatus})
    .from(members).innerJoin(user,eq(members.userId,user.id))
    .where(eq(members.organizationId,organizationId))
  const activeAdmins=roster.filter(item=>["owner","admin"].includes(item.role)&&item.status==="active"&&item.accessStatus==="active").length
  if(activeAdmins<=1)throw new Error("Cadastre ou habilite outro Administrador antes de remover o último acesso administrativo")
}

export async function listManagedOrganizations(){
  const manager=await requirePlatformManager()
  const [companies,roster,projects,grants]=await Promise.all([
    db.select().from(organizations),
    db.select({
      id:members.id,
      organizationId:members.organizationId,
      userId:members.userId,
      role:members.role,
      status:members.status,
      lastAccessAt:members.lastAccessAt,
      name:user.name,
      email:user.email,
      jobTitle:user.jobTitle,
      whatsapp:user.whatsapp,
      accessStatus:user.accessStatus,
    }).from(members).innerJoin(user,eq(members.userId,user.id)),
    db.select({id:developments.id,organizationId:developments.organizationId,name:developments.name}).from(developments),
    db.select({memberId:developmentAssignments.memberId,developmentId:developmentAssignments.developmentId}).from(developmentAssignments),
  ])
  return companies.map(company=>({
    id:company.id,
    name:company.name,
    logo:company.logo,
    members:roster
      .filter(person=>person.organizationId===company.id && !(person.userId===manager.user.id&&person.role==="owner"))
      .map(person=>({...person,assignments:grants.filter(grant=>grant.memberId===person.id).map(grant=>grant.developmentId)})),
    developments:projects.filter(project=>project.organizationId===company.id).map(({id,name})=>({id,name})),
  }))
}

export async function createManagedOrganization(input:{name:string}):Promise<ManagerActionResult<{id:string}>>{
  try{
    const context=await requirePlatformManager()
    const name=input.name.trim()
    if(name.length<2)throw new Error("Informe o nome da construtora")
    const id=crypto.randomUUID()
    const slug=`${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"")}-${id.slice(0,8)}`
    await db.insert(organizations).values({id,name,slug,metadata:JSON.stringify({
      initials:name.split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase(),
      primaryColor:"#2563eb",
    })})
    await recordAudit({organizationId:id,actorId:context.user.id,action:"manager.organization_created",entityType:"organization",entityId:id,metadata:{name}})
    revalidatePath("/gerenciador")
    return {ok:true,message:"Construtora cadastrada com sucesso.",data:{id}}
  }catch(error){return failure(error,"Não foi possível cadastrar a construtora")}
}

export async function createManagerAccess(input:{
  organizationId:string
  name:string
  email:string
  role:"admin"|"editor"
  developmentIds:string[]
}):Promise<ManagerActionResult<{mode:"linked"|"invited";path?:string}>>{
  try{
    const context=await requirePlatformManager()
    const email=input.email.trim().toLowerCase()
    const name=input.name.trim()
    if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Informe nome e e-mail válidos")
    const company=(await db.select({id:organizations.id}).from(organizations).where(eq(organizations.id,input.organizationId)).limit(1))[0]
    if(!company)throw new Error("Construtora não encontrada")
    const selected=input.role==="editor"?await ensureDevelopmentSelection(input.organizationId,input.developmentIds):[]

    const existing=(await db.select({
      userId:user.id,
      memberId:members.id,
    }).from(user)
      .leftJoin(members,and(eq(members.userId,user.id),eq(members.organizationId,input.organizationId)))
      .where(eq(user.email,email)).limit(1))[0]

    if(existing?.userId){
      await db.update(user).set({accessStatus:"active",updatedAt:new Date()}).where(eq(user.id,existing.userId))
      const memberId=existing.memberId??crypto.randomUUID()
      if(existing.memberId){
        await ensureAdministratorCoverage(memberId,input.organizationId,input.role,false)
        await db.update(members).set({role:input.role,status:"active",lastAccessAt:new Date()}).where(eq(members.id,memberId))
      }else{
        await db.insert(members).values({id:memberId,organizationId:input.organizationId,userId:existing.userId,role:input.role,status:"active",lastAccessAt:new Date()})
      }
      await setAssignments(input.organizationId,memberId,input.role,selected)
      await recordAudit({
        organizationId:input.organizationId,actorId:context.user.id,
        action:"manager.access_linked",entityType:"member",entityId:memberId,
        metadata:{email,role:input.role,developmentIds:selected},
      })
      revalidatePath("/gerenciador")
      return {ok:true,message:"Acesso vinculado e habilitado com sucesso.",data:{mode:"linked"}}
    }

    await db.update(organizationInvitations).set({status:"canceled",canceledAt:new Date()}).where(and(
      eq(organizationInvitations.organizationId,input.organizationId),
      eq(organizationInvitations.email,email),
      eq(organizationInvitations.status,"pending"),
    ))
    const token=crypto.randomUUID()
    await db.insert(organizationInvitations).values({
      id:crypto.randomUUID(),
      organizationId:input.organizationId,
      email,
      name,
      role:input.role,
      developmentIds:selected,
      tokenHash:hashToken(token),
      expiresAt:new Date(Date.now()+7*24*60*60*1000),
      invitedBy:context.user.id,
    })
    await recordAudit({
      organizationId:input.organizationId,actorId:context.user.id,
      action:"manager.access_invited",entityType:"invitation",entityId:hashToken(token),
      metadata:{email,role:input.role,developmentIds:selected},
    })
    revalidatePath("/gerenciador")
    return {ok:true,message:"Convite de acesso criado com sucesso.",data:{mode:"invited",path:"/convite/"+token}}
  }catch(error){return failure(error,"Não foi possível criar o acesso")}
}

export async function managerUpdateMemberAccess(input:{
  organizationId:string
  memberId:string
  role:"admin"|"editor"
  developmentIds:string[]
}):Promise<ManagerActionResult>{
  try{
    const context=await requirePlatformManager()
    const person=(await db.select({id:members.id}).from(members)
      .where(and(eq(members.id,input.memberId),eq(members.organizationId,input.organizationId))).limit(1))[0]
    if(!person)throw new Error("Usuário não encontrado")
    await ensureAdministratorCoverage(input.memberId,input.organizationId,input.role,false)
    const selected=input.role==="editor"?await ensureDevelopmentSelection(input.organizationId,input.developmentIds):[]
    await db.update(members).set({role:input.role,status:"active"}).where(eq(members.id,input.memberId))
    await setAssignments(input.organizationId,input.memberId,input.role,selected)
    await recordAudit({
      organizationId:input.organizationId,actorId:context.user.id,
      action:"manager.member_permissions_updated",entityType:"member",entityId:input.memberId,
      metadata:{role:input.role,developmentIds:selected},
    })
    revalidatePath("/gerenciador")
    return {ok:true,message:"Perfil e permissões atualizados com sucesso."}
  }catch(error){return failure(error,"Não foi possível atualizar as permissões")}
}

export async function managerSetUserAccess(input:{userId:string;status:"active"|"disabled"}):Promise<ManagerActionResult>{
  try{
    const context=await requirePlatformManager()
    if(input.userId===context.user.id&&input.status==="disabled")throw new Error("O Gerenciador não pode desabilitar a própria conta")
    const profile=(await db.select({id:user.id,name:user.name,platformRole:user.platformRole}).from(user).where(eq(user.id,input.userId)).limit(1))[0]
    if(!profile)throw new Error("Usuário não encontrado")
    if(profile.platformRole==="manager"&&input.status==="disabled")throw new Error("Outro Gerenciador não pode ser desabilitado por este painel")

    const userMemberships=await db.select({id:members.id,organizationId:members.organizationId,role:members.role,status:members.status})
      .from(members).where(eq(members.userId,input.userId))
    if(input.status==="disabled"){
      for(const membership of userMemberships){
        if(["owner","admin"].includes(membership.role)&&membership.status==="active"){
          await ensureAdministratorCoverage(membership.id,membership.organizationId,undefined,true)
        }
      }
    }

    await db.update(user).set({accessStatus:input.status,updatedAt:new Date()}).where(eq(user.id,input.userId))
    if(input.status==="disabled")await db.delete(session).where(eq(session.userId,input.userId))
    for(const membership of userMemberships){
      await recordAudit({
        organizationId:membership.organizationId,actorId:context.user.id,
        action:input.status==="active"?"manager.account_enabled":"manager.account_disabled",
        entityType:"user",entityId:input.userId,metadata:{name:profile.name},
      })
    }
    revalidatePath("/gerenciador")
    return {ok:true,message:input.status==="active"?"Conta habilitada com sucesso.":"Conta desabilitada e sessões encerradas."}
  }catch(error){return failure(error,"Não foi possível alterar o status da conta")}
}

export async function managerDeleteMember(input:{organizationId:string;memberId:string}):Promise<ManagerActionResult>{
  try{
    const context=await requirePlatformManager()
    const person=(await db.select({userId:members.userId,email:user.email}).from(members)
      .innerJoin(user,eq(members.userId,user.id))
      .where(and(eq(members.id,input.memberId),eq(members.organizationId,input.organizationId))).limit(1))[0]
    if(!person)throw new Error("Usuário não encontrado")
    await ensureAdministratorCoverage(input.memberId,input.organizationId,undefined,true)
    await db.delete(developmentAssignments).where(and(
      eq(developmentAssignments.organizationId,input.organizationId),
      eq(developmentAssignments.memberId,input.memberId),
    ))
    await db.delete(members).where(and(eq(members.id,input.memberId),eq(members.organizationId,input.organizationId)))

    const remaining=(await db.select({total:count()}).from(members).where(eq(members.userId,person.userId)))[0]
    const profile=(await db.select({platformRole:user.platformRole}).from(user).where(eq(user.id,person.userId)).limit(1))[0]
    if(Number(remaining?.total??0)===0&&!profile?.platformRole){
      await db.delete(session).where(eq(session.userId,person.userId))
      await db.delete(account).where(eq(account.userId,person.userId))
      await db.delete(user).where(eq(user.id,person.userId))
    }

    await recordAudit({
      organizationId:input.organizationId,actorId:context.user.id,
      action:"manager.member_deleted",entityType:"user",entityId:person.userId,metadata:{email:person.email},
    })
    revalidatePath("/gerenciador")
    return {ok:true,message:"Acesso do usuário excluído da construtora."}
  }catch(error){return failure(error,"Não foi possível excluir o usuário")}
}

export async function deleteManagedOrganization(input:{organizationId:string}):Promise<ManagerActionResult>{
  try{
    const context=await requirePlatformManager()
    const company=(await db.select({id:organizations.id,name:organizations.name}).from(organizations).where(eq(organizations.id,input.organizationId)).limit(1))[0]
    if(!company)throw new Error("Construtora não encontrada")
    const [memberCount,developmentCount]=await Promise.all([
      db.select({total:count()}).from(members).where(eq(members.organizationId,input.organizationId)),
      db.select({total:count()}).from(developments).where(eq(developments.organizationId,input.organizationId)),
    ])
    if(Number(memberCount[0]?.total??0)>0)throw new Error("Exclua todos os usuários da construtora antes de excluí-la")
    if(Number(developmentCount[0]?.total??0)>0)throw new Error("A construtora ainda possui empreendimentos. Exclua ou transfira os empreendimentos antes de excluí-la")
    await db.delete(organizationInvitations).where(eq(organizationInvitations.organizationId,input.organizationId))
    await db.delete(organizations).where(eq(organizations.id,input.organizationId))
    await recordAudit({
      organizationId:input.organizationId,actorId:context.user.id,
      action:"manager.organization_deleted",entityType:"organization",entityId:input.organizationId,metadata:{name:company.name},
    })
    revalidatePath("/gerenciador")
    return {ok:true,message:"Construtora excluída com sucesso."}
  }catch(error){return failure(error,"Não foi possível excluir a construtora")}
}
