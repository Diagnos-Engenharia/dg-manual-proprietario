import { checklistItemMatchesScope, type ChecklistItem, type SchedulePhase } from "@/lib/mock-data"
import { fichaProgress, checklistProgress, progressForDevelopment } from "@/lib/progress"
import { htmlToLines, manualScope, manualValidationStatus, optionalManualSectionIds, selectManualCommissioning, selectManualSystems, type ManualContent, type ManualContentValidation } from "@/lib/manual-content"

export type PendingStage = { id: string; name: string; progress: number; pending: string[] }
export type ReadinessFinishingTable = { id: string; status: string; tower?: string; typology?: string; data?: unknown }
const statusLabels: Record<string, string> = { rascunho: "rascunho", aguardando_validacao: "aguardando validação", reprovado: "reprovado" }
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
const hasValue = (value: unknown) => (typeof value === "string" || typeof value === "number") && String(value).trim().length > 0

/** Official emission is stricter than composition: existence is not approval. */
export function assessManualReadiness(data: Record<string, unknown>, manual: "proprietario" | "sindico", finishingCount = 0, validations: ManualContentValidation[] = [], finishing: ReadinessFinishingTable[] = []) {
  const checklist = Array.isArray(data.checklist) ? data.checklist as ChecklistItem[] : []
  const ficha = data.ficha as Parameters<typeof fichaProgress>[0]
  const manuals = data.manuals as Record<string, ManualContent> | undefined
  const content = manuals?.[manual]
  const scope = manualScope(manual)
  const stages: PendingStage[] = []
  const missingFicha = [ ["Torres",ficha?.towers ?? ficha?.torres],["Apartamentos",ficha?.apartments ?? ficha?.apartamentos],["Tipologias",ficha?.typologies ?? ficha?.tipologias],["Áreas",ficha?.areas],["Previsão de finalização",ficha?.completionDate] ].filter(([,v]) => !String(v ?? "").trim()).map(([name]) => "Ficha técnica: preencher " + name)
  stages.push({ id: "ficha", name: "Ficha Técnica do Empreendimento", progress: fichaProgress(ficha), pending: missingFicha })
  const relevant = Array.from(new Map(checklist.filter(i => checklistItemMatchesScope(i,scope)).map(i => [i.id,i])).values())
  const unanswered = relevant.filter(i=>i.status==="nao_especificado" || i.status==="em_andamento")
  stages.push({ id: "checklist", name: "Checklist Inicial", progress: checklistProgress(checklist,scope), pending: unanswered.map(i=>"Checklist: responder " + i.category + " / " + i.item) })
  const selected = selectManualSystems({ ...data, checklist }, manual, validations)
  const pendingSystems: string[] = []
  let approvedSystemParts = 0
  for (const system of selected) {
    const label = `${system.item.category} / ${system.item.item}`
    const hasDescription = htmlToLines(system.html).join("").trim().length > 0
    if (!hasDescription) pendingSystems.push("Descrição técnica: completar " + label)
    if (system.descriptionStatus !== "aprovado") pendingSystems.push(`Descrição técnica: ${label} — ${statusLabels[system.descriptionStatus]}`)
    else if (hasDescription) approvedSystemParts++
    // An independently approved empty table explicitly means no activity applies.
    if (system.maintenanceStatus !== "aprovado") pendingSystems.push(`Manutenção: ${label} — ${statusLabels[system.maintenanceStatus]}`)
    else if (system.maintenance.some(row => !row.task.trim() || !row.frequency.trim() || !row.responsible)) pendingSystems.push("Manutenção: completar atividade, periodicidade e responsável de " + label)
    else approvedSystemParts++
  }
  if (!selected.length) pendingSystems.push("Indicar ao menos um sistema existente para este manual.")
  stages.push({ id: manual, name: manual==="proprietario"?"Manual do Proprietário":"Manual do Síndico", progress: selected.length ? Math.round(approvedSystemParts / (selected.length * 2) * 100) : 0, pending: pendingSystems })
  if (manual === "proprietario") {
    const pending: string[] = []
    if (!finishingCount || !finishing.length) pending.push(finishingCount ? "Verificar a aprovação da Tabela de Acabamentos." : "Cadastrar a Tabela de Acabamentos.")
    let approved = 0
    const required: Record<string, string[]> = { ambientes: ["ambiente"], materiais: ["material", "aplicacao", "ambiente"], hidraulicas: ["ambiente", "loucaCuba"], esquadrias: ["ambiente"], eletricas: ["ambiente", "acabamentoEletrico"] }
    for (const table of finishing) {
      const label = [table.tower, table.typology].filter(Boolean).join(" / ") || "Tabela de Acabamentos"
      if (table.status !== "aprovado") pending.push(`Acabamentos: ${label} — ${statusLabels[table.status] ?? "sem aprovação"}`)
      const groups = Object.entries(asRecord(table.data)).filter(([, value]) => Array.isArray(value))
      const count = groups.reduce((total, [, value]) => total + (value as unknown[]).length, 0)
      const incomplete = groups.some(([group, values]) => (values as unknown[]).some(value => (required[group] ?? []).some(key => !hasValue(asRecord(value)[key]))))
      if (!count) pending.push("Acabamentos: cadastrar registros em " + label)
      else if (incomplete) pending.push("Acabamentos: completar os campos obrigatórios em " + label)
      else if (table.status === "aprovado") approved++
    }
    stages.push({ id: "acabamentos", name: "Tabela de Acabamentos", progress: finishing.length ? Math.round(approved / finishing.length * 100) : 0, pending })
  }
  const editorial = content?.editorial ?? {}
  const pendingEditorial: string[] = []
  const contexts = new Set<string>()
  const requireEditorialApproval = (id: string, label: string) => {
    if (contexts.has(id)) return
    contexts.add(id)
    const status = manualValidationStatus(validations, `${id}::${scope}`, "editorial")
    if (status !== "aprovado") pendingEditorial.push(`${label} — ${statusLabels[status]}`)
  }
  for (const [id, section] of Object.entries(editorial.sections ?? {})) {
    const disabledOptional = optionalManualSectionIds.some(optional => optional === id) && section.enabled === false
    if (!disabledOptional && htmlToLines(section.html ?? "").length) requireEditorialApproval(id, "Conteúdo editorial: " + id)
  }
  const authoring = asRecord(data.authoring)
  const contacts = Array.isArray(authoring.contacts) ? authoring.contacts.map(asRecord) : []
  if (contacts.some(contact => contact.kind === "projetista")) {
    requireEditorialApproval("projetistas", "Projetistas")
    requireEditorialApproval("responsaveis-tecnicos", "Responsáveis técnicos")
  }
  if (contacts.some(contact => contact.kind === "fornecedor")) requireEditorialApproval("fornecedores", "Fornecedores")
  const services = selectManualCommissioning(data, manual)
  for (const id of ["agua", "gas", "energia", "telecom"]) if (Object.values(asRecord(services[id])).some(hasValue)) requireEditorialApproval(id, "Providências iniciais: " + id)
  if (Array.isArray(editorial.warranties) && editorial.warranties.length) {
    requireEditorialApproval("garantias-tabela", "Tabela de garantias")
    if (editorial.warranties.some(row => !Object.entries(row).some(([key, value]) => key !== "id" && hasValue(value)))) pendingEditorial.push("Tabela de garantias: completar ou remover registros vazios.")
  }
  if (contexts.size) stages.push({ id: "editorial", name: "Conteúdo editorial e cadastros", progress: Math.round(Math.max(0, contexts.size - pendingEditorial.length) / contexts.size * 100), pending: pendingEditorial })
  const all = progressForDevelopment(ficha,checklist,manuals)
  const schedule = Array.isArray(data.schedule) ? data.schedule as SchedulePhase[] : []
  const sum = schedule.reduce((s,p)=>s+p.weight,0)
  if (Math.abs(sum-100)>0.001) stages.push({id:"cronograma",name:"Cronograma",progress:0,pending:["Distribuir 100% dos pesos no cronograma."]})
  for (const stage of schedule) if ((stage.kind==="custom" || stage.id.startsWith("custom-")) && (stage.progress??0)<100) stages.push({id:stage.id,name:stage.name,progress:stage.progress??0,pending:["Concluir a etapa personalizada: "+stage.name]})
  const blocking = stages.flatMap(s=>s.pending)
  return {ok:!blocking.length,blocking,stages,overall:Math.round(stages.reduce((s,p)=>s+p.progress,0)/Math.max(stages.length,1)),progress:all}
}
