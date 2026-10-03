import { and, asc, eq, isNull, lt, or } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLogs, developmentAssignments, developments, members, organizations, user as userTable } from "@/lib/db/schema"

export type PlatformRole = "manager"
export type CompanyRole = "admin" | "editor" | "validator"
export type DevelopmentRole = CompanyRole | "admin_empreendimento"
export type MemberStatus = "active" | "suspended" | "removed"
export type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

const LAST_ACCESS_REFRESH_MS = 5 * 60 * 1000

export async function requireAuthenticatedUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Não autenticado")
  const profile=(await db.select({accessStatus:userTable.accessStatus}).from(userTable).where(eq(userTable.id,session.user.id)).limit(1))[0]
  if(profile?.accessStatus==="disabled")throw new Error("Conta inativa")
  return session.user
}

export async function getPlatformUser() {
  const current = await requireAuthenticatedUser()
  const profile=await db.select({ platformRole: userTable.platformRole }).from(userTable).where(eq(userTable.id,current.id)).limit(1)
  const platformRole = profile[0]?.platformRole as PlatformRole | null | undefined
  return { user: current, platformRole, isManager: platformRole === "manager" }
}

export async function requirePlatformManager() {
  const context = await getPlatformUser()
  if (!context.isManager) throw new Error("Acesso restrito ao Gerenciador")
  return { ...context, platformRole: "manager" as const }
}

export async function isCurrentUserPlatformManager() {
  try {
    return (await getPlatformUser()).isManager
  } catch {
    return false
  }
}

async function activeMembershipRows(userId:string){
  return db.select({ member: members, organization: organizations }).from(members)
    .innerJoin(organizations,eq(members.organizationId,organizations.id))
    .where(and(eq(members.userId,userId),eq(members.status,"active")))
    .orderBy(asc(members.createdAt),asc(members.id))
}

export async function getOrganizationChoices(){
  const user=await requireAuthenticatedUser()
  const [rows,profile]=await Promise.all([
    activeMembershipRows(user.id),
    db.select({activeOrganizationId:userTable.activeOrganizationId}).from(userTable).where(eq(userTable.id,user.id)).limit(1),
  ])
  const configured=profile[0]?.activeOrganizationId??null
  const validConfigured=configured&&rows.some(row=>row.organization.id===configured)?configured:null
  const activeOrganizationId=validConfigured??(rows.length===1?rows[0].organization.id:null)
  if(activeOrganizationId!==configured){
    await db.update(userTable).set({activeOrganizationId,updatedAt:new Date()}).where(and(
      eq(userTable.id,user.id),configured?eq(userTable.activeOrganizationId,configured):isNull(userTable.activeOrganizationId),
    ))
  }
  return {
    user,
    activeOrganizationId,
    organizations:rows.map(row=>({
      id:row.organization.id,
      name:row.organization.name,
      role:row.member.role,
      memberId:row.member.id,
      current:row.organization.id===activeOrganizationId,
    })),
  }
}

export async function setActiveOrganization(organizationId:string){
  const user=await requireAuthenticatedUser()
  await db.transaction(async tx=>{
    await lockOrganization(tx,organizationId)
    const profile=(await tx.select({accessStatus:userTable.accessStatus}).from(userTable).where(eq(userTable.id,user.id)).limit(1).for("update"))[0]
    const row=(await tx.select({id:members.id}).from(members).where(and(
      eq(members.userId,user.id),eq(members.organizationId,organizationId),eq(members.status,"active"),
    )).limit(1))[0]
    if(!row || profile?.accessStatus!=="active")throw new Error("Você não possui acesso ativo a esta construtora")
    await tx.update(userTable).set({activeOrganizationId:organizationId,updatedAt:new Date()}).where(eq(userTable.id,user.id))
  })
  return organizationId
}

export async function getActiveMembership() {
  const choices=await getOrganizationChoices()
  const selectedOrganizationId=choices.activeOrganizationId
  if(!selectedOrganizationId)return null
  const rows=await db.select({ member: members, organization: organizations }).from(members)
    .innerJoin(organizations,eq(members.organizationId,organizations.id))
    .where(and(
      eq(members.userId,choices.user.id),
      eq(members.organizationId,selectedOrganizationId),
      eq(members.status,"active"),
    )).limit(1)
  if(!rows[0])return null
  const staleBefore=new Date(Date.now()-LAST_ACCESS_REFRESH_MS)
  if(!rows[0].member.lastAccessAt || rows[0].member.lastAccessAt < staleBefore){
    // Avoid even issuing UPDATE for fresh requests; the predicate handles two
    // stale requests racing to refresh the same timestamp.
    await db.update(members).set({lastAccessAt:new Date()}).where(and(
      eq(members.id,rows[0].member.id),
      or(isNull(members.lastAccessAt),lt(members.lastAccessAt,staleBefore)),
    ))
  }
  return { user:choices.user, member:rows[0].member, organization:rows[0].organization }
}

export async function requireActiveMembership() {
  const context = await getActiveMembership()
  if (!context) {
    const choices=await getOrganizationChoices()
    if(choices.organizations.length>1)throw new Error("Selecione a construtora ativa antes de continuar")
    throw new Error("Organização não configurada")
  }
  return context
}

export function isGlobalAdmin(role: string) { return role === "owner" || role === "admin" }

export function companyRoleLabel(role:string) {
  if (role === "owner" || role === "admin") return "Administrador"
  if (role === "editor" || role === "admin_empreendimento") return "Construtor"
  if (role === "validator") return "Validador legado"
  return role
}

export async function requireCompanyRole(roles: CompanyRole[]) {
  const context = await requireActiveMembership()
  const role = context.member.role === "owner" ? "admin" : context.member.role
  if (!roles.includes(role as CompanyRole)) throw new Error("Você não tem permissão para esta ação")
  return { ...context, role:role as CompanyRole }
}

export async function permittedDevelopmentIds(context: Awaited<ReturnType<typeof requireActiveMembership>>) {
  if(isGlobalAdmin(context.member.role)) return null
  const rows=await db.select({ id:developmentAssignments.developmentId })
    .from(developmentAssignments).where(and(eq(developmentAssignments.organizationId,context.organization.id),eq(developmentAssignments.memberId,context.member.id)))
  return rows.map(r=>r.id)
}

export async function requireDevelopmentAccess(developmentId:string) {
  const context=await requireActiveMembership()
  const rows=await db.select().from(developments).where(and(eq(developments.id,developmentId),eq(developments.organizationId,context.organization.id))).limit(1)
  if(!rows[0])throw new Error("Empreendimento não encontrado")
  if(isGlobalAdmin(context.member.role))return {...context,development:rows[0],developmentRole:"admin" as const}
  const grants=await db.select({role:developmentAssignments.role}).from(developmentAssignments)
    .where(and(eq(developmentAssignments.memberId,context.member.id),eq(developmentAssignments.developmentId,developmentId),eq(developmentAssignments.organizationId,context.organization.id))).limit(1)
  if(!grants[0])throw new Error("Acesso não autorizado a este empreendimento")
  const developmentRole=grants[0].role as DevelopmentRole
  if(!["admin_empreendimento","editor","validator"].includes(developmentRole))throw new Error("Perfil de acesso inválido")
  return {...context,development:rows[0],developmentRole}
}

export async function requireDevelopmentRole(developmentId:string, roles:DevelopmentRole[]){
  const context=await requireDevelopmentAccess(developmentId)
  if(!roles.includes(context.developmentRole)&&!(context.developmentRole==="admin"&&roles.includes("admin_empreendimento")))
    throw new Error("Você não tem permissão para esta ação neste empreendimento")
  return context
}

export async function canAccessDevelopment(developmentId:string) {
  try { await requireDevelopmentAccess(developmentId); return true }catch{return false}
}

export async function recordAudit(input:{organizationId:string;actorId:string;action:string;entityType:string;entityId:string;metadata?:Record<string,unknown>},executor:Pick<typeof db,"insert">=db){
  await executor.insert(auditLogs).values({id:crypto.randomUUID(),...input,metadata:input.metadata??{}})
}

export async function lockOrganization(tx:DatabaseTransaction,organizationId:string){
  const company=(await tx.select().from(organizations).where(eq(organizations.id,organizationId)).limit(1).for("update"))[0]
  if(!company)throw new Error("Construtora não encontrada")
  return company
}

export function canEditContent(role:DevelopmentRole){return role==="admin"||role==="admin_empreendimento"||role==="editor"}
export function canValidateContent(role:DevelopmentRole){return role==="admin"}
export function canManageMembers(role:string){return isGlobalAdmin(role)}
