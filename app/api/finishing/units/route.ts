import { NextResponse } from "next/server"
import { listFinishingUnits, saveDevelopmentUnit } from "@/lib/finishing-units"
import type { UnitInput } from "@/lib/finishing-types"
import { manualApiError } from "@/lib/manual-document/http"
export const runtime = "nodejs"
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("developmentId")
    if (!id) return NextResponse.json({ error: "Empreendimento não informado" }, { status: 400 })
    return NextResponse.json(await listFinishingUnits(id), { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return manualApiError(error) }
}
export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (typeof body.developmentId !== "string" || !body.developmentId) return NextResponse.json({ error: "Empreendimento não informado" }, { status: 400 })
    return NextResponse.json({ unit: await saveDevelopmentUnit(body.developmentId, body as UnitInput) }, { status: body.id ? 200 : 201 })
  } catch (error) { return manualApiError(error) }
}
