import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { manualApiError } from "@/lib/manual-document/http"
import { parseManualType } from "@/lib/manual-document/service"
import { listTechnicalCatalog, mutateTechnicalSystem, TechnicalContentError, type TechnicalMutation } from "@/lib/manual-document/technical-service"

export const runtime = "nodejs"
const headers = { "Cache-Control": "private, no-store" }
function errorResponse(error: unknown) {
  return error instanceof TechnicalContentError ? NextResponse.json({ error: error.message }, { status: error.status, headers }) : manualApiError(error)
}

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams
    const developmentId = query.get("developmentId")
    if (!developmentId) throw new TechnicalContentError("Empreendimento não informado", 400)
    return NextResponse.json(await listTechnicalCatalog(developmentId, parseManualType(query.get("manualType"))), { headers })
  } catch (error) { return errorResponse(error) }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (!body || typeof body.developmentId !== "string" || !body.developmentId) throw new TechnicalContentError("Empreendimento não informado", 400)
    if (!["save", "submit", "approve", "reject"].includes(body.action)) throw new TechnicalContentError("Ação técnica inválida", 400)
    const system = await mutateTechnicalSystem({ ...body, manualType: parseManualType(body.manualType) } as TechnicalMutation)
    revalidatePath("/empreendimentos/" + body.developmentId)
    return NextResponse.json({ system }, { headers })
  } catch (error) { return errorResponse(error) }
}
