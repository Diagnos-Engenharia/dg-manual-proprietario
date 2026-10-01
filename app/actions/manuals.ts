"use server"

import { and, desc, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { developmentAssignments, developments, manualVersions, user } from "@/lib/db/schema"
import { isGlobalAdmin, requireActiveMembership } from "@/lib/organization"

/** Published PDFs follow the same organization and development grants as authoring. */
export async function listPublishedManuals() {
  const context = await requireActiveMembership()
  const assignmentIds = db.select({ id: developmentAssignments.developmentId }).from(developmentAssignments).where(and(
    eq(developmentAssignments.organizationId, context.organization.id),
    eq(developmentAssignments.memberId, context.member.id),
    inArray(developmentAssignments.role, ["admin_empreendimento", "editor", "validator"]),
  ))
  const rows = await db.select({
    id: manualVersions.id, developmentId: developments.id,
    developmentName: developments.name, client: developments.client,
    manualType: manualVersions.manualType, revision: manualVersions.revision,
    filename: manualVersions.filename, pathname: manualVersions.pathname,
    pages: manualVersions.pages, createdAt: manualVersions.createdAt, authorName: user.name,
  }).from(manualVersions)
    .innerJoin(developments, eq(manualVersions.developmentId, developments.id))
    .leftJoin(user, eq(manualVersions.createdBy, user.id))
    .where(and(
      eq(manualVersions.status, "publicado"),
      eq(manualVersions.organizationId, context.organization.id),
      eq(developments.organizationId, context.organization.id),
      inArray(manualVersions.manualType, ["proprietario", "sindico"]),
      ...(isGlobalAdmin(context.member.role) ? [] : [inArray(developments.id, assignmentIds)]),
    ))
    .orderBy(desc(manualVersions.createdAt), desc(manualVersions.revision))
  return rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }))
}
