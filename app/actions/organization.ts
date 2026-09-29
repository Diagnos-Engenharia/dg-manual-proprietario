'use server'

import { createHash } from "node:crypto"
import { and, count, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { developments, members, organizations, organizationInvitations, user } from "@/lib/db/schema"
import { recordAudit, requireActiveMembership, requireAuthenticatedUser, requireCompanyRole } from "@/lib/organization"

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

export async function getOrganizationContext() { return requireActiveMembership() }

export async function listOrganizationMembers() {
  const { organization } = await requireActiveMembership()
  return db.select({ id: members.id, userId: members.userId, role: members.role, status: members.status, createdAt: members.createdAt, lastAccessAt: members.lastAccessAt, name: user.name, email: user.email, image: user.image }).from(members).innerJoin(user, eq(members.userId, user.id)).where(eq(members.organizationId, organization.id))
}

async function ensureNotLastAdmin(memberId: string, organizationId: string, nextRole?: string, nextStatus?: string) {
  const target = await db.select({ role: members.role, status: members.status }).from(members).where(and(eq(members.id, memberId), eq(members.organizationId, organizationId))).limit(1)
  if (!target[0]) throw new Error("Usuário não encontrado")
  if (target[0].role === "admin" && target[0].status === "active" && (nextRole !== "admin" || nextStatus === "suspended" || nextStatus === "removed")) {
    const admins = await db.select({ total: count() }).from(members).where(and(eq(members.organizationId, organizationId), eq(members.role, "admin"), eq(members.status, "active")))
    if (Number(admins[0]?.total ?? 0) <= 1) throw new Error("Não é possível remover, suspender ou rebaixar o último administrador ativo")
  }
}

export async function updateMemberRole(memberId: string, role: "admin" | "editor" | "validator") {
  const context = await requireCompanyRole(["admin"])
  await ensureNotLastAdmin(memberId, context.organization.id, role)
  await db.update(members).set({ role }).where(and(eq(members.id, memberId), eq(members.organizationId, context.organization.id)))
  await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "member.role_changed", entityType: "member", entityId: memberId, metadata: { role } })
  revalidatePath("/equipe")
}

export async function updateMemberStatus(memberId: string, status: "active" | "suspended" | "removed") {
  const context = await requireCompanyRole(["admin"])
  await ensureNotLastAdmin(memberId, context.organization.id, undefined, status)
  await db.update(members).set({ status }).where(and(eq(members.id, memberId), eq(members.organizationId, context.organization.id)))
  await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: `member.${status}`, entityType: "member", entityId: memberId })
  revalidatePath("/equipe")
}

export async function createOrganizationInvitation(input: { email: string; name: string; role: "editor" | "validator" }) {
  const context = await requireCompanyRole(["admin"])
  const email = input.email.trim().toLowerCase()
  if (!email || !input.name.trim()) throw new Error("Informe nome e e-mail")
  const existing = await db.select({ id: members.id }).from(members).innerJoin(user, eq(members.userId, user.id)).where(and(eq(members.organizationId, context.organization.id), eq(user.email, email))).limit(1)
  if (existing[0]) throw new Error("Este e-mail já pertence à construtora")
  const token = crypto.randomUUID()
  await db.insert(organizationInvitations).values({ id: crypto.randomUUID(), organizationId: context.organization.id, email, name: input.name.trim(), role: input.role, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), invitedBy: context.user.id })
  await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "invitation.created", entityType: "invitation", entityId: hashToken(token), metadata: { email, role: input.role } })
  return `/convite/${token}`
}

export async function cancelOrganizationInvitation(id: string) {
  const context = await requireCompanyRole(["admin"])
  await db.update(organizationInvitations).set({ status: "canceled", canceledAt: new Date() }).where(and(eq(organizationInvitations.id, id), eq(organizationInvitations.organizationId, context.organization.id), eq(organizationInvitations.status, "pending")))
  await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "invitation.canceled", entityType: "invitation", entityId: id })
  revalidatePath("/equipe")
}

export async function getInvitationPreview(token: string) {
  try {
    const rows = await db.select({ invitation: organizationInvitations, organization: organizations }).from(organizationInvitations).innerJoin(organizations, eq(organizationInvitations.organizationId, organizations.id)).where(and(eq(organizationInvitations.tokenHash, hashToken(token)), eq(organizationInvitations.status, "pending"))).limit(1)
    const row = rows[0]
    if (!row || row.invitation.expiresAt < new Date()) return null
    return { organization: row.organization, email: row.invitation.email, name: row.invitation.name, role: row.invitation.role, expiresAt: row.invitation.expiresAt }
  } catch {
    return null
  }
}

export async function acceptOrganizationInvitation(token: string) {
  const current = await requireAuthenticatedUser()
  const rows = await db.select().from(organizationInvitations).where(and(eq(organizationInvitations.tokenHash, hashToken(token)), eq(organizationInvitations.status, "pending"))).limit(1)
  const invite = rows[0]
  if (!invite || invite.expiresAt < new Date()) throw new Error("Convite inválido ou expirado")
  if (invite.email !== current.email.toLowerCase()) throw new Error("Este convite foi enviado para outro e-mail")
  await db.insert(members).values({ id: crypto.randomUUID(), organizationId: invite.organizationId, userId: current.id, role: invite.role, status: "active", lastAccessAt: new Date() })
  await db.update(organizationInvitations).set({ status: "accepted", acceptedBy: current.id, acceptedAt: new Date() }).where(eq(organizationInvitations.id, invite.id))
  await recordAudit({ organizationId: invite.organizationId, actorId: current.id, action: "invitation.accepted", entityType: "invitation", entityId: invite.id })
  revalidatePath("/equipe")
  return invite.organizationId
}

export async function createOrganization(input: { name: string; logo?: string; initials?: string; primaryColor?: string }) {
  const current = await requireAuthenticatedUser()
  const name = input.name.trim()
  if (!name) throw new Error("Informe o nome da construtora")
  const existing = await db.select({ id: members.id }).from(members).where(and(eq(members.userId, current.id), eq(members.status, "active"))).limit(1)
  if (existing[0]) throw new Error("Você já pertence a uma construtora")
  const organizationId = crypto.randomUUID()
  const metadata = JSON.stringify({ initials: (input.initials?.trim() || name.slice(0, 2)).toUpperCase().slice(0, 4), primaryColor: input.primaryColor || "#2563eb" })
  await db.insert(organizations).values({ id: organizationId, name, logo: input.logo?.trim() || null, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${organizationId.slice(0, 8)}`, metadata })
  await db.insert(members).values({ id: crypto.randomUUID(), organizationId, userId: current.id, role: "admin", status: "active", lastAccessAt: new Date() })
  await db.update(developments).set({ organizationId }).where(and(eq(developments.userId, current.id), isNull(developments.organizationId)))
  revalidatePath("/")
}

export async function updateOrganization(input: { name: string; logo?: string; initials?: string; primaryColor?: string }) {
  const context = await requireCompanyRole(["admin"])
  const previous = context.organization.metadata ? JSON.parse(context.organization.metadata) as Record<string, unknown> : {}
  const metadata = JSON.stringify({ ...previous, initials: (input.initials?.trim() || String(previous.initials || input.name.slice(0, 2))).toUpperCase().slice(0, 4), primaryColor: input.primaryColor || previous.primaryColor || "#2563eb" })
  await db.update(organizations).set({ name: input.name.trim(), logo: input.logo?.trim() || null, metadata }).where(eq(organizations.id, context.organization.id))
  await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "organization.updated", entityType: "organization", entityId: context.organization.id })
  revalidatePath("/perfil"); revalidatePath("/equipe")
}
