import { createHash } from "node:crypto"
import { and, eq, inArray, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { auditLogs, developmentContentValidations, developments, members, organizationNotifications } from "@/lib/db/schema"
import { canEditContent, canValidateContent, requireDevelopmentAccess } from "@/lib/organization"\nimport { assertSafeRichTextPayload } from "@/lib/security/input"
import { htmlToLines, manualScope, orderManualSystems } from "@/lib/manual-content"
import type { MaintenanceItem, ManualType } from "@/lib/mock-data"
import type { TechnicalAction, TechnicalCatalog, TechnicalSection, TechnicalSystem } from "@/lib/technical-content"

type Context = Awaited<ReturnType<typeof requireDevelopmentAccess>>
type ValidationRow = typeof developmentContentValidations.$inferSelect
type SystemEntry = ReturnType<typeof orderManualSystems>[number]
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
const isObject = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value)
const canonical = (value: unknown): string => JSON.stringify(value, (_key, node) => isObject(node) ? Object.fromEntries(Object.entries(node).sort(([left], [right]) => left.localeCompare(right))) : node)

export class TechnicalContentError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "TechnicalContentError" }
}

function eligibleSystems(data: Record<string, unknown>, manual: ManualType, validations: ValidationRow[]) {
  // A missing checklist never opts the development into the reference catalog.
  return orderManualSystems({ ...data, checklist: Array.isArray(data.checklist) ? data.checklist : [] }, manual, validations)
}

function fingerprint(context: Context, manual: ManualType, system: SystemEntry, section: TechnicalSection, row?: ValidationRow) {
  return createHash("sha256").update(canonical({ developmentId: context.development.id, organizationId: context.organization.id, manual, key: system.key, section, item: { id: system.item.id, category: system.item.category, title: system.item.item, norms: system.item.norms }, source: section === "sistemas" ? system.html : system.maintenance, validation: row ? { status: row.status, comment: row.comment, lastEditorId: row.lastEditorId, validatorId: row.validatorId, updatedAt: row.updatedAt.toISOString() } : null })).digest("hex")
}

function technicalSystem(context: Context, manual: ManualType, system: SystemEntry, validations: ValidationRow[]): TechnicalSystem {
  const description = validations.find(row => row.contextKey === system.key && row.section === "sistemas")
  const maintenance = validations.find(row => row.contextKey === system.key && row.section === "manutencao")
  return { ...system, descriptionComment: description?.comment ?? null, maintenanceComment: maintenance?.comment ?? null, descriptionFingerprint: fingerprint(context, manual, system, "sistemas", description), maintenanceFingerprint: fingerprint(context, manual, system, "manutencao", maintenance) }
}

export async function listTechnicalCatalog(developmentId: string, manualType: ManualType): Promise<TechnicalCatalog> {
  const context = await requireDevelopmentAccess(developmentId)
  const systems = await db.transaction(async tx => {
    const development = (await tx.select().from(developments).where(and(eq(developments.id, developmentId), eq(developments.organizationId, context.organization.id))).limit(1))[0]
    if (!development) throw new TechnicalContentError("Empreendimento não encontrado", 404)
    const validations = await tx.select().from(developmentContentValidations).where(and(eq(developmentContentValidations.developmentId, developmentId), eq(developmentContentValidations.organizationId, context.organization.id), inArray(developmentContentValidations.section, ["sistemas", "manutencao"])))
    return eligibleSystems(object(development.data), manualType, validations).map(system => technicalSystem(context, manualType, system, validations))
  }, { isolationLevel: "repeatable read", accessMode: "read only" })
  return { systems, canEdit: canEditContent(context.developmentRole), canValidate: canValidateContent(context.developmentRole) }
}

export type TechnicalMutation = {
  developmentId: string; manualType: ManualType; contextKey: string; section: TechnicalSection
  action: TechnicalAction | "mark-edited"; expectedFingerprint?: string; html?: unknown; maintenance?: unknown; comment?: unknown
}

function savedMaintenance(value: unknown): MaintenanceItem[] {
  if (!Array.isArray(value) || value.length > 2000) throw new TechnicalContentError("Tabela de manutenção inválida", 400)
  return value.map(value => {
    const row = object(value)
    if (typeof row.task !== "string" || row.task.length > 10_000 || typeof row.frequency !== "string" || row.frequency.length > 10_000 || (row.responsible !== "Proprietário" && row.responsible !== "Síndico") || (row.id !== undefined && (typeof row.id !== "string" || row.id.length > 200))) throw new TechnicalContentError("Atividade de manutenção inválida", 400)
    return { task: row.task, frequency: row.frequency, responsible: row.responsible, ...(row.id === undefined ? {} : { id: row.id }) }
  })
}

function assertComplete(system: SystemEntry, section: TechnicalSection) {
  if (section === "sistemas" && !htmlToLines(system.html).length) throw new TechnicalContentError("Descrição técnica vazia: preencha e salve o texto antes de enviar.", 400)
  if (section === "manutencao" && system.maintenance.some(row => !row.task?.trim() || !row.frequency?.trim() || (row.responsible !== "Proprietário" && row.responsible !== "Síndico"))) throw new TechnicalContentError("Manutenção incompleta: informe atividade, periodicidade e responsável antes de enviar.", 400)
}

/** One locked mutation for the selected context; legacy actions use the same guards. */
export async function mutateTechnicalSystem(input: TechnicalMutation, requireFingerprint = true): Promise<TechnicalSystem> {
  if (!["sistemas", "manutencao"].includes(input.section) || !["save", "submit", "approve", "reject", "mark-edited"].includes(input.action)) throw new TechnicalContentError("Ação técnica inválida", 400)
  const scope = manualScope(input.manualType)
  if (typeof input.contextKey !== "string" || !input.contextKey.endsWith("::" + scope) || !input.contextKey.slice(0, -(scope.length + 2)) || input.contextKey.slice(0, -(scope.length + 2)).includes("::")) throw new TechnicalContentError("Contexto técnico fora do escopo deste manual", 400)
  if ((requireFingerprint || input.expectedFingerprint !== undefined) && (typeof input.expectedFingerprint !== "string" || !input.expectedFingerprint || input.expectedFingerprint.length > 128)) throw new TechnicalContentError("Informe a revisão do conteúdo e recarregue antes de salvar.", 400)
  const context = await requireDevelopmentAccess(input.developmentId)
  const review = input.action === "approve" || input.action === "reject"
  if (review ? !canValidateContent(context.developmentRole) : !canEditContent(context.developmentRole)) throw new TechnicalContentError("Você não tem permissão para esta ação", 403)
  const comment = typeof input.comment === "string" ? input.comment.trim().slice(0, 5000) : ""
  if (input.action === "reject" && !comment) throw new TechnicalContentError("Informe o motivo da reprovação", 400)

  return db.transaction(async tx => {
    // Source saves, review and issuance all acquire the parent before approval.
    const development = (await tx.select().from(developments).where(and(eq(developments.id, input.developmentId), eq(developments.organizationId, context.organization.id))).for("update"))[0]
    if (!development) throw new TechnicalContentError("Empreendimento não encontrado", 404)
    const data = object(development.data)
    const validations = await tx.select().from(developmentContentValidations).where(and(eq(developmentContentValidations.developmentId, input.developmentId), eq(developmentContentValidations.organizationId, context.organization.id), eq(developmentContentValidations.contextKey, input.contextKey), inArray(developmentContentValidations.section, ["sistemas", "manutencao"]))).for("update")
    const system = eligibleSystems(data, input.manualType, validations).find(system => system.key === input.contextKey)
    if (!system) throw new TechnicalContentError("Este sistema não está disponível neste manual. Ajuste o checklist e recarregue os textos técnicos.", 400)
    const existing = validations.find(row => row.section === input.section)
    const currentFingerprint = fingerprint(context, input.manualType, system, input.section, existing)
    if (input.expectedFingerprint !== undefined && input.expectedFingerprint !== currentFingerprint) throw new TechnicalContentError("Este conteúdo ou sua validação foi alterado por outro usuário. Recarregue antes de continuar.", 409)
    if (review && existing?.status !== "aguardando_validacao") throw new TechnicalContentError("Este conteúdo não está aguardando validação", 400)
    if (input.action === "approve" && existing?.lastEditorId === context.user.id) throw new TechnicalContentError("Quem enviou o conteúdo não pode aprovar a própria edição. Solicite a validação de outro usuário.", 403)
    if (!review && existing?.status === "aguardando_validacao") throw new TechnicalContentError("Conteúdo em validação: aguarde a decisão antes de editar ou reenviar.", 400)
    if (input.action === "mark-edited" && (!existing || existing.status === "rascunho")) return technicalSystem(context, input.manualType, system, validations)

    let savedData = data
    let sourceChanged = false
    const currentStatus = input.section === "sistemas" ? system.descriptionStatus : system.maintenanceStatus
    if (input.action === "save") {
      let value: string | MaintenanceItem[]
      if (input.section === "sistemas") {
        if (typeof input.html !== "string" || input.html.length > 500_000) throw new TechnicalContentError("Descrição técnica inválida ou acima do limite da seção", 400)
        try { assertSafeRichTextPayload(input.html) } catch (error) { throw new TechnicalContentError(error instanceof Error ? error.message : "Descrição técnica contém conteúdo não permitido", 400) }
        value = input.html
      } else value = savedMaintenance(input.maintenance)
      const previous = input.section === "sistemas" ? system.html : system.maintenance
      sourceChanged = canonical(previous) !== canonical(value)
      const manuals = object(data.manuals), manual = object(manuals[input.manualType]), map = object(manual[input.section])
      // An identical save preserves approval. A missing scoped key may still be
      // materialized, including an explicitly empty maintenance decision.
      if (sourceChanged || !Object.hasOwn(map, input.contextKey)) {
        const path = ["manuals", input.manualType, input.section, input.contextKey]
        const sqlPath = (segments: string[]) => sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(segments)}::jsonb))`
        let nextData = sql`coalesce(${developments.data}, '{}'::jsonb)`
        for (let depth = 1; depth < path.length; depth++) {
          const node = path.slice(0, depth).reduce<unknown>((node, key) => object(node)[key], data)
          if (!isObject(node)) nextData = sql`jsonb_set(${nextData}, ${sqlPath(path.slice(0, depth))}, '{}'::jsonb, true)`
        }
        nextData = sql`jsonb_set(${nextData}, ${sqlPath(path)}, ${JSON.stringify(value)}::jsonb, true)`
        const saved = (await tx.update(developments).set({ data: nextData, lastEditorId: context.user.id, updatedAt: new Date(), version: sql`${developments.version} + 1` }).where(and(eq(developments.id, input.developmentId), eq(developments.organizationId, context.organization.id))).returning({ data: developments.data }))[0]
        savedData = object(saved.data)
        await tx.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: context.organization.id, actorId: context.user.id, action: "development.path_edited", entityType: "development", entityId: input.developmentId, metadata: { path, before: previous, after: value, version: development.version + 1 } })
      }
    } else if (input.action === "submit") {
      if (currentStatus === "aprovado") throw new TechnicalContentError("Conteúdo já aprovado. Salve uma alteração antes de reenviar.", 400)
      assertComplete(system, input.section)
    } else if (input.action === "approve") assertComplete(system, input.section)

    const changeStatus = input.action !== "save" || sourceChanged
    if (changeStatus) {
      const status = input.action === "approve" ? "aprovado" : input.action === "reject" ? "reprovado" : input.action === "submit" ? "aguardando_validacao" : "rascunho"
      const patch = { status, lastEditorId: review ? existing?.lastEditorId : context.user.id, validatorId: review ? context.user.id : null, comment: input.action === "reject" ? comment : null, updatedAt: new Date() }
      let saved: ValidationRow
      if (existing) saved = (await tx.update(developmentContentValidations).set(patch).where(eq(developmentContentValidations.id, existing.id)).returning())[0]
      else saved = (await tx.insert(developmentContentValidations).values({ id: crypto.randomUUID(), developmentId: input.developmentId, organizationId: context.organization.id, contextKey: input.contextKey, section: input.section, ...patch }).returning())[0]
      const index = validations.findIndex(row => row.section === input.section)
      if (index < 0) validations.push(saved); else validations[index] = saved
      const label = system.item.item, sectionLabel = input.section === "sistemas" ? "Descrição técnica" : "Manutenção preventiva", scopeLabel = scope === "unidade" ? "Unidades privativas" : "Áreas comuns"
      if (input.action === "submit") {
        const admins = await tx.select({ userId: members.userId }).from(members).where(and(eq(members.organizationId, context.organization.id), or(eq(members.role, "owner"), eq(members.role, "admin")), eq(members.status, "active")))
        const recipients = Array.from(new Set(admins.map(row => row.userId)))
        if (recipients.length) await tx.insert(organizationNotifications).values(recipients.map(userId => ({ id: crypto.randomUUID(), organizationId: context.organization.id, userId, type: "validation_requested", title: "1 item enviado para validação", body: label + " · " + scopeLabel + " · " + sectionLabel, developmentId: input.developmentId, reason: null })))
      } else if (review && existing?.lastEditorId) {
        await tx.insert(organizationNotifications).values({ id: crypto.randomUUID(), organizationId: context.organization.id, userId: existing.lastEditorId, type: input.action === "approve" ? "validation_approved" : "validation_rejected", title: input.action === "approve" ? "Item aprovado" : "Ajustes solicitados", body: label + " · " + scopeLabel + " · " + sectionLabel, developmentId: input.developmentId, reason: input.action === "reject" ? comment : null })
      }
      await tx.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: context.organization.id, actorId: context.user.id, action: input.action === "submit" ? "content.sent_for_validation" : input.action === "approve" ? "content.approved" : input.action === "reject" ? "content.rejected" : "content.edited", entityType: "development", entityId: input.developmentId, metadata: { path: ["validacao", input.contextKey, input.section], before: existing?.status ?? "rascunho", after: status, label, comment: input.action === "reject" ? comment : null } })
    }
    const next = eligibleSystems(savedData, input.manualType, validations).find(system => system.key === input.contextKey)!
    return technicalSystem(context, input.manualType, next, validations)
  })
}
