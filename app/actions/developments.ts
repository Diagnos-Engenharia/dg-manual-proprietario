'use server'

import { db } from '@/lib/db'
import { auditLogs, databookFiles, developmentContentValidations, developments, finishingTableHistory, finishingTables, user } from '@/lib/db/schema'
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { isGlobalAdmin, permittedDevelopmentIds, recordAudit, requireActiveMembership, requireCompanyRole, requireDevelopmentAccess, requireDevelopmentRole } from '@/lib/organization'
import { changedValidationContexts } from '@/lib/manual-document/invalidation'
import { assertId, assertIsoDate, assertJsonPayload, assertSafeRichTextPayload, cleanText } from '@/lib/security/input'

export async function getDevelopment(id: string) {
  await requireDevelopmentAccess(id)
  const context = await requireActiveMembership()
  const rows = await db.select().from(developments).where(and(eq(developments.id, id), eq(developments.organizationId, context.organization.id))).limit(1)
  return rows[0] ?? null
}

export async function listDevelopments() {
  const context = await requireActiveMembership()
  const ids = await permittedDevelopmentIds(context)
  if(ids!==null && !ids.length)return []
  return db.select().from(developments).where(and(eq(developments.organizationId, context.organization.id),...(ids===null?[]:[inArray(developments.id,ids)])))
}

export async function createDevelopment(input: {
  id: string
  name: string
  client: string
  deliveryDate: string
  data: unknown
}) {
  const context = await requireCompanyRole(["admin"])
  const id = assertId(input.id, "Identificador do empreendimento")
  const name = cleanText(input.name, "Nome do empreendimento", 160)
  const client = cleanText(input.client, "Construtora", 160)
  const deliveryDate = assertIsoDate(input.deliveryDate, "Data de entrega")
  const data = assertJsonPayload(input.data)
  await db.insert(developments).values({
    id,
    userId: context.user.id,
    organizationId: context.organization.id,
    name,
    client,
    deliveryDate,
    data,
    masterProgress: 0,
  })
  await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "development.created", entityType: "development", entityId: id, metadata: { path: ["empreendimento"], before: null, after: { name, client, deliveryDate } } })
  revalidatePath('/empreendimentos')
  revalidatePath('/')
  return id
}

export async function updateDevelopmentData(id: string, data: unknown) {
  const context = await requireDevelopmentRole(id,["admin","admin_empreendimento","editor"])
  const safeData = assertSafeRichTextPayload(data)
  await db.transaction(async tx => {
    await tx.update(developments).set({ data: safeData, lastEditorId: context.user.id, updatedAt: new Date() }).where(and(eq(developments.id, id), eq(developments.organizationId, context.organization.id)))
    await tx.update(developmentContentValidations).set({ status: "rascunho", lastEditorId: context.user.id, validatorId: null, comment: null, updatedAt: new Date() }).where(and(eq(developmentContentValidations.developmentId,id),eq(developmentContentValidations.organizationId,context.organization.id)))
  })
  revalidatePath(`/empreendimentos/${id}`)
}

export type FinishingGroup = "ambientes" | "materiais" | "hidraulicas" | "esquadrias" | "eletricas"
export type FinishingRow = Record<string, string> & { id: string }
export type FinishingTableData = { ambientes: FinishingRow[]; materiais: FinishingRow[]; hidraulicas: FinishingRow[]; esquadrias: FinishingRow[]; eletricas: FinishingRow[] }

export async function getFinishingTable(developmentId: string, typology: string) {
  const context = await requireDevelopmentAccess(developmentId)
  const rows = await db.select().from(finishingTables).where(and(eq(finishingTables.developmentId, developmentId), eq(finishingTables.organizationId, context.organization.id), eq(finishingTables.typology, typology), isNull(finishingTables.unitId))).limit(1)
  return rows[0] ?? null
}

export async function saveFinishingTable(input: { id?: string; developmentId: string; tower: string; typology: string; unitModel: string; area: string; data: FinishingTableData; expectedRevision?: number }) {
  const context = await requireDevelopmentRole(input.developmentId,["admin","admin_empreendimento","editor"])
  const { id, revision, before } = await db.transaction(async tx => {
    // Issuance locks the same parent before its final source check. Locking it
    // here also serializes new table inserts, which have no existing row to lock.
    const development = (await tx.select({ id: developments.id }).from(developments).where(and(eq(developments.id, input.developmentId), eq(developments.organizationId, context.organization.id))).for("update"))[0]
    if (!development) throw new Error("Empreendimento não encontrado")
    const existing = input.id ? (await tx.select().from(finishingTables).where(and(eq(finishingTables.id, input.id), eq(finishingTables.developmentId,input.developmentId),eq(finishingTables.organizationId, context.organization.id))).for("update"))[0] : undefined
    if (existing?.unitId) throw new Error("Tabela da unidade: utilize a elaboração por unidade para salvar.")
    if (existing && input.expectedRevision !== undefined && existing.revision !== input.expectedRevision) throw new Error("Esta tabela foi alterada por outro usuário. Recarregue antes de salvar.")
    const id = existing?.id ?? crypto.randomUUID()
    const revision = (existing?.revision ?? 0) + 1
    if (existing) await tx.update(finishingTables).set({ tower: input.tower.trim(), unitModel: input.unitModel.trim(), area: input.area.trim(), data: input.data, revision, status: "rascunho", lastEditorId: context.user.id, updatedAt: new Date() }).where(eq(finishingTables.id, id))
    else await tx.insert(finishingTables).values({ id, developmentId: input.developmentId, organizationId: context.organization.id, tower: input.tower.trim(), typology: input.typology.trim(), unitModel: input.unitModel.trim(), area: input.area.trim(), data: input.data, revision, lastEditorId: context.user.id })
    await tx.insert(finishingTableHistory).values({ id: crypto.randomUUID(), finishingTableId: id, developmentId: input.developmentId, organizationId: context.organization.id, revision, status: "rascunho", data: input.data, changedBy: context.user.id })
    return { id, revision, before: existing?.data ?? null }
  })
  await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "finishing_table.edited", entityType: "finishing_table", entityId: id, metadata: { developmentId: input.developmentId, path: ["acabamentos", input.typology], before, after: input.data, revision, rows: Object.values(input.data).flat().length } })
  revalidatePath(`/empreendimentos/${input.developmentId}`)
  return { id, revision, updatedAt: new Date().toISOString() }
}

export async function duplicateFinishingTable(input: { sourceId: string; developmentId: string; typology: string; unitModel: string; area: string }) {
  const context = await requireDevelopmentRole(input.developmentId,["admin","admin_empreendimento","editor"])
  const source = (await db.select().from(finishingTables).where(and(eq(finishingTables.id, input.sourceId),eq(finishingTables.developmentId,input.developmentId), eq(finishingTables.organizationId, context.organization.id))).limit(1))[0]
  if (!source) throw new Error("Tabela de origem não encontrada")
  return saveFinishingTable({ developmentId: input.developmentId, tower: source.tower, typology: input.typology, unitModel: input.unitModel, area: input.area, data: source.data as FinishingTableData })
}

export async function listDatabookFiles(developmentId: string) {
  const context = await requireDevelopmentAccess(developmentId)
  const rows = await db.select({ file: databookFiles }).from(databookFiles).innerJoin(developments, eq(databookFiles.developmentId, developments.id)).where(and(eq(databookFiles.developmentId, developmentId), eq(developments.organizationId, context.organization.id)))
  return rows.map(({ file }) => file)
}


type AuditChange = { path: string[]; before: unknown; after: unknown }
function auditChanges(before: unknown, after: unknown, path: string[], depth = 0): AuditChange[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return []
  if (depth > 5 || before == null || after == null) return [{ path, before: before ?? null, after: after ?? null }]
  if (Array.isArray(before) && Array.isArray(after) && before.every(x => x && typeof x.id === "string") && after.every(x => x && typeof x.id === "string")) {
    const oldMap = new Map(before.map(x => [x.id as string, x]))
    const newMap = new Map(after.map(x => [x.id as string, x]))
    const changes = Array.from(new Set([...oldMap.keys(),...newMap.keys()])).flatMap(id => auditChanges(oldMap.get(id),newMap.get(id),[...path,id],depth+1))
    if (before.map(x=>x.id).join("|") !== after.map(x=>x.id).join("|")) changes.push({path:[...path,"ordem"],before:before.map(x=>x.id),after:after.map(x=>x.id)})
    return changes.length > 80 ? [{path,before,after}] : changes
  }
  if (!Array.isArray(before) && !Array.isArray(after) && typeof before === "object" && typeof after === "object") {
    const b = before as Record<string,unknown>, a = after as Record<string,unknown>
    const changes = Array.from(new Set([...Object.keys(b),...Object.keys(a)])).flatMap(key => auditChanges(b[key],a[key],[...path,key],depth+1))
    return changes.length > 80 ? [{path,before,after}] : changes
  }
  return [{path,before,after}]
}

export async function saveDevelopmentModulePath(id: string, path: string[], value: unknown, expectedUpdatedAt?: string) {
  const context = await requireDevelopmentRole(id,["admin","admin_empreendimento","editor"])
  if (path.length === 0 || path.length > 8 || path.some((segment) => !/^[a-zA-Z0-9_-]{1,100}$/.test(segment))) throw new Error("Caminho de persistência inválido")
  const safeValue = path[0] === "manuals" ? assertSafeRichTextPayload(value) : assertJsonPayload(value)
  const conditions = [eq(developments.id, id), eq(developments.organizationId, context.organization.id)]
  if (expectedUpdatedAt) conditions.push(eq(developments.updatedAt, new Date(expectedUpdatedAt)))
  const beforeRows = await db.select({ data: developments.data, updatedAt: developments.updatedAt, version: developments.version }).from(developments).where(and(eq(developments.id, id), eq(developments.organizationId, context.organization.id))).limit(1)
  if (!beforeRows[0]) throw new Error("Empreendimento não encontrado")
  const previous = path.reduce<unknown>((node, key) => node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined, beforeRows[0].data)
  if (JSON.stringify(previous) === JSON.stringify(safeValue)) return { updatedAt: beforeRows[0].updatedAt.toISOString(), version: beforeRows[0].version }
  const jsonPath = `{${path.join(",")}}`
  // jsonb_set only creates the final key: construct missing ancestors atomically.
  let nextData = sql`coalesce(${developments.data}, '{}'::jsonb)`
  for (let depth = 1; depth < path.length; depth++) {
    const parentPath = `{${path.slice(0, depth).join(",")}}`
    nextData = sql`jsonb_set(${nextData}, ${parentPath}::text[], coalesce(nullif(${developments.data} #> ${parentPath}::text[], 'null'::jsonb), '{}'::jsonb), true)`
  }
  nextData = sql`jsonb_set(${nextData}, ${jsonPath}::text[], ${JSON.stringify(safeValue)}::jsonb, true)`
  const result = await db.transaction(async tx => {
    const saved = await tx.update(developments).set({ data: nextData, updatedAt: new Date(), lastEditorId: context.user.id, version: sql`${developments.version} + 1` }).where(and(...conditions)).returning({ data: developments.data, updatedAt: developments.updatedAt, version: developments.version })
    if (saved[0]) for (const change of changedValidationContexts(beforeRows[0].data, saved[0].data)) await tx.update(developmentContentValidations).set({ status: "rascunho", lastEditorId: context.user.id, validatorId: null, comment: null, updatedAt: new Date() }).where(and(eq(developmentContentValidations.developmentId,id),eq(developmentContentValidations.organizationId,context.organization.id),eq(developmentContentValidations.section,change.section),eq(developmentContentValidations.contextKey,change.contextKey)))
    return saved
  })
  if (!result[0]) throw new Error(expectedUpdatedAt ? "Este conteúdo foi atualizado por outro usuário. Revise as alterações antes de salvar." : "Empreendimento não encontrado")
  for (const change of auditChanges(previous,safeValue,path)) await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "development.path_edited", entityType: "development", entityId: id, metadata: { ...change, version: result[0].version } })
  revalidatePath(`/empreendimentos/${id}`)
  return { updatedAt: result[0].updatedAt.toISOString(), version: result[0].version }
}

export async function saveDevelopmentModule(id: string, module: string, value: unknown, expectedUpdatedAt?: string) {
  const context = await requireDevelopmentRole(id,["admin","admin_empreendimento","editor"])
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(module)) throw new Error("Módulo inválido")
  const safeValue = assertSafeRichTextPayload(value)
  const conditions = [eq(developments.id, id), eq(developments.organizationId, context.organization.id)]
  if (expectedUpdatedAt) conditions.push(eq(developments.updatedAt, new Date(expectedUpdatedAt)))
  const beforeRows = await db.select({ data: developments.data }).from(developments).where(and(eq(developments.id, id), eq(developments.organizationId, context.organization.id))).limit(1)
  const previous = (beforeRows[0]?.data as Record<string, unknown> | undefined)?.[module]
  const result = await db.transaction(async tx => {
    const saved = await tx.update(developments).set({ data: sql`coalesce(${developments.data}, '{}'::jsonb) || ${JSON.stringify({ [module]: safeValue })}::jsonb`, updatedAt: new Date(), lastEditorId: context.user.id, version: sql`${developments.version} + 1`, workflowStatus: sql`case when ${developments.workflowStatus} in ('aprovado', 'publicado') then 'em_elaboracao' else ${developments.workflowStatus} end`, approvedVersion: null, approvedBy: null, approvedAt: null }).where(and(...conditions)).returning({ data: developments.data, updatedAt: developments.updatedAt, version: developments.version })
    if (saved[0]) for (const change of changedValidationContexts(beforeRows[0]?.data, saved[0].data)) await tx.update(developmentContentValidations).set({ status: "rascunho", lastEditorId: context.user.id, validatorId: null, comment: null, updatedAt: new Date() }).where(and(eq(developmentContentValidations.developmentId,id),eq(developmentContentValidations.organizationId,context.organization.id),eq(developmentContentValidations.section,change.section),eq(developmentContentValidations.contextKey,change.contextKey)))
    return saved
  })
  if (!result[0]) throw new Error(expectedUpdatedAt ? "Este conteúdo foi atualizado por outro usuário. Revise as alterações antes de salvar." : "Empreendimento não encontrado")
  for (const change of auditChanges(previous,safeValue,[module])) await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "development.edited", entityType: "development", entityId: id, metadata: { ...change, version: result[0].version } })
  revalidatePath(`/empreendimentos/${id}`)
  return { updatedAt: result[0].updatedAt.toISOString(), version: result[0].version }
}


export async function listDevelopmentHistory(developmentId: string) {
  const context = await requireDevelopmentAccess(developmentId)
  const scoped = await db.select({ id: developments.id }).from(developments).where(and(eq(developments.id, developmentId), eq(developments.organizationId, context.organization.id))).limit(1)
  if (!scoped[0]) throw new Error("Empreendimento não encontrado")
  const rows = await db.select({
    id: auditLogs.id,
    action: auditLogs.action,
    metadata: auditLogs.metadata,
    createdAt: auditLogs.createdAt,
    actorName: user.name,
    actorEmail: user.email,
  }).from(auditLogs).leftJoin(user, eq(auditLogs.actorId, user.id))
    .where(and(eq(auditLogs.organizationId, context.organization.id), or(eq(auditLogs.entityId, developmentId), sql`${auditLogs.metadata} ->> 'developmentId' = ${developmentId}`)))
    .orderBy(desc(auditLogs.createdAt)).limit(200)
  return rows.map((row) => ({ ...row, actorName: row.actorName ?? "Usuário removido", actorEmail: row.actorEmail ?? "", createdAt: row.createdAt.toISOString() }))
}
