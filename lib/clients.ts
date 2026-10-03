import "server-only"
import { and, desc, eq, isNull, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { clientAccesses, developmentUnits, developments, manualVersions, organizations } from "@/lib/db/schema"
import { requireAuthenticatedUser } from "@/lib/organization"
import { assertId } from "@/lib/security/input"
import type { ClientManual, ClientPortalData } from "@/lib/client-types"

export class ClientAccessError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export async function requireClientUser() {
  try { return await requireAuthenticatedUser() }
  catch (error) {
    if (error instanceof Error && error.message === "Não autenticado") throw new ClientAccessError(401, "Entre na sua conta para acessar seus documentos.")
    if (error instanceof Error && error.message === "Conta inativa") throw new ClientAccessError(403, "Seu acesso está desabilitado. Entre em contato com a construtora.")
    throw error
  }
}

export async function hasClientIdentity(userId: string): Promise<boolean> {
  const row = await db.select({ id: clientAccesses.id }).from(clientAccesses).where(eq(clientAccesses.userId, userId)).limit(1)
  return Boolean(row[0])
}

export async function requireClientManual(input: { accessId: string; manualId: string }) {
  const current = await requireClientUser()
  try { assertId(input.accessId); assertId(input.manualId) }
  catch { throw new ClientAccessError(400, "Documento inválido.") }
  const rows = await db.select({ access: clientAccesses, manual: manualVersions }).from(clientAccesses)
    .innerJoin(developmentUnits, and(eq(developmentUnits.id, clientAccesses.unitId), eq(developmentUnits.developmentId, clientAccesses.developmentId), eq(developmentUnits.organizationId, clientAccesses.organizationId)))
    .innerJoin(manualVersions, and(eq(manualVersions.organizationId, clientAccesses.organizationId), eq(manualVersions.developmentId, clientAccesses.developmentId)))
    .where(and(
      eq(clientAccesses.id, input.accessId), eq(clientAccesses.userId, current.id), eq(clientAccesses.status, "active"),
      eq(manualVersions.id, input.manualId), eq(manualVersions.status, "publicado"),
      or(and(eq(manualVersions.manualType, "proprietario"), isNull(manualVersions.unitId)), and(eq(manualVersions.manualType, "acabamentos"), eq(manualVersions.unitId, clientAccesses.unitId))),
    )).limit(1)
  if (!rows[0]) throw new ClientAccessError(404, "Documento indisponível para este acesso.")
  return { user: current, access: rows[0].access, manual: rows[0].manual }
}

export async function getClientPortalData(): Promise<ClientPortalData> {
  const current = await requireClientUser()
  const rows = await db.select({ access: clientAccesses, organizationName: organizations.name, developmentName: developments.name, tower: developmentUnits.tower, number: developmentUnits.number })
    .from(clientAccesses)
    .innerJoin(organizations, eq(organizations.id, clientAccesses.organizationId))
    .innerJoin(developments, and(eq(developments.id, clientAccesses.developmentId), eq(developments.organizationId, clientAccesses.organizationId)))
    .innerJoin(developmentUnits, and(eq(developmentUnits.id, clientAccesses.unitId), eq(developmentUnits.developmentId, clientAccesses.developmentId), eq(developmentUnits.organizationId, clientAccesses.organizationId)))
    .where(and(eq(clientAccesses.userId, current.id), eq(clientAccesses.status, "active")))
    .orderBy(clientAccesses.createdAt)
  if (!rows.length) {
    if (await hasClientIdentity(current.id)) throw new ClientAccessError(403, "Seu acesso está desabilitado. Entre em contato com a construtora.")
    throw new ClientAccessError(403, "Esta conta não possui acesso de cliente. Solicite um convite à construtora.")
  }
  const versions = await db.select({ id: manualVersions.id, organizationId: manualVersions.organizationId, developmentId: manualVersions.developmentId, unitId: manualVersions.unitId, manualType: manualVersions.manualType, filename: manualVersions.filename, revision: manualVersions.revision, pages: manualVersions.pages, createdAt: manualVersions.createdAt, publishedAt: manualVersions.publishedAt })
    .from(manualVersions).where(and(eq(manualVersions.status, "publicado"), or(...rows.map(row => and(
      eq(manualVersions.organizationId, row.access.organizationId), eq(manualVersions.developmentId, row.access.developmentId),
      or(and(eq(manualVersions.manualType, "proprietario"), isNull(manualVersions.unitId)), and(eq(manualVersions.manualType, "acabamentos"), eq(manualVersions.unitId, row.access.unitId))),
    )))))
    .orderBy(desc(manualVersions.revision))
  return {
    userName: current.name,
    accesses: rows.map(row => ({
      id: row.access.id, organizationName: row.organizationName, developmentName: row.developmentName,
      unitLabel: [row.tower, "Unidade " + row.number].filter(Boolean).join(" · "),
      manuals: versions.filter(version => version.organizationId === row.access.organizationId && version.developmentId === row.access.developmentId && (version.manualType === "proprietario" ? version.unitId === null : version.unitId === row.access.unitId))
        .map((version): ClientManual => ({ id: version.id, filename: version.filename, revision: version.revision, pages: version.pages, manualType: version.manualType as ClientManual["manualType"], publishedAt: (version.publishedAt ?? version.createdAt).toISOString(), downloadUrl: "/api/clients/manuals/file?" + new URLSearchParams({ accessId: row.access.id, id: version.id }) })),
    })),
  }
}
