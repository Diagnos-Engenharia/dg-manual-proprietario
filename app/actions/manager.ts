'use server'

import { createHash } from "node:crypto"
import { and, count, eq, or } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { developments, members, organizationInvitations, organizations, user } from "@/lib/db/schema"
import { recordAudit, requirePlatformManager } from "@/lib/organization"

const hashToken=(token:string)=>createHash("sha256").update(token).digest("hex")

export async function listManagedOrganizations(){
  await requirePlatformManager()
  const [companies,roster,projects]=await Promise.all([
    db.select().from(organizations),
    db.select({id:members.id,organizationId:members.organizationId,userId:members.userId,role:members.role,status:members.status,lastAccessAt:members.lastAccessAt,name:user.name,email:user.email,jobTitle:user.jobTitle,whatsapp:user.whatsapp}).from(members).innerJoin(user,eq(members.userId,user.id)),
    db.select({id:developments.id,organizationId:developments.organizationId}).from(developments),
  ])
  return companies.map(company=>({
    id:company.id,
    name:company.name,
    logo:company.logo,
    members:roster.filter(person=>person.organizationId===company.id),
    developments:projects.filter(project=>project.organizationId===company.id).length,
  }))
}

export async function createManagedOrganization(input:{name:string}){
  const context=await requirePlatformManager()
  const name=input.name.trim()
  if(name.length<2)throw new Error("Informe o nome da construtora")
  const id=crypto.randomUUID()
  const slug=`${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"")}-${id.slice(0,8)}`
  await db.insert(organizations).values({id,name,slug,metadata:JSON.stringify({initials:name.split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase(),primaryColor:"#2563eb"})})
  await recordAudit({organizationId:id,actorId:context.user.id,action:"manager.organization_created",entityType:"organization",entityId:id,metadata:{name}})
  revalidatePath("/gerenciador")
  return id
}

export async function createAdministratorInvitation(input:{organizationId:string;name:string;email:string}){
  const context=await requirePlatformManager()
  const email=input.email.trim().toLowerCase()
  const name=input.name.trim()
  if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Informe nome e e-mail válidos")
  const company=await db.select({id:organizations.id}).from(organizations).where(eq(organizations.id,input.organizationId)).limit(1)
  if(!company[0])throw new Error("Construtora não encontrada")

  const existing=await db.select({memberId:members.id,userId:user.id}).from(user)
    .leftJoin(members,and(eq(members.userId,user.id),eq(members.organizationId,input.organizationId)))
    .where(eq(user.email,email)).limit(1)
  if(existing[0]?.memberId){
    await db.update(members).set({role:"admin",status:"active"}).where(eq(members.id,existing[0].memberId!))
    await recordAudit({organizationId:input.organizationId,actorId:context.user.id,action:"manager.administrator_activated",entityType:"member",entityId:existing[0].memberId!,metadata:{email}})
    revalidatePath("/gerenciador")
    return ""
  }
  if(existing[0]?.userId){
    const memberId=crypto.randomUUID()
    await db.insert(members).values({id:memberId,organizationId:input.organizationId,userId:existing[0].userId,role:"admin",status:"active",lastAccessAt:new Date()})
    await recordAudit({organizationId:input.organizationId,actorId:context.user.id,action:"manager.administrator_added",entityType:"member",entityId:memberId,metadata:{email}})
    revalidatePath("/gerenciador")
    return ""
  }

  const token=crypto.randomUUID()
  await db.insert(organizationInvitations).values({id:crypto.randomUUID(),organizationId:input.organizationId,email,name,role:"admin",developmentIds:[],tokenHash:hashToken(token),expiresAt:new Date(Date.now()+7*24*60*60*1000),invitedBy:context.user.id})
  await recordAudit({organizationId:input.organizationId,actorId:context.user.id,action:"manager.administrator_invited",entityType:"invitation",entityId:hashToken(token),metadata:{email}})
  revalidatePath("/gerenciador")
  return "/convite/"+token
}

async function ensureAdministratorCoverage(memberId:string,organizationId:string,nextRole?:string,nextStatus?:string){
  const target=await db.select({role:members.role,status:members.status}).from(members).where(and(eq(members.id,memberId),eq(members.organizationId,organizationId))).limit(1)
  if(!target[0])throw new Error("Usuário não encontrado")
  if(!["owner","admin"].includes(target[0].role)||target[0].status!=="active")return
  const losingAdmin=(nextRole!==undefined&&!["owner","admin"].includes(nextRole))||nextStatus==="suspended"||nextStatus==="removed"
  if(!losingAdmin)return
  const admins=await db.select({total:count()}).from(members).where(and(eq(members.organizationId,organizationId),or(eq(members.role,"owner"),eq(members.role,"admin")),eq(members.status,"active")))
  if(Number(admins[0]?.total??0)<=1)throw new Error("Cadastre outro Administrador antes de remover o último acesso administrativo")
}

export async function managerUpdateMember(input:{organizationId:string;memberId:string;role:"admin"|"editor";status?:"active"|"suspended"}){
  const context=await requirePlatformManager()
  await ensureAdministratorCoverage(input.memberId,input.organizationId,input.role,input.status)
  const person=await db.select({id:members.id}).from(members).where(and(eq(members.id,input.memberId),eq(members.organizationId,input.organizationId))).limit(1)
  if(!person[0])throw new Error("Usuário não encontrado")
  await db.update(members).set({role:input.role,...(input.status?{status:input.status}:{})}).where(eq(members.id,input.memberId))
  await recordAudit({organizationId:input.organizationId,actorId:context.user.id,action:"manager.member_updated",entityType:"member",entityId:input.memberId,metadata:{role:input.role,status:input.status??null}})
  revalidatePath("/gerenciador")
}
