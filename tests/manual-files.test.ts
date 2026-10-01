import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { discardUnissuedManualFile, saveManualFile } from "../lib/manual-files"

test("failed issuance cleanup removes only its generated file and rejects traversal", async () => {
  const oldRoot = process.env.DG_PREVIEW_FILES_DIR
  const root = await mkdtemp(path.join(tmpdir(), "dg-manual-issuance-"))
  process.env.DG_PREVIEW_FILES_DIR = root
  try {
    const failed = `manuals/organization/development/${crypto.randomUUID()}/failed.pdf`
    const issued = `manuals/organization/development/${crypto.randomUUID()}/issued.pdf`
    await saveManualFile(failed, Buffer.from("failed"))
    await saveManualFile(issued, Buffer.from("issued"))
    await discardUnissuedManualFile(failed)
    await assert.rejects(readFile(path.join(root, failed)), { code: "ENOENT" })
    assert.equal(await readFile(path.join(root, issued), "utf8"), "issued")
    await assert.rejects(discardUnissuedManualFile("manuals/../development/file.pdf"), /inválido/)
    await discardUnissuedManualFile(issued)
  } finally {
    if (oldRoot === undefined) delete process.env.DG_PREVIEW_FILES_DIR
    else process.env.DG_PREVIEW_FILES_DIR = oldRoot
  }
})
