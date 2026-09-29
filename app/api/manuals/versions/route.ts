import { NextResponse } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { manualVersions } from "@/lib/db/schema"
import { requireActiveMembership } from "@/lib/organization"

export async function GET(request: Request) {
  const context = await requireActiveMembership()
  const url = new URL(request.url)
  const developmentId = url.searchParams.get("developmentId")
  const manualType = url.searchParams.get("manualType") ?? "proprietario"
  if (!developmentId) return NextResponse.json({ error: "Empreendimento não informado" }, { status: 400 })
  const versions = await db.select().from(manualVersions).where(and(eq(manualVersions.developmentId, developmentId), eq(manualVersions.organizationId, context.organization.id), eq(manualVersions.manualType, manualType))).orderBy(desc(manualVersions.revision))
  return NextResponse.json({ versions })
}
