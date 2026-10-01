import { emptyFinishingData, finishingGroups, finishingProblems, unitLabel } from "@/lib/finishing-content"
import type { DevelopmentUnit, FinishingTable } from "@/lib/finishing-types"
import { resolveManualIdentity } from "@/lib/manual-identity"
import { finishingTableBlocks } from "./build"
import type { ManualBlock, ManualDocument, ManualPreview, ManualSection } from "./types"

export type FinishingDocumentSource = { developmentId: string; name: string; organization: { name: string; logo?: string | null; metadata?: string | null }; data: Record<string, unknown>; unit: DevelopmentUnit; table: FinishingTable | null; revision: number; date: string }
export function assessFinishingReadiness(source: FinishingDocumentSource): ManualPreview["readiness"] {
  const pending: string[] = []
  if (!source.unit.number.trim()) pending.push("Complete o número da unidade.")
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
  const firstGroup = finishingGroups.find(group => table?.data[group].length) ?? "ambientes"
  const review = status === "aguardando_validacao" ? { reviewStatus: "aguardando_validacao" as const } : {}
  const blocks: ManualBlock[] = visible && table ? Array.from(grouped, ([environment, data]): ManualBlock[] => {
    const environmentHref = editHref + "&ambiente=" + encodeURIComponent(environment)
    const environmentGroup = finishingGroups.find(group => data[group].length) ?? "ambientes"
    return [
      { type: "heading", text: environment.toLocaleUpperCase("pt-BR"), level: 3, editHref: environmentHref + "&grupo=" + environmentGroup, ...review },
      ...finishingGroups.flatMap(group => {
        if (!data[group].length) return []
        const groupData = { ...emptyFinishingData(), [group]: data[group] }
        return finishingTableBlocks({ ...table, data: groupData }).filter(block => block.type !== "heading").map(block => ({ ...block, editHref: environmentHref + "&grupo=" + group, ...review }))
      }),
    ]
  }).flat() : []
  const sections: ManualSection[] = [{ id: "acabamentos", type: "content", title: "Tabela de acabamentos", validationStatus: status, renderPolicy: status === "aprovado" ? "approved" : status === "aguardando_validacao" ? "review" : "structure", blocks, children: [], editHref: editHref + "&grupo=" + firstGroup }]
  const generatedAt = source.date + "T12:00:00.000Z"
  return { schemaVersion: 1, metadata: { developmentId: source.developmentId, developmentName: source.name, organizationName: source.organization.name, organizationLogo: source.organization.logo, manualType: "acabamentos", pageOrientation: "landscape", unitId: unit.id, unitLabel: unitLabel(unit), title: "Tabela de acabamentos · " + unitLabel(unit), revision: source.revision, date: source.date, generatedAt, purpose }, identity: resolveManualIdentity(source.data.identity ?? source.data.brand, source.name, source.organization.metadata), sections, attachments: [] }
}
