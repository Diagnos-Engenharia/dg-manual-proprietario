import { NextResponse } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { manualVersions } from "@/lib/db/schema"
import { requireDevelopmentAccess } from "@/lib/organization"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const developmentId = url.searchParams.get("developmentId")
  const manualType = url.searchParams.get("manualType") ?? "proprietario"
  if (!developmentId) return NextResponse.json({ error: "Empreendimento não informado" }, { status: 400 })
  const context = await requireDevelopmentAccess(developmentId)
  const versions = await db.select({
    id:manualVersions.id,
    manualType:manualVersions.manualType,
    revision:manualVersions.revision,
    status:manualVersions.status,
    comment:manualVersions.comment,
    filename:manualVersions.filename,
    sections:manualVersions.sections,
    pages:manualVersions.pages,
    attachments:manualVersions.attachments,
    finishingRevision:manualVersions.finishingRevision,
    finishingRows:manualVersions.finishingRows,
    createdAt:manualVersions.createdAt,
  }).from(manualVersions).where(and(eq(manualVersions.developmentId, developmentId), eq(manualVersions.organizationId, context.organization.id), eq(manualVersions.manualType, manualType))).orderBy(desc(manualVersions.revision))
  return NextResponse.json({ versions })
}
