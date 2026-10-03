'use server'

import { createHash } from "node:crypto"
import { and, count, eq, inArray, isNull, or, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { developmentAssignments, developments, members, organizations, organizationInvitations, user } from "@/lib/db/schema"
import { isGlobalAdmin, recordAudit, requireActiveMembership, requireAuthenticatedUser, requireCompanyRole, requirePlatformManager, type DevelopmentRole } from "@/lib/organization"

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

export async function getOrganizationContext() { return requireActiveMembership() }

export async function listOrganizationMembers() {
  const { organization } = await requireCompanyRole(["admin"])
  const [roster, grants] = await Promise.all([
    db.select({ id: members.id, userId: members.userId, role: members.role, status: members.status, createdAt: members.createdAt, lastAccessAt: members.lastAccessAt, name: user.name, email: user.email, image: user.image }).from(members).innerJoin(user, eq(members.userId, user.id)).where(eq(members.organizationId, organization.id)),
    db.select({ memberId: developmentAssignments.memberId, developmentId: developmentAssignments.developmentId, role: developmentAssignments.role }).from(developmentAssignments).where(eq(developmentAssignments.organizationId,organization.id)),
  ])
  return roster.map(member => ({...member,assignments:grants.filter(grant=>grant.memberId===member.id).map(({developmentId,role})=>({developmentId,role}))}))
}

async function ensureNotLastAdmin(memberId: string, organizationId: string, nextRole?: string, nextStatus?: string) {
  const target = await db.select({ role: members.role, status: members.status }).from(members).where(and(eq(members.id, memberId), eq(members.organizationId, organizationId))).limit(1)
  if (!target[0]) throw new Error("Usuário não encontrado")
  if (target[0].role === "owner" && (nextRole !== undefined || nextStatus === "suspended" || nextStatus === "removed")) throw new Error("O acesso legado do proprietário só pode ser alterado pelo Gerenciador")
  if (target[0].role === "admin" && target[0].status === "active" && (nextRole !== "admin" || nextStatus === "suspended" || nextStatus === "removed")) {
    const admins = await db.select({ total: count() }).from(members).where(and(eq(members.organizationId, organizationId), or(eq(members.role, "admin"),eq(members.role,"owner")), eq(members.status, "active")))
    if (Number(admins[0]?.total ?? 0) <= 1) throw new Error("Não é possível remover, suspender ou rebaixar o último administrador ativo")
  }
}

export async function updateMemberRole(memberId: string, role: "editor") {
  const context = await requireCompanyRole(["admin"])
  await ensureNotLastAdmin(memberId, context.organization.id, role, undefined)
  await db.update(members).set({ role }).where(and(eq(members.id, memberId), eq(members.organizationId, context.organization.id)))
  await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "member.role_changed", entityType: "member", entityId: memberId, metadata: { role } })
  revalidatePath("/configuracoes")
}

export async function updateMemberStatus(memberId: string, status: "active" | "suspended" | "removed") {
  const context = await requireCompanyRole(["admin"])
  const target=await db.select({role:members.role}).from(members).where(and(eq(members.id,memberId),eq(members.organizationId,context.organization.id))).limit(1)
  if(!target[0])throw new Error("Usuário não encontrado")
  if(isGlobalAdmin(target[0].role))throw new Error("Administradores são gerenciados pelo Gerenciador da plataforma")
  await ensureNotLastAdmin(memberId, context.organization.id, undefined, status)
  await db.update(members).set({ status }).where(and(eq(members.id, memberId), eq(members.organizationId, context.organization.id)))
  await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: `member.${status}`, entityType: "member", entityId: memberId })
  revalidatePath("/configuracoes")
}

export async function listOrganizationDevelopments() {
  const context = await requireCompanyRole(["admin"])
  return db.select({id:developments.id,name:developments.name}).from(developments).where(eq(developments.organizationId,context.organization.id))
}

export async function setDevelopmentAssignment(memberId:string,developmentId:string,role:Exclude<DevelopmentRole,"admin">|null) {
  const context=await requireCompanyRole(["admin"])
  const [person,development]=await Promise.all([
    db.select().from(members).where(and(eq(members.id,memberId),eq(members.organizationId,context.organization.id))).limit(1),
    db.select({id:developments.id}).from(developments).where(and(eq(developments.id,developmentId),eq(developments.organizationId,context.organization.id))).limit(1),
  ])
  if(!person[0]||!development[0])throw new Error("Usuário ou empreendimento não encontrado")
  if(isGlobalAdmin(person[0].role))throw new Error("O Administrador já possui acesso a todos os empreendimentos")
  if(role && role!=="editor")throw new Error("Novos acessos de empreendimento devem utilizar o perfil Construtor")
  await db.delete(developmentAssignments).where(and(eq(developmentAssignments.organizationId,context.organization.id),eq(developmentAssignments.memberId,memberId),eq(developmentAssignments.developmentId,developmentId)))
  if(role)await db.insert(developmentAssignments).values({id:crypto.randomUUID(),organizationId:context.organization.id,memberId,developmentId,role})
  await recordAudit({organizationId:context.organization.id,actorId:context.user.id,action:role?"development.access_granted":"development.access_revoked",entityType:"development",entityId:developmentId,metadata:{memberId,role}})
  revalidatePath("/configuracoes");revalidatePath("/empreendimentos")
}

export async function createOrganizationInvitation(input:{email:string;name:string;developmentId:string;role?:string}) {
  const context=await requireCompanyRole(["admin"])
  const email=input.email.trim().toLowerCase()
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!input.name.trim())throw new Error("Informe nome e e-mail válidos")
  const owned=await db.select({id:developments.id}).from(developments).where(and(eq(developments.id,input.developmentId),eq(developments.organizationId,context.organization.id))).limit(1)
  if(!owned[0])throw new Error("Selecione um empreendimento válido")
  const existing=await db.select({id:members.id,role:members.role}).from(members).innerJoin(user,eq(members.userId,user.id))
    .where(and(eq(members.organizationId,context.organization.id),eq(user.email,email))).limit(1)
  if(existing[0]) {
    if(isGlobalAdmin(existing[0].role))throw new Error("O usuário já é Administrador da construtora")
    await setDevelopmentAssignment(existing[0].id,input.developmentId,"editor")
    return ""
  }
  const token=crypto.randomUUID()
  await db.insert(organizationInvitations).values({id:crypto.randomUUID(),organizationId:context.organization.id,email,name:input.name.trim(),role:"editor",developmentIds:[input.developmentId],tokenHash:hashToken(token),expiresAt:new Date(Date.now()+7*24*60*60*1000),invitedBy:context.user.id})
  await recordAudit({organizationId:context.organization.id,actorId:context.user.id,action:"invitation.created",entityType:"invitation",entityId:hashToken(token),metadata:{email,role:"editor",developmentIds:[input.developmentId]}})
  return "/convite/"+token
}

export async function cancelOrganizationInvitation(id: string) {
  const context = await requireCompanyRole(["admin"])
  await db.update(organizationInvitations).set({ status: "canceled", canceledAt: new Date() }).where(and(eq(organizationInvitations.id, id), eq(organizationInvitations.organizationId, context.organization.id), eq(organizationInvitations.status, "pending")))
  await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "invitation.canceled", entityType: "invitation", entityId: id })
  revalidatePath("/configuracoes")
}

export async function getInvitationPreview(token: string) {
  try {
    const rows = await db.select({ invitation: organizationInvitations, organization: organizations }).from(organizationInvitations).innerJoin(organizations, eq(organizationInvitations.organizationId, organizations.id)).where(and(eq(organizationInvitations.tokenHash, hashToken(token)), eq(organizationInvitations.status, "pending"))).limit(1)
    const row = rows[0]
    if (!row || row.invitation.expiresAt < new Date()) return null
    return { organization: row.organization, email: row.invitation.email, name: row.invitation.name, role: row.invitation.role, developmentIds: row.invitation.developmentIds, expiresAt: row.invitation.expiresAt }
  } catch {
    return null
  }
}

export async function acceptOrganizationInvitation(token: string) {
  const current = await requireAuthenticatedUser()
  const tokenHash = hashToken(token)

  const accepted = await db.transaction(async (tx) => {
    const rows = await tx.select().from(organizationInvitations).where(and(
      eq(organizationInvitations.tokenHash, tokenHash),
      eq(organizationInvitations.status, "pending"),
    )).limit(1)
    const invite = rows[0]
    if (!invite || invite.expiresAt < new Date()) throw new Error("Convite inválido ou expirado")
    if (invite.email !== current.email.toLowerCase()) throw new Error("Este convite foi enviado para outro e-mail")

    // Serializa aceites do mesmo usuário. Isso impede que dois convites/tabs concorrentes
    // criem memberships duplicados para a mesma construtora.
    await tx.execute(sql`select "id" from "user" where "id" = ${current.id} for update`)

    const claimed = await tx.update(organizationInvitations)
      .set({ status: "accepted", acceptedBy: current.id, acceptedAt: new Date() })
      .where(and(
        eq(organizationInvitations.id, invite.id),
        eq(organizationInvitations.status, "pending"),
      ))
      .returning({ id: organizationInvitations.id })
    if (!claimed[0]) throw new Error("Este convite já foi utilizado")

    const existing = await tx.select().from(members).where(and(
      eq(members.organizationId, invite.organizationId),
      eq(members.userId, current.id),
    )).limit(1)
    if (existing[0] && existing[0].status !== "active") throw new Error("Solicite a reativação do seu acesso")
    const memberId = existing[0]?.id ?? crypto.randomUUID()

    if (invite.role === "admin") {
      if (existing[0]) {
        await tx.update(members).set({ role: "admin", status: "active", lastAccessAt: new Date() }).where(eq(members.id, memberId))
      } else {
        await tx.insert(members).values({ id: memberId, organizationId: invite.organizationId, userId: current.id, role: "admin", status: "active", lastAccessAt: new Date() })
      }
    } else {
      const allowed = await tx.select({ id: developments.id }).from(developments).where(and(
        eq(developments.organizationId, invite.organizationId),
        inArray(developments.id, invite.developmentIds),
      ))
      if (!allowed.length || allowed.length !== invite.developmentIds.length) throw new Error("Empreendimento não disponível")
      if (!existing[0]) {
        await tx.insert(members).values({ id: memberId, organizationId: invite.organizationId, userId: current.id, role: "editor", status: "active", lastAccessAt: new Date() })
      }
      if (existing[0] && isGlobalAdmin(existing[0].role)) throw new Error("O usuário já possui acesso administrativo")

      for (const developmentId of invite.developmentIds) {
        await tx.delete(developmentAssignments).where(and(
          eq(developmentAssignments.organizationId, invite.organizationId),
          eq(developmentAssignments.memberId, memberId),
          eq(developmentAssignments.developmentId, developmentId),
        ))
        await tx.insert(developmentAssignments).values({
          id: crypto.randomUUID(),
          organizationId: invite.organizationId,
          developmentId,
          memberId,
          role: "editor",
        })
      }
    }

    return invite
  })

  await recordAudit({
    organizationId: accepted.organizationId,
    actorId: current.id,
    action: "invitation.accepted",
    entityType: "invitation",
    entityId: accepted.id,
    metadata: { role: accepted.role },
  })
  revalidatePath("/configuracoes")
  revalidatePath("/gerenciador")
  return accepted.organizationId
}

export async function createOrganization(input: { name: string; logo?: string; initials?: string; primaryColor?: string }) {
  await requirePlatformManager()
  const current = await requireAuthenticatedUser()
  const name = input.name.trim()
  if (!name) throw new Error("Informe o nome da construtora")
  const organizationId = crypto.randomUUID()
  const metadata = JSON.stringify({ initials: (input.initials?.trim() || name.slice(0, 2)).toUpperCase().slice(0, 4), primaryColor: input.primaryColor || "#2563eb" })
  await db.insert(organizations).values({ id: organizationId, name, logo: input.logo?.trim() || null, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${organizationId.slice(0, 8)}`, metadata })
  await db.update(developments).set({ organizationId }).where(and(eq(developments.userId, current.id), isNull(developments.organizationId)))
  revalidatePath("/gerenciador")
}

export async function updateOrganization(input: { name: string; logo?: string; initials?: string; primaryColor?: string }) {
  const context = await requireCompanyRole(["admin"])
  const previous = context.organization.metadata ? JSON.parse(context.organization.metadata) as Record<string, unknown> : {}
  const metadata = JSON.stringify({ ...previous, initials: (input.initials?.trim() || String(previous.initials || input.name.slice(0, 2))).toUpperCase().slice(0, 4), primaryColor: input.primaryColor || previous.primaryColor || "#2563eb" })
  await db.update(organizations).set({ name: input.name.trim(), logo: input.logo?.trim() || null, metadata }).where(eq(organizations.id, context.organization.id))
  await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "organization.updated", entityType: "organization", entityId: context.organization.id })
  revalidatePath("/perfil"); revalidatePath("/configuracoes")
}
