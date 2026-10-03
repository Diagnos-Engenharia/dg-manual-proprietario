"use server"

import { createHash, randomBytes } from "node:crypto"
import { hashPassword } from "better-auth/crypto"
import { and, asc, eq, gt, isNull, ne, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { account, auditLogs, clientAccesses, clientPasswordResets, developmentUnits, developments, members, organizationInvitations, session, user } from "@/lib/db/schema"
import { requireCompanyRole } from "@/lib/organization"
import { ClientAccessError } from "@/lib/clients"
import { assertId, cleanText, InputValidationError } from "@/lib/security/input"
import { consumeRateLimit, RateLimitError } from "@/lib/security/rate-limit"
import type { ClientActionResult, ClientAdminData, ClientUserRow } from "@/lib/client-types"

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex")
const unitLabel = (unit: { tower: string; number: string }) => [unit.tower, "Unidade " + unit.number].filter(Boolean).join(" · ")

function failure(error: unknown): ClientActionResult<never> {
  if (error instanceof InputValidationError || error instanceof ClientAccessError || error instanceof RateLimitError) return { ok: false, message: error.message }
  if (error instanceof Error && /^(Não autenticado|Conta inativa|Organização não configurada|Selecione a construtora ativa|Você não tem permissão)/.test(error.message)) return { ok: false, message: "Entre com uma conta de Administrador da construtora para concluir esta ação." }
  return { ok: false, message: "Não foi possível concluir a operação. Tente novamente." }
}

function revalidateClients() { revalidatePath("/usuarios"); revalidatePath("/meu-manual") }

async function lockOrganization(tx: Transaction, organizationId: string) {
  await tx.execute(sql`select "id" from "organization" where "id" = ${organizationId} for update`)
}

async function audit(tx: Transaction, actorId: string, organizationId: string, action: string, entityId: string, metadata: Record<string, unknown> = {}) {
  await tx.insert(auditLogs).values({ id: crypto.randomUUID(), actorId, organizationId, action, entityType: "client_access", entityId, metadata })
}

async function requireClientOnlyCredential(tx: Transaction, userId: string, organizationId: string) {
  const profile = (await tx.select({ platformRole: user.platformRole, accessStatus: user.accessStatus }).from(user).where(eq(user.id, userId)).limit(1))[0]
  if (!profile || profile.accessStatus !== "active") throw new ClientAccessError(403, "A conta está inativa. Solicite a reativação ao Gerenciador.")
  const staff = await tx.select({ id: members.id }).from(members).where(eq(members.userId, userId)).limit(1)
  if (profile.platformRole || staff[0]) throw new ClientAccessError(403, "Esta conta também possui acesso interno. A recuperação da senha deve ser feita pelo responsável pela conta interna.")
  const shared=(await tx.select({id:clientAccesses.id}).from(clientAccesses).where(and(eq(clientAccesses.userId,userId),ne(clientAccesses.organizationId,organizationId))).limit(1))[0]
  if(shared)throw new ClientAccessError(403,"Esta conta é compartilhada entre construtoras. Solicite a recuperação da senha ao suporte responsável pela conta.")
  const credential = (await tx.select({ id: account.id }).from(account).where(and(eq(account.userId, userId), eq(account.providerId, "credential"))).limit(1))[0]
  if (!credential) throw new ClientAccessError(409, "Esta conta não utiliza senha. Entre pelo método de acesso original.")
  return credential
}

export async function listClientAdminData(): Promise<ClientAdminData> {
  const context = await requireCompanyRole(["admin"])
  const organizationId = context.organization.id
  const [rows, projects, units] = await Promise.all([
    db.select({ access: clientAccesses, tower: developmentUnits.tower, number: developmentUnits.number, developmentName: developments.name }).from(clientAccesses)
      .innerJoin(developmentUnits, and(eq(developmentUnits.id, clientAccesses.unitId), eq(developmentUnits.developmentId, clientAccesses.developmentId), eq(developmentUnits.organizationId, clientAccesses.organizationId)))
      .innerJoin(developments, and(eq(developments.id, clientAccesses.developmentId), eq(developments.organizationId, clientAccesses.organizationId)))
      .where(eq(clientAccesses.organizationId, organizationId)).orderBy(asc(clientAccesses.createdAt)),
    db.select({ id: developments.id, name: developments.name }).from(developments).where(eq(developments.organizationId, organizationId)).orderBy(asc(developments.name)),
    db.select({ id: developmentUnits.id, developmentId: developmentUnits.developmentId, tower: developmentUnits.tower, number: developmentUnits.number }).from(developmentUnits).where(eq(developmentUnits.organizationId, organizationId)).orderBy(asc(developmentUnits.tower), asc(developmentUnits.number)),
  ])
  return {
    organizationId: context.organization.id, organizationName: context.organization.name, developments: projects,
    units: units.map(unit => ({ id: unit.id, developmentId: unit.developmentId, label: unitLabel(unit) })),
    clients: rows.map(({ access, tower, number, developmentName }): ClientUserRow => ({ id: access.id, userId: access.userId, name: access.name, email: access.email, unitId: access.unitId, unitLabel: unitLabel({ tower, number }), developmentId: access.developmentId, developmentName, status: access.status as ClientUserRow["status"], createdAt: access.createdAt.toISOString() })),
  }
}

export async function createClientInvitation(input: { name: string; email: string; unitId: string }): Promise<ClientActionResult<{ invitationPath: string }>> {
  try {
    const context = await requireCompanyRole(["admin"])
    await consumeRateLimit("client-invite:" + context.user.id, { max: 40, windowSeconds: 3600 })
    const name = cleanText(typeof input.name === "string" ? input.name : "", "Nome", 160)
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : ""
    if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputValidationError("Informe um e-mail válido.")
    const unitId = assertId(input.unitId, "Unidade")
    const token = randomBytes(32).toString("base64url")
    await db.transaction(async tx => {
      await lockOrganization(tx, context.organization.id)
      const unit = (await tx.select().from(developmentUnits).where(and(eq(developmentUnits.id, unitId), eq(developmentUnits.organizationId, context.organization.id))).limit(1))[0]
      if (!unit) throw new ClientAccessError(404, "Unidade não encontrada nesta construtora.")
      const existing = (await tx.select().from(clientAccesses).where(and(eq(clientAccesses.organizationId, context.organization.id), eq(clientAccesses.unitId, unitId), eq(clientAccesses.email, email))).limit(1).for("update"))[0]
      if (existing && existing.status !== "pending") throw new ClientAccessError(409, "Este cliente já está cadastrado nesta unidade. Use as ações de acesso do cadastro existente.")
      const accessId = existing?.id ?? crypto.randomUUID()
      if (existing) await tx.update(clientAccesses).set({ name, updatedAt: new Date() }).where(eq(clientAccesses.id, accessId))
      else await tx.insert(clientAccesses).values({ id: accessId, organizationId: context.organization.id, developmentId: unit.developmentId, unitId, email, name, createdBy: context.user.id })
      await tx.update(organizationInvitations).set({ status: "canceled", canceledAt: new Date() }).where(and(eq(organizationInvitations.clientAccessId, accessId), eq(organizationInvitations.organizationId, context.organization.id), eq(organizationInvitations.status, "pending")))
      await tx.insert(organizationInvitations).values({ id: crypto.randomUUID(), organizationId: context.organization.id, email, name, role: "client", developmentIds: [unit.developmentId], unitId, clientAccessId: accessId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), invitedBy: context.user.id })
      await audit(tx, context.user.id, context.organization.id, "client.invited", accessId, { unitId })
    })
    revalidateClients()
    return { ok: true, message: "Convite criado. Copie o link para enviar ao cliente.", data: { invitationPath: "/convite/" + token } }
  } catch (error) { return failure(error) }
}

export async function setClientAccessStatus(input: { id: string; enabled: boolean }): Promise<ClientActionResult> {
  try {
    const context = await requireCompanyRole(["admin"])
    const id = assertId(input.id, "Cliente")
    if (typeof input.enabled !== "boolean") throw new InputValidationError("Informe o estado do acesso.")
    await consumeRateLimit("client-access:" + context.user.id, { max: 120, windowSeconds: 3600 })
    await db.transaction(async tx => {
      await lockOrganization(tx, context.organization.id)
      const access = (await tx.select().from(clientAccesses).where(and(eq(clientAccesses.id, id), eq(clientAccesses.organizationId, context.organization.id))).limit(1).for("update"))[0]
      if (!access) throw new ClientAccessError(404, "Cliente não encontrado nesta construtora.")
      if(access.userId)await tx.execute(sql`select "id" from "user" where "id" = ${access.userId} for update`)
      const status = input.enabled ? access.userId ? "active" : "pending" : "disabled"
      await tx.update(clientAccesses).set({ status, updatedAt: new Date() }).where(and(eq(clientAccesses.id, id), eq(clientAccesses.organizationId, context.organization.id)))
      if (!input.enabled) await tx.update(clientPasswordResets).set({ usedAt: new Date() }).where(and(eq(clientPasswordResets.clientAccessId, id), isNull(clientPasswordResets.usedAt)))
      await audit(tx, context.user.id, context.organization.id, "client.access_changed", id, { before: access.status, after: status })
    })
    revalidateClients()
    return { ok: true, message: input.enabled ? "Acesso do cliente habilitado." : "Acesso do cliente desabilitado." }
  } catch (error) { return failure(error) }
}

export async function setAllClientsAccessStatus(input: { enabled: boolean; organizationId: string }): Promise<ClientActionResult> {
  try {
    const context = await requireCompanyRole(["admin"])
    const organizationId = assertId(input.organizationId, "Construtora")
    if (organizationId !== context.organization.id) throw new ClientAccessError(409, "A construtora ativa mudou. Atualize a página antes de alterar os acessos.")
    if (typeof input.enabled !== "boolean") throw new InputValidationError("Informe o estado do acesso.")
    await consumeRateLimit("client-access-all:" + context.user.id, { max: 20, windowSeconds: 3600 })
    await db.transaction(async tx => {
      await lockOrganization(tx, context.organization.id)
      const affected=await tx.select({userId:clientAccesses.userId}).from(clientAccesses).where(eq(clientAccesses.organizationId,context.organization.id)).for("update")
      for(const userId of [...new Set(affected.map(row=>row.userId).filter((id):id is string=>Boolean(id)))].sort())await tx.execute(sql`select "id" from "user" where "id" = ${userId} for update`)
      await tx.update(clientAccesses).set({ status: input.enabled ? sql`case when ${clientAccesses.userId} is null then 'pending' else 'active' end` : "disabled", updatedAt: new Date() }).where(eq(clientAccesses.organizationId, context.organization.id))
      if (!input.enabled) await tx.update(clientPasswordResets).set({ usedAt: new Date() }).where(and(eq(clientPasswordResets.organizationId, context.organization.id), isNull(clientPasswordResets.usedAt)))
      await audit(tx, context.user.id, context.organization.id, "client.all_access_changed", context.organization.id, { enabled: input.enabled })
    })
    revalidateClients()
    return { ok: true, message: input.enabled ? "Acessos dos clientes desta construtora habilitados." : "Acessos dos clientes desta construtora desabilitados." }
  } catch (error) { return failure(error) }
}

export async function deleteClientAccess(input: { id: string }): Promise<ClientActionResult> {
  try {
    const context=await requireCompanyRole(["admin"])
    const id=assertId(input.id,"Cliente")
    await consumeRateLimit("client-delete:"+context.user.id,{max:30,windowSeconds:3600})
    await db.transaction(async tx=>{
      await lockOrganization(tx,context.organization.id)
      const access=(await tx.select().from(clientAccesses).where(and(eq(clientAccesses.id,id),eq(clientAccesses.organizationId,context.organization.id))).limit(1).for("update"))[0]
      if(!access)throw new ClientAccessError(404,"Cliente não encontrado nesta construtora.")
      if(access.userId)await tx.execute(sql`select "id" from "user" where "id" = ${access.userId} for update`)
      // Reset tokens and client invitations reference this access and cascade with it.
      await tx.delete(clientAccesses).where(and(eq(clientAccesses.id,id),eq(clientAccesses.organizationId,context.organization.id)))
      let sessionsRevoked=false
      if(access.userId){
        const profile=await tx.select({platformRole:user.platformRole}).from(user).where(eq(user.id,access.userId)).limit(1)
        const staff=await tx.select({id:members.id}).from(members).where(eq(members.userId,access.userId)).limit(1)
        const remaining=await tx.select({id:clientAccesses.id}).from(clientAccesses).where(eq(clientAccesses.userId,access.userId)).limit(1)
        if(profile[0] && !profile[0].platformRole && !staff[0] && !remaining[0]){
          await tx.delete(session).where(eq(session.userId,access.userId))
          sessionsRevoked=true
        }
      }
      await audit(tx,context.user.id,context.organization.id,"client.access_deleted",id,{unitId:access.unitId,sessionsRevoked})
    })
    revalidateClients()
    return {ok:true,message:"Acesso de cliente removido desta construtora."}
  }catch(error){return failure(error)}
}

export async function createClientPasswordReset(input: { id: string }): Promise<ClientActionResult<{ resetPath: string }>> {
  try {
    const context = await requireCompanyRole(["admin"])
    const id = assertId(input.id, "Cliente")
    await consumeRateLimit("client-reset-create:" + context.user.id, { max: 30, windowSeconds: 3600 })
    const token = randomBytes(32).toString("base64url")
    await db.transaction(async tx => {
      await lockOrganization(tx, context.organization.id)
      const access = (await tx.select().from(clientAccesses).where(and(eq(clientAccesses.id, id), eq(clientAccesses.organizationId, context.organization.id), eq(clientAccesses.status, "active"))).limit(1).for("update"))[0]
      if (!access?.userId) throw new ClientAccessError(409, "O cliente precisa aceitar o convite e ter acesso ativo antes de redefinir a senha.")
      await tx.execute(sql`select "id" from "user" where "id" = ${access.userId} for update`)
      await requireClientOnlyCredential(tx, access.userId, context.organization.id)
      await tx.update(clientPasswordResets).set({ usedAt: new Date() }).where(and(eq(clientPasswordResets.userId, access.userId), isNull(clientPasswordResets.usedAt)))
      await tx.insert(clientPasswordResets).values({ id: crypto.randomUUID(), organizationId: context.organization.id, clientAccessId: id, userId: access.userId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 15 * 60 * 1000), createdBy: context.user.id })
      await audit(tx, context.user.id, context.organization.id, "client.password_reset_created", id)
    })
    return { ok: true, message: "Link de redefinição criado. Ele expira em 15 minutos e só pode ser utilizado uma vez.", data: { resetPath: "/redefinir-senha/" + token } }
  } catch (error) { return failure(error) }
}

export async function resetClientPassword(input: { token: string; password: string }): Promise<ClientActionResult> {
  try {
    if (typeof input.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(input.token)) throw new InputValidationError("Link de redefinição inválido ou expirado.")
    if (typeof input.password !== "string" || input.password.length < 8 || input.password.length > 128) throw new InputValidationError("A senha deve ter entre 8 e 128 caracteres.")
    const incoming = await headers()
    const ip = (incoming.get("x-forwarded-for")?.split(",")[0]?.trim() || incoming.get("x-real-ip") || "unknown").slice(0,100)
    await consumeRateLimit("client-reset-ip:" + ip, { max: 10, windowSeconds: 900 })
    const hash = tokenHash(input.token)
    await consumeRateLimit("client-reset-token:" + hash, { max: 5, windowSeconds: 900 })
    const passwordHash = await hashPassword(input.password)
    await db.transaction(async tx => {
      // Match lock order of admin mutations: organization -> client access -> user -> token.
      const preliminary = (await tx.select().from(clientPasswordResets).where(and(eq(clientPasswordResets.tokenHash, hash), isNull(clientPasswordResets.usedAt), gt(clientPasswordResets.expiresAt, new Date()))).limit(1))[0]
      if (!preliminary) throw new ClientAccessError(400, "Link de redefinição inválido ou expirado.")
      await lockOrganization(tx, preliminary.organizationId)
      const access = (await tx.select().from(clientAccesses).where(and(eq(clientAccesses.id, preliminary.clientAccessId), eq(clientAccesses.organizationId, preliminary.organizationId), eq(clientAccesses.userId, preliminary.userId), eq(clientAccesses.status, "active"))).limit(1).for("update"))[0]
      if (!access) throw new ClientAccessError(400, "Link de redefinição inválido ou expirado.")
      await tx.execute(sql`select "id" from "user" where "id" = ${preliminary.userId} for update`)
      const credential = await requireClientOnlyCredential(tx, preliminary.userId, preliminary.organizationId)
      const claimed = await tx.update(clientPasswordResets).set({ usedAt: new Date() }).where(and(eq(clientPasswordResets.id, preliminary.id), eq(clientPasswordResets.tokenHash, hash), isNull(clientPasswordResets.usedAt), gt(clientPasswordResets.expiresAt, new Date()))).returning({ id: clientPasswordResets.id })
      if (!claimed[0]) throw new ClientAccessError(400, "Link de redefinição inválido ou expirado.")
      await tx.update(account).set({ password: passwordHash, updatedAt: new Date() }).where(and(eq(account.id, credential.id), eq(account.userId, preliminary.userId), eq(account.providerId, "credential")))
      await tx.update(clientPasswordResets).set({ usedAt: new Date() }).where(and(eq(clientPasswordResets.userId, preliminary.userId), isNull(clientPasswordResets.usedAt)))
      await tx.delete(session).where(eq(session.userId, preliminary.userId))
      await audit(tx, preliminary.userId, preliminary.organizationId, "client.password_reset_completed", access.id)
    })
    return { ok: true, message: "Senha atualizada. Entre novamente com sua nova senha." }
  } catch (error) { return failure(error) }
}
