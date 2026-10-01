import test from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { databookArchivePaths } from "@/lib/databook/archive-paths"

test("ZIP entries remain inside named folders and preserve every colliding filename", async () => {
  const paths = databookArchivePaths(), zip = new JSZip()
  const inputs = [["..", "documento.txt"], ["A/B", "foo.pdf"], ["A/B", "foo.pdf"], ["A/B", "foo (2).pdf"], ["A-B", "foo.pdf"], ["a-b", "foo.pdf"], ["A/B", "FOO.pdf"], ["Tórre", "../arquivo.txt"]]
  inputs.forEach(([folder, name], index) => zip.file(paths.file(folder, name), String(index)))
  const saved = await JSZip.loadAsync(await zip.generateAsync({ type: "nodebuffer" }))
  const files = Object.values(saved.files).filter(entry => !entry.dir)
  assert.equal(files.length, inputs.length)
  for (const file of files) assert.ok(file.name.split("/").every(segment => segment && segment !== "." && segment !== ".."))
  assert.deepEqual((await Promise.all(files.map(file => file.async("string")))).sort(), inputs.map((_, index) => String(index)).sort())
})
