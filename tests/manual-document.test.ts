import test from "node:test"
import assert from "node:assert/strict"
import { buildManualDocument, approvedHtmlBlocks, type BuildManualDocumentInput } from "@/lib/manual-document/build"
import { flattenSections } from "@/lib/manual-document/types"
import { assessManualReadiness } from "@/lib/completion"
import { getChecklistItemScopes, type ChecklistItem } from "@/lib/mock-data"
import { orderManualSystems, type ManualContentValidation } from "@/lib/manual-content"
import { changedValidationContexts } from "@/lib/manual-document/invalidation"
import { paginateManualDocument, REVIEW_TEXT_COLOR } from "@/lib/manual-document/paginate"
import { renderManualPdf } from "@/lib/manual-document/pdf"

const item = (id: string, scopes: ("unidade" | "comum")[] = ["unidade"]): ChecklistItem => ({ id, item: id, category: "Sistemas", scope: scopes[0], scopes, status: "possui", norms: [], obsProprietario: "", obsSindico: "" })
const validation = (id: string, section = "sistemas", status = "aprovado", scope = "unidade"): ManualContentValidation => ({ contextKey: `${id}::${scope}`, section, status })
const input = (data: Record<string, unknown>, validations: ManualContentValidation[] = []): BuildManualDocumentInput => ({ developmentId: "test", name: "Residencial São João", organization: { name: "Construtora Árvore", metadata: '{"primaryColor":"#123456"}' }, data, manualType: "proprietario", revision: 3, date: "2026-10-01", validations, finishing: [], files: [] })
const find = (document: ReturnType<typeof buildManualDocument>, id: string) => flattenSections(document.sections).find(section => section.id === id)!
const published = (document: ReturnType<typeof buildManualDocument>) => JSON.stringify(flattenSections(document.sections).map(section => section.blocks))

test("technical catalog and document share scoped category order, editorial ordering and stable system identities", () => {
  const checklist: ChecklistItem[] = [
    { ...item("a"), category: "Estrutura" },
    { ...item("b"), category: "Instalações" },
    { ...item("z"), category: "Estrutura" },
    { ...item("shared", ["unidade", "comum"]), category: "Estrutura" },
    { ...item("common", ["comum"]), category: "Instalações" },
    { ...item("not-selected"), status: "em_andamento" },
    { ...item("no-scope"), scopes: [] },
    { ...item("a"), category: "Estrutura", item: "Nome atualizado" },
  ]
  const data = { checklist, manuals: { proprietario: { editorial: { systemOrder: ["z", "b", "missing"] } }, sindico: { editorial: { systemOrder: ["common"] } } } }
  const before = JSON.stringify(data)
  const owner = orderManualSystems(data, "proprietario")
  assert.deepEqual(owner.map(entry => entry.item.id), ["z", "a", "shared", "b"])
  assert.equal(owner.find(entry => entry.item.id === "a")!.item.item, "Nome atualizado")
  assert.deepEqual(owner.map(entry => entry.key), ["z::unidade", "a::unidade", "shared::unidade", "b::unidade"])
  assert.deepEqual(orderManualSystems(data, "sindico").map(entry => entry.key), ["shared::comum", "common::comum"])
  const systems = find(buildManualDocument(input(data)), "sistemas").children
  assert.deepEqual(systems.map(section => section.id), owner.map(entry => "sistema-" + entry.item.id))
  assert.deepEqual(systems.map(section => section.number), ["4.1", "4.2", "4.3", "4.4"])
  assert.equal(JSON.stringify(data), before)
})

test("a missing checklist never inserts reference systems into the technical catalog or document", () => {
  for (const data of [{}, { checklist: null }, { checklist: [] }]) {
    assert.deepEqual(orderManualSystems(data, "proprietario"), [])
    assert.deepEqual(orderManualSystems(data, "sindico"), [])
    assert.deepEqual(find(buildManualDocument(input(data)), "sistemas").children, [])
  }
})

test("checklist removal excludes technical content without erasing it; reactivation restores only its original scope", () => {
  const data = { checklist: [item("existing"), item("shared", ["unidade", "comum"])], manuals: { proprietario: { sistemas: { "existing::unidade": "<p>CONTEUDO_PRESERVADO</p>" }, manutencao: { "existing::unidade": [{ task: "ATIVIDADE_PRESERVADA", frequency: "Anual", responsible: "Proprietário" }] } } } }
  const validations = [validation("existing"), validation("existing", "manutencao")]
  const removed = { ...data, checklist: data.checklist.map(entry => entry.id === "existing" ? { ...entry, status: "nao_aplicado" as const } : entry) }
  assert.ok(!orderManualSystems(removed, "proprietario").some(entry => entry.item.id === "existing"))
  assert.ok(!published(buildManualDocument(input(removed, validations))).includes("PRESERVAD"))
  const restored = { ...removed, checklist: removed.checklist.map(entry => entry.id === "existing" ? { ...entry, status: "possui" as const, scopes: ["unidade", "comum"] as ("unidade" | "comum")[] } : entry) }
  const owner = orderManualSystems(restored, "proprietario", validations).find(entry => entry.item.id === "existing")!
  const common = orderManualSystems(restored, "sindico", validations).find(entry => entry.item.id === "existing")!
  assert.ok(owner.html.includes("CONTEUDO_PRESERVADO"))
  assert.equal(owner.maintenance[0].task, "ATIVIDADE_PRESERVADA")
  assert.equal(common.html, "")
  assert.deepEqual(common.maintenance, [])
  assert.equal(common.descriptionStatus, "rascunho")
  assert.equal(common.maintenanceStatus, "rascunho")
  assert.ok(published(buildManualDocument(input(restored, validations))).includes("CONTEUDO_PRESERVADO"))
})

test("incomplete manuals preserve macrostructure and selected titles without leaking draft, waiting or rejected text", () => {
  const checklist = [item("draft"), item("waiting"), item("rejected"), item("common", ["comum"]), { ...item("removed"), status: "nao_aplicado" }]
  const document = buildManualDocument(input({ checklist, manuals: { proprietario: { sistemas: { "draft::unidade": "<p>SEGREDO_RASCUNHO</p>", "waiting::unidade": "<p>SEGREDO_AGUARDANDO</p>", "rejected::unidade": "<p>SEGREDO_REPROVADO</p>", "removed::unidade": "<p>SEGREDO_REMOVIDO</p>" } } } }, [validation("waiting", "sistemas", "aguardando_validacao"), validation("rejected", "sistemas", "reprovado")]))
  for (const id of ["capa", "apresentacao", "sumario", "introducao", "identificacao", "providencias", "sistemas", "garantias", "reformas", "documentacao", "definicoes", "anexos"]) assert.ok(find(document, id))
  assert.equal(find(document, "sistemas").children.length, 3)
  for (const id of ["draft", "waiting", "rejected"]) assert.deepEqual(find(document, "sistema-" + id).blocks, [])
  assert.equal(find(document, "sistema-common"), undefined)
  assert.equal(find(document, "sistema-removed"), undefined)
  assert.ok(!published(document).includes("SEGREDO_"))
})

test("description and maintenance approval is independent and exact for each manual scope", () => {
  const data = { checklist: [item("shared", ["unidade", "comum"])], manuals: { proprietario: { sistemas: { "shared::unidade": "<p>DESCRIÇÃO_PRIVATIVA</p>" }, manutencao: { "shared::unidade": [{ task: "ATIVIDADE_PRIVATIVA", frequency: "Anual", responsible: "Proprietário" }] } }, sindico: { sistemas: { "shared::comum": "<p>DESCRIÇÃO_COMUM</p>" }, manutencao: { "shared::comum": [{ task: "ATIVIDADE_COMUM", frequency: "Mensal", responsible: "Síndico" }] } } } }
  const validations = [validation("shared"), validation("shared", "manutencao", "rascunho"), validation("shared", "sistemas", "reprovado", "comum"), validation("shared", "manutencao", "aprovado", "comum")]
  const owner = buildManualDocument(input(data, validations))
  const manager = buildManualDocument({ ...input(data, validations), manualType: "sindico" })
  assert.ok(published(owner).includes("DESCRIÇÃO_PRIVATIVA"))
  assert.ok(!published(owner).includes("ATIVIDADE_PRIVATIVA"))
  assert.ok(!published(manager).includes("DESCRIÇÃO_COMUM"))
  assert.ok(published(manager).includes("ATIVIDADE_COMUM"))
  assert.ok(!published(owner).includes("COMUM"))
  assert.ok(!published(manager).includes("PRIVATIVA"))
  assert.deepEqual(find(owner, "sistema-shared").componentStatuses?.map(part => part.status), ["aprovado", "rascunho"])
})

test("legacy content is only reused in its recorded single scope with exact approval; dual-scope legacy is withheld", () => {
  const legacy = { ...item("legacy"), scopes: undefined }
  assert.deepEqual(getChecklistItemScopes(legacy), ["unidade"])
  const data = { checklist: [legacy, item("dual", ["unidade", "comum"])], manuals: { proprietario: { sistemas: { legacy: "<p>LEGADO_UNIDADE</p>", dual: "<p>LEGADO_AMBIGUO</p>" } } } }
  const document = buildManualDocument(input(data, [validation("legacy"), validation("dual")]))
  assert.ok(published(document).includes("LEGADO_UNIDADE"))
  assert.ok(!published(document).includes("LEGADO_AMBIGUO"))
  const manager = buildManualDocument({ ...input(data, [validation("legacy", "sistemas", "aprovado", "comum")]), manualType: "sindico" })
  assert.equal(find(manager, "sistema-legacy"), undefined)
})

test("all approved finishing tables preserve tower, typology and environment grouping; drafts and common manual omit their rows", () => {
  const source = input({ checklist: [] })
  source.finishing = [
    { id: "a", tower: "Torre A", typology: "Tipo 01", unitModel: "101", area: "70", revision: 1, status: "aprovado", data: { materiais: [{ id: "1", ambiente: "Cozinha", material: "Porcelanato", aplicacao: "Piso", marca: "MARCA_APROVADA_A", formato: "60 × 60" }] } },
    { id: "b", tower: "Torre B", typology: "Tipo 02", unitModel: "201", area: "80", revision: 2, status: "aprovado", data: { ambientes: [{ id: "2", ambiente: "Banheiro", parede: "ACABAMENTO_APROVADO_B" }] } },
    { id: "c", tower: "Torre B", typology: "Tipo 03", unitModel: "301", area: "90", revision: 3, status: "rascunho", data: { materiais: [{ id: "3", ambiente: "Sala", marca: "MARCA_RASCUNHO" }] } },
  ]
  const document = buildManualDocument(source)
  assert.equal(find(document, "acabamentos").children.length, 2)
  assert.ok(published(document).includes("MARCA_APROVADA_A"))
  assert.ok(published(document).includes("ACABAMENTO_APROVADO_B"))
  assert.ok(published(document).includes("COZINHA"))
  assert.ok(!published(document).includes("MARCA_RASCUNHO"))
  assert.deepEqual(find(document, "acabamento-c").blocks, [])
  const manager = buildManualDocument({ ...source, manualType: "sindico" })
  assert.equal(find(manager, "acabamentos"), undefined)
  assert.ok(!published(manager).includes("MARCA_APROVADA"))
})

test("editorial client status cannot forge approval, optional content can be inapplicable, warranty records remain tabular", () => {
  const data = { checklist: [], manuals: { proprietario: { editorial: { sections: { introducao: { html: "<p>APROVAÇÃO_FORJADA</p>", status: "aprovado" }, finalidade: { html: "<p>FINALIDADE_APROVADA</p>" }, glossario: { html: "<p>GLOSSARIO_DESATIVADO</p>", enabled: false } }, warranties: [{ sistema: "Esquadrias", descricaoFalha: "Falha de vedação", prazo: "Conforme contrato cadastrado" }] } } } }
  const source = input(data, [validation("finalidade", "editorial"), validation("garantias-tabela", "editorial"), validation("glossario", "editorial")])
  source.data.identity = { inheritance: "organization", primary: "#abcdef" }
  const document = buildManualDocument(source)
  assert.ok(!published(document).includes("APROVAÇÃO_FORJADA"))
  assert.ok(published(document).includes("FINALIDADE_APROVADA"))
  assert.equal(find(document, "glossario"), undefined)
  assert.equal(find(document, "garantias-tabela").blocks[0].type, "warrantyTable")
  assert.equal(document.identity.primary, "#123456")
  assert.equal(document.metadata.title, "Manual do Proprietário")
})

test("shared contacts and service content need independently scoped approval", () => {
  const data = { checklist: [], authoring: { contacts: [{ id: "designer", kind: "projetista", name: "RESPONSÁVEL_APROVADO", company: "Empresa", discipline: "Estrutural", registration: "CREA 123", phone: "123", email: "contato@example.test" }], comissionamento: { energia: { company: "CONCESSIONÁRIA_APROVADA", instructions: "Solicitar ligação" } } } }
  const source = input(data, [validation("projetistas", "editorial"), validation("energia", "editorial")])
  const owner = buildManualDocument(source)
  const manager = buildManualDocument({ ...source, manualType: "sindico" })
  assert.ok(published(owner).includes("RESPONSÁVEL_APROVADO"))
  assert.deepEqual(find(owner, "responsaveis-tecnicos").blocks, [])
  const approvedResponsible = buildManualDocument({ ...source, validations: [...source.validations, validation("responsaveis-tecnicos", "editorial")] })
  assert.ok(JSON.stringify(find(approvedResponsible, "responsaveis-tecnicos").blocks).includes("RESPONSÁVEL_APROVADO"))
  assert.ok(published(owner).includes("CONCESSIONÁRIA_APROVADA"))
  assert.ok(!published(manager).includes("RESPONSÁVEL_APROVADO"))
  assert.ok(!published(manager).includes("CONCESSIONÁRIA_APROVADA"))
})

test("official readiness blocks unapproved selected content and accepts approved empty maintenance as inapplicable", () => {
  const data = { ficha: { towers: "1", apartments: "20", typologies: "2", areas: "70", completionDate: "2026-10-01" }, checklist: [item("common", ["comum"])], schedule: [{ id: "stage", name: "Etapa", weight: 100 }], manuals: { sindico: { sistemas: { "common::comum": "<p>Descrição concluída</p>" }, manutencao: { "common::comum": [] } } } }
  const unapproved = assessManualReadiness(data, "sindico")
  assert.equal(unapproved.ok, false)
  assert.ok(unapproved.blocking.some(reason => reason.includes("Descrição técnica") && reason.includes("rascunho")))
  assert.ok(unapproved.blocking.some(reason => reason.includes("Manutenção")))
  const approved = [validation("common", "sistemas", "aprovado", "comum"), validation("common", "manutencao", "aprovado", "comum")]
  assert.equal(assessManualReadiness(data, "sindico", 0, approved).ok, true)
  data.manuals.sindico.manutencao["common::comum"] = [{ task: "Atividade", frequency: "", responsible: "Síndico" }] as never[]
  assert.equal(assessManualReadiness(data, "sindico", 0, approved).ok, false)
})

test("readiness rejects draft finishing tables and existing draft editorial content", () => {
  const data = { ficha: { towers: "1", apartments: "20", typologies: "2", areas: "70", completionDate: "2026-10-01" }, checklist: [item("unit")], schedule: [{ id: "stage", name: "Etapa", weight: 100 }], manuals: { proprietario: { sistemas: { "unit::unidade": "<p>Descrição concluída</p>" }, editorial: { sections: { introducao: { html: "<p>Texto existente</p>", status: "aprovado" } } } } } }
  const approved = [validation("unit"), validation("unit", "manutencao")]
  const finishing = [{ id: "f", typology: "Tipo A", status: "rascunho", data: { ambientes: [{ ambiente: "Sala", teto: "Gesso" }] } }]
  const draft = assessManualReadiness(data, "proprietario", 1, approved, finishing)
  assert.equal(draft.ok, false)
  assert.ok(draft.blocking.some(reason => reason.includes("Acabamentos")))
  assert.ok(draft.blocking.some(reason => reason.includes("introducao")))
  assert.equal(assessManualReadiness(data, "proprietario", 1, [...approved, validation("introducao", "editorial")], [{ ...finishing[0], status: "aprovado" }]).ok, true)
})

test("approved HTML preserves Portuguese characters and typed headings, lists, callouts and tables", () => {
  const blocks = approvedHtmlBlocks('<h3>Cuidados e limitações</h3><p>Água, ação, 1º, 2ª, “aspas” — &#231; &#xE3;.</p><ul><li>Limpeza periódica</li></ul><blockquote>Não perfurar.</blockquote><table><tr><th>Periodicidade</th><th>Atividade</th></tr><tr><td>Anual</td><td>Verificação</td></tr></table><script>alert("SEGREDO")</script>')
  assert.deepEqual(blocks.map(block => block.type), ["heading", "paragraph", "paragraph", "callout", "table"])
  assert.ok(JSON.stringify(blocks).includes("Água, ação, 1º, 2ª, “aspas” — ç ã."))
  assert.ok(!JSON.stringify(blocks).includes("SEGREDO"))
})

test("anexos honor per-manual inclusion policy without importing file bytes into the publication model", () => {
  const source = input({ checklist: [], manuals: { proprietario: { editorial: { attachments: { hidden: "exclude", included: "include" } } } } })
  source.files = ["default", "hidden", "included"].map(id => ({ id, name: `${id}.pdf`, pathname: `databook/test/${id}.pdf`, contentType: "application/pdf", sizeBytes: 200 }))
  const document = buildManualDocument(source)
  assert.deepEqual(document.attachments.map(file => file.policy), ["reference", "exclude", "include"])
  assert.equal(find(document, "anexo-hidden"), undefined)
  assert.equal(find(document, "anexos").children.length, 2)
  const manager = buildManualDocument({ ...source, manualType: "sindico" })
  assert.ok(manager.attachments.every(file => file.policy === "reference"))
})

test("editing shared contacts invalidates each rendered editorial context in both scopes", () => {
  const changes = changedValidationContexts({ authoring: { contacts: [{ id: "a", company: "Antes" }] } }, { authoring: { contacts: [{ id: "a", company: "Depois" }] } })
  for (const scope of ["unidade", "comum"]) for (const id of ["projetistas", "fornecedores", "responsaveis-tecnicos"]) assert.ok(changes.some(change => change.contextKey === `${id}::${scope}` && change.section === "editorial"))
  assert.deepEqual(changedValidationContexts({ authoring: { contacts: [{ id: "a", company: "Mesmo" }] } }, { authoring: { contacts: [{ id: "a", company: "Mesmo" }] } }), [])
})

test("commissioning edits reset only affected services and include both scopes for global source records", () => {
  const before = { authoring: { comissionamento: { agua: { company: "Anterior" }, gas: { company: "Mesmo" } } } }
  const after = { authoring: { comissionamento: { agua: { company: "Atual" }, gas: { company: "Mesmo" } } } }
  assert.deepEqual(changedValidationContexts(before, after), [{ contextKey: "agua::unidade", section: "editorial" }, { contextKey: "agua::comum", section: "editorial" }])
  const ownBefore = { manuals: { proprietario: { comissionamento: { energia: { instructions: "Antes" } } } } }
  const ownAfter = { manuals: { proprietario: { comissionamento: { energia: { instructions: "Depois" } } } } }
  assert.deepEqual(changedValidationContexts(ownBefore, ownAfter), [{ contextKey: "energia::unidade", section: "editorial" }])
})

test("edits to legacy unscoped system maps reset exact matching scoped approvals for description and maintenance", () => {
  const before = { manuals: { proprietario: { sistemas: { legacy: "Antes" }, manutencao: { legacy: [] } }, sindico: { sistemas: { legacy: "Comum inalterado" } } } }
  const after = { manuals: { proprietario: { sistemas: { legacy: "Depois" }, manutencao: { legacy: [{ task: "Inspecionar" }] } }, sindico: { sistemas: { legacy: "Comum inalterado" } } } }
  assert.deepEqual(changedValidationContexts(before, after), [{ contextKey: "legacy::unidade", section: "sistemas" }, { contextKey: "legacy::unidade", section: "manutencao" }])
})

test("document edit links preserve manual and route to the specific system, service and finishing typology", () => {
  const source = input({ checklist: [item("both", ["unidade", "comum"])], authoring: { comissionamento: { agua: { company: "Empresa" } } } })
  source.finishing = [{ id: "finish", tower: "A", typology: "Tipo Á", unitModel: "101", area: "70", revision: 1, status: "rascunho", data: {} }]
  const document = buildManualDocument(source)
  for (const section of flattenSections(document.sections)) if (section.editHref) assert.equal(new URL(section.editHref, "https://test.invalid").searchParams.get("manual"), "proprietario")
  assert.equal(new URL(find(document, "sistema-both").editHref!, "https://test.invalid").searchParams.get("item"), "both::unidade")
  assert.equal(new URL(find(document, "agua").editHref!, "https://test.invalid").searchParams.get("servico"), "agua")
  assert.equal(new URL(find(document, "acabamento-finish").editHref!, "https://test.invalid").searchParams.get("tipologia"), "Tipo Á")
  const manager = buildManualDocument({ ...source, manualType: "sindico" })
  assert.equal(new URL(find(manager, "sistema-both").editHref!, "https://test.invalid").searchParams.get("manual"), "sindico")
  assert.equal(new URL(find(manager, "sistema-both").editHref!, "https://test.invalid").searchParams.get("item"), "both::comum")
})

test("review preview shows only submitted text in yellow; approval restores design and publication excludes review text", async () => {
  const data = { checklist: [item("waiting"), item("approved"), item("draft"), item("rejected"), item("common", ["comum"])], manuals: { proprietario: { sistemas: { "waiting::unidade": "<p>TEXTO_EM_VALIDACAO</p>", "approved::unidade": "<p>TEXTO_APROVADO</p>", "draft::unidade": "<p>TEXTO_RASCUNHO</p>", "rejected::unidade": "<p>TEXTO_REPROVADO</p>" }, manutencao: { "waiting::unidade": [{ task: "MANUTENCAO_APROVADA", frequency: "Anual", responsible: "Proprietário" }], "approved::unidade": [{ task: "MANUTENCAO_EM_VALIDACAO", frequency: "Mensal", responsible: "Proprietário" }] } }, sindico: { sistemas: { "common::comum": "<p>OUTRO_ESCOPO</p>" } } } }
  const source = input(data, [validation("waiting", "sistemas", "aguardando_validacao"), validation("waiting", "manutencao"), validation("approved"), validation("approved", "manutencao", "aguardando_validacao"), validation("rejected", "sistemas", "reprovado")])
  const preview = buildManualDocument(source, "preview")
  assert.ok(published(preview).includes("TEXTO_EM_VALIDACAO"))
  assert.ok(published(preview).includes("MANUTENCAO_EM_VALIDACAO"))
  for (const hidden of ["TEXTO_RASCUNHO", "TEXTO_REPROVADO", "OUTRO_ESCOPO"]) assert.ok(!published(preview).includes(hidden))
  const layout = await paginateManualDocument(preview)
  const commands = layout.pages.flatMap(page => page.commands).filter(command => command.type === "text")
  for (const marker of ["TEXTO_EM_VALIDACAO", "MANUTENCAO_EM_VALIDACAO"]) assert.ok(commands.some(command => command.type === "text" && command.text === marker && command.color === REVIEW_TEXT_COLOR && command.reviewStatus === "aguardando_validacao"))
  for (const marker of ["TEXTO_APROVADO", "MANUTENCAO_APROVADA"]) assert.ok(commands.some(command => command.type === "text" && command.text === marker && command.color === preview.identity.text && !command.reviewStatus))
  await assert.rejects(renderManualPdf(preview, layout), /só pode aparecer no preview/)
  const publication = buildManualDocument(source)
  assert.ok(!published(publication).includes("EM_VALIDACAO"))
  const approved = buildManualDocument({ ...source, validations: source.validations.map(row => ({ ...row, status: row.status === "aguardando_validacao" ? "aprovado" : row.status })) }, "preview")
  const approvedLayout = await paginateManualDocument(approved)
  assert.ok(!approvedLayout.pages.some(page => page.commands.some(command => command.type === "text" && command.reviewStatus)))
  assert.ok(approvedLayout.pages.flatMap(page => page.commands).some(command => command.type === "text" && command.text === "TEXTO_EM_VALIDACAO" && command.color === approved.identity.text))
  assert.equal(assessManualReadiness(data, "proprietario", 0, source.validations).ok, false)
})

test("review status covers editorial, warranty, contacts, commissioning and finishing tables with exact scope", () => {
  const source = input({ checklist: [], manuals: { proprietario: { editorial: { sections: { finalidade: { html: "<p>FINALIDADE_EM_VALIDACAO</p>" } }, warranties: [{ sistema: "GARANTIA_EM_VALIDACAO", prazo: "Conforme contrato" }] } } }, authoring: { contacts: [{ id: "a", kind: "projetista", name: "PROJETISTA_EM_VALIDACAO", company: "Empresa", discipline: "Estrutural" }], comissionamento: { agua: { company: "AGUA_EM_VALIDACAO" } } } }, ["finalidade", "garantias-tabela", "projetistas", "responsaveis-tecnicos", "agua"].map(id => validation(id, "editorial", "aguardando_validacao")))
  source.finishing = [{ id: "a", tower: "A", typology: "01", unitModel: "101", area: "70", revision: 1, status: "aguardando_validacao", data: { ambientes: [{ ambiente: "Sala", teto: "ACABAMENTO_EM_VALIDACAO" }] } }]
  const preview = buildManualDocument(source, "preview")
  for (const marker of ["FINALIDADE", "GARANTIA", "PROJETISTA", "AGUA", "ACABAMENTO"]) assert.ok(published(preview).includes(marker + "_EM_VALIDACAO"))
  for (const id of ["finalidade", "garantias-tabela", "projetistas", "responsaveis-tecnicos", "agua", "acabamento-a"]) assert.ok(find(preview, id).blocks.every(block => block.reviewStatus === "aguardando_validacao"))
  assert.ok(!published(buildManualDocument(source)).includes("_EM_VALIDACAO"))
  assert.ok(!published(buildManualDocument({ ...source, manualType: "sindico" }, "preview")).includes("_EM_VALIDACAO"))
})

test("drawing text links back to its own source, maintenance has its editor and furniture has no editing targets", async () => {
  const source = input({ checklist: [item("unit")], manuals: { proprietario: { sistemas: { "unit::unidade": "<p>DESCRICAO_ORIGEM</p>" }, manutencao: { "unit::unidade": [{ task: "ATIVIDADE_ORIGEM", frequency: "Anual", responsible: "Proprietário" }] } } } }, [validation("unit"), validation("unit", "manutencao")])
  const layout = await paginateManualDocument(buildManualDocument(source, "preview"))
  const commands = layout.pages.flatMap(page => page.commands).filter(command => command.type === "text")
  const description = commands.find(command => command.type === "text" && command.text === "DESCRICAO_ORIGEM")!
  assert.equal(description.sectionId, "sistema-unit")
  assert.equal(new URL(description.editHref!, "https://test.invalid").searchParams.get("aba"), "textos")
  const activity = commands.find(command => command.type === "text" && command.text === "ATIVIDADE_ORIGEM")!
  assert.equal(new URL(activity.editHref!, "https://test.invalid").searchParams.get("aba"), "textos")
  assert.equal(new URL(activity.editHref!, "https://test.invalid").searchParams.get("conteudo"), "manutencao")
  assert.equal(new URL(activity.editHref!, "https://test.invalid").searchParams.get("item"), "unit::unidade")
  assert.ok(commands.filter(command => command.type === "text" && /^\d+ \/ \d+$/.test(command.text)).every(command => !command.sectionId && !command.editHref))
})
