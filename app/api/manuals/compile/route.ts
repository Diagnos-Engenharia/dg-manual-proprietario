import { logSafeError } from "@/lib/security/logging"
import { NextResponse } from "next/server"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { auditLogs, developments, manualVersions } from "@/lib/db/schema"
import { requireDevelopmentRole } from "@/lib/organization"
import { discardUnissuedManualFile, saveManualFile } from "@/lib/manual-files"
import { composeManualPreview, loadManualSource, parseDocumentType } from "@/lib/manual-document/service"
import { composeFinishingPreview, FinishingContentError, finishingPreviewFingerprint, loadFinishingSource } from "@/lib/finishing-units"
import { renderManualPdf } from "@/lib/manual-document/pdf"
import { flattenSections } from "@/lib/manual-document/types"
import { manualApiError } from "@/lib/manual-document/http"
import { assertId, cleanText } from "@/lib/security/input"
import { consumeRateLimit } from "@/lib/security/rate-limit"

export const runtime = "nodejs"
export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (typeof body.developmentId !== "string" || !body.developmentId) return NextResponse.json({ error: "Empreendimento não informado" }, { status: 400 })
    const developmentId = assertId(body.developmentId, "Empreendimento")
    const manualType = parseDocumentType(body.manualType)
    const unitId = manualType === "acabamentos" && typeof body.unitId === "string" ? assertId(body.unitId, "Unidade") : null
    const comment = typeof body.comment === "string" && body.comment.trim() ? cleanText(body.comment, "Comentário", 5000) : null
    if (manualType === "acabamentos" && (!unitId || typeof body.previewFingerprint !== "string" || !body.previewFingerprint)) return NextResponse.json({ error: "Selecione a unidade e atualize o preview antes de emitir." }, { status: 400 })
    const context = await requireDevelopmentRole(developmentId, ["admin", "admin_empreendimento", "editor"])
    await consumeRateLimit(`manual-compile:${context.user.id}`, { max: 20, windowSeconds: 3600 })
    // Rebuild from authenticated server data. Never trust submitted approval flags or document blocks.
    const preview = manualType === "acabamentos" ? await composeFinishingPreview(context, unitId!) : await composeManualPreview(context, manualType)
    if (body.previewFingerprint && body.previewFingerprint !== preview.fingerprint) return NextResponse.json({ error: "O documento mudou. Atualize o preview antes de emitir." }, { status: 409 })
    if (!preview.readiness.ok) return NextResponse.json({ error: "Não é possível emitir: " + preview.readiness.blocking.join("; "), blocking: preview.readiness.blocking, stages: preview.readiness.stages }, { status: 400 })
    const bytes = await renderManualPdf(preview.document, preview.layout)
    const revision = preview.document.metadata.revision
    const slug = context.development.name.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "empreendimento"
    const unitSlug = preview.document.metadata.unitLabel?.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "unidade"
    const kind = manualType === "acabamentos" ? "Tabela-acabamentos_" + unitSlug : "Manual-" + (manualType === "sindico" ? "Sindico" : "Proprietario")
    const filename = `${slug}_${kind}_Rev-${String(revision).padStart(2, "0")}_${preview.document.metadata.date}.pdf`
    const id = crypto.randomUUID()
    // UUID avoids overwriting a competing issuance before the revision guard.
    const blob = await saveManualFile(`manuals/${context.organization.id}/${developmentId}/${id}/${filename}`, Buffer.from(bytes))
    const sections = flattenSections(preview.document.sections).length
    const pages = preview.layout.pages.length
    try { await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM development WHERE id = ${developmentId} AND "organizationId" = ${context.organization.id} FOR UPDATE`)
      if (manualType === "acabamentos") await tx.execute(sql`SELECT id FROM organization WHERE id = ${context.organization.id} FOR SHARE`)
      await tx.execute(sql`SELECT id FROM development_content_validation WHERE "developmentId" = ${developmentId} AND "organizationId" = ${context.organization.id} FOR SHARE`)
      await tx.execute(sql`SELECT id FROM finishing_table WHERE "developmentId" = ${developmentId} AND "organizationId" = ${context.organization.id} FOR SHARE`)
      const latest = await tx.select({ revision: manualVersions.revision }).from(manualVersions).where(and(eq(manualVersions.developmentId, developmentId), eq(manualVersions.organizationId, context.organization.id), eq(manualVersions.manualType, manualType), unitId ? eq(manualVersions.unitId, unitId) : isNull(manualVersions.unitId))).orderBy(desc(manualVersions.revision)).limit(1)
      if ((latest[0]?.revision ?? 0) + 1 !== revision) throw new FinishingContentError("Recarregue o preview: uma nova revisão foi emitida.", 409)
      const current = manualType === "acabamentos" ? await loadFinishingSource(context, unitId!, tx) : await loadManualSource(context, manualType)
      const currentPreviewFingerprint = "unit" in current.source ? finishingPreviewFingerprint(current.fingerprint, current.source) : current.fingerprint
      if (currentPreviewFingerprint !== preview.fingerprint) throw new FinishingContentError("Atualize o preview: o conteúdo ou sua validação mudou durante a emissão.", 409)
      const finishing = "table" in current.source ? current.source.table : null
      const finishingRows = finishing ? Object.values(finishing.data).reduce((total, rows) => total + rows.length, 0) : 0
      await tx.insert(manualVersions).values({ id, developmentId: developmentId, organizationId: context.organization.id, manualType, unitId, sourceFingerprint: current.fingerprint, sourceSnapshot: "snapshot" in current ? current.snapshot : { document: preview.document }, revision, status: "rascunho", comment, filename, pathname: blob.pathname, sections, pages, attachments: preview.document.attachments.filter(file => file.policy !== "exclude").length, finishingTableId: finishing?.id ?? null, finishingRevision: finishing?.revision ?? null, finishingRows, createdBy: context.user.id })
      await tx.update(developments).set({ version: sql`${developments.version} + 1`, lastEditorId: context.user.id, updatedAt: new Date() }).where(and(eq(developments.id, developmentId), eq(developments.organizationId, context.organization.id)))
      await tx.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: context.organization.id, actorId: context.user.id, action: "manual.issued", entityType: "development", entityId: developmentId, metadata: { path: ["emissao", manualType, ...(unitId ? [unitId] : [])], fingerprint: preview.fingerprint, before: null, after: { filename, revision, pages }, unitId, finishingTable: finishing ? { id: finishing.id, revision: finishing.revision } : null } })
    }) } catch (error) {
      try { await discardUnissuedManualFile(blob.pathname) } catch (cleanupError) { logSafeError("manual.discard", cleanupError) }
      throw error
    }
    return NextResponse.json({ id, filename, revision, sections, pages }, { status: 201 })
  } catch (error) { return manualApiError(error) }
}
