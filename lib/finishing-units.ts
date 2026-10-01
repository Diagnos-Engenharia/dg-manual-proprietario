import { createHash } from "node:crypto"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { auditLogs, developmentUnits, developments, finishingTableHistory, finishingTables, manualVersions, organizations } from "@/lib/db/schema"
import { canEditContent, canValidateContent, requireDevelopmentAccess } from "@/lib/organization"
import { finishingProblems, normalizeFinishingData, normalizeUnitInput, normalizedUnitKey } from "@/lib/finishing-content"
import type { DevelopmentUnit, FinishingMutation, FinishingTable, FinishingUnitSummary, UnitCatalog, UnitDocumentVersion, UnitInput } from "@/lib/finishing-types"
import { assessFinishingReadiness, buildFinishingDocument, type FinishingDocumentSource } from "@/lib/manual-document/finishing"
import { hydrateDocumentImage } from "@/lib/manual-document/service"
import { paginateManualDocument } from "@/lib/manual-document/paginate"
import type { ManualPreview } from "@/lib/manual-document/types"

type AccessContext = Awaited<ReturnType<typeof requireDevelopmentAccess>>
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Reader = Pick<typeof db, "select">
type UnitRow = typeof developmentUnits.$inferSelect
type TableRow = typeof finishingTables.$inferSelect
type VersionRow = typeof manualVersions.$inferSelect
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
const canonical = (value: unknown): string => JSON.stringify(value, (_key, node) => node && typeof node === "object" && !Array.isArray(node) ? Object.fromEntries(Object.entries(node).sort(([a], [b]) => a.localeCompare(b))) : node)
export class FinishingContentError extends Error { constructor(message: string, readonly status: number) { super(message); this.name = "FinishingContentError" } }
function unitJson(row: UnitRow): DevelopmentUnit { return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() } }
function tableJson(row: TableRow): FinishingTable { return { id: row.id, unitId: row.unitId, tower: row.tower, typology: row.typology, unitModel: row.unitModel, area: row.area, revision: row.revision, status: row.status as FinishingTable["status"], data: normalizeFinishingData(row.data), lastEditorId: row.lastEditorId, updatedAt: row.updatedAt.toISOString(), comment: row.comment } }
function versionJson(row: VersionRow): UnitDocumentVersion { return { ...row, createdAt: row.createdAt.toISOString() } }
export function finishingSourceFingerprint(source: Omit<FinishingDocumentSource, "revision" | "date">) {
  // Unrelated checklist or another unit's issuance must not stale this document.
  return createHash("sha256").update(canonical({ developmentId: source.developmentId, name: source.name, organization: source.organization, identity: source.data.identity ?? source.data.brand ?? null, unit: source.unit, table: source.table })).digest("hex")
}
export function finishingPreviewFingerprint(sourceFingerprint: string, source: Pick<FinishingDocumentSource, "revision" | "date">) { return createHash("sha256").update(canonical({ sourceFingerprint, revision: source.revision, date: source.date })).digest("hex") }
export function unitEmissionStatus(fingerprint: string, latest: UnitDocumentVersion | null, published: UnitDocumentVersion | null): FinishingUnitSummary["emissionStatus"] {
  if (published && published.sourceFingerprint !== fingerprint) return "atualizacao_pendente"
  if (published) return "emitida"
  if (latest && latest.sourceFingerprint !== fingerprint) return "atualizacao_pendente"
  if (latest && ["validacao", "aprovado"].includes(latest.status)) return "validacao"
  return latest ? "emitida" : "pendente"
}
function source(context: AccessContext, development: typeof developments.$inferSelect, unit: UnitRow, table?: TableRow): Omit<FinishingDocumentSource, "revision" | "date"> {
  return { developmentId: development.id, name: development.name, organization: { name: context.organization.name, logo: context.organization.logo, metadata: context.organization.metadata }, data: object(development.data), unit: unitJson(unit), table: table ? tableJson(table) : null }
}
async function summary(context: AccessContext, development: typeof developments.$inferSelect, unit: UnitRow, reader: Reader = db): Promise<FinishingUnitSummary> {
  const [tables, versions] = await Promise.all([
    reader.select().from(finishingTables).where(and(eq(finishingTables.developmentId, development.id), eq(finishingTables.organizationId, context.organization.id), eq(finishingTables.unitId, unit.id))).limit(1),
    reader.select().from(manualVersions).where(and(eq(manualVersions.developmentId, development.id), eq(manualVersions.organizationId, context.organization.id), eq(manualVersions.manualType, "acabamentos"), eq(manualVersions.unitId, unit.id))).orderBy(desc(manualVersions.revision)),
  ])
  return unitSummary(context, development, unit, tables[0], versions)
}
function unitSummary(context: AccessContext, development: typeof developments.$inferSelect, unit: UnitRow, table: TableRow | undefined, versions: VersionRow[]): FinishingUnitSummary {
  const current = source(context, development, unit, table)
  const fingerprint = finishingSourceFingerprint(current)
  const latestVersion = versions[0] ? versionJson(versions[0]) : null
  const published = versions.find(row => row.status === "publicado")
  const publishedVersion = published ? versionJson(published) : null
  return { ...current.unit, table: current.table, fingerprint, latestVersion, publishedVersion, emissionStatus: unitEmissionStatus(fingerprint, latestVersion, publishedVersion) }
}
export async function listFinishingUnits(developmentId: string): Promise<UnitCatalog> {
  const context = await requireDevelopmentAccess(developmentId)
  return db.transaction(async tx => {
    const development = (await tx.select().from(developments).where(and(eq(developments.id, developmentId), eq(developments.organizationId, context.organization.id))).limit(1))[0]
    if (!development) throw new FinishingContentError("Empreendimento não encontrado", 404)
    const [units, tables, versions] = await Promise.all([
      tx.select().from(developmentUnits).where(and(eq(developmentUnits.developmentId, developmentId), eq(developmentUnits.organizationId, context.organization.id))).orderBy(developmentUnits.tower, developmentUnits.number),
      tx.select().from(finishingTables).where(and(eq(finishingTables.developmentId, developmentId), eq(finishingTables.organizationId, context.organization.id))).orderBy(finishingTables.tower, finishingTables.typology),
      tx.select().from(manualVersions).where(and(eq(manualVersions.developmentId, developmentId), eq(manualVersions.organizationId, context.organization.id), eq(manualVersions.manualType, "acabamentos"))).orderBy(desc(manualVersions.revision)),
    ])
    const byUnit = new Map(tables.filter(table => table.unitId).map(table => [table.unitId!, table]))
    const unitVersions = new Map<string, VersionRow[]>()
    for (const version of versions) if (version.unitId) unitVersions.set(version.unitId, [...(unitVersions.get(version.unitId) ?? []), version])
    return { actorId: context.user.id, units: units.map(unit => unitSummary(context, development, unit, byUnit.get(unit.id), unitVersions.get(unit.id) ?? [])), legacyTables: tables.filter(table => !table.unitId).map(tableJson), canEdit: canEditContent(context.developmentRole), canValidate: canValidateContent(context.developmentRole) }
  }, { isolationLevel: "repeatable read", accessMode: "read only" })
}
export async function getFinishingUnit(developmentId: string, unitId: string): Promise<FinishingUnitSummary> {
  const catalog = await listFinishingUnits(developmentId)
  const unit = catalog.units.find(unit => unit.id === unitId)
  if (!unit) throw new FinishingContentError("Unidade não encontrada neste empreendimento", 404)
  return unit
}
async function audit(tx: Transaction, context: AccessContext, action: string, metadata: Record<string, unknown>) {
  await tx.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: context.organization.id, actorId: context.user.id, action, entityType: "development", entityId: context.development.id, metadata })
}
export async function saveDevelopmentUnit(developmentId: string, input: UnitInput): Promise<FinishingUnitSummary> {
  const context = await requireDevelopmentAccess(developmentId)
  if (!canEditContent(context.developmentRole)) throw new FinishingContentError("Você não tem permissão para cadastrar unidades", 403)
  let values: ReturnType<typeof normalizeUnitInput>
  try { values = normalizeUnitInput(input) } catch (error) { throw new FinishingContentError(error instanceof Error ? error.message : "Unidade inválida", 400) }
  return db.transaction(async tx => {
    const development = (await tx.select().from(developments).where(and(eq(developments.id, developmentId), eq(developments.organizationId, context.organization.id))).for("update"))[0]
    if (!development) throw new FinishingContentError("Empreendimento não encontrado", 404)
    const units = await tx.select().from(developmentUnits).where(and(eq(developmentUnits.developmentId, developmentId), eq(developmentUnits.organizationId, context.organization.id))).for("update")
    const existing = input.id ? units.find(unit => unit.id === input.id) : undefined
    if (input.id && !existing) throw new FinishingContentError("Unidade não encontrada neste empreendimento", 404)
    if (existing && input.expectedRevision !== existing.revision) throw new FinishingContentError("Esta identificação mudou. Recarregue a unidade antes de salvar.", 409)
    const duplicate = units.find(unit => unit.id !== existing?.id && normalizedUnitKey(unit.tower, unit.number) === normalizedUnitKey(values.tower, values.number))
    if (duplicate) throw new FinishingContentError("Já existe uma unidade com este número nesta torre ou bloco.", 409)
    if (existing && Object.entries(values).every(([key, value]) => existing[key as keyof UnitRow] === value)) return summary(context, development, existing, tx)
    const now = new Date()
    const unit = existing
      ? (await tx.update(developmentUnits).set({ ...values, revision: existing.revision + 1, lastEditorId: context.user.id, updatedAt: now }).where(eq(developmentUnits.id, existing.id)).returning())[0]
      : (await tx.insert(developmentUnits).values({ id: crypto.randomUUID(), developmentId, organizationId: context.organization.id, ...values, lastEditorId: context.user.id }).returning())[0]
    const table = (await tx.select().from(finishingTables).where(and(eq(finishingTables.developmentId, developmentId), eq(finishingTables.organizationId, context.organization.id), eq(finishingTables.unitId, unit.id))).for("update"))[0]
    if (table) {
      await tx.update(finishingTables).set({ tower: unit.tower, typology: unit.typology, unitModel: unit.number, area: unit.area, revision: table.revision + 1, status: "rascunho", comment: null, lastEditorId: context.user.id, updatedAt: now }).where(eq(finishingTables.id, table.id))
      await tx.insert(finishingTableHistory).values({ id: crypto.randomUUID(), finishingTableId: table.id, developmentId, organizationId: context.organization.id, revision: table.revision + 1, status: "rascunho", data: { unit: unitJson(unit), table: table.data }, changedBy: context.user.id })
    }
    await audit(tx, context, existing ? "unit.updated" : "unit.created", { unitId: unit.id, before: existing ? unitJson(existing) : null, after: unitJson(unit) })
    return summary(context, development, unit, tx)
  })
}
export async function mutateFinishingTable(input: FinishingMutation): Promise<FinishingUnitSummary> {
  const context = await requireDevelopmentAccess(input.developmentId)
  const review = input.action === "approve" || input.action === "reject"
  if (review ? !canValidateContent(context.developmentRole) : !canEditContent(context.developmentRole)) throw new FinishingContentError("Você não tem permissão para esta ação", 403)
  if (!["save", "copy", "submit", "approve", "reject"].includes(input.action) || typeof input.expectedFingerprint !== "string" || !input.expectedFingerprint) throw new FinishingContentError("Ação ou revisão da tabela inválida", 400)
  const comment = typeof input.comment === "string" ? input.comment.trim().slice(0, 5000) : ""
  if (input.action === "reject" && !comment) throw new FinishingContentError("Informe o motivo da reprovação", 400)
  return db.transaction(async tx => {
    const development = (await tx.select().from(developments).where(and(eq(developments.id, input.developmentId), eq(developments.organizationId, context.organization.id))).for("update"))[0]
    if (!development) throw new FinishingContentError("Empreendimento não encontrado", 404)
    const unit = (await tx.select().from(developmentUnits).where(and(eq(developmentUnits.id, input.unitId), eq(developmentUnits.developmentId, input.developmentId), eq(developmentUnits.organizationId, context.organization.id))).for("update"))[0]
    if (!unit) throw new FinishingContentError("Unidade não encontrada neste empreendimento", 404)
    const table = (await tx.select().from(finishingTables).where(and(eq(finishingTables.unitId, unit.id), eq(finishingTables.developmentId, input.developmentId), eq(finishingTables.organizationId, context.organization.id))).for("update"))[0]
    if (finishingSourceFingerprint(source(context, development, unit, table)) !== input.expectedFingerprint) throw new FinishingContentError("A unidade, tabela ou validação mudou. Recarregue antes de continuar.", 409)
    if (review && table?.status !== "aguardando_validacao") throw new FinishingContentError("A tabela precisa estar aguardando validação", 400)
    if (input.action === "approve" && table?.lastEditorId === context.user.id) throw new FinishingContentError("Quem editou ou enviou a tabela não pode aprovar o próprio conteúdo.", 403)
    if (!review && table?.status === "aguardando_validacao") throw new FinishingContentError("Tabela em validação: aguarde a decisão antes de editar.", 409)
    let data = table ? normalizeFinishingData(table.data) : undefined
    if (input.action === "save" || input.action === "copy") {
      let supplied = input.data
      if (input.action === "copy") {
        const base = (await tx.select().from(finishingTables).where(and(eq(finishingTables.id, input.sourceTableId ?? ""), eq(finishingTables.developmentId, input.developmentId), eq(finishingTables.organizationId, context.organization.id), isNull(finishingTables.unitId))).for("share"))[0]
        if (!base) throw new FinishingContentError("Base de acabamentos não encontrada neste empreendimento", 404)
        supplied ??= normalizeFinishingData(base.data)
      }
      try { data = normalizeFinishingData(supplied) } catch (error) { throw new FinishingContentError(error instanceof Error ? error.message : "Tabela inválida", 400) }
      if (table && input.action === "save" && canonical(table.data) === canonical(data)) return summary(context, development, unit, tx)
    } else {
      if (!table || !data) throw new FinishingContentError("Cadastre e salve a tabela antes de enviar", 400)
      if (input.action === "submit" && table.status === "aprovado") throw new FinishingContentError("Tabela já aprovada. Salve uma alteração antes de reenviar.", 400)
      if (input.action !== "reject") {
        const problems = finishingProblems(data)
        if (problems.length) throw new FinishingContentError(problems.join(" "), 400)
      }
    }
    const editing = input.action === "save" || input.action === "copy"
    const status = input.action === "approve" ? "aprovado" : input.action === "reject" ? "reprovado" : input.action === "submit" ? "aguardando_validacao" : "rascunho"
    const revision = editing ? (table?.revision ?? 0) + 1 : table!.revision
    const values = { unitId: unit.id, tower: unit.tower, typology: unit.typology, unitModel: unit.number, area: unit.area, data: data!, revision, status, comment: input.action === "reject" ? comment : null, lastEditorId: review ? table!.lastEditorId : context.user.id, updatedAt: new Date() }
    const saved = table ? (await tx.update(finishingTables).set(values).where(eq(finishingTables.id, table.id)).returning())[0] : (await tx.insert(finishingTables).values({ id: crypto.randomUUID(), developmentId: input.developmentId, organizationId: context.organization.id, ...values }).returning())[0]
    await tx.insert(finishingTableHistory).values({ id: crypto.randomUUID(), finishingTableId: saved.id, developmentId: input.developmentId, organizationId: context.organization.id, revision, status, data: { unit: unitJson(unit), table: data }, changedBy: context.user.id })
    await audit(tx, context, "unit.finishing." + input.action, { unitId: unit.id, tableId: saved.id, revision, sourceTableId: input.action === "copy" ? input.sourceTableId : null, before: table ? tableJson(table) : null, after: tableJson(saved), comment: comment || null })
    return summary(context, development, unit, tx)
  })
}
export async function loadFinishingSource(context: AccessContext, unitId: string, reader: Reader = db) {
  if (!unitId) throw new FinishingContentError("Selecione uma unidade para visualizar ou emitir a tabela.", 400)
  const developmentId = context.development.id, organizationId = context.organization.id
  const [developmentsRows, units, tables, versions, organizationRows] = await Promise.all([
    reader.select().from(developments).where(and(eq(developments.id, developmentId), eq(developments.organizationId, organizationId))).limit(1),
    reader.select().from(developmentUnits).where(and(eq(developmentUnits.id, unitId), eq(developmentUnits.developmentId, developmentId), eq(developmentUnits.organizationId, organizationId))).limit(1),
    reader.select().from(finishingTables).where(and(eq(finishingTables.unitId, unitId), eq(finishingTables.developmentId, developmentId), eq(finishingTables.organizationId, organizationId))).limit(1),
    reader.select({ revision: manualVersions.revision }).from(manualVersions).where(and(eq(manualVersions.unitId, unitId), eq(manualVersions.developmentId, developmentId), eq(manualVersions.organizationId, organizationId), eq(manualVersions.manualType, "acabamentos"))).orderBy(desc(manualVersions.revision)).limit(1),
    reader.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1),
  ])
  if (!developmentsRows[0] || !units[0]) throw new FinishingContentError("Unidade não encontrada neste empreendimento", 404)
  const current = source(organizationRows[0] ? { ...context, organization: organizationRows[0] } : context, developmentsRows[0], units[0], tables[0])
  const fingerprint = finishingSourceFingerprint(current)
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
  const result: FinishingDocumentSource = { ...current, revision: (versions[0]?.revision ?? 0) + 1, date }
  return { source: result, fingerprint, snapshot: { ...current, data: { identity: current.data.identity ?? current.data.brand ?? null } } }
}
export async function composeFinishingPreview(context: AccessContext, unitId: string, purpose: "publication" | "preview" = "publication"): Promise<ManualPreview> {
  const { source, fingerprint: sourceFingerprint } = await db.transaction(tx => loadFinishingSource(context, unitId, tx), { isolationLevel: "repeatable read", accessMode: "read only" })
  const fingerprint = finishingPreviewFingerprint(sourceFingerprint, source)
  const document = buildFinishingDocument(source, purpose)
  document.metadata.fingerprint = fingerprint
  const warnings: string[] = []
  const image = async (value: string | null | undefined) => { try { return await hydrateDocumentImage(value, context) } catch (error) { warnings.push(error instanceof Error ? error.message : "Imagem indisponível"); return null } }
  const [hero, logo, organizationLogo] = await Promise.all([image(document.identity.heroUrl), image(document.identity.developmentLogoUrl), image(document.metadata.organizationLogo)])
  document.identity.heroUrl = hero; document.identity.developmentLogoUrl = logo; document.metadata.organizationLogo = organizationLogo
  const layout = await paginateManualDocument(document)
  layout.warnings.push(...warnings)
  const readiness = assessFinishingReadiness(source)
  readiness.blocking.push(...layout.warnings)
  readiness.ok = readiness.blocking.length === 0
  return { document, layout, readiness, updatedAt: new Date().toISOString(), fingerprint }
}
