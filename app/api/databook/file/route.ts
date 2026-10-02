import { NextRequest, NextResponse } from "next/server"
import { databookApiError, databookHeaders } from "@/lib/databook/http"
import { findDatabookFile, renameDatabookFile } from "@/lib/databook/service"
import { readDatabookFile } from "@/lib/databook/storage"
import { safeContentDisposition } from "@/lib/security/uploads"

export const runtime = "nodejs"
export async function GET(request: NextRequest) {
  try {
    const file = await findDatabookFile(request.nextUrl.searchParams.get("pathname"))
    const result = await readDatabookFile(file.pathname, file.contentType || "application/octet-stream", request.headers.get("if-none-match"))
    if (!result) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404, headers: databookHeaders })
    if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers: { ETag: result.blob.etag, "Cache-Control": "private, no-cache" } })
    return new NextResponse(result.stream, { headers: { "Content-Type": result.blob.contentType, ETag: result.blob.etag, "Cache-Control": "private, no-cache", "X-Content-Type-Options": "nosniff", "Content-Disposition": safeContentDisposition(file.name) } })
  } catch (error) { return databookApiError(error) }
}

export async function PATCH(request: Request) {
  try { return NextResponse.json({ file: await renameDatabookFile(await request.json()) }, { headers: databookHeaders }) } catch (error) { return databookApiError(error) }
}
