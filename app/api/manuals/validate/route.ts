import { NextResponse } from "next/server"
import { requireDevelopmentAccess } from "@/lib/organization"
import { composeManualPreview, loadManualSource, parseManualType } from "@/lib/manual-document/service"
import { flattenSections } from "@/lib/manual-document/types"
import { manualApiError } from "@/lib/manual-document/http"

export const runtime = "nodejs"
export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (typeof body.developmentId !== "string" || !body.developmentId) return NextResponse.json({ error: "Empreendimento não informado" }, { status: 400 })
    const manualType = parseManualType(body.manualType)
    const context = await requireDevelopmentAccess(body.developmentId)
    const preview = await composeManualPreview(context, manualType)
    const { source } = await loadManualSource(context, manualType)
    return NextResponse.json({ ...preview.readiness, alerts: preview.layout.warnings, sections: flattenSections(preview.document.sections).length, attachments: source.files.map(({ id, name, sizeBytes }) => ({ id, name, sizeBytes })), manualType, development: source.name, finishing: source.finishing.map(({ id, tower, typology, unitModel, area, revision, status, updatedAt }) => ({ id, tower, typology, unitModel, area, revision, status, updatedAt })) }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return manualApiError(error) }
}
