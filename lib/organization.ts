import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLogs, developments, members, organizations } from "@/lib/db/schema"

export type CompanyRole = "admin" | "editor" | "validator"
export type MemberStatus = "active" | "suspended" | "removed"

export async function requireAuthenticatedUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Não autenticado")
  return session.user
}

export async function getActiveMembership() {
  const user = await requireAuthenticatedUser()
  const rows = await db.select({ member: members, organization: organizations }).from(members).innerJoin(organizations, eq(members.organizationId, organizations.id)).where(and(eq(members.userId, user.id), eq(members.status, "active"))).limit(1)
  return rows[0] ? { user, member: rows[0].member, organization: rows[0].organization } : null
}

export async function requireActiveMembership() {
  const context = await getActiveMembership()
  if (!context) throw new Error("Organização não configurada")
  await db.update(members).set({ lastAccessAt: new Date() }).where(eq(members.id, context.member.id))
  return context
}

export async function requireCompanyRole(roles: CompanyRole[]) {
  const context = await requireActiveMembership()
  const normalized = context.member.role === "owner" ? "admin" : context.member.role
  if (!roles.includes(normalized as CompanyRole)) throw new Error("Você não tem permissão para esta ação")
  return { ...context, role: normalized as CompanyRole }
}

export async function canAccessDevelopment(developmentId: string) {
  const context = await requireActiveMembership()
  const rows = await db.select({ id: developments.id }).from(developments).where(and(eq(developments.id, developmentId), eq(developments.organizationId, context.organization.id))).limit(1)
  return Boolean(rows[0])
}

export async function requireDevelopmentAccess(developmentId: string) {
  const context = await requireActiveMembership()
  const rows = await db.select().from(developments).where(and(eq(developments.id, developmentId), eq(developments.organizationId, context.organization.id))).limit(1)
  if (!rows[0]) throw new Error("Empreendimento não encontrado")
  return { ...context, development: rows[0] }
}

export async function recordAudit(input: { organizationId: string; actorId: string; action: string; entityType: string; entityId: string; metadata?: Record<string, unknown> }) {
  await db.insert(auditLogs).values({ id: crypto.randomUUID(), ...input, metadata: input.metadata ?? {} })
}

export function canEditContent(role: CompanyRole) { return role === "admin" || role === "editor" }
export function canValidateContent(role: CompanyRole) { return role === "admin" || role === "validator" }
export function canManageMembers(role: CompanyRole) { return role === "admin" }
