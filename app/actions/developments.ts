'use server'

import { db } from '@/lib/db'
import { auditLogs, databookFiles, developments, finishingTableHistory, finishingTables, user } from '@/lib/db/schema'
import { and, desc, eq, or, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { recordAudit, requireActiveMembership, requireCompanyRole } from '@/lib/organization'

export async function getDevelopment(id: string) {
  const context = await requireActiveMembership()
  const rows = await db.select().from(developments).where(and(eq(developments.id, id), eq(developments.organizationId, context.organization.id))).limit(1)
  return rows[0] ?? null
}

export async function listDevelopments() {
  const context = await requireActiveMembership()
  return db.select().from(developments).where(eq(developments.organizationId, context.organization.id))
}

export async function createDevelopment(input: {
  id: string
  name: string
  client: string
  deliveryDate: string
  data: unknown
}) {
  const context = await requireCompanyRole(["admin", "editor"])
  await db.insert(developments).values({
    id: input.id,
    userId: context.user.id,
    organizationId: context.organization.id,
    name: input.name.trim(),
    client: input.client.trim(),
    deliveryDate: input.deliveryDate,
    data: input.data,
    masterProgress: 0,
  })
  await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "development.created", entityType: "development", entityId: input.id, metadata: { path: ["empreendimento"], before: null, after: { name: input.name, client: input.client, deliveryDate: input.deliveryDate } } })
  revalidatePath('/empreendimentos')
  revalidatePath('/')
  return input.id
}

export async function updateDevelopmentData(id: string, data: unknown) {
  const context = await requireCompanyRole(["admin", "editor"])
  await db.update(developments).set({ data, updatedAt: new Date() }).where(and(eq(developments.id, id), eq(developments.organizationId, context.organization.id)))
  revalidatePath(`/empreendimentos/${id}`)
}

export type FinishingGroup = "ambientes" | "materiais" | "hidraulicas" | "esquadrias" | "eletricas"
export type FinishingRow = Record<string, string> & { id: string }
export type FinishingTableData = { ambientes: FinishingRow[]; materiais: FinishingRow[]; hidraulicas: FinishingRow[]; esquadrias: FinishingRow[]; eletricas: FinishingRow[] }

export async function getFinishingTable(developmentId: string, typology: string) {
  const context = await requireActiveMembership()
  const rows = await db.select().from(finishingTables).where(and(eq(finishingTables.developmentId, developmentId), eq(finishingTables.organizationId, context.organization.id), eq(finishingTables.typology, typology))).limit(1)
  return rows[0] ?? null
}

export async function saveFinishingTable(input: { id?: string; developmentId: string; tower: string; typology: string; unitModel: string; area: string; data: FinishingTableData; expectedRevision?: number }) {
  const context = await requireCompanyRole(["admin", "editor"])
  const existing = input.id ? (await db.select().from(finishingTables).where(and(eq(finishingTables.id, input.id), eq(finishingTables.organizationId, context.organization.id))).limit(1))[0] : undefined
  if (existing && input.expectedRevision !== undefined && existing.revision !== input.expectedRevision) throw new Error("Esta tabela foi alterada por outro usuário. Recarregue antes de salvar.")
  const id = existing?.id ?? crypto.randomUUID()
  const revision = (existing?.revision ?? 0) + 1
  if (existing) await db.update(finishingTables).set({ tower: input.tower.trim(), unitModel: input.unitModel.trim(), area: input.area.trim(), data: input.data, revision, status: "rascunho", lastEditorId: context.user.id, updatedAt: new Date() }).where(eq(finishingTables.id, id))
  else await db.insert(finishingTables).values({ id, developmentId: input.developmentId, organizationId: context.organization.id, tower: input.tower.trim(), typology: input.typology.trim(), unitModel: input.unitModel.trim(), area: input.area.trim(), data: input.data, revision, lastEditorId: context.user.id })
  await db.insert(finishingTableHistory).values({ id: crypto.randomUUID(), finishingTableId: id, developmentId: input.developmentId, organizationId: context.organization.id, revision, status: "rascunho", data: input.data, changedBy: context.user.id })
  await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "finishing_table.edited", entityType: "finishing_table", entityId: id, metadata: { developmentId: input.developmentId, path: ["acabamentos", input.typology], before: existing?.data ?? null, after: input.data, revision, rows: Object.values(input.data).flat().length } })
  revalidatePath(`/empreendimentos/${input.developmentId}`)
  return { id, revision, updatedAt: new Date().toISOString() }
}

export async function duplicateFinishingTable(input: { sourceId: string; developmentId: string; typology: string; unitModel: string; area: string }) {
  const context = await requireCompanyRole(["admin", "editor"])
  const source = (await db.select().from(finishingTables).where(and(eq(finishingTables.id, input.sourceId), eq(finishingTables.organizationId, context.organization.id))).limit(1))[0]
  if (!source) throw new Error("Tabela de origem não encontrada")
  return saveFinishingTable({ developmentId: input.developmentId, tower: source.tower, typology: input.typology, unitModel: input.unitModel, area: input.area, data: source.data as FinishingTableData })
}

export async function listDatabookFiles(developmentId: string) {
  const context = await requireActiveMembership()
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
  const context = await requireCompanyRole(["admin", "editor"])
  if (path.length === 0 || path.some((segment) => !/^[a-zA-Z0-9_-]+$/.test(segment))) throw new Error("Caminho de persistência inválido")
  const conditions = [eq(developments.id, id), eq(developments.organizationId, context.organization.id)]
  if (expectedUpdatedAt) conditions.push(eq(developments.updatedAt, new Date(expectedUpdatedAt)))
  const beforeRows = await db.select({ data: developments.data, updatedAt: developments.updatedAt, version: developments.version }).from(developments).where(and(eq(developments.id, id), eq(developments.organizationId, context.organization.id))).limit(1)
  if (!beforeRows[0]) throw new Error("Empreendimento não encontrado")
  const previous = path.reduce<unknown>((node, key) => node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined, beforeRows[0].data)
  if (JSON.stringify(previous) === JSON.stringify(value)) return { updatedAt: beforeRows[0].updatedAt.toISOString(), version: beforeRows[0].version }
  const jsonPath = `{${path.join(",")}}`
  // jsonb_set only creates the final key: construct missing ancestors atomically.
  let nextData = sql`coalesce(${developments.data}, '{}'::jsonb)`
  for (let depth = 1; depth < path.length; depth++) {
    const parentPath = `{${path.slice(0, depth).join(",")}}`
    nextData = sql`jsonb_set(${nextData}, ${parentPath}::text[], coalesce(nullif(${developments.data} #> ${parentPath}::text[], 'null'::jsonb), '{}'::jsonb), true)`
  }
  nextData = sql`jsonb_set(${nextData}, ${jsonPath}::text[], ${JSON.stringify(value)}::jsonb, true)`
  const result = await db.update(developments).set({ data: nextData, updatedAt: new Date(), lastEditorId: context.user.id, version: sql`${developments.version} + 1` }).where(and(...conditions)).returning({ updatedAt: developments.updatedAt, version: developments.version })
  if (!result[0]) throw new Error(expectedUpdatedAt ? "Este conteúdo foi atualizado por outro usuário. Revise as alterações antes de salvar." : "Empreendimento não encontrado")
  for (const change of auditChanges(previous,value,path)) await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "development.path_edited", entityType: "development", entityId: id, metadata: { ...change, version: result[0].version } })
  revalidatePath(`/empreendimentos/${id}`)
  return { updatedAt: result[0].updatedAt.toISOString(), version: result[0].version }
}

export async function saveDevelopmentModule(id: string, module: string, value: unknown, expectedUpdatedAt?: string) {
  const context = await requireCompanyRole(["admin", "editor"])
  const conditions = [eq(developments.id, id), eq(developments.organizationId, context.organization.id)]
  if (expectedUpdatedAt) conditions.push(eq(developments.updatedAt, new Date(expectedUpdatedAt)))
  const beforeRows = await db.select({ data: developments.data }).from(developments).where(and(eq(developments.id, id), eq(developments.organizationId, context.organization.id))).limit(1)
  const previous = (beforeRows[0]?.data as Record<string, unknown> | undefined)?.[module]
  const result = await db.update(developments).set({ data: sql`coalesce(${developments.data}, '{}'::jsonb) || ${JSON.stringify({ [module]: value })}::jsonb`, updatedAt: new Date(), lastEditorId: context.user.id, version: sql`${developments.version} + 1`, workflowStatus: sql`case when ${developments.workflowStatus} in ('aprovado', 'publicado') then 'em_elaboracao' else ${developments.workflowStatus} end`, approvedVersion: null, approvedBy: null, approvedAt: null }).where(and(...conditions)).returning({ updatedAt: developments.updatedAt, version: developments.version })
  if (!result[0]) throw new Error(expectedUpdatedAt ? "Este conteúdo foi atualizado por outro usuário. Revise as alterações antes de salvar." : "Empreendimento não encontrado")
  for (const change of auditChanges(previous,value,[module])) await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "development.edited", entityType: "development", entityId: id, metadata: { ...change, version: result[0].version } })
  revalidatePath(`/empreendimentos/${id}`)
  return { updatedAt: result[0].updatedAt.toISOString(), version: result[0].version }
}


export async function listDevelopmentHistory(developmentId: string) {
  const context = await requireActiveMembership()
  const scoped = await db.select({ id: developments.id }).from(developments).where(and(eq(developments.id, developmentId), eq(developments.organizationId, context.organization.id))).limit(1)
  if (!scoped[0]) throw new Error("Empreendimento não encontrado")
  const rows = await db.select({
    id: auditLogs.id,
    action: auditLogs.action,
    metadata: auditLogs.metadata,
    createdAt: auditLogs.createdAt,
    actorName: user.name,
    actorEmail: user.email,
  }).from(auditLogs).innerJoin(user, eq(auditLogs.actorId, user.id))
    .where(and(eq(auditLogs.organizationId, context.organization.id), or(eq(auditLogs.entityId, developmentId), sql`${auditLogs.metadata} ->> 'developmentId' = ${developmentId}`)))
    .orderBy(desc(auditLogs.createdAt)).limit(200)
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
}
