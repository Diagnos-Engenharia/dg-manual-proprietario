import { del, get, put } from "@vercel/blob"
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

// Explicitly enabled only for isolated preview runners. Production retains private Blob storage.
function previewPath(pathname: string) {
  const root = process.env.DG_PREVIEW_FILES_DIR
  if (!root || process.env.VERCEL_ENV === "production") return null
  const target = path.resolve(root, pathname)
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("Caminho de arquivo inválido")
  return target
}

export async function saveManualFile(pathname: string, bytes: Buffer) {
  const local = previewPath(pathname)
  if (!local) return put(pathname, bytes, { access: "private", contentType: "application/pdf", addRandomSuffix: false })
  await mkdir(path.dirname(local), { recursive: true })
  await writeFile(local, bytes)
  return { pathname }
}

export async function getManualFile(pathname: string) {
  const local = previewPath(pathname)
  if (!local) return get(pathname, { access: "private" })
  try {
    const bytes = await readFile(/* turbopackIgnore: true */ local)
    return { stream: new Uint8Array(bytes), blob: { contentType: "application/pdf" } }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

/** Only the just-generated UUID issuance file may be discarded after a failed commit. */
export async function discardUnissuedManualFile(pathname: string) {
  if (!/^manuals\/[^/.]+\/[^/.]+\/[0-9a-f-]{36}\/[^/]+\.pdf$/i.test(pathname)) throw new Error("Caminho de emissão inválido")
  const local = previewPath(pathname)
  if (!local) return del(pathname)
  try { await unlink(local) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
}
