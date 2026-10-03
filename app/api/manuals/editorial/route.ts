import { NextResponse } from "next/server"
import { and, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { auditLogs, databookFiles, developmentContentValidations, developments, finishingTableHistory, finishingTables } from "@/lib/db/schema"
import { canEditContent, canValidateContent, requireDevelopmentAccess } from "@/lib/organization"
import { editableManualSections } from "@/lib/manual-document/build"
import { manualScope, selectManualCommissioning, type ManualContent } from "@/lib/manual-content"
import { manualApiError } from "@/lib/manual-document/http"
import { parseManualType } from "@/lib/manual-document/service"
import { assertTechnicalHtml } from "@/lib/security/input"

export const runtime = "nodejs"
type JsonObject = Record<string, unknown>
const object = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams
    const id = query.get("developmentId")
    if (!id) return NextResponse.json({ error: "Empreendimento não informado" }, { status: 400 })
    const manualType = parseManualType(query.get("manualType"))
    const context = await requireDevelopmentAccess(id)
    const data = object(context.development.data)
    const content = object(object(data.manuals)[manualType]) as ManualContent
    const validations = await db.select().from(developmentContentValidations).where(and(eq(developmentContentValidations.developmentId, id), eq(developmentContentValidations.organizationId, context.organization.id), eq(developmentContentValidations.section, "editorial")))
    const sections = Object.fromEntries(editableManualSections.map(({ id: sectionId }) => {
      const row = validations.find(row => row.contextKey === `${sectionId}::${manualScope(manualType)}`)
      return [sectionId, { ...content.editorial?.sections?.[sectionId], html: content.editorial?.sections?.[sectionId]?.html ?? "", status: row?.status ?? "rascunho", comment: row?.comment, lastEditorId: row?.lastEditorId }]
    }))
    // Retain legacy review links without exposing unit tables inside the manual.
    const finishing = manualType === "proprietario" ? await db.select().from(finishingTables).where(and(eq(finishingTables.developmentId, id), eq(finishingTables.organizationId, context.organization.id), isNull(finishingTables.unitId))) : []
    const authoring = object(data.authoring)
    const warranties = content.editorial?.warranties ?? []
    return NextResponse.json({ sections, warranties, attachments: content.editorial?.attachments ?? {}, systemOrder: content.editorial?.systemOrder ?? [], contacts: authoring.contacts ?? [], commissioning: selectManualCommissioning(data, manualType), finishing, canEdit: canEditContent(context.developmentRole), canValidate: canValidateContent(context.developmentRole) }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return manualApiError(error) }
}

export async function POST(request: Request) {
  try {
    const body = object(await request.json())
    const id = typeof body.developmentId === "string" ? body.developmentId : ""
    if (!id) return NextResponse.json({ error: "Empreendimento não informado" }, { status: 400 })
    const manualType = parseManualType(body.manualType)
    const context = await requireDevelopmentAccess(id)
    const action = String(body.action ?? "")
    if (!/^(save|settings|submit|approve|reject|finishing-submit|finishing-approve|finishing-reject)$/.test(action)) throw new Error("Ação inválida")
    const review = action.endsWith("approve") || action.endsWith("reject")
    if (review ? !canValidateContent(context.developmentRole) : !canEditContent(context.developmentRole)) throw new Error("Você não tem permissão para esta ação")
    const sectionId = typeof body.sectionId === "string" ? body.sectionId : ""
    if (!action.startsWith("finishing-") && action !== "settings" && !editableManualSections.some(section => section.id === sectionId)) throw new Error("Seção editorial inválida")
    const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 5000) : ""
    if (action.endsWith("reject") && !comment) throw new Error("Informe o motivo da reprovação")
    const status = action.endsWith("approve") ? "aprovado" : action.endsWith("reject") ? "reprovado" : action.endsWith("submit") ? "aguardando_validacao" : "rascunho"
    await db.transaction(async tx => {
      const rows = await tx.select().from(developments).where(and(eq(developments.id, id), eq(developments.organizationId, context.organization.id))).for("update")
      const data = object(rows[0]?.data)
      const manuals = object(data.manuals)
      const content = object(manuals[manualType]) as ManualContent
      const editorial = { ...content.editorial, sections: { ...content.editorial?.sections } }
      if (action.startsWith("finishing-")) {
        if (manualType !== "proprietario") throw new Error("Tabela de acabamentos fora do escopo deste manual")
        const table = (await tx.select().from(finishingTables).where(and(eq(finishingTables.id, String(body.tableId)), eq(finishingTables.developmentId, id), eq(finishingTables.organizationId, context.organization.id))).for("update"))[0]
        if (!table) throw new Error("Tabela não encontrada")
        if (table.unitId) throw new Error("Tabela da unidade fora do escopo deste manual. Abra sua elaboração para validar.")
        if (typeof body.revision !== "number" || body.revision !== table.revision) throw new Error("Recarregue a tabela antes de validar esta revisão")
        if (review && table.status !== "aguardando_validacao") throw new Error("Conteúdo precisa estar aguardando validação")
        if (review && table.lastEditorId === context.user.id) throw new Error("Quem editou por último não pode validar o próprio conteúdo")
        if (action === "finishing-submit" && !Object.values(object(table.data)).some(rows => Array.isArray(rows) && rows.length)) throw new Error("Conteúdo vazio: preencha a tabela antes de enviar")
        await tx.update(finishingTables).set({ status, updatedAt: new Date() }).where(eq(finishingTables.id, table.id))
        await tx.insert(finishingTableHistory).values({ id: crypto.randomUUID(), finishingTableId: table.id, developmentId: id, organizationId: context.organization.id, revision: table.revision, status, data: table.data, changedBy: context.user.id })
      } else if (action === "settings") {
        const attachments = object(body.attachments)
        const files = await tx.select().from(databookFiles).where(eq(databookFiles.developmentId, id))
        const policies = { ...editorial.attachments }
        for (const [key, policy] of Object.entries(attachments)) {
          const file = files.find(file => file.id === key || file.pathname === key)
          if (!file || !["include", "reference", "exclude"].includes(String(policy))) throw new Error("Política de anexo inválida")
          if (policy === "include") throw new Error("A inclusão física de anexos será disponibilizada em uma próxima etapa. Selecione Apenas referenciar.")
          policies[file.id] = policy as "reference" | "exclude"
        }
        editorial.attachments = policies
        const allowedOptional = new Set(["meio-ambiente", "uso-racional-agua", "telefones-uteis", "glossario"])
        for (const [key, enabled] of Object.entries(object(body.optional))) {
          if (!allowedOptional.has(key) || typeof enabled !== "boolean") throw new Error("Módulo opcional inválido")
          editorial.sections[key] = { ...editorial.sections[key], enabled }
        }
        // Only internal systems can be reordered; macrostructure is immutable.
        if (body.systemOrder !== undefined) {
          if (!Array.isArray(body.systemOrder) || !body.systemOrder.every(key => typeof key === "string") || new Set(body.systemOrder).size !== body.systemOrder.length) throw new Error("Ordem de sistemas inválida")
          editorial.systemOrder = body.systemOrder as string[]
        }
        manuals[manualType] = { ...content, editorial }
        await tx.update(developments).set({ data: { ...data, manuals }, lastEditorId: context.user.id, updatedAt: new Date(), version: sql`${developments.version} + 1` }).where(eq(developments.id, id))
      } else {
        const contextKey = `${sectionId}::${manualScope(manualType)}`
        const existing = (await tx.select().from(developmentContentValidations).where(and(eq(developmentContentValidations.developmentId, id), eq(developmentContentValidations.organizationId, context.organization.id), eq(developmentContentValidations.contextKey, contextKey), eq(developmentContentValidations.section, "editorial"))).for("update"))[0]
        if (review && existing?.status !== "aguardando_validacao") throw new Error("Conteúdo precisa estar aguardando validação")
        if (review && existing?.lastEditorId === context.user.id) throw new Error("Quem enviou ou editou não pode validar o próprio conteúdo")
        if (action === "save") {
          if (typeof body.html !== "string" && body.warranties === undefined) throw new Error("Conteúdo inválido")
          if (typeof body.html === "string" && body.html.length > 500_000) throw new Error("Conteúdo excede o limite da seção")
          editorial.sections[sectionId] = { ...editorial.sections[sectionId], ...(typeof body.html === "string" ? { html: assertTechnicalHtml(body.html) } : {}) }
          if (body.warranties !== undefined) {
            if (sectionId !== "garantias-tabela" || !Array.isArray(body.warranties) || body.warranties.length > 2000 || !body.warranties.every(row => row && typeof row === "object" && !Array.isArray(row) && Object.values(row).every(value => typeof value === "string" && value.length <= 10_000))) throw new Error("Tabela de garantias inválida")
            const mapping: Record<string, string> = { system: "sistema", element: "elemento", defect: "descricaoFalha", period: "prazo", conditions: "condicoes" }
            editorial.warranties = body.warranties.map(row => Object.fromEntries(Object.entries(row as Record<string, string>).map(([key, value]) => [mapping[key] ?? key, value])))
          }
          manuals[manualType] = { ...content, editorial }
          await tx.update(developments).set({ data: { ...data, manuals }, lastEditorId: context.user.id, updatedAt: new Date(), version: sql`${developments.version} + 1` }).where(eq(developments.id, id))
        }
        if (action === "submit") {
          const html = editorial.sections[sectionId]?.html?.replace(/<[^>]*>/g, " ").trim()
          const authoring = object(data.authoring)
          const contacts = Array.isArray(authoring.contacts) ? authoring.contacts : []
          const hasContacts = ["projetistas", "fornecedores", "responsaveis-tecnicos"].includes(sectionId) && contacts.some(contact => object(contact).kind === (sectionId === "fornecedores" ? "fornecedor" : "projetista"))
          const hasCommissioning = ["agua", "gas", "energia", "telecom"].includes(sectionId) && Object.values(object(selectManualCommissioning(data, manualType)[sectionId])).some(value => typeof value === "string" && value.trim())
          if (!html && !hasContacts && !hasCommissioning && !(sectionId === "garantias-tabela" && editorial.warranties?.length)) throw new Error("Conteúdo vazio: preencha a seção antes de enviar")
          if (existing?.status === "aguardando_validacao" || existing?.status === "aprovado") throw new Error("Conteúdo já enviado ou aprovado. Salve uma alteração antes de reenviar.")
        }
        const patch = { status, lastEditorId: action === "save" || action === "submit" ? context.user.id : existing?.lastEditorId, validatorId: review ? context.user.id : null, comment: action === "reject" ? comment : null, updatedAt: new Date() }
        if (existing) await tx.update(developmentContentValidations).set(patch).where(eq(developmentContentValidations.id, existing.id))
        else await tx.insert(developmentContentValidations).values({ id: crypto.randomUUID(), developmentId: id, organizationId: context.organization.id, contextKey, section: "editorial", ...patch })
      }
      await tx.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: context.organization.id, actorId: context.user.id, action: `manual.editorial.${action}`, entityType: "development", entityId: id, metadata: { path: ["manuals", manualType, "editorial", sectionId], tableId: body.tableId ?? null, status, comment: comment || null } })
    })
    return NextResponse.json({ ok: true, status })
  } catch (error) { return manualApiError(error) }
}
