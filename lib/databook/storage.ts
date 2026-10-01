import { del, get, head } from "@vercel/blob"
import { createHash } from "node:crypto"
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { DatabookError } from "./ticket"

/** The local adapter is available only to explicitly configured isolated runners. */
export function hasLocalDatabookStorage() { return Boolean(process.env.DG_PREVIEW_FILES_DIR && !process.env.VERCEL && process.env.VERCEL_ENV !== "production") }
function localPath(pathname: string) {
  if (!hasLocalDatabookStorage()) return null
  if (!pathname.startsWith("databook/") || pathname.includes("\\") || pathname.split("/").some(segment => !segment || segment === "." || segment === "..")) throw new DatabookError("Destino do arquivo inválido.")
  const root = path.resolve(process.env.DG_PREVIEW_FILES_DIR!)
  const target = path.resolve(root, pathname)
  if (!target.startsWith(`${root}${path.sep}`)) throw new DatabookError("Destino do arquivo inválido.")
  return target
}
export function requireDatabookStorage() {
  if (!hasLocalDatabookStorage() && !process.env.BLOB_READ_WRITE_TOKEN) throw new DatabookError("Armazenamento de arquivos indisponível. Configure o armazenamento privado para esta prévia.", 503)
}
export async function writeLocalDatabookFile(pathname: string, file: File) {
  const target = localPath(pathname)
  if (!target) throw new DatabookError("O envio local não está disponível.", 400)
  await mkdir(path.dirname(target), { recursive: true })
  try { await writeFile(target, new Uint8Array(await file.arrayBuffer()), { flag: "wx" }) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    const existing = await readFile(/* turbopackIgnore: true */ target)
    const incoming = Buffer.from(await file.arrayBuffer())
    if (!existing.equals(incoming)) throw new DatabookError("Já existe outro arquivo para esta autorização.", 409)
  }
}
export async function headDatabookFile(pathname: string) {
  const target = localPath(pathname)
  if (target) { try { return { pathname, size: (await stat(/* turbopackIgnore: true */ target)).size, private: true } } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new DatabookError("O arquivo ainda não foi recebido. Tente novamente.", 409); throw error } }
  requireDatabookStorage()
  const result = await head(pathname)
  return { pathname: result.pathname, size: result.size, private: new URL(result.url).hostname.endsWith(".private.blob.vercel-storage.com") }
}
export async function readDatabookFile(pathname: string, contentType: string, ifNoneMatch?: string | null) {
  const target = localPath(pathname)
  if (!target) { requireDatabookStorage(); return get(pathname, { access: "private", ifNoneMatch: ifNoneMatch ?? undefined }) }
  try {
    const bytes = await readFile(/* turbopackIgnore: true */ target)
    const etag = `"${createHash("sha256").update(bytes).digest("hex")}"`
    return { stream: ifNoneMatch === etag ? null : new Uint8Array(bytes), statusCode: ifNoneMatch === etag ? 304 as const : 200 as const, blob: { contentType, etag } }
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error }
}
export async function removeDatabookFile(pathname: string) {
  const target = localPath(pathname)
  if (!target) { requireDatabookStorage(); return del(pathname) }
  try { await unlink(target) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
}
