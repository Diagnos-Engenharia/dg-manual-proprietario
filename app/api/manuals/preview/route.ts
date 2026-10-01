import { NextResponse } from "next/server"
import { requireDevelopmentAccess } from "@/lib/organization"
import { composeManualPreview, parseDocumentType } from "@/lib/manual-document/service"
import { composeFinishingPreview } from "@/lib/finishing-units"
import { manualApiError } from "@/lib/manual-document/http"

export const runtime = "nodejs"
export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (typeof body.developmentId !== "string" || !body.developmentId) return NextResponse.json({ error: "Empreendimento não informado" }, { status: 400 })
    const context = await requireDevelopmentAccess(body.developmentId)
    const type = parseDocumentType(body.manualType)
    const preview = type === "acabamentos" ? await composeFinishingPreview(context, typeof body.unitId === "string" ? body.unitId : "", "preview") : await composeManualPreview(context, type, body.refresh === true, "preview")
    return NextResponse.json(preview, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return manualApiError(error) }
}
