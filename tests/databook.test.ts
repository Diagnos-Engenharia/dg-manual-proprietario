import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { DATABOOK_DEFAULT_FOLDERS, DATABOOK_MAX_BYTES, resolveDatabookFolders } from "../lib/databook/types"
import { signUploadTicket, uploadPath, validateFileMetadata, verifyUploadTicket, type UploadTicket } from "../lib/databook/ticket"
import { hasLocalDatabookStorage, headDatabookFile, readDatabookFile, removeDatabookFile, writeLocalDatabookFile } from "../lib/databook/storage"

test("folder reconciliation preserves defaults, stored identities and intentionally deleted folders", () => {
  const fresh = resolveDatabookFolders({}, [{ folder: "Recebidos" }])
  assert.deepEqual(fresh.slice(0, DATABOOK_DEFAULT_FOLDERS.length).map(folder => folder.name), DATABOOK_DEFAULT_FOLDERS)
  assert.equal(fresh.at(-1)?.name, "Recebidos")
  const data = { ficha: { towers: "2" }, databookFolders: [{ id: "created", name: " Pasta   vazia " }, { id: "duplicate", name: "pasta vazia" }] }
  const before = structuredClone(data)
  const saved = resolveDatabookFolders(data, [{ folder: "Legado" }])
  assert.deepEqual(saved.map(folder => folder.name), ["Pasta vazia", "Legado"])
  assert.equal(saved[0].id, "created")
  assert.equal(resolveDatabookFolders({ databookFolders: [] }, []).length, 0)
  assert.deepEqual(data, before)
})

test("upload tickets bind exact destination and metadata, reject forgery and expiration", () => {
  const original = process.env.BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_SECRET = "isolated-databook-ticket-test"
  try {
    const id = crypto.randomUUID()
    const ticket: UploadTicket = { id, organizationId: "org-a", developmentId: "development-a", userId: "editor-a", folderId: "folder-a", name: "Área técnica.pdf", contentType: "application/pdf", size: 6 * 1024 * 1024, pathname: uploadPath("org-a", "development-a", id, "Área técnica.pdf"), expiresAt: Date.now() + 300_000 }
    const signed = signUploadTicket(ticket)
    assert.deepEqual(verifyUploadTicket(signed), ticket)
    const [payload, signature] = signed.split(".")
    const altered = Buffer.from(JSON.stringify({ ...ticket, developmentId: "development-b" })).toString("base64url")
    assert.throws(() => verifyUploadTicket(`${altered}.${signature}`), /inválida/)
    assert.throws(() => verifyUploadTicket(`${payload}.bad`), /inválida/)
    assert.throws(() => verifyUploadTicket(signUploadTicket({ ...ticket, pathname: "databook/org-a/development-b/stolen.pdf" })), /Destino/)
    assert.throws(() => verifyUploadTicket(signed, ticket.expiresAt), /expirou/)
    assert.deepEqual(verifyUploadTicket(signed, ticket.expiresAt, true), ticket)
    assert.throws(() => validateFileMetadata("../segredo.pdf", "application/pdf", 20), /Nome/)
    assert.throws(() => validateFileMetadata("vazio.pdf", "application/pdf", 0), /vazio/)
    assert.throws(() => validateFileMetadata("grande.pdf", "application/pdf", DATABOOK_MAX_BYTES + 1), /50 MB/)
    assert.throws(() => validateFileMetadata("injetado.pdf", "application/pdf\r\nX-Test: injected", 20), /Tipo/)
    assert.equal(validateFileMetadata("  normal.pdf  ", "", DATABOOK_MAX_BYTES).name, "normal.pdf")
    assert.match(uploadPath("../org", "dev/../other", id, "file.pdf"), /^databook\/%2E%2E%2Forg\/dev%2F%2E%2E%2Fother\//)
  } finally { if (original === undefined) delete process.env.BETTER_AUTH_SECRET; else process.env.BETTER_AUTH_SECRET = original }
})

test("isolated private storage supports large files, conditional reads and safe idempotent removal", async () => {
  const previous = { root: process.env.DG_PREVIEW_FILES_DIR, vercel: process.env.VERCEL, env: process.env.VERCEL_ENV }
  const root = await mkdtemp(path.join(tmpdir(), "dg-databook-files-"))
  process.env.DG_PREVIEW_FILES_DIR = root
  delete process.env.VERCEL
  process.env.VERCEL_ENV = "preview"
  try {
    assert.equal(hasLocalDatabookStorage(), true)
    const pathname = uploadPath("organization", "development", crypto.randomUUID(), "arquivo-6mb.pdf")
    const contents = Buffer.alloc(6 * 1024 * 1024, 97)
    const file = new File([contents], "arquivo-6mb.pdf", { type: "application/pdf" })
    await writeLocalDatabookFile(pathname, file)
    await writeLocalDatabookFile(pathname, file)
    assert.equal((await headDatabookFile(pathname)).size, contents.length)
    const read = await readDatabookFile(pathname, "application/pdf")
    assert.equal(read?.statusCode, 200)
    assert.deepEqual(Buffer.from(read!.stream as Uint8Array), contents)
    assert.equal((await readDatabookFile(pathname, "application/pdf", read!.blob.etag))?.statusCode, 304)
    await assert.rejects(writeLocalDatabookFile(pathname, new File(["different"], "arquivo-6mb.pdf")), /outro arquivo/)
    await assert.rejects(removeDatabookFile("databook/../../outside.pdf"), /inválido/)
    await assert.rejects(removeDatabookFile("databook/../other.pdf"), /inválido/)
    assert.equal((await readFile(path.join(root, pathname))).length, contents.length)
    process.env.VERCEL = "1"
    assert.equal(hasLocalDatabookStorage(), false)
    delete process.env.VERCEL
    process.env.VERCEL_ENV = "production"
    assert.equal(hasLocalDatabookStorage(), false)
    process.env.VERCEL_ENV = "preview"
    await removeDatabookFile(pathname)
    await removeDatabookFile(pathname)
    assert.equal(await readDatabookFile(pathname, "application/pdf"), null)
  } finally {
    if (previous.root === undefined) delete process.env.DG_PREVIEW_FILES_DIR; else process.env.DG_PREVIEW_FILES_DIR = previous.root
    if (previous.vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous.vercel
    if (previous.env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous.env
  }
})
