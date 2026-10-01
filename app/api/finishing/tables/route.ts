import { NextResponse } from "next/server"
import { getFinishingUnit, mutateFinishingTable } from "@/lib/finishing-units"
import type { FinishingMutation } from "@/lib/finishing-types"
import { manualApiError } from "@/lib/manual-document/http"
export const runtime = "nodejs"
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams
    const developmentId = query.get("developmentId"), unitId = query.get("unitId")
    if (!developmentId || !unitId) return NextResponse.json({ error: "Informe empreendimento e unidade" }, { status: 400 })
    return NextResponse.json({ unit: await getFinishingUnit(developmentId, unitId) }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return manualApiError(error) }
}
export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (typeof body.developmentId !== "string" || !body.developmentId || typeof body.unitId !== "string" || !body.unitId) return NextResponse.json({ error: "Informe empreendimento e unidade" }, { status: 400 })
    return NextResponse.json({ unit: await mutateFinishingTable(body as FinishingMutation) })
  } catch (error) { return manualApiError(error) }
}
