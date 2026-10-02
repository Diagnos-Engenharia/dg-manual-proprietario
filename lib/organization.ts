import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLogs, developmentAssignments, developments, members, organizations, user as userTable } from "@/lib/db/schema"

export type PlatformRole = "manager"
export type CompanyRole = "admin" | "editor" | "validator"
export type DevelopmentRole = CompanyRole | "admin_empreendimento"
export type MemberStatus = "active" | "suspended" | "removed"

export async function requireAuthenticatedUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Não autenticado")
  return session.user
}

export async function getPlatformUser() {
  const current = await requireAuthenticatedUser()
  const [profile,legacyOwner] = await Promise.all([
    db.select({ platformRole: userTable.platformRole }).from(userTable).where(eq(userTable.id,current.id)).limit(1),
    db.select({ id:members.id }).from(members).where(and(eq(members.userId,current.id),eq(members.role,"owner"),eq(members.status,"active"))).limit(1),
  ])
  const platformRole = profile[0]?.platformRole as PlatformRole | null | undefined
  return { user: current, platformRole, isManager: platformRole === "manager" || Boolean(legacyOwner[0]) }
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

export async function getActiveMembership() {
  const user = await requireAuthenticatedUser()
  const rows = await db.select({ member: members, organization: organizations }).from(members)
    .innerJoin(organizations,eq(members.organizationId,organizations.id))
    .where(and(eq(members.userId,user.id),eq(members.status,"active"))).limit(1)
  return rows[0] ? { user, member: rows[0].member, organization: rows[0].organization } : null
}

export async function requireActiveMembership() {
  const context = await getActiveMembership()
  if (!context) throw new Error("Organização não configurada")
  await db.update(members).set({lastAccessAt:new Date()}).where(eq(members.id,context.member.id))
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

export async function recordAudit(input:{organizationId:string;actorId:string;action:string;entityType:string;entityId:string;metadata?:Record<string,unknown>}){
  await db.insert(auditLogs).values({id:crypto.randomUUID(),...input,metadata:input.metadata??{}})
}

export function canEditContent(role:DevelopmentRole){return role==="admin"||role==="admin_empreendimento"||role==="editor"}
export function canValidateContent(role:DevelopmentRole){return role==="admin"}
export function canManageMembers(role:string){return isGlobalAdmin(role)}
