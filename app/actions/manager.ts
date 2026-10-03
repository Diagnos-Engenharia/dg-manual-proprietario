'use server'

import { createHash } from "node:crypto"
import { and, asc, count, eq, ilike, inArray, ne, or, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  auditLogs,
  clientAccesses,
  developmentAssignments,
  developments,
  members,
  organizationApiKeys,
  organizationIntegrations,
  organizationInvitations,
  organizationNotifications,
  organizations,
  session,
  user,
} from "@/lib/db/schema"
import { lockOrganization, recordAudit, requirePlatformManager, type DatabaseTransaction } from "@/lib/organization"
import { consumeRateLimit, RateLimitError } from "@/lib/security/rate-limit"
import { cleanText, InputValidationError } from "@/lib/security/input"
import { logSafeError } from "@/lib/security/logging"

const hashToken=(token:string)=>createHash("sha256").update(token).digest("hex")

export type ManagerActionResult<T=undefined>=
  | {ok:true;message:string;data?:T}
  | {ok:false;message:string}

class ManagerValidationError extends Error{}

function failure(error:unknown,fallback:string):ManagerActionResult{
  const authorizationErrors=["Não autenticado","Conta inativa","Acesso restrito ao Gerenciador","Construtora não encontrada"]
  if(error instanceof ManagerValidationError || error instanceof InputValidationError || error instanceof RateLimitError || (error instanceof Error&&authorizationErrors.includes(error.message))){
    return {ok:false,message:error.message}
  }
  logSafeError("manager.action_failed",error)
  return {ok:false,message:fallback}
}

async function ensureDevelopmentSelection(tx:DatabaseTransaction,organizationId:string,developmentIds:string[]){
  const unique=[...new Set(developmentIds.filter(Boolean))]
  if(!unique.length)throw new ManagerValidationError("Selecione ao menos um empreendimento para o Construtor")
  const rows=await tx.select({id:developments.id}).from(developments)
    .where(and(eq(developments.organizationId,organizationId),inArray(developments.id,unique)))
  if(rows.length!==unique.length)throw new ManagerValidationError("Um ou mais empreendimentos selecionados não pertencem à construtora")
  return unique
}

async function setAssignments(tx:DatabaseTransaction,organizationId:string,memberId:string,role:"admin"|"editor",developmentIds:string[]){
  await tx.delete(developmentAssignments).where(and(
    eq(developmentAssignments.organizationId,organizationId),
    eq(developmentAssignments.memberId,memberId),
  ))
  if(role==="admin")return
  const selected=await ensureDevelopmentSelection(tx,organizationId,developmentIds)
  await tx.insert(developmentAssignments).values(selected.map(developmentId=>({
    id:crypto.randomUUID(),
    organizationId,
    developmentId,
    memberId,
    role:"editor",
  })))
}

async function ensureAdministratorCoverage(tx:DatabaseTransaction,memberId:string,organizationId:string,nextRole?:string,nextDisabled=false){
  const target=await tx.select({role:members.role,status:members.status}).from(members)
    .where(and(eq(members.id,memberId),eq(members.organizationId,organizationId))).limit(1)
  if(!target[0])throw new ManagerValidationError("Usuário não encontrado")
  if(!["owner","admin"].includes(target[0].role)||target[0].status!=="active")return
  const losingAdmin=(nextRole!==undefined&&!["owner","admin"].includes(nextRole))||nextDisabled
  if(!losingAdmin)return
  const roster=await tx.select({total:count()})
    .from(members).innerJoin(user,eq(members.userId,user.id))
    .where(and(eq(members.organizationId,organizationId),inArray(members.role,["owner","admin"]),eq(members.status,"active"),eq(user.accessStatus,"active")))
  const activeAdmins=Number(roster[0]?.total??0)
  if(activeAdmins<=1)throw new ManagerValidationError("Cadastre ou habilite outro Administrador antes de remover o último acesso administrativo")
}

export async function listManagedOrganizations(input:{page?:number;pageSize?:number;search?:string}={}){
  await requirePlatformManager()
  const pageSize=Number.isFinite(input.pageSize)?Math.max(1,Math.min(25,Math.floor(input.pageSize!))):10
  const requestedPage=Number.isFinite(input.page)?Math.max(1,Math.floor(input.page!)):1
  const search=typeof input.search==="string"?input.search.trim().slice(0,120):""
  const pattern=`%${search.replace(/[\\%_]/g,"\\$&")}%`
  const filter=search?or(ilike(organizations.name,pattern),sql<boolean>`exists (
    select 1 from "member" m inner join "user" u on u.id=m."userId"
    where m."organizationId"=${organizations.id} and (u.name ilike ${pattern} or u.email ilike ${pattern})
  )`):undefined
  const total=Number((await db.select({total:count()}).from(organizations).where(filter))[0]?.total??0)
  const totalPages=Math.max(1,Math.ceil(total/pageSize))
  const page=Math.min(requestedPage,totalPages)
  const companies=await db.select({id:organizations.id,name:organizations.name,logo:organizations.logo}).from(organizations)
    .where(filter).orderBy(asc(organizations.name),asc(organizations.id)).limit(pageSize).offset((page-1)*pageSize)
  const organizationIds=companies.map(company=>company.id)
  const [roster,projects,grants]=organizationIds.length?await Promise.all([
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
    }).from(members).innerJoin(user,eq(members.userId,user.id)).where(inArray(members.organizationId,organizationIds)),
    db.select({id:developments.id,organizationId:developments.organizationId,name:developments.name}).from(developments).where(inArray(developments.organizationId,organizationIds)),
    db.select({memberId:developmentAssignments.memberId,developmentId:developmentAssignments.developmentId}).from(developmentAssignments).where(inArray(developmentAssignments.organizationId,organizationIds)),
  ]):[[],[],[]]
  const grantsByMember=new Map<string,string[]>()
  for(const grant of grants){
    const assigned=grantsByMember.get(grant.memberId)??[]
    assigned.push(grant.developmentId)
    grantsByMember.set(grant.memberId,assigned)
  }
  const membersByOrganization=new Map<string,typeof roster>()
  for(const person of roster){
    const roster=membersByOrganization.get(person.organizationId)??[]
    roster.push(person)
    membersByOrganization.set(person.organizationId,roster)
  }
  const projectsByOrganization=new Map<string,Array<{id:string;name:string}>>()
  for(const project of projects){
    if(!project.organizationId)continue
    const selected=projectsByOrganization.get(project.organizationId)??[]
    selected.push({id:project.id,name:project.name})
    projectsByOrganization.set(project.organizationId,selected)
  }
  return {companies:companies.map(company=>({
    id:company.id,
    name:company.name,
    logo:company.logo,
    members:(membersByOrganization.get(company.id)??[]).map(person=>({...person,assignments:grantsByMember.get(person.id)??[]})),
    developments:projectsByOrganization.get(company.id)??[],
  })),pagination:{page,pageSize,total,totalPages,search}}
}

export async function createManagedOrganization(input:{name:string}):Promise<ManagerActionResult<{id:string}>>{
  try{
    const context=await requirePlatformManager()
    await consumeRateLimit("manager-create-org:"+context.user.id,{max:20,windowSeconds:3600})
    const name=cleanText(input.name,"Nome da construtora",160,2)
    const id=crypto.randomUUID()
    const slug=`${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"")}-${id.slice(0,8)}`
    await db.transaction(async tx=>{
      await tx.insert(organizations).values({id,name,slug,metadata:JSON.stringify({
        initials:name.split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase(),
        primaryColor:"#2563eb",
      })})
      await recordAudit({organizationId:id,actorId:context.user.id,action:"manager.organization_created",entityType:"organization",entityId:id,metadata:{name}},tx)
    })
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
    await consumeRateLimit("manager-create-access:"+context.user.id,{max:50,windowSeconds:3600})
    const email=input.email.trim().toLowerCase()
    const name=cleanText(input.name,"Nome do usuário",160)
    if(!["admin","editor"].includes(input.role))throw new ManagerValidationError("Perfil de acesso inválido")
    if(email.length>320||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new ManagerValidationError("Informe um e-mail válido")
    const result=await db.transaction(async tx=>{
    await lockOrganization(tx,input.organizationId)
    const selected=input.role==="editor"?await ensureDevelopmentSelection(tx,input.organizationId,input.developmentIds):[]

    const existing=(await tx.select({
      userId:user.id,
      memberId:members.id,
      accessStatus:user.accessStatus,
    }).from(user)
      .leftJoin(members,and(eq(members.userId,user.id),eq(members.organizationId,input.organizationId)))
      .where(eq(user.email,email)).limit(1).for("update",{of:user}))[0]

    if(existing?.userId){
      let memberId=existing.memberId??crypto.randomUUID()
      if(existing.memberId){
        await ensureAdministratorCoverage(tx,memberId,input.organizationId,input.role,false)
        await tx.update(members).set({role:input.role,status:"active",lastAccessAt:new Date()}).where(eq(members.id,memberId))
      }else{
        const linked=(await tx.insert(members).values({id:memberId,organizationId:input.organizationId,userId:existing.userId,role:input.role,status:"active",lastAccessAt:new Date()})
          .onConflictDoUpdate({target:[members.organizationId,members.userId],set:{role:input.role,status:"active",lastAccessAt:new Date()}})
          .returning({id:members.id}))[0]
        memberId=linked.id
      }
      await setAssignments(tx,input.organizationId,memberId,input.role,selected)
      await recordAudit({
        organizationId:input.organizationId,actorId:context.user.id,
        action:"manager.access_linked",entityType:"member",entityId:memberId,
        metadata:{email,role:input.role,developmentIds:selected,accountStatus:existing.accessStatus},
      },tx)
      return {
        ok:true as const,
        message:existing.accessStatus==="disabled"
          ?"Acesso vinculado. A conta global permanece inativa; habilite-a explicitamente no switch para liberar o login."
          :"Acesso vinculado com sucesso.",
        data:{mode:"linked" as const},
      }
    }

    await tx.update(organizationInvitations).set({status:"canceled",canceledAt:new Date()}).where(and(
      eq(organizationInvitations.organizationId,input.organizationId),
      eq(organizationInvitations.email,email),
      eq(organizationInvitations.status,"pending"),
      ne(organizationInvitations.role,"client"),
    ))
    const token=crypto.randomUUID()
    await tx.insert(organizationInvitations).values({
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
    },tx)
    return {ok:true as const,message:"Convite de acesso criado com sucesso.",data:{mode:"invited" as const,path:"/convite/"+token}}
    })
    revalidatePath("/gerenciador")
    return result
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
    await consumeRateLimit("manager-update-access:"+context.user.id,{max:120,windowSeconds:3600})
    if(!["admin","editor"].includes(input.role))throw new ManagerValidationError("Perfil de acesso inválido")
    await db.transaction(async tx=>{
    await lockOrganization(tx,input.organizationId)
    const person=(await tx.select({id:members.id}).from(members)
      .where(and(eq(members.id,input.memberId),eq(members.organizationId,input.organizationId))).limit(1))[0]
    if(!person)throw new ManagerValidationError("Usuário não encontrado")
    await ensureAdministratorCoverage(tx,input.memberId,input.organizationId,input.role,false)
    const selected=input.role==="editor"?await ensureDevelopmentSelection(tx,input.organizationId,input.developmentIds):[]
    await tx.update(members).set({role:input.role,status:"active"}).where(eq(members.id,input.memberId))
    await setAssignments(tx,input.organizationId,input.memberId,input.role,selected)
    await recordAudit({
      organizationId:input.organizationId,actorId:context.user.id,
      action:"manager.member_permissions_updated",entityType:"member",entityId:input.memberId,
      metadata:{role:input.role,developmentIds:selected},
    },tx)
    })
    revalidatePath("/gerenciador")
    return {ok:true,message:"Perfil e permissões atualizados com sucesso."}
  }catch(error){return failure(error,"Não foi possível atualizar as permissões")}
}

export async function managerSetUserAccess(input:{userId:string;status:"active"|"disabled"}):Promise<ManagerActionResult>{
  try{
    const context=await requirePlatformManager()
    await consumeRateLimit("manager-account-status:"+context.user.id,{max:120,windowSeconds:3600})
    if(!["active","disabled"].includes(input.status))throw new ManagerValidationError("Status de conta inválido")
    if(input.userId===context.user.id&&input.status==="disabled")throw new ManagerValidationError("O Gerenciador não pode desabilitar a própria conta")
    const organizationIds=[...new Set((await db.select({organizationId:members.organizationId}).from(members).where(eq(members.userId,input.userId))).map(item=>item.organizationId))].sort()
    await db.transaction(async tx=>{
    // Lock tenants in a stable order, then the identity, as in invite/offboarding.
    for(const organizationId of organizationIds)await lockOrganization(tx,organizationId)
    const profile=(await tx.select({id:user.id,name:user.name,platformRole:user.platformRole}).from(user).where(eq(user.id,input.userId)).limit(1).for("update"))[0]
    if(!profile)throw new ManagerValidationError("Usuário não encontrado")
    if(profile.platformRole==="manager"&&input.status==="disabled")throw new ManagerValidationError("Outro Gerenciador não pode ser desabilitado por este painel")

    const userMemberships=await tx.select({id:members.id,organizationId:members.organizationId,role:members.role,status:members.status})
      .from(members).where(eq(members.userId,input.userId))
    if(userMemberships.some(item=>!organizationIds.includes(item.organizationId)))throw new ManagerValidationError("Os vínculos do usuário mudaram. Recarregue o painel e tente novamente")
    if(input.status==="disabled"){
      for(const membership of userMemberships){
        if(["owner","admin"].includes(membership.role)&&membership.status==="active"){
          await ensureAdministratorCoverage(tx,membership.id,membership.organizationId,undefined,true)
        }
      }
    }

    await tx.update(user).set({accessStatus:input.status,updatedAt:new Date()}).where(eq(user.id,input.userId))
    // O status da conta é global; o status de cada vínculo com uma construtora é independente.
    // Não reative/suspenda memberships de outros tenants ao alternar a conta global.
    if(input.status==="disabled")await tx.delete(session).where(eq(session.userId,input.userId))
    for(const organizationId of organizationIds.length?organizationIds:["platform"]){
      await recordAudit({
        organizationId,actorId:context.user.id,
        action:input.status==="active"?"manager.account_enabled":"manager.account_disabled",
        entityType:"user",entityId:input.userId,metadata:{name:profile.name},
      },tx)
    }
    })
    revalidatePath("/gerenciador")
    return {ok:true,message:input.status==="active"?"Conta habilitada com sucesso.":"Conta desabilitada e sessões encerradas."}
  }catch(error){return failure(error,"Não foi possível alterar o status da conta")}
}

export async function managerDeleteMember(input:{organizationId:string;memberId:string}):Promise<ManagerActionResult>{
  try{
    const context=await requirePlatformManager()
    await consumeRateLimit("manager-delete-member:"+context.user.id,{max:50,windowSeconds:3600})
    await db.transaction(async tx=>{
    await lockOrganization(tx,input.organizationId)
    const person=(await tx.select({userId:members.userId,email:user.email}).from(members)
      .innerJoin(user,eq(members.userId,user.id))
      .where(and(eq(members.id,input.memberId),eq(members.organizationId,input.organizationId))).limit(1))[0]
    if(!person)throw new ManagerValidationError("Usuário não encontrado")
    // The platform Manager explicitly offboards members, including the last
    // Administrator. Ordinary permission/status edits still require coverage.
      await tx.execute(sql`SELECT id FROM "user" WHERE id = ${person.userId} FOR UPDATE`)
      await tx.delete(developmentAssignments).where(and(eq(developmentAssignments.organizationId,input.organizationId),eq(developmentAssignments.memberId,input.memberId)))
      await tx.delete(members).where(and(eq(members.id,input.memberId),eq(members.organizationId,input.organizationId)))
      await tx.update(user).set({activeOrganizationId:null,updatedAt:new Date()}).where(and(eq(user.id,person.userId),eq(user.activeOrganizationId,input.organizationId)))
      const remaining=(await tx.select({total:count()}).from(members).where(eq(members.userId,person.userId)))[0]
      const clientLinks=(await tx.select({total:count()}).from(clientAccesses).where(eq(clientAccesses.userId,person.userId)))[0]
      const profile=(await tx.select({platformRole:user.platformRole}).from(user).where(eq(user.id,person.userId)).limit(1))[0]
      if(Number(remaining?.total??0)===0&&Number(clientLinks?.total??0)===0&&!profile?.platformRole){
        await tx.update(user).set({accessStatus:"disabled",updatedAt:new Date()}).where(eq(user.id,person.userId))
        await tx.delete(session).where(eq(session.userId,person.userId))
      }
      await tx.insert(auditLogs).values({id:crypto.randomUUID(),organizationId:input.organizationId,actorId:context.user.id,
        action:"manager.member_deleted",entityType:"user",entityId:person.userId,metadata:{email:person.email},
      })
    })
    revalidatePath("/gerenciador")
    return {ok:true,message:"Acesso do usuário excluído da construtora."}
  }catch(error){return failure(error,"Não foi possível excluir o usuário")}
}

export async function deleteManagedOrganization(input:{organizationId:string}):Promise<ManagerActionResult>{
  try{
    const context=await requirePlatformManager()
    await consumeRateLimit("manager-delete-org:"+context.user.id,{max:20,windowSeconds:3600})
    await db.transaction(async tx=>{
    const company=await lockOrganization(tx,input.organizationId)
    const memberCount=await tx.select({total:count()}).from(members).where(eq(members.organizationId,input.organizationId))
    const developmentCount=await tx.select({total:count()}).from(developments).where(eq(developments.organizationId,input.organizationId))
    const clientCount=await tx.select({total:count()}).from(clientAccesses).where(eq(clientAccesses.organizationId,input.organizationId))
    if(Number(memberCount[0]?.total??0)>0)throw new ManagerValidationError("Exclua todos os usuários da construtora antes de excluí-la")
    if(Number(clientCount[0]?.total??0)>0)throw new ManagerValidationError("A construtora ainda possui vínculos de clientes")
    if(Number(developmentCount[0]?.total??0)>0)throw new ManagerValidationError("A construtora ainda possui empreendimentos. Exclua ou transfira os empreendimentos antes de excluí-la")
      await tx.delete(organizationInvitations).where(eq(organizationInvitations.organizationId,input.organizationId))
      await tx.delete(organizationApiKeys).where(eq(organizationApiKeys.organizationId,input.organizationId))
      await tx.delete(organizationIntegrations).where(eq(organizationIntegrations.organizationId,input.organizationId))
      await tx.delete(organizationNotifications).where(eq(organizationNotifications.organizationId,input.organizationId))
      await tx.update(user).set({activeOrganizationId:null,updatedAt:new Date()}).where(eq(user.activeOrganizationId,input.organizationId))
      await tx.insert(auditLogs).values({
        id:crypto.randomUUID(),organizationId:input.organizationId,actorId:context.user.id,
        action:"manager.organization_deleted",entityType:"organization",entityId:input.organizationId,metadata:{name:company.name},
      })
      await tx.delete(organizations).where(eq(organizations.id,input.organizationId))
    })
    revalidatePath("/gerenciador")
    return {ok:true,message:"Construtora excluída com sucesso."}
  }catch(error){return failure(error,"Não foi possível excluir a construtora")}
}
