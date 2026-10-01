import { NextResponse } from "next/server"
import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { auditLogs, developments, manualVersions } from "@/lib/db/schema"
import { requireDevelopmentRole } from "@/lib/organization"
import { discardUnissuedManualFile, saveManualFile } from "@/lib/manual-files"
import { composeManualPreview, loadManualSource, parseManualType } from "@/lib/manual-document/service"
import { renderManualPdf } from "@/lib/manual-document/pdf"
import { flattenSections } from "@/lib/manual-document/types"
import { manualApiError } from "@/lib/manual-document/http"

export const runtime = "nodejs"
export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (typeof body.developmentId !== "string" || !body.developmentId) return NextResponse.json({ error: "Empreendimento não informado" }, { status: 400 })
    const manualType = parseManualType(body.manualType)
    const context = await requireDevelopmentRole(body.developmentId, ["admin", "admin_empreendimento", "editor"])
    // Rebuild from authenticated server data. Never trust submitted approval flags or document blocks.
    const preview = await composeManualPreview(context, manualType)
    if (body.previewFingerprint && body.previewFingerprint !== preview.fingerprint) return NextResponse.json({ error: "O documento mudou. Atualize o preview antes de emitir." }, { status: 409 })
    if (!preview.readiness.ok) return NextResponse.json({ error: "Não é possível emitir: " + preview.readiness.blocking.join("; "), blocking: preview.readiness.blocking, stages: preview.readiness.stages }, { status: 400 })
    const bytes = await renderManualPdf(preview.document, preview.layout)
    const revision = preview.document.metadata.revision
    const slug = context.development.name.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "empreendimento"
    const filename = `${slug}_Manual-${manualType === "sindico" ? "Sindico" : "Proprietario"}_Rev-${String(revision).padStart(2, "0")}_${preview.document.metadata.date}.pdf`
    const id = crypto.randomUUID()
    // UUID avoids overwriting a competing issuance before the revision guard.
    const blob = await saveManualFile(`manuals/${context.organization.id}/${body.developmentId}/${id}/${filename}`, Buffer.from(bytes))
    const sections = flattenSections(preview.document.sections).length
    const pages = preview.layout.pages.length
    try { await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM development WHERE id = ${body.developmentId} AND "organizationId" = ${context.organization.id} FOR UPDATE`)
      await tx.execute(sql`SELECT id FROM development_content_validation WHERE "developmentId" = ${body.developmentId} AND "organizationId" = ${context.organization.id} FOR SHARE`)
      await tx.execute(sql`SELECT id FROM finishing_table WHERE "developmentId" = ${body.developmentId} AND "organizationId" = ${context.organization.id} FOR SHARE`)
      const latest = await tx.select({ revision: manualVersions.revision }).from(manualVersions).where(and(eq(manualVersions.developmentId, body.developmentId), eq(manualVersions.organizationId, context.organization.id), eq(manualVersions.manualType, manualType))).orderBy(desc(manualVersions.revision)).limit(1)
      if ((latest[0]?.revision ?? 0) + 1 !== revision) throw new Error("Recarregue o preview: uma nova revisão foi emitida.")
      const current = await loadManualSource(context, manualType)
      if (current.fingerprint !== preview.fingerprint) throw new Error("Atualize o preview: o conteúdo ou sua validação mudou durante a emissão.")
      const approvedFinishing = current.source.finishing.filter(table => table.status === "aprovado")
      await tx.insert(manualVersions).values({ id, developmentId: body.developmentId, organizationId: context.organization.id, manualType, revision, status: "rascunho", comment: typeof body.comment === "string" ? body.comment.trim().slice(0, 5000) || null : null, filename, pathname: blob.pathname, sections, pages, attachments: preview.document.attachments.filter(file => file.policy !== "exclude").length, finishingTableId: approvedFinishing[0]?.id ?? null, finishingRevision: approvedFinishing[0]?.revision ?? null, finishingRows: approvedFinishing.reduce((sum, table) => sum + Object.values((table.data ?? {}) as Record<string, unknown>).reduce<number>((total, rows) => total + (Array.isArray(rows) ? rows.length : 0), 0), 0), createdBy: context.user.id })
      await tx.update(developments).set({ version: sql`${developments.version} + 1`, lastEditorId: context.user.id, updatedAt: new Date() }).where(and(eq(developments.id, body.developmentId), eq(developments.organizationId, context.organization.id)))
      await tx.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: context.organization.id, actorId: context.user.id, action: "manual.issued", entityType: "development", entityId: body.developmentId, metadata: { path: ["emissao", manualType], fingerprint: preview.fingerprint, before: null, after: { filename, revision, pages }, finishingTables: approvedFinishing.map(table => ({ id: table.id, revision: table.revision })) } })
    }) } catch (error) {
      try { await discardUnissuedManualFile(blob.pathname) } catch (cleanupError) { console.error("Falha ao descartar arquivo de emissão não registrada", cleanupError) }
      throw error
    }
    return NextResponse.json({ id, filename, pathname: blob.pathname, revision, sections, pages }, { status: 201 })
  } catch (error) { return manualApiError(error) }
}
