import { get } from "@vercel/blob"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { databookFiles, developments } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { headers } from "next/headers"
import { requireDevelopmentAccess } from "@/lib/organization"

export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.searchParams.get("pathname")
  if (!pathname) return NextResponse.json({ error: "Arquivo não informado" }, { status: 400 })
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  try {
    const owned = await db.select({ pathname: databookFiles.pathname, name: databookFiles.name,developmentId:databookFiles.developmentId }).from(databookFiles).innerJoin(developments, eq(databookFiles.developmentId, developments.id)).where(and(eq(databookFiles.pathname, pathname), eq(developments.id,databookFiles.developmentId))).limit(1)
    if (!owned[0]) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 })
    await requireDevelopmentAccess(owned[0].developmentId)
    const result = await get(pathname, { access: "private", ifNoneMatch: request.headers.get("if-none-match") ?? undefined })
    if (!result) return new NextResponse("Arquivo não encontrado", { status: 404 })
    if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers: { ETag: result.blob.etag, "Cache-Control": "private, no-cache" } })
    return new NextResponse(result.stream, { headers: { "Content-Type": result.blob.contentType, ETag: result.blob.etag, "Cache-Control": "private, no-cache", "Content-Disposition": `attachment; filename="${owned[0].name}"` } })
  } catch (error) {
    console.error("[v0] DATABOOK file failed", error)
    return NextResponse.json({ error: "Não foi possível abrir o arquivo" }, { status: 500 })
  }
}
