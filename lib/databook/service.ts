import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { auditLogs, databookFiles, developments } from "@/lib/db/schema"
import { canEditContent, requireDevelopmentAccess } from "@/lib/organization"
import { consumeRateLimit } from "@/lib/security/rate-limit"
import { databookNameKey, DATABOOK_GENERAL_FOLDER, normalizeDatabookName, resolveDatabookFolders, type DatabookCatalog, type DatabookFile, type DatabookFolder } from "./types"
import { DatabookError, signUploadTicket, uploadPath, validateFileMetadata, verifyUploadTicket, type UploadTicket } from "./ticket"
import { hasLocalDatabookStorage, headDatabookFile, readDatabookFileHead, removeDatabookFile, requireDatabookStorage } from "./storage"\nimport { assertDatabookContent } from "@/lib/security/uploads"

type Context = Awaited<ReturnType<typeof requireDevelopmentAccess>>
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type FileRow = typeof databookFiles.$inferSelect
export function serializeDatabookFile(file: FileRow): DatabookFile { return { id: file.id, folder: file.folder, name: file.name, pathname: file.pathname, contentType: file.contentType, sizeBytes: file.sizeBytes, createdAt: file.createdAt.toISOString() } }

export async function databookAccess(id: unknown, edit = false) {
  if (typeof id !== "string" || !id || id.length > 300) throw new DatabookError("Empreendimento não informado.")
  let context: Context
  try { context = await requireDevelopmentAccess(id) } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (/Não autenticado/i.test(message)) throw new DatabookError("Não autenticado.", 401)
    if (/não encontrad|Acesso não autorizado/i.test(message)) throw new DatabookError("Empreendimento não encontrado.", 404)
    if (/Organização|Perfil|permissão|restrito/i.test(message)) throw new DatabookError("Você não tem permissão para acessar estes arquivos.", 403)
    throw error
  }
  if (edit && !canEditContent(context.developmentRole)) throw new DatabookError("Você não tem permissão para alterar estes arquivos.", 403)
  return context
}

async function lockDevelopment(tx: Transaction, context: Context) {
  const row = (await tx.select().from(developments).where(and(eq(developments.id, context.development.id), eq(developments.organizationId, context.organization.id))).for("update"))[0]
  if (!row) throw new DatabookError("Empreendimento não encontrado.", 404)
  return row
}
async function filesFor(tx: Transaction, id: string) { return tx.select().from(databookFiles).where(eq(databookFiles.developmentId, id)).orderBy(databookFiles.folder, databookFiles.name) }
async function writeFolders(tx: Transaction, context: Context, folders: DatabookFolder[]) {
  await tx.update(developments).set({ data: sql`jsonb_set(COALESCE(${developments.data}, '{}'::jsonb), '{databookFolders}', ${JSON.stringify(folders)}::jsonb, true)`, lastEditorId: context.user.id, updatedAt: new Date(), version: sql`${developments.version} + 1` }).where(eq(developments.id, context.development.id))
}
async function audit(tx: Transaction, context: Context, action: string, metadata: Record<string, unknown>) {
  await tx.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: context.organization.id, actorId: context.user.id, action, entityType: "development", entityId: context.development.id, metadata })
}
function folderName(value: unknown) {
  if (typeof value !== "string" || !normalizeDatabookName(value) || value.length > 100 || /[\x00-\x1f\x7f]/.test(value)) throw new DatabookError("Informe um nome de pasta válido, com até 100 caracteres.")
  return normalizeDatabookName(value)
}

export async function listDatabookCatalog(developmentId: unknown): Promise<DatabookCatalog> {
  const context = await databookAccess(developmentId)
  return db.transaction(async tx => {
    const development = (await tx.select({ data: developments.data }).from(developments).where(eq(developments.id, context.development.id)))[0]
    const files = await filesFor(tx, context.development.id)
    return { folders: resolveDatabookFolders(development?.data, files), files: files.map(serializeDatabookFile), canEdit: canEditContent(context.developmentRole) }
  }, { isolationLevel: "repeatable read", accessMode: "read only" })
}

export async function mutateDatabookFolder(input: { developmentId: unknown; action: unknown; id?: unknown; name?: unknown; expectedName?: unknown }) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DatabookError("Dados de pasta inválidos.")
  const context = await databookAccess(input.developmentId, true)
  await consumeRateLimit(`databook-folder:${context.user.id}`, { max: 120, windowSeconds: 3600 })
  if (!["create", "rename", "delete"].includes(String(input.action))) throw new DatabookError("Ação de pasta inválida.")
  if (input.action === "delete") {
    const catalog = await listDatabookCatalog(context.development.id)
    const folder = catalog.folders.find(item => item.id === input.id)
    if (!folder) throw new DatabookError("Pasta não encontrada.", 404)
    if (folder.name !== input.expectedName) throw new DatabookError("A pasta foi alterada. Atualize a lista e tente novamente.", 409)
    const failed: string[] = []
    for (const file of catalog.files.filter(item => item.folder === folder.name)) {
      try { await deleteDatabookFile({ developmentId: context.development.id, id: file.id, expectedName: file.name, expectedFolder: { id: folder.id, name: folder.name } }) } catch (error) {
        // Stop immediately if another editor changed the folder while the batch was running.
        if (error instanceof DatabookError && error.code === "FOLDER_CHANGED") throw error
        failed.push(file.name)
      }
    }
    if (failed.length) throw new DatabookError(`Não foi possível excluir: ${failed.join(", ")}. Os arquivos restantes e a pasta foram preservados. Tente novamente.`, 409)
  }
  await db.transaction(async tx => {
    const development = await lockDevelopment(tx, context)
    const files = await filesFor(tx, development.id)
    const folders = resolveDatabookFolders(development.data, files)
    if (input.action === "create") {
      const name = folderName(input.name)
      if (folders.some(item => databookNameKey(item.name) === databookNameKey(name))) throw new DatabookError("Já existe uma pasta com esse nome.", 409)
      folders.push({ id: crypto.randomUUID(), name })
      await audit(tx, context, "databook.folder.created", { name })
    } else {
      const folder = folders.find(item => item.id === input.id)
      if (!folder) throw new DatabookError("Pasta não encontrada.", 404)
      if (folder.name !== input.expectedName) throw new DatabookError("A pasta foi alterada. Atualize a lista e tente novamente.", 409)
      if (input.action === "rename") {
        const name = folderName(input.name)
        if (folders.some(item => item.id !== folder.id && databookNameKey(item.name) === databookNameKey(name))) throw new DatabookError("Já existe uma pasta com esse nome.", 409)
        await tx.update(databookFiles).set({ folder: name }).where(and(eq(databookFiles.developmentId, development.id), eq(databookFiles.folder, folder.name)))
        await audit(tx, context, "databook.folder.renamed", { before: folder.name, after: name })
        folder.name = name
      } else {
        if (files.some(item => item.folder === folder.name)) throw new DatabookError("A pasta recebeu novos arquivos. Confira o conteúdo antes de excluí-la.", 409)
        folders.splice(folders.indexOf(folder), 1)
        await audit(tx, context, "databook.folder.deleted", { name: folder.name })
      }
    }
    await writeFolders(tx, context, folders)
  })
  return listDatabookCatalog(context.development.id)
}

export async function prepareDatabookUpload(input: { developmentId: unknown; folderId?: unknown; name: unknown; contentType: unknown; size: unknown }) {
  const context = await databookAccess(input.developmentId, true)
  await consumeRateLimit(`databook-upload:${context.user.id}`, { max: 40, windowSeconds: 3600 })
  const metadata = validateFileMetadata(input.name, input.contentType, input.size)
  requireDatabookStorage()
  const folder = await db.transaction(async tx => {
    const development = await lockDevelopment(tx, context)
    const folders = resolveDatabookFolders(development.data, await filesFor(tx, development.id))
    let selected = folders.find(item => item.id === input.folderId)
    if (input.folderId == null) {
      selected = folders.find(item => databookNameKey(item.name) === databookNameKey(DATABOOK_GENERAL_FOLDER))
      if (!selected) { selected = { id: crypto.randomUUID(), name: DATABOOK_GENERAL_FOLDER }; folders.push(selected) }
    }
    if (!selected) throw new DatabookError("Pasta não encontrada. Selecione o destino novamente.", 404)
    const persistedFolders = development.data && typeof development.data === "object" && !Array.isArray(development.data) ? (development.data as Record<string, unknown>).databookFolders : undefined
    if (JSON.stringify(persistedFolders) !== JSON.stringify(folders)) await writeFolders(tx, context, folders)
    return selected
  })
  const id = crypto.randomUUID()
  const ticket: UploadTicket = { ...metadata, id, developmentId: context.development.id, organizationId: context.organization.id, userId: context.user.id, folderId: folder.id, pathname: uploadPath(context.organization.id, context.development.id, id, metadata.name), expiresAt: Date.now() + 20 * 60 * 1000 }
  return { ticket: signUploadTicket(ticket), pathname: ticket.pathname, transport: hasLocalDatabookStorage() ? "local" as const : "blob" as const }
}

export async function authorizeDatabookTicket(value: unknown, allowExpired = false) {
  const ticket = verifyUploadTicket(value, Date.now(), allowExpired)
  const context = await databookAccess(ticket.developmentId, true)
  if (context.user.id !== ticket.userId || context.organization.id !== ticket.organizationId) throw new DatabookError("Esta autorização pertence a outro usuário.", 403)
  const folders = resolveDatabookFolders(context.development.data, await db.select().from(databookFiles).where(eq(databookFiles.developmentId, ticket.developmentId)))
  if (!folders.some(folder => folder.id === ticket.folderId)) throw new DatabookError("A pasta de destino foi excluída. Selecione outra pasta.", 409)
  return { ticket, context }
}

export async function finalizeDatabookUpload(value: unknown) {
  const { ticket, context } = await authorizeDatabookTicket(value, true)
  const existing = (await db.select().from(databookFiles).where(and(eq(databookFiles.id, ticket.id), eq(databookFiles.developmentId, ticket.developmentId))))[0]
  if (existing) return serializeDatabookFile(existing)
  if (ticket.expiresAt <= Date.now()) throw new DatabookError("A autorização de envio expirou. Tente novamente.", 409)
  const blob = await headDatabookFile(ticket.pathname)
  if (blob.pathname !== ticket.pathname || !blob.private || blob.size !== ticket.size) throw new DatabookError("O arquivo recebido não corresponde ao envio autorizado.", 409)
  try { assertDatabookContent(ticket.name,ticket.contentType,await readDatabookFileHead(ticket.pathname)) }
  catch(error){ throw new DatabookError(error instanceof Error?error.message:"O conteúdo real do arquivo não é permitido.",400) }
  return db.transaction(async tx => {
    const development = await lockDevelopment(tx, context)
    const files = await filesFor(tx, development.id)
    const previous = files.find(item => item.id === ticket.id)
    if (previous) return serializeDatabookFile(previous)
    const folder = resolveDatabookFolders(development.data, files).find(item => item.id === ticket.folderId)
    if (!folder) throw new DatabookError("A pasta de destino foi excluída. Selecione outra pasta.", 409)
    const [file] = await tx.insert(databookFiles).values({ id: ticket.id, userId: context.user.id, developmentId: development.id, folder: folder.name, name: ticket.name, pathname: ticket.pathname, contentType: ticket.contentType, sizeBytes: ticket.size }).returning()
    await audit(tx, context, "databook.uploaded", { path: ["databook", folder.name, ticket.name], before: null, after: { id: ticket.id, pathname: ticket.pathname, size: ticket.size } })
    return serializeDatabookFile(file)
  })
}

export async function findDatabookFile(pathname: unknown) {
  if (typeof pathname !== "string" || !pathname || pathname.length > 1000) throw new DatabookError("Arquivo não informado.")
  const row = (await db.select().from(databookFiles).where(eq(databookFiles.pathname, pathname)))[0]
  if (!row) throw new DatabookError("Arquivo não encontrado.", 404)
  await databookAccess(row.developmentId)
  return row
}

export async function renameDatabookFile(input: { developmentId: unknown; id?: unknown; name?: unknown; expectedName?: unknown }) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DatabookError("Dados de arquivo inválidos.")
  const context = await databookAccess(input.developmentId, true)
  await consumeRateLimit(`databook-rename:${context.user.id}`, { max: 120, windowSeconds: 3600 })
  const metadata = validateFileMetadata(input.name, "application/octet-stream", 1)
  return db.transaction(async tx => {
    await lockDevelopment(tx, context)
    const row = (await tx.select().from(databookFiles).where(and(eq(databookFiles.id, String(input.id)), eq(databookFiles.developmentId, context.development.id))))[0]
    if (!row) throw new DatabookError("Arquivo não encontrado.", 404)
    if (row.name !== input.expectedName) throw new DatabookError("O arquivo foi alterado. Atualize a lista e tente novamente.", 409)
    const [file] = await tx.update(databookFiles).set({ name: metadata.name }).where(eq(databookFiles.id, row.id)).returning()
    await audit(tx, context, "databook.file.renamed", { before: row.name, after: file.name, pathname: row.pathname })
    return serializeDatabookFile(file)
  })
}

export async function deleteDatabookFile(input: { developmentId?: unknown; id?: unknown; pathname?: unknown; expectedName?: unknown; expectedFolder?: { id: unknown; name: unknown } }) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DatabookError("Dados de arquivo inválidos.")
  const row = input.pathname ? await findDatabookFile(input.pathname) : null
  const context = await databookAccess(input.developmentId ?? row?.developmentId, true)
  await consumeRateLimit(`databook-delete:${context.user.id}`, { max: 60, windowSeconds: 3600 })
  return db.transaction(async tx => {
    const development = await lockDevelopment(tx, context)
    const file = (await tx.select().from(databookFiles).where(and(eq(databookFiles.id, row?.id ?? String(input.id)), eq(databookFiles.developmentId, context.development.id))))[0]
    if (!file) throw new DatabookError("Arquivo não encontrado.", 404)
    if (input.expectedFolder) {
      const folder = resolveDatabookFolders(development.data, await filesFor(tx, development.id)).find(item => item.id === input.expectedFolder!.id)
      if (!folder || folder.name !== input.expectedFolder.name || file.folder !== input.expectedFolder.name) throw new DatabookError("A pasta foi alterada durante a exclusão. Os arquivos restantes foram preservados. Confira o destino antes de tentar novamente.", 409, "FOLDER_CHANGED")
    }
    if (input.expectedName !== undefined && file.name !== input.expectedName) throw new DatabookError("O arquivo foi alterado. Atualize a lista e tente novamente.", 409)
    await removeDatabookFile(file.pathname)
    await tx.delete(databookFiles).where(eq(databookFiles.id, file.id))
    await audit(tx, context, "databook.deleted", { path: ["databook", file.folder, file.name], before: { id: file.id, pathname: file.pathname }, after: null })
    return { success: true }
  })
}
