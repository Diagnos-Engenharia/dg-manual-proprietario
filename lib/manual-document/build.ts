import { type ChecklistScope, type ManualType, type TechnicalContact } from "@/lib/mock-data"
import { htmlToLines, manualScope, manualValidationStatus, selectManualCommissioning, orderManualSystems, type ManualContent, type ManualContentValidation } from "@/lib/manual-content"
import { resolveManualIdentity } from "@/lib/manual-identity"
import type { ContentStatus, ManualAttachment, ManualBlock, ManualDocument, ManualSection } from "./types"

export type ManualFinishingTable = {
  id: string; tower: string; typology: string; unitModel: string; area: string
  revision: number; status: string; data: unknown
}
export type ManualDatabookFile = {
  id: string; name: string; pathname: string; folder?: string
  contentType?: string | null; sizeBytes: number
}
export type BuildManualDocumentInput = {
  developmentId: string; name: string
  organization: { name: string; logo?: string | null; metadata?: string | null }
  data: Record<string, unknown>; manualType: ManualType; revision: number; date?: string
  validations: ManualContentValidation[]; finishing: ManualFinishingTable[]; files: ManualDatabookFile[]
}

type SectionDefinition = { id: string; title: string; number?: string; children?: SectionDefinition[]; optional?: boolean }
const definitions: SectionDefinition[] = [
  { id: "apresentacao", title: "Apresentação" },
  { id: "introducao", title: "Introdução", number: "1", children: [
    { id: "finalidade", title: "Finalidade do Manual", number: "1.1" },
    { id: "como-utilizar", title: "Como utilizar o Manual", number: "1.2" },
  ] },
  { id: "identificacao", title: "Identificação do Empreendimento", number: "2", children: [
    { id: "ficha-tecnica", title: "Ficha Técnica", number: "2.1" },
    { id: "dados-gerais", title: "Dados Gerais", number: "2.2" },
    { id: "responsaveis-tecnicos", title: "Responsáveis Técnicos e Projetistas", number: "2.3" },
    { id: "vida-util", title: "Vida Útil, Durabilidade e Desempenho", number: "2.4" },
    { id: "garantia-legal-contratual", title: "Garantia Legal e Contratual", number: "2.5" },
    { id: "manutencao-conceitos", title: "Manutenção Preventiva, Corretiva e Rotineira", number: "2.6" },
  ] },
  { id: "providencias", title: "Providências Iniciais", number: "3", children: [
    { id: "energia", title: "Energia", number: "3.1" },
    { id: "agua", title: "Água", number: "3.2" },
    { id: "gas", title: "Gás", number: "3.3" },
    { id: "telecom", title: "Telecomunicações", number: "3.4" },
    { id: "mudanca", title: "Mudança", number: "3.5" },
    { id: "equipamentos", title: "Instalação de equipamentos", number: "3.6" },
  ] },
  { id: "sistemas", title: "Sistemas Construtivos, Uso e Manutenção", number: "4" },
  { id: "garantias", title: "Garantias e Assistência Técnica", number: "5", children: [
    { id: "garantia-legal", title: "Garantia legal", number: "5.1" },
    { id: "garantia-contratual", title: "Garantia contratual", number: "5.2" },
    { id: "garantias-tabela", title: "Prazos de garantia", number: "5.3" },
    { id: "perda-garantia", title: "Perda de garantia", number: "5.4" },
    { id: "assistencia", title: "Assistência técnica", number: "5.5" },
  ] },
  { id: "reformas", title: "Reformas na unidade", number: "6" },
  { id: "documentacao", title: "Documentação da unidade", number: "7", children: [
    { id: "manutencao-tabela", title: "Programa e tabelas de manutenção", number: "7.1" },
    { id: "fornecedores", title: "Fornecedores", number: "7.2" },
    { id: "projetistas", title: "Projetistas", number: "7.3" },
  ] },
  { id: "definicoes", title: "Definições e Conceitos", number: "8", children: [
    { id: "glossario", title: "Glossário", number: "8.1", optional: true },
    { id: "meio-ambiente", title: "Meio ambiente", number: "8.2", optional: true },
    { id: "uso-racional-agua", title: "Uso racional da água", number: "8.3", optional: true },
    { id: "telefones-uteis", title: "Telefones úteis", number: "8.4", optional: true },
  ] },
  { id: "anexos", title: "Anexos", number: "9" },
]

/** These IDs are also the scoped validation contexts and editorial storage keys. */
export const editableManualSections = definitions.flatMap(definition => [definition, ...(definition.children ?? [])])
  .filter(definition => !["identificacao", "ficha-tecnica", "sistemas", "manutencao-tabela", "acabamentos", "anexos"].includes(definition.id))
  .map(({ id, title, number }) => ({ id, title, number }))

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function text(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : "" }
function decoded(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&apos;|&#39;/gi, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => { const point = code[0].toLowerCase() === "x" ? Number.parseInt(code.slice(1), 16) : Number(code); return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "" })
    .replace(/\s+/g, " ").trim()
}

/** Parse approved editor HTML into safe document data, never executable HTML. */
export function approvedHtmlBlocks(html: string): ManualBlock[] {
  const safe = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?\s*>/gi, "\n")
  const expression = /<(h[1-6]|p|li|blockquote|table)\b[^>]*>([\s\S]*?)<\/\1>|<img\b[^>]*>/gi
  const blocks: ManualBlock[] = []
  let position = 0
  for (const match of safe.matchAll(expression)) {
    const before = decoded(safe.slice(position, match.index))
    if (before) blocks.push({ type: "paragraph", text: before })
    position = (match.index ?? 0) + match[0].length
    const tag = match[1]?.toLowerCase()
    if (tag === "table") {
      const rows = Array.from(match[2].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map(row => Array.from(row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)).map(cell => decoded(cell[1])))
      if (rows.length) {
        const hasHeader = /<th\b/i.test(match[2])
        const columns = Math.max(...rows.map(row => row.length))
        blocks.push({ type: "table", headers: hasHeader ? rows[0] : Array.from({ length: columns }, (_, index) => `Coluna ${index + 1}`), rows: hasHeader ? rows.slice(1) : rows })
      }
    } else if (!tag) {
      const src = match[0].match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]
      if (src && (/^https?:\/\//i.test(src) || /^\/(?!\/)/.test(src))) blocks.push({ type: "image", src, caption: match[0].match(/\balt\s*=\s*["']([^"']+)["']/i)?.[1] })
    } else {
      const value = decoded(match[2])
      if (!value) continue
      if (tag[0] === "h") blocks.push({ type: "heading", text: value, level: Number(tag[1]) })
      else if (tag === "blockquote") blocks.push({ type: "callout", kind: "atencoes", title: "Atenção", text: value })
      else blocks.push({ type: "paragraph", text: tag === "li" ? `• ${value}` : value })
    }
  }
  const tail = decoded(safe.slice(position))
  if (tail) blocks.push({ type: "paragraph", text: tail })
  return blocks
}

const finishingColumns: Record<string, Array<[string, string]>> = {
  ambientes: [["pisoRodapeBancada", "Piso, rodapé e bancada"], ["parede", "Parede"], ["teto", "Teto"]],
  materiais: [["material", "Material"], ["aplicacao", "Aplicação"], ["marca", "Marca"], ["linha", "Linha"], ["referencia", "Referência"], ["formato", "Formato"], ["cor", "Cor"], ["observacoes", "Observações"]],
  hidraulicas: [["loucaCuba", "Louça ou cuba"], ["metais", "Metais"], ["fabricante", "Fabricante"], ["modelo", "Modelo"], ["referencia", "Referência"], ["observacoes", "Observações"]],
  esquadrias: [["portas", "Portas"], ["janelas", "Janelas"], ["esquadrias", "Esquadrias"], ["ferragens", "Ferragens"], ["vidros", "Vidros"], ["fabricante", "Fabricante"], ["modelo", "Modelo"], ["observacoes", "Observações"]],
  eletricas: [["acabamentoEletrico", "Acabamento elétrico"], ["interruptores", "Interruptores"], ["tomadas", "Tomadas"], ["placas", "Placas"], ["fabricante", "Fabricante"], ["linha", "Linha"], ["cor", "Cor"], ["observacoes", "Observações"]],
}
const finishingTitles: Record<string, string> = { ambientes: "Acabamentos gerais", materiais: "Materiais", hidraulicas: "Instalações hidráulicas", esquadrias: "Esquadrias e ferragens", eletricas: "Instalações elétricas" }

export function finishingTableBlocks(table: ManualFinishingTable): ManualBlock[] {
  const data = record(table.data)
  const environments = new Map<string, Map<string, Record<string, unknown>[]>>()
  for (const [group, values] of Object.entries(data)) {
    if (!Array.isArray(values)) continue
    for (const value of values) {
      const row = record(value)
      const environment = text(row.ambiente) || table.unitModel
      if (!environments.has(environment)) environments.set(environment, new Map())
      const grouped = environments.get(environment)!
      grouped.set(group, [...(grouped.get(group) ?? []), row])
    }
  }
  const blocks: ManualBlock[] = []
  for (const [environment, groups] of environments) {
    if (environment) blocks.push({ type: "heading", text: environment.toLocaleUpperCase("pt-BR"), level: 3 })
    for (const [group, rows] of groups) {
      const known = finishingColumns[group] ?? []
      const extra = Array.from(new Set(rows.flatMap(row => Object.keys(row)))).filter(key => !["id", "ambiente", ...known.map(([key]) => key)].includes(key))
      const columns = [...known, ...extra.map(key => [key, key] as [string, string])].filter(([key]) => rows.some(row => text(row[key])))
      if (!columns.length) continue
      blocks.push({ type: "table", title: finishingTitles[group] ?? group, headers: columns.map(([, label]) => label), rows: rows.map(row => columns.map(([key]) => text(row[key]))) })
    }
  }
  return blocks
}

export function warrantyTableBlocks(rows: Record<string, string>[]): ManualBlock[] {
  if (!rows.length) return []
  const labels: Record<string, string> = {
    sistema: "Sistema", system: "Sistema", elemento: "Elemento", element: "Elemento",
    descricaoFalha: "Descrição da falha", descricao_falha: "Descrição da falha", failure: "Descrição da falha", defect: "Descrição da falha",
    descricao: "Descrição", description: "Descrição", prazo: "Prazo de garantia", prazoGarantia: "Prazo de garantia", prazo_garantia: "Prazo de garantia", period: "Prazo de garantia", warrantyPeriod: "Prazo de garantia",
    ano1: "1 ano", ano3: "3 anos", ano5: "5 anos", oneYear: "1 ano", threeYears: "3 anos", fiveYears: "5 anos",
    condicoes: "Condições", conditions: "Condições", observacoes: "Observações", observations: "Observações",
    fabricante: "Fabricante", manufacturer: "Fabricante", marca: "Marca", brand: "Marca", produto: "Produto", product: "Produto", servico: "Serviço", service: "Serviço",
  }
  const keys = Array.from(new Set(rows.flatMap(row => Object.keys(row)))).filter(key => key !== "id" && rows.some(row => text(row[key])))
  return keys.length ? [{ type: "warrantyTable", headers: keys.map(key => labels[key] ?? key), rows: rows.map(row => keys.map(key => text(row[key]))) }] : []
}

function contactBlocks(contacts: TechnicalContact[], kind: "projetista" | "fornecedor"): ManualBlock[] {
  const selected = contacts.filter(contact => contact.kind === kind)
  if (kind === "fornecedor") return selected.length ? [{ type: "table", headers: ["Produto / Serviço", "Empresa", "Contato", "Telefone / E-mail"], rows: selected.map(contact => [contact.discipline, contact.company, contact.name, [contact.phone, contact.whatsapp, contact.email].filter(Boolean).join(" · ")]), widths: [1, 1.2, 1, 1.4] }] : []
  return selected.flatMap(contact => [
    { type: "heading" as const, text: contact.discipline, level: 3 },
    { type: "table" as const, headers: ["Identificação", "Dados do projetista"], rows: [["Empresa", contact.company], ["Responsável", contact.name], ["Registro", contact.registration], ["Telefone", contact.phone], ["E-mail", contact.email]].filter(([, value]) => value), widths: [1, 3] },
  ])
}

function combinedStatus(statuses: ContentStatus[]): ContentStatus {
  if (statuses.includes("reprovado")) return "reprovado"
  if (statuses.includes("aguardando_validacao")) return "aguardando_validacao"
  if (statuses.includes("rascunho")) return "rascunho"
  if (statuses.includes("sem_conteudo")) return "sem_conteudo"
  return statuses.length ? "aprovado" : "sem_conteudo"
}

/** One builder: publication remains approved-only; review preview may show submitted content. */
export function buildManualDocument(input: BuildManualDocumentInput, purpose: "publication" | "preview" = "publication"): ManualDocument {
  const visible = (status: ContentStatus) => status === "aprovado" || (purpose === "preview" && status === "aguardando_validacao")
  const rendered = (blocks: ManualBlock[], status: ContentStatus, editHref?: string): ManualBlock[] => blocks.map(block => ({ ...block, ...(status === "aguardando_validacao" ? { reviewStatus: "aguardando_validacao" as const } : {}), ...(editHref ? { editHref } : {}) }))
  const policy = (status: ContentStatus): ManualSection["renderPolicy"] => status === "aprovado" ? "approved" : visible(status) ? "review" : "structure"
  const scope: ChecklistScope = manualScope(input.manualType)
  const content = (record(input.data.manuals)[input.manualType] ?? {}) as ManualContent
  const editorial = content.editorial ?? {}
  const baseHref = `/empreendimentos/${encodeURIComponent(input.developmentId)}`
  const manualQuery = `&manual=${input.manualType}`
  const editHref = `${baseHref}?modulo=elaboracao&aba=textos${manualQuery}&secao=`
  const section = (definition: SectionDefinition): ManualSection => {
    const stored = editorial.sections?.[definition.id]
    const disabled = definition.optional && stored?.enabled === false
    const hasContent = Boolean(htmlToLines(stored?.html ?? "").join("").trim())
    const status: ContentStatus = hasContent ? manualValidationStatus(input.validations, `${definition.id}::${scope}`, "editorial") : "sem_conteudo"
    return {
      id: definition.id, title: definition.title, number: definition.number,
      type: definition.number && !definition.number.includes(".") ? "chapter" : "content",
      validationStatus: disabled ? "nao_aplicavel" : status, renderPolicy: !disabled ? policy(status) : "structure",
      blocks: visible(status) && !disabled ? rendered(approvedHtmlBlocks(stored?.html ?? ""), status) : [],
      children: (definition.children ?? []).filter(child => !child.optional || editorial.sections?.[child.id]?.enabled !== false).map(section), editHref: editHref + definition.id, optional: definition.optional,
    }
  }
  const sections = definitions.map(section)
  const byId = new Map(sections.flatMap(parent => [parent, ...parent.children]).map(value => [value.id, value]))
  const metadataSection = byId.get("ficha-tecnica")!
  metadataSection.editHref = `${baseHref}?modulo=informacoes${manualQuery}`
  byId.get("identificacao")!.editHref = metadataSection.editHref
  const ficha = record(input.data.ficha)
  const fichaRows = [["Torres", ficha.towers ?? ficha.torres], ["Apartamentos", ficha.apartments ?? ficha.apartamentos], ["Tipologias", ficha.typologies ?? ficha.tipologias], ["Áreas das unidades privativas (m²)", ficha.areas], ["Finalização do empreendimento", ficha.completionDate]]
    .map(([label, value]) => [String(label), text(value)]).filter(([, value]) => value)
  metadataSection.blocks = fichaRows.length ? [{ type: "table", headers: ["Informação", "Empreendimento"], rows: fichaRows, widths: [1.3, 2] }] : []
  metadataSection.renderPolicy = "metadata"
  metadataSection.validationStatus = fichaRows.length === 5 ? "aprovado" : fichaRows.length ? "rascunho" : "sem_conteudo"
  const sortedSystems = orderManualSystems(input.data, input.manualType, input.validations)
  const maintenanceRows: string[][] = []
  const reviewMaintenance: ManualBlock[] = []
  const systemSections = sortedSystems.map((system, index): ManualSection => {
    const description: ContentStatus = system.descriptionStatus === "rascunho" && !htmlToLines(system.html).length ? "sem_conteudo" : system.descriptionStatus
    const maintenance: ContentStatus = system.maintenanceStatus === "rascunho" && !system.maintenance.length ? "sem_conteudo" : system.maintenanceStatus
    const blocks: ManualBlock[] = []
    if (visible(description)) {
      const descriptionBlocks: ManualBlock[] = [{ type: "heading", text: "Descrição do sistema", level: 3 }, ...approvedHtmlBlocks(system.html).filter(block => !(block.type === "heading" && block.text.toLocaleLowerCase("pt-BR") === system.item.item.toLocaleLowerCase("pt-BR")))]
      if (system.item.norms.length) descriptionBlocks.push({ type: "paragraph", text: `Normas de referência: ${system.item.norms.join(", ")}` })
      blocks.push(...rendered(descriptionBlocks, description))
    }
    if (visible(maintenance) && system.maintenance.length) {
      const maintenanceHref = `${baseHref}?modulo=elaboracao&aba=textos${manualQuery}&conteudo=manutencao&item=${encodeURIComponent(system.key)}`
      blocks.push(...rendered([{ type: "heading", text: "Manutenção e conservação", level: 3 }, { type: "maintenanceTable", headers: ["Periodicidade", "Atividade", "Responsável"], rows: system.maintenance.map(row => [row.frequency, row.task, row.responsible]), widths: [1, 2.6, 1.1] }], maintenance, maintenanceHref))
      if (maintenance === "aprovado") maintenanceRows.push(...system.maintenance.map(row => [system.item.item, row.frequency, row.task, row.responsible]))
      else reviewMaintenance.push(...rendered([{ type: "maintenanceTable", title: system.item.item, headers: ["Sistema", "Periodicidade", "Atividade", "Responsável"], rows: system.maintenance.map(row => [system.item.item, row.frequency, row.task, row.responsible]), widths: [1.4, 1, 2.6, 1.1] }], maintenance, maintenanceHref))
    }
    return { id: `sistema-${system.item.id}`, type: "system", title: system.item.item, number: `4.${index + 1}`, validationStatus: combinedStatus([description, maintenance]), renderPolicy: blocks.some(block => block.reviewStatus) ? "review" : blocks.length ? "approved" : "structure", blocks, children: [], componentStatuses: [{ label: "Descrição técnica", status: description }, { label: "Manutenção", status: maintenance }], editHref: `${baseHref}?modulo=elaboracao&aba=textos${manualQuery}&item=${encodeURIComponent(system.key)}` }
  })
  byId.get("sistemas")!.children = systemSections
  byId.get("sistemas")!.editHref = `${baseHref}?modulo=elaboracao&aba=textos${manualQuery}&secao=sistemas`
  byId.get("sistemas")!.validationStatus = combinedStatus(systemSections.map(value => value.validationStatus))
  const consolidated = byId.get("manutencao-tabela")!
  consolidated.blocks = [...(maintenanceRows.length ? [{ type: "maintenanceTable" as const, headers: ["Sistema", "Periodicidade", "Atividade", "Responsável"], rows: maintenanceRows, widths: [1.4, 1, 2.6, 1.1] }] : []), ...reviewMaintenance]
  consolidated.validationStatus = combinedStatus(systemSections.map(system => system.componentStatuses![1].status))
  consolidated.renderPolicy = reviewMaintenance.length ? "review" : maintenanceRows.length ? "approved" : "structure"
  consolidated.editHref = `${baseHref}?modulo=elaboracao&aba=textos${manualQuery}&conteudo=manutencao`

  const authoring = record(input.data.authoring)
  const contacts = (Array.isArray(authoring.contacts) ? authoring.contacts : []).map(value => record(value)).filter(value => value.kind === "projetista" || value.kind === "fornecedor").map(value => Object.fromEntries(["id", "kind", "name", "company", "discipline", "registration", "phone", "whatsapp", "email", "warranty", "nbr"].map(key => [key, text(value[key])]))) as TechnicalContact[]
  for (const kind of ["projetista", "fornecedor"] as const) {
    const id = kind === "projetista" ? "projetistas" : "fornecedores"
    const target = byId.get(id)!
    if (contacts.some(contact => contact.kind === kind)) {
      target.validationStatus = manualValidationStatus(input.validations, `${id}::${scope}`, "editorial")
      target.renderPolicy = policy(target.validationStatus)
      if (visible(target.validationStatus)) target.blocks.push(...rendered(contactBlocks(contacts, kind), target.validationStatus))
    }
    target.editHref = `${baseHref}?modulo=elaboracao&aba=contatos${manualQuery}`
  }
  // The ficha and contact appendix are separate editorial contexts. Sharing the
  // source records cannot share their approval across sections or manual scopes.
  const responsible = byId.get("responsaveis-tecnicos")!
  if (contacts.some(contact => contact.kind === "projetista")) {
    responsible.validationStatus = manualValidationStatus(input.validations, `responsaveis-tecnicos::${scope}`, "editorial")
    responsible.renderPolicy = policy(responsible.validationStatus)
    if (visible(responsible.validationStatus)) responsible.blocks.push(...rendered(contactBlocks(contacts, "projetista"), responsible.validationStatus))
  }
  const commissioning = selectManualCommissioning(input.data, input.manualType)
  for (const id of ["energia", "agua", "gas", "telecom"]) {
    const value = record(commissioning[id])
    if (!Object.values(value).some(item => text(item))) continue
    const target = byId.get(id)!
    target.validationStatus = manualValidationStatus(input.validations, `${id}::${scope}`, "editorial")
    target.renderPolicy = policy(target.validationStatus)
    if (visible(target.validationStatus)) {
      const rows = [["Empresa", text(value.company)], ["Telefone", text(value.phone)], ["Site", text(value.site)]].filter(([, value]) => value)
      if (rows.length) target.blocks.push(...rendered([{ type: "table", headers: ["Atendimento", "Contato"], rows, widths: [1, 3] }], target.validationStatus))
      if (text(value.instructions)) target.blocks.push(...rendered([{ type: "paragraph", text: text(value.instructions) }], target.validationStatus))
    }
    target.editHref = `${baseHref}?modulo=elaboracao&aba=comissionamento${manualQuery}&servico=${id}`
  }
  const warranties = byId.get("garantias-tabela")!
  const warrantyRows = Array.isArray(editorial.warranties) ? editorial.warranties : []
  if (warrantyRows.length) {
    warranties.validationStatus = manualValidationStatus(input.validations, `garantias-tabela::${scope}`, "editorial")
    warranties.renderPolicy = policy(warranties.validationStatus)
    if (visible(warranties.validationStatus)) warranties.blocks.push(...rendered(warrantyTableBlocks(warrantyRows), warranties.validationStatus))
  }

  if (input.manualType === "sindico") {
    byId.get("reformas")!.title = "Reformas nas áreas comuns"
    byId.get("documentacao")!.title = "Documentação das áreas comuns"
  }

  const attachments: ManualAttachment[] = input.files.map(file => ({ id: file.id, name: file.name, pathname: file.pathname, contentType: file.contentType ?? "application/octet-stream", sizeBytes: file.sizeBytes, policy: editorial.attachments?.[file.id] ?? "reference", sectionId: `anexo-${file.id}` }))
  let attachmentIndex = 0
  byId.get("anexos")!.children = attachments.filter(file => file.policy !== "exclude").map(file => ({ id: file.sectionId, type: "attachment", title: file.name, number: `9.${++attachmentIndex}`, validationStatus: "aprovado", renderPolicy: "metadata", blocks: [{ type: "paragraph", text: `Documento de referência: ${file.name}` }], children: [], editHref: `${baseHref}?modulo=databook${manualQuery}` }))
  byId.get("anexos")!.validationStatus = attachmentIndex ? "aprovado" : "sem_conteudo"
  byId.get("anexos")!.editHref = `${baseHref}?modulo=databook${manualQuery}`

  const title = input.manualType === "sindico" ? "Manual do Síndico" : "Manual do Proprietário"
  const generatedAt = input.date ?? new Date().toISOString()
  const cover: ManualSection = { id: "capa", type: "cover", title: "Capa", validationStatus: "aprovado", renderPolicy: "metadata", blocks: [], children: [], editHref: `${baseHref}?modulo=identidade${manualQuery}` }
  const toc: ManualSection = { id: "sumario", type: "toc", title: "Sumário", validationStatus: "aprovado", renderPolicy: "metadata", blocks: [], children: [] }
  sections.splice(1, 0, toc)
  return { schemaVersion: 1, metadata: { developmentId: input.developmentId, developmentName: input.name, organizationName: input.organization.name, organizationLogo: input.organization.logo, manualType: input.manualType, title, revision: input.revision, date: generatedAt.slice(0, 10), generatedAt, purpose }, identity: resolveManualIdentity(input.data.identity ?? input.data.brand, input.name, input.organization.metadata), sections: [cover, ...sections], attachments }
}
