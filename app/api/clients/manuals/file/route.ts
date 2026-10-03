import { NextResponse } from "next/server"
import { ClientAccessError, requireClientManual } from "@/lib/clients"
import { getManualFile } from "@/lib/manual-files"
import { safeContentDisposition } from "@/lib/security/uploads"

export const dynamic = "force-dynamic"
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const accessId = params.get("accessId") ?? ""
    const manualId = params.get("id") ?? ""
    const { manual } = await requireClientManual({ accessId, manualId })
    const result = await getManualFile(manual.pathname)
    if (!result) return NextResponse.json({ error: "Documento indisponível. Tente novamente mais tarde." }, { status: 404, headers: privateHeaders })
    await requireClientManual({ accessId, manualId })
    return new NextResponse(result.stream, { headers: { ...privateHeaders, "Content-Type": "application/pdf", "Content-Disposition": safeContentDisposition(manual.filename, params.get("download") === "1" ? "attachment" : "inline") } })
  } catch (error) {
    if (error instanceof ClientAccessError) return NextResponse.json({ error: error.message }, { status: error.status, headers: privateHeaders })
    console.error("[clients.manual_file] Unable to serve private document")
    return NextResponse.json({ error: "Não foi possível carregar o documento. Tente novamente." }, { status: 500, headers: privateHeaders })
  }
}
