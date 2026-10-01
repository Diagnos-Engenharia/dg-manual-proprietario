import { emptyFinishingData, finishingGroups, finishingProblems, unitLabel } from "@/lib/finishing-content"
import type { DevelopmentUnit, FinishingTable } from "@/lib/finishing-types"
import { resolveManualIdentity } from "@/lib/manual-identity"
import { finishingTableBlocks } from "./build"
import type { ManualDocument, ManualPreview, ManualSection } from "./types"

export type FinishingDocumentSource = { developmentId: string; name: string; organization: { name: string; logo?: string | null; metadata?: string | null }; data: Record<string, unknown>; unit: DevelopmentUnit; table: FinishingTable | null; revision: number; date: string }
export function assessFinishingReadiness(source: FinishingDocumentSource): ManualPreview["readiness"] {
  const pending: string[] = []
  if (!source.unit.number.trim() || !source.unit.typology.trim()) pending.push("Complete número e tipologia da unidade.")
  if (!source.table) pending.push("Cadastre a tabela desta unidade.")
  else {
    pending.push(...finishingProblems(source.table.data))
    if (source.table.status !== "aprovado") pending.push("A tabela da unidade precisa estar aprovada antes de emitir o PDF.")
  }
  if (!source.name.trim()) pending.push("O empreendimento não possui nome cadastrado.")
  return { ok: pending.length === 0, blocking: pending, overall: pending.length ? 0 : 100, stages: [{ id: "acabamentos", name: "Tabela de acabamentos da unidade", progress: pending.length ? 0 : 100, pending }] }
}
export function buildFinishingDocument(source: FinishingDocumentSource, purpose: "preview" | "publication" = "publication"): ManualDocument {
  const { unit, table } = source
  const editHref = "/empreendimentos/" + encodeURIComponent(source.developmentId) + "?modulo=elaboracao&aba=acabamentos&unidade=" + encodeURIComponent(unit.id)
  const status = table?.status ?? "sem_conteudo"
  const visible = status === "aprovado" || (purpose === "preview" && status === "aguardando_validacao")
  const grouped = new Map<string, ReturnType<typeof emptyFinishingData>>()
  for (const group of finishingGroups) for (const row of table?.data[group] ?? []) {
    const environment = row.ambiente?.trim() || "Especificações da unidade"
    if (!grouped.has(environment)) grouped.set(environment, emptyFinishingData())
    grouped.get(environment)![group].push(row)
  }
  const sections: ManualSection[] = [
    { id: "capa", type: "cover", title: "Capa", validationStatus: "aprovado", renderPolicy: "metadata", blocks: [], children: [], editHref },
    { id: "sumario", type: "toc", title: "Sumário", validationStatus: "aprovado", renderPolicy: "metadata", blocks: [], children: [] },
    { id: "identificacao-unidade", type: "content", title: "Identificação da unidade", validationStatus: "aprovado", renderPolicy: "metadata", blocks: [{ type: "table", headers: ["Identificação", "Dados da unidade"], rows: [["Empreendimento", source.name], ["Torre ou bloco", unit.tower], ["Pavimento", unit.floor], ["Unidade", unit.number], ["Tipologia", unit.typology], ["Área", unit.area]].filter(([, value]) => value) }], children: [], editHref },
    ...Array.from(grouped, ([environment, data], index): ManualSection => {
      const environmentHref = editHref + "&ambiente=" + encodeURIComponent(environment)
      const firstGroup = finishingGroups.find(group => data[group].length) ?? "ambientes"
      const blocks = visible && table ? finishingGroups.flatMap(group => {
        if (!data[group].length) return []
        const groupData = { ...emptyFinishingData(), [group]: data[group] }
        return finishingTableBlocks({ ...table, data: groupData }).filter(block => block.type !== "heading").map(block => ({ ...block, editHref: environmentHref + "&grupo=" + group, ...(status === "aguardando_validacao" ? { reviewStatus: "aguardando_validacao" as const } : {}) }))
      }) : []
      return { id: "ambiente-" + (index + 1), type: "content", number: String(index + 1), title: environment, validationStatus: status, renderPolicy: status === "aprovado" ? "approved" : status === "aguardando_validacao" ? "review" : "structure", blocks, children: [], editHref: environmentHref + "&grupo=" + firstGroup }
    }),
  ]
  if (!grouped.size) sections.push({ id: "acabamentos", type: "content", title: "Tabela de acabamentos", validationStatus: status, renderPolicy: "structure", blocks: [], children: [], editHref })
  const generatedAt = source.date + "T12:00:00.000Z"
  return { schemaVersion: 1, metadata: { developmentId: source.developmentId, developmentName: source.name, organizationName: source.organization.name, organizationLogo: source.organization.logo, manualType: "acabamentos", unitId: unit.id, unitLabel: unitLabel(unit), title: "Tabela de acabamentos · " + unitLabel(unit), revision: source.revision, date: source.date, generatedAt, purpose }, identity: resolveManualIdentity(source.data.identity ?? source.data.brand, source.name, source.organization.metadata), sections, attachments: [] }
}
