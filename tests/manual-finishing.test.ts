import assert from "node:assert/strict"
import test from "node:test"
import { PDFDocument } from "pdf-lib"
import { emptyFinishingData, finishingProblems, normalizeFinishingData, normalizeUnitInput, normalizedUnitKey } from "../lib/finishing-content"
import { assessFinishingReadiness, buildFinishingDocument, type FinishingDocumentSource } from "../lib/manual-document/finishing"
import { flattenSections } from "../lib/manual-document/types"
import { paginateManualDocument, REVIEW_TEXT_COLOR } from "../lib/manual-document/paginate"
import { renderManualPdf } from "../lib/manual-document/pdf"

function source(): FinishingDocumentSource {
  return { developmentId: "development", name: "Residencial São João", organization: { name: "Construtora Árvore" }, data: { checklist: [], manuals: { proprietario: { sistemas: { secret: "MANUAL_FORA_DA_TABELA" } } } }, revision: 2, date: "2026-10-01", unit: { id: "unit-real-uuid", developmentId: "development", organizationId: "organization", tower: "Torre A", floor: "2º", number: "201", typology: "Tipo Á", area: "70,40", revision: 1, lastEditorId: "editor", createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z" }, table: { id: "table", unitId: "unit-real-uuid", tower: "Torre A", typology: "Tipo Á", unitModel: "201", area: "70,40", revision: 1, status: "aprovado", data: { ...emptyFinishingData(), ambientes: [{ id: "room", ambiente: "Cozinha", parede: "ACABAMENTO_ÁRVORE", pisoRodapeBancada: "Porcelanato", teto: "Gesso" }] }, lastEditorId: "editor", updatedAt: "2026-10-01T12:00:00Z", comment: null } }
}
test("unit identity normalizes optional fields, respects tower scope and rejects invalid areas", () => {
  assert.equal(normalizedUnitKey(" TORRE A ", " 101 "), normalizedUnitKey("torre a", "101"))
  assert.notEqual(normalizedUnitKey("Torre A", "101"), normalizedUnitKey("Torre B", "101"))
  assert.deepEqual(normalizeUnitInput({ number: " 101 ", typology: " Tipo A " } as never), { number: "101", typology: "Tipo A", tower: "", floor: "", area: "" })
  for (const area of ["0", "-10", "texto", "Infinity"]) assert.throws(() => normalizeUnitInput({ number: "101", typology: "A", tower: "", floor: "", area }), /Área/)
  assert.equal(normalizeUnitInput({ number: "101", typology: "A", tower: "", floor: "", area: "68,40 m²" }).area, "68,40 m²")
})
test("composed and decomposed Portuguese unit identity share the same normalized key", () => {
  assert.equal(normalizedUnitKey("Tórre Á", "101"), normalizedUnitKey(" To\u0301rre A\u0301 ", " 101 "))
  const normalized = normalizeUnitInput({ tower: "To\u0301rre A\u0301", floor: "Te\u0301rreo", number: "201", typology: "Padra\u0303o", area: "68,40" })
  assert.equal(normalized.tower, "Tórre Á")
  assert.equal(normalized.floor, "Térreo")
  assert.equal(normalized.typology, "Padrão")
})
test("finishing drafts can contain incomplete rows but submission requires populated complete records", () => {
  assert.ok(finishingProblems(emptyFinishingData()).length)
  const data = normalizeFinishingData({ ambientes: [{ id: "a", ambiente: "" }] })
  assert.ok(finishingProblems(data).length)
  data.ambientes[0].ambiente = "Sala"
  assert.deepEqual(finishingProblems(data), [])
  assert.throws(() => normalizeFinishingData({ ambientes: [{ id: "a" }, { id: "a" }] }), /duplicada/)
  assert.throws(() => normalizeFinishingData({ ambientes: [{ id: "a", ambiente: 123 }] }), /inválido/)
})
test("standalone finishing identifies its exact unit and edit links retain unit and environment", () => {
  const document = buildFinishingDocument(source())
  const contents = JSON.stringify(document.sections)
  assert.equal(document.metadata.manualType, "acabamentos")
  assert.equal(document.metadata.unitId, "unit-real-uuid")
  assert.ok(document.metadata.title.includes("201"))
  assert.ok(contents.includes("ACABAMENTO_ÁRVORE"))
  assert.ok(!contents.includes("MANUAL_FORA_DA_TABELA"))
  const environment = document.sections.find(section => section.title === "Cozinha")!
  const url = new URL(environment.editHref!, "https://test.invalid")
  assert.equal(url.searchParams.get("unidade"), "unit-real-uuid")
  assert.equal(url.searchParams.get("ambiente"), "Cozinha")
  assert.deepEqual(assessFinishingReadiness(source()).blocking, [])
})
test("source clicks open the populated group and exact environment when no general environment row exists", async () => {
  const environment = "Cozinha & Área de serviço"
  for (const group of ["materiais", "hidraulicas"] as const) {
    const input = source()
    const marker = "EDITAR_" + group
    input.table!.data = { ...emptyFinishingData(), [group]: group === "materiais"
      ? [{ id: "material-only", ambiente: environment, material: marker, aplicacao: "Piso" }]
      : [{ id: "hydraulic-only", ambiente: environment, loucaCuba: marker }] }
    const document = buildFinishingDocument(input)
    const section = document.sections.find(section => section.title === environment)!
    const layout = await paginateManualDocument(document)
    const command = layout.pages.flatMap(page => page.commands).find(command => command.type === "text" && command.text === marker)
    assert.ok(command && command.type === "text", "The selected source text must actually be rendered")
    for (const href of [section.editHref, command.editHref]) {
      const url = new URL(href!, "https://test.invalid")
      assert.equal(url.pathname, "/empreendimentos/development")
      assert.equal(url.searchParams.get("modulo"), "elaboracao")
      assert.equal(url.searchParams.get("aba"), "acabamentos")
      assert.equal(url.searchParams.get("unidade"), input.unit.id)
      assert.equal(url.searchParams.get("grupo"), group)
      assert.equal(url.searchParams.get("ambiente"), environment)
      assert.ok(input.table!.data[group].some(row => row.ambiente === url.searchParams.get("ambiente")))
    }
  }
})

test("environment topics prefer general rows while each source table retains its own group", async () => {
  const input = source()
  input.table!.data.materiais = [{ id: "material", ambiente: "Cozinha", material: "MATERIAL_GROUP", aplicacao: "Piso" }]
  const document = buildFinishingDocument(input)
  const section = document.sections.find(section => section.title === "Cozinha")!
  assert.equal(new URL(section.editHref!, "https://test.invalid").searchParams.get("grupo"), "ambientes")
  const layout = await paginateManualDocument(document)
  for (const [marker, group] of [["ACABAMENTO_ÁRVORE", "ambientes"], ["MATERIAL_GROUP", "materiais"]]) {
    const command = layout.pages.flatMap(page => page.commands).find(command => command.type === "text" && command.text === marker)
    assert.ok(command && command.type === "text")
    assert.equal(new URL(command.editHref!, "https://test.invalid").searchParams.get("grupo"), group)
  }
})

test("review finishing is yellow in preview only and official PDFs reject its commands", async () => {
  const input = source()
  input.table!.status = "aguardando_validacao"
  const preview = buildFinishingDocument(input, "preview")
  const layout = await paginateManualDocument(preview)
  assert.ok(layout.pages.flatMap(page => page.commands).some(command => command.type === "text" && command.text === "ACABAMENTO_ÁRVORE" && command.color === REVIEW_TEXT_COLOR))
  await assert.rejects(renderManualPdf(preview, layout), /só pode aparecer no preview/)
  assert.ok(!JSON.stringify(buildFinishingDocument(input)).includes("ACABAMENTO_ÁRVORE"))
  for (const status of ["rascunho", "reprovado"] as const) {
    input.table!.status = status
    assert.ok(!JSON.stringify(buildFinishingDocument(input, "preview")).includes("ACABAMENTO_ÁRVORE"))
  }
  assert.equal(assessFinishingReadiness(input).ok, false)
})
test("long finishing tables use the same Unicode page commands and exported PDF page count", async () => {
  const input = source()
  input.table!.data.ambientes = Array.from({ length: 50 }, (_, index) => ({ id: "room-" + index, ambiente: "Cozinha", teto: "Revestimento São João, ação e manutenção: " + "especificação longa com acentos e referência técnica ".repeat(8) + index }))
  const document = buildFinishingDocument(input)
  const layout = await paginateManualDocument(document)
  assert.ok(layout.pages.length > 4)
  assert.ok(flattenSections(document.sections).some(section => section.title === "Cozinha"))
  assert.ok(layout.pages.flatMap(page => page.commands).some(command => command.type === "text" && command.text.includes("São João")))
  const pdf = await PDFDocument.load(await renderManualPdf(document, layout))
  assert.equal(pdf.getPageCount(), layout.pages.length)
  assert.equal(pdf.getTitle(), "Tabela de acabamentos · Torre A · Unidade 201 · Residencial São João")
})
