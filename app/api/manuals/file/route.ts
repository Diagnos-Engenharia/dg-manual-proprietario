import { getManualFile } from "@/lib/manual-files"
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { developments, manualVersions } from "@/lib/db/schema"
import { requireDevelopmentAccess } from "@/lib/organization"
import { manualApiError } from "@/lib/manual-document/http"
import { safeContentDisposition } from "@/lib/security/uploads"

export async function GET(request: Request) {
  try {
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Versão não informada" }, { status: 400 })
  const rows = await db.select({ pathname: manualVersions.pathname, filename: manualVersions.filename, developmentId: manualVersions.developmentId }).from(manualVersions).innerJoin(developments, eq(manualVersions.developmentId, developments.id)).where(and(eq(manualVersions.id, id), eq(manualVersions.organizationId,developments.organizationId))).limit(1)
  if (!rows[0]) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 })
  await requireDevelopmentAccess(rows[0].developmentId)
  const result = await getManualFile(rows[0].pathname)
  if (!result) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 })
  return new NextResponse(result.stream, { headers: { "Content-Type": result.blob.contentType || "application/pdf", "Content-Disposition": safeContentDisposition(rows[0].filename, "inline"), "Cache-Control": "private, no-cache" } })
  } catch (error) { return manualApiError(error) }
}
