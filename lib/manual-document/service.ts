import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { get } from "@vercel/blob"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { databookFiles, developmentContentValidations, developments, finishingTables, manualVersions } from "@/lib/db/schema"
import { assessManualReadiness } from "@/lib/completion"
import type { ManualType } from "@/lib/mock-data"
import type { requireDevelopmentAccess } from "@/lib/organization"
import { buildManualDocument } from "./build"
import { paginateManualDocument } from "./paginate"
import { normalizeManualImage } from "./images"
import type { ManualPreview } from "./types"

type AccessContext = Awaited<ReturnType<typeof requireDevelopmentAccess>>
export async function loadManualSource(context: AccessContext, manualType: ManualType) {
  const developmentId = context.development.id
  const organizationId = context.organization.id
  // Content and its approvals must come from one MVCC snapshot, never mixed reads.
  const [development, validations, finishing, files, versions] = await db.transaction(tx => Promise.all([
    tx.select().from(developments).where(and(eq(developments.id, developmentId), eq(developments.organizationId, organizationId))).limit(1),
    tx.select().from(developmentContentValidations).where(and(eq(developmentContentValidations.developmentId, developmentId), eq(developmentContentValidations.organizationId, organizationId))),
    manualType === "proprietario" ? tx.select().from(finishingTables).where(and(eq(finishingTables.developmentId, developmentId), eq(finishingTables.organizationId, organizationId))).orderBy(finishingTables.tower, finishingTables.typology) : Promise.resolve([]),
    tx.select().from(databookFiles).where(eq(databookFiles.developmentId, developmentId)).orderBy(databookFiles.folder, databookFiles.name),
    tx.select({ revision: manualVersions.revision }).from(manualVersions).where(and(eq(manualVersions.developmentId, developmentId), eq(manualVersions.organizationId, organizationId), eq(manualVersions.manualType, manualType))).orderBy(desc(manualVersions.revision)).limit(1),
  ]), { isolationLevel: "repeatable read", accessMode: "read only" })
  if (!development[0]) throw new Error("Empreendimento não encontrado")
  const source = {
    developmentId, name: development[0].name,
    organization: { name: context.organization.name, logo: context.organization.logo, metadata: context.organization.metadata },
    data: (development[0].data ?? {}) as Record<string, unknown>, manualType,
    revision: (versions[0]?.revision ?? 0) + 1,
    date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
    validations, finishing, files,
  }
  const fingerprint = createHash("sha256").update(JSON.stringify(source)).digest("hex")
  return { source, fingerprint, development: development[0] }
}

/** Authorization happens before lookup. Hash includes all source data and approval states. */
const cache = new Map<string, { result: ManualPreview; expires: number; bytes: number }>()
let cacheBytes = 0
const MAX_CACHE_BYTES = 24 * 1024 * 1024

async function identityImage(url: string | null | undefined, context: AccessContext): Promise<string | null> {
  if (!url) return null
  // Read only authenticated tenant assets. Never fetch arbitrary URLs from saved identity.
  const parsed = new URL(url, "https://manual.invalid")
  const pathname = parsed.searchParams.get("pathname")
  const brand = parsed.origin === "https://manual.invalid" && parsed.pathname === "/api/brand/file" && pathname?.startsWith(`brand/${context.development.id}/`)
  const organization = parsed.origin === "https://manual.invalid" && parsed.pathname === "/api/organization/logo" && pathname?.startsWith(`organization-logos/${context.organization.id}/`)
  if (!pathname || (!brand && !organization)) throw new Error("Imagem do Design do Manual precisa estar no armazenamento autorizado do empreendimento.")
  let bytes: Buffer
  let contentType: string
  const root = process.env.DG_PREVIEW_FILES_DIR
  if (root && process.env.VERCEL_ENV !== "production") {
    const target = path.resolve(root, pathname)
    if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error("Caminho de imagem inválido")
    bytes = await readFile(/* turbopackIgnore: true */ target)
    contentType = pathname.endsWith(".png") ? "image/png" : pathname.endsWith(".webp") ? "image/webp" : "image/jpeg"
  } else {
    const file = await get(pathname, { access: "private" })
    if (!file) throw new Error("Imagem configurada não encontrada. Atualize o Design do Manual.")
    contentType = file.blob.contentType ?? ""
    bytes = Buffer.from(await new Response(file.stream).arrayBuffer())
  }
  return (await normalizeManualImage(bytes, contentType)).dataUri
}

export async function composeManualPreview(context: AccessContext, manualType: ManualType, fresh = false) {
  const { source, fingerprint } = await loadManualSource(context, manualType)
  const found = cache.get(fingerprint)
  if (!fresh && found && found.expires > Date.now()) return found.result
  const document = buildManualDocument(source)
  document.metadata.fingerprint = fingerprint
  const warnings: string[] = []
  const image = async (url: string | null | undefined) => {
    try { return await identityImage(url, context) } catch (error) { warnings.push(error instanceof Error ? error.message : "Falha ao carregar imagem."); return null }
  }
  const [hero, logo, organizationLogo] = await Promise.all([image(document.identity.heroUrl), image(document.identity.developmentLogoUrl), image(document.metadata.organizationLogo)])
  document.identity.heroUrl = hero
  document.identity.developmentLogoUrl = logo
  document.metadata.organizationLogo = organizationLogo
  for (const section of document.sections.flatMap(function flatten(section): typeof document.sections { return [section, ...section.children.flatMap(flatten)] })) {
    for (const block of section.blocks) if (block.type === "image") {
      const src = await image(block.src)
      block.src = src ?? ""
    }
  }
  if (document.attachments.some(file => file.policy === "include")) warnings.push("A inclusão física de anexos ainda não está disponível. Selecione Apenas referenciar ou Não incluir.")
  const layout = await paginateManualDocument(document)
  layout.warnings.push(...warnings)
  const readiness = assessManualReadiness(source.data, manualType, source.finishing.length, source.validations, source.finishing)
  if (!source.name.trim()) readiness.blocking.push("O empreendimento não possui nome cadastrado.")
  readiness.blocking.push(...layout.warnings)
  readiness.ok = readiness.blocking.length === 0
  const result: ManualPreview = { document, layout, readiness, updatedAt: new Date().toISOString(), fingerprint }
  const bytes = Buffer.byteLength(JSON.stringify(result))
  if (found) { cacheBytes -= found.bytes; cache.delete(fingerprint) }
  while (cache.size && (cache.size >= 8 || cacheBytes + bytes > MAX_CACHE_BYTES)) {
    const key = cache.keys().next().value!
    cacheBytes -= cache.get(key)!.bytes
    cache.delete(key)
  }
  if (bytes <= MAX_CACHE_BYTES) { cache.set(fingerprint, { result, bytes, expires: Date.now() + 30_000 }); cacheBytes += bytes }
  return result
}

export function parseManualType(value: unknown): ManualType {
  if (value === undefined || value === null || value === "proprietario") return "proprietario"
  if (value === "sindico") return "sindico"
  throw new Error("Tipo de manual inválido")
}
