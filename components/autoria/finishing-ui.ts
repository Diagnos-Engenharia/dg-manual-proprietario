import type { DevelopmentUnit, FinishingGroup, FinishingRow, FinishingTableData } from "@/lib/finishing-types"

export type FinishingGroupConfig = { id: FinishingGroup; label: string; description: string; columns: string[]; required: string[] }
export const finishingGroups: FinishingGroupConfig[] = [
  { id: "ambientes", label: "Ambientes", description: "Pisos, paredes, tetos e acabamentos gerais de cada ambiente.", columns: ["ambiente", "pisoRodapeBancada", "parede", "teto"], required: ["ambiente"] },
  { id: "materiais", label: "Materiais", description: "Materiais, aplicações, marcas e referências.", columns: ["material", "aplicacao", "ambiente", "marca", "linha", "referencia", "formato", "cor", "observacoes"], required: ["material", "aplicacao", "ambiente"] },
  { id: "hidraulicas", label: "Instalações hidráulicas", description: "Louças, cubas, metais e componentes aparentes.", columns: ["ambiente", "loucaCuba", "metais", "fabricante", "modelo", "referencia", "observacoes"], required: ["ambiente", "loucaCuba"] },
  { id: "esquadrias", label: "Esquadrias e ferragens", description: "Portas, janelas, ferragens e vidros.", columns: ["ambiente", "portas", "janelas", "esquadrias", "ferragens", "vidros", "fabricante", "modelo", "observacoes"], required: ["ambiente"] },
  { id: "eletricas", label: "Instalações elétricas", description: "Interruptores, tomadas, placas e acabamentos elétricos.", columns: ["ambiente", "acabamentoEletrico", "interruptores", "tomadas", "placas", "fabricante", "linha", "cor", "observacoes"], required: ["ambiente", "acabamentoEletrico"] },
]
export const finishingFieldLabels: Record<string, string> = {
  ambiente: "Ambiente", pisoRodapeBancada: "Piso, rodapé e bancada", parede: "Parede", teto: "Teto", material: "Material", aplicacao: "Aplicação",
  loucaCuba: "Louça ou cuba", metais: "Metais", fabricante: "Fabricante", modelo: "Modelo", referencia: "Referência", observacoes: "Observações",
  portas: "Portas", janelas: "Janelas", esquadrias: "Esquadrias", ferragens: "Ferragens", vidros: "Vidros", acabamentoEletrico: "Acabamento elétrico",
  interruptores: "Interruptores", tomadas: "Tomadas", placas: "Placas", linha: "Linha", formato: "Formato", cor: "Cor", marca: "Marca",
}
export const finishingSourceLabels: Record<string, string> = { sem_tabela: "Sem tabela", rascunho: "Rascunho", aguardando_validacao: "Aguardando validação", aprovado: "Aprovado", reprovado: "Reprovado" }
export const unitEmissionLabels: Record<string, string> = { pendente: "Pendente de emissão", validacao: "Em validação", emitida: "Emitida", atualizacao_pendente: "Atualização pendente" }
export function normalizeFinishing(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim() }
export function finishingUnitLabel(unit: Pick<DevelopmentUnit, "tower" | "number">) { return [unit.tower, "Unidade " + unit.number].filter(Boolean).join(" · ") }
export function emptyFinishingData(): FinishingTableData { return { ambientes: [], materiais: [], hidraulicas: [], esquadrias: [], eletricas: [] } }
export function finishingDataCount(data: FinishingTableData) { return finishingGroups.reduce((sum, group) => sum + data[group.id].length, 0) }
export function finishingIncompleteCount(data: FinishingTableData) { return finishingGroups.reduce((sum, group) => sum + data[group.id].filter(row => group.required.some(field => !row[field]?.trim())).length, 0) }
export function newFinishingRow(group: FinishingGroupConfig): FinishingRow { return Object.fromEntries([["id", crypto.randomUUID()], ...group.columns.map(field => [field, ""])]) as FinishingRow }
export function duplicateFinishingData(data: FinishingTableData): FinishingTableData { return Object.fromEntries(finishingGroups.map(group => [group.id, data[group.id].map(row => ({ ...row, id: crypto.randomUUID() }))])) as FinishingTableData }
