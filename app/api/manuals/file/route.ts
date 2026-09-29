import { get } from "@vercel/blob"
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { developments, manualVersions } from "@/lib/db/schema"
import { requireActiveMembership } from "@/lib/organization"

export async function GET(request: Request) {
  const context = await requireActiveMembership()
  const pathname = new URL(request.url).searchParams.get("pathname")
  if (!pathname) return NextResponse.json({ error: "Arquivo não informado" }, { status: 400 })
  const rows = await db.select({ pathname: manualVersions.pathname, filename: manualVersions.filename }).from(manualVersions).innerJoin(developments, eq(manualVersions.developmentId, developments.id)).where(and(eq(manualVersions.pathname, pathname), eq(manualVersions.organizationId, context.organization.id))).limit(1)
  if (!rows[0]) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 })
  const result = await get(pathname, { access: "private" })
  if (!result) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 })
  return new NextResponse(result.stream, { headers: { "Content-Type": result.blob.contentType || "application/pdf", "Content-Disposition": `inline; filename="${rows[0].filename}"`, "Cache-Control": "private, no-cache" } })
}
