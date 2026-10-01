import { NextResponse } from "next/server"
import { requireDevelopmentAccess } from "@/lib/organization"
import { composeManualPreview, parseManualType } from "@/lib/manual-document/service"
import { manualApiError } from "@/lib/manual-document/http"

export const runtime = "nodejs"
export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (typeof body.developmentId !== "string" || !body.developmentId) return NextResponse.json({ error: "Empreendimento não informado" }, { status: 400 })
    const context = await requireDevelopmentAccess(body.developmentId)
    const preview = await composeManualPreview(context, parseManualType(body.manualType), body.refresh === true, "preview")
    return NextResponse.json(preview, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return manualApiError(error) }
}
