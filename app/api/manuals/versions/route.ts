import { NextResponse } from "next/server"
import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { manualVersions, user } from "@/lib/db/schema"
import { requireDevelopmentAccess } from "@/lib/organization"
import { parseDocumentType } from "@/lib/manual-document/service"
import { getFinishingUnit } from "@/lib/finishing-units"
import { manualApiError } from "@/lib/manual-document/http"

export async function GET(request: Request) {
  try {
  const url = new URL(request.url)
  const developmentId = url.searchParams.get("developmentId")
  const manualType = parseDocumentType(url.searchParams.get("manualType"))
  const unitId = manualType === "acabamentos" ? url.searchParams.get("unitId") : null
  if (!developmentId) return NextResponse.json({ error: "Empreendimento não informado" }, { status: 400 })
  const context = await requireDevelopmentAccess(developmentId)
  const unit = manualType === "acabamentos" && unitId ? await getFinishingUnit(developmentId, unitId) : null
  if (manualType === "acabamentos" && !unit) return NextResponse.json({ error: "Selecione uma unidade" }, { status: 400 })
  const rows = await db.select({
    id: manualVersions.id,
    revision: manualVersions.revision,
    status: manualVersions.status,
    comment: manualVersions.comment,
    filename: manualVersions.filename,
    sections: manualVersions.sections,
    pages: manualVersions.pages,
    attachments: manualVersions.attachments,
    createdAt: manualVersions.createdAt,
    createdBy: manualVersions.createdBy,
    sourceFingerprint: manualVersions.sourceFingerprint,
    authorName: user.name,
  }).from(manualVersions).leftJoin(user, eq(manualVersions.createdBy,user.id)).where(and(eq(manualVersions.developmentId, developmentId), eq(manualVersions.organizationId, context.organization.id), eq(manualVersions.manualType, manualType), unitId ? eq(manualVersions.unitId, unitId) : isNull(manualVersions.unitId))).orderBy(desc(manualVersions.revision))
  const versions = rows.map(({ sourceFingerprint, ...version }) => ({ ...version, createdAt: version.createdAt.toISOString(), ...(unit ? { sourceCurrent: sourceFingerprint === unit.fingerprint } : {}) }))
  return NextResponse.json({ versions }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return manualApiError(error) }
}
