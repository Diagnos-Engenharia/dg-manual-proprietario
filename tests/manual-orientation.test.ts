import assert from "node:assert/strict"
import test from "node:test"
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib"
import { resolveManualIdentity } from "../lib/manual-identity"
import { manualFontMetrics } from "../lib/manual-document/fonts"
import { A4, paginateManualDocument } from "../lib/manual-document/paginate"
import { renderManualPdf } from "../lib/manual-document/pdf"
import type { DrawingCommand, ManualBlock, ManualDocument, ManualSection, PaginatedManual } from "../lib/manual-document/types"

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII="
const section = (id: string, blocks: ManualBlock[], type: ManualSection["type"] = "content"): ManualSection => ({ id, type, title: id, validationStatus: "aprovado", renderPolicy: "approved", blocks, children: [] })
function document(blocks: ManualBlock[], finishing = false): ManualDocument {
  return {
    schemaVersion: 1,
    metadata: { developmentId: "orientation", developmentName: "Residencial São João", organizationName: "Construção Técnica", manualType: finishing ? "acabamentos" : "proprietario", ...(finishing ? { unitId: "unit-1407", unitLabel: "Torre Ipê · Unidade 1407", pageOrientation: "landscape" as const } : {}), title: finishing ? "Tabela de acabamentos" : "Manual do Proprietário", revision: 3, date: "01/10/2026", generatedAt: "2026-10-01T12:00:00Z" },
    identity: resolveManualIdentity({}, "Residencial São João"),
    sections: [section(finishing ? "acabamentos" : "conteudo", blocks)],
    attachments: [],
  }
}
function textCommands(layout: PaginatedManual) {
  return layout.pages.flatMap(page => page.commands).filter((command): command is Extract<DrawingCommand, { type: "text" }> => command.type === "text")
}
async function assertBounds(doc: ManualDocument, layout: PaginatedManual) {
  const fonts = await manualFontMetrics(doc.identity.typography)
  const tolerance = .1
  for (const page of layout.pages) for (const command of page.commands) {
    assert.ok(command.x >= 0 && command.y >= 0, `${command.type} starts outside the page`)
    if (command.type === "text") {
      assert.ok(command.y < page.height - 10, `${command.text} is below the page`)
      assert.ok(command.x + fonts[command.font].widthOfTextAtSize(command.text, command.size) <= page.width + tolerance, `${command.text} is wider than the page`)
    } else if (command.type === "line") {
      assert.ok(command.x <= page.width + tolerance && command.x2 >= 0 && command.x2 <= page.width + tolerance)
      assert.ok(command.y <= page.height + tolerance && command.y2 >= 0 && command.y2 <= page.height + tolerance)
    } else {
      assert.ok(command.x + command.width <= page.width + tolerance, `${command.type} is wider than the page`)
      assert.ok(command.y + command.height <= page.height + tolerance, `${command.type} is taller than the page`)
    }
  }
}

test("landscape finishing rows continue without losing words and repeat their unit header and footer", async () => {
  const words = Array.from({ length: 1200 }, (_, index) => `acabamento${index}`)
  const doc = document([{ type: "table", headers: ["Ambiente", "Descrição do acabamento", "Fornecedor"], widths: [1, 3, 1], rows: [["Cozinha", words.join(" "), "Especialista"], ...Array.from({ length: 55 }, (_, index) => [`Ambiente ${index}`, `Revestimento ${index}`, "Fornecedor"]) ] }], true)
  doc.identity.headerTemplate = "Simple"
  const layout = await paginateManualDocument(doc)
  assert.ok(layout.pages.length > 4)
  assert.equal(layout.warnings.length, 0)
  const output = new Set(textCommands(layout).flatMap(command => command.text.split(/\s+/)))
  for (const word of words) assert.ok(output.has(word), `${word} was lost at a page break`)
  for (const page of layout.pages) {
    assert.equal(page.width, A4.height)
    assert.equal(page.height, A4.width)
    for (const expected of [doc.metadata.developmentName, doc.metadata.unitLabel!, "Ambiente", "Descrição do acabamento", "Fornecedor", `${page.number} / ${layout.pages.length}`]) assert.ok(page.commands.some(command => command.type === "text" && command.text === expected), `page ${page.number} has no ${expected}`)
    assert.ok(page.commands.some(command => command.type === "line" && command.x === 44 && command.x2 === A4.height - 44 && command.y === A4.width - 46 && command.y2 === A4.width - 46))
    for (const command of page.commands) if (command.type === "rect" && command.x === 44 && command.width === A4.height - 88) assert.ok(command.y + command.height <= page.height - 65 + .1, "table collides with its footer")
  }
  assert.ok(layout.pages[0].commands.some(command => command.type === "text" && command.text.includes("acabamento0")), "an oversized first row must start with its section heading")
  await assertBounds(doc, layout)
  const pdf = await PDFDocument.load(await renderManualPdf(doc, layout))
  assert.equal(pdf.getPageCount(), layout.pages.length)
  for (const page of pdf.getPages()) assert.deepEqual(page.getSize(), { width: A4.height, height: A4.width })
})

test("long finishing labels preserve the final unit number in every design header", async () => {
  const tower = Array.from({ length: 20 }, (_, index) => `Torre${index}`).join(" ")
  const unit = Array.from({ length: 16 }, (_, index) => `Identificação${index}`).join(" ") + " 999999"
  for (const headerTemplate of ["Simple", "Brand", "Technical"]) {
    const doc = document([{ type: "paragraph", text: "Conteúdo inicial." }, { type: "pageBreak" }, { type: "paragraph", text: "Conteúdo de continuação." }], true)
    doc.metadata.developmentName = Array.from({ length: 27 }, (_, index) => `Residencial${index}`).join(" ")
    doc.metadata.unitLabel = `${tower} · Unidade ${unit}`
    doc.identity.headerTemplate = headerTemplate
    const layout = await paginateManualDocument(doc)
    assert.equal(layout.pages.length, 2)
    for (const page of layout.pages) {
      const header = page.commands.filter((command): command is Extract<DrawingCommand, { type: "text" }> => command.type === "text" && !command.sectionId && command.y < page.height - 65)
      assert.equal(header.filter(command => command.font === "bold").map(command => command.text).join(" "), doc.metadata.developmentName)
      assert.equal(header.filter(command => command.font === "body").map(command => command.text).join(" "), doc.metadata.unitLabel)
      assert.ok(header.at(-1)!.text.endsWith("999999"))
      assert.ok(header.every(command => !command.reviewStatus), "approved metadata must keep its design color")
      const firstContent = page.commands.find(command => command.type === "text" && command.sectionId)
      assert.ok(firstContent && firstContent.y > header.at(-1)!.y + 20, "wrapped unit header overlaps the content")
    }
    await assertBounds(doc, layout)
  }
})

test("landscape dimensions apply to images, callouts, TOC links and generic PNG covers", async () => {
  const doc = document([{ type: "callout", title: "Atenção", text: "Verifique o acabamento antes da entrega. ".repeat(90), kind: "atencoes" }, { type: "image", src: png, height: 1000, caption: "Imagem de referência" }, { type: "warrantyTable", headers: ["Elemento", "Prazo"], rows: [["Acabamento", "Conforme garantia"]] }])
  doc.metadata.pageOrientation = "landscape"
  doc.identity.heroUrl = png
  doc.identity.template = "Monolith"
  doc.identity.graphicStyle = "blocks"
  const chapter = section("Identificação", [], "chapter")
  chapter.number = "1"
  chapter.children = doc.sections
  doc.sections = [section("capa", [], "cover"), section("sumario", [], "toc"), chapter]
  const layout = await paginateManualDocument(doc)
  await assertBounds(doc, layout)
  assert.ok(layout.pages.every(page => page.width === A4.height && page.height === A4.width))
  assert.ok(layout.pages[0].commands.some(command => command.type === "image" && command.width === A4.height && command.height === A4.width))
  const toc = layout.pages.find(page => page.sectionId === "sumario")!
  assert.ok(toc.commands.some(command => command.type === "text" && command.link === "#conteudo" && command.text === String(layout.destinations.conteudo.page)))
  const pdf = await PDFDocument.load(await renderManualPdf(doc, layout))
  assert.ok(pdf.context.enumerateIndirectObjects().some(([, value]) => value instanceof PDFRawStream && value.dict.get(PDFName.of("Subtype")) === PDFName.of("Image")), "PNG must be embedded in the rendered PDF")
  for (const page of pdf.getPages()) assert.deepEqual(page.getSize(), { width: A4.height, height: A4.width })
})

test("default and explicit portrait manuals retain their established cover, header and footer geometry", async () => {
  const doc = document([{ type: "paragraph", text: "Texto técnico em retrato." }])
  doc.sections.unshift(section("capa", [], "cover"))
  const baseline = await paginateManualDocument(doc)
  const explicit = structuredClone(doc)
  explicit.metadata.pageOrientation = "portrait"
  assert.deepEqual(await paginateManualDocument(explicit), baseline)
  assert.ok(baseline.pages.every(page => page.width === A4.width && page.height === A4.height))
  const fonts = await manualFontMetrics(doc.identity.typography)
  const coverTitle = baseline.pages[0].commands.find(command => command.type === "text" && command.font === "heading")!
  assert.equal(coverTitle.y, 440 + fonts.heading.heightAtSize(34, { descender: false }))
  assert.ok(baseline.pages[1].commands.some(command => command.type === "rect" && command.x === 44 && command.y === 37 && command.width === 3 && command.height === 23))
  assert.ok(baseline.pages[1].commands.some(command => command.type === "line" && command.x === 44 && command.x2 === A4.width - 44 && command.y === 69 && command.y2 === 69))
  assert.ok(baseline.pages[1].commands.some(command => command.type === "line" && command.y === A4.height - 46 && command.y2 === A4.height - 46))
})

test("interleaved landscape and portrait pagination never shares document dimensions", async () => {
  const portrait = document([{ type: "paragraph", text: "Conteúdo técnico aprovado. ".repeat(180) }])
  const landscape = document([{ type: "maintenanceTable", headers: ["Ambiente", "Material"], rows: Array.from({ length: 75 }, (_, index) => [`Local ${index}`, "Cerâmica São João"] ) }], true)
  const serial = [await paginateManualDocument(portrait), await paginateManualDocument(landscape)]
  const concurrent = await Promise.all(Array.from({ length: 8 }, (_, index) => paginateManualDocument(structuredClone(index % 2 ? landscape : portrait))))
  concurrent.forEach((layout, index) => assert.deepEqual(layout, serial[index % 2]))
})
