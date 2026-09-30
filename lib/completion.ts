import { checklistItemMatchesScope, type ChecklistItem, type SchedulePhase } from "@/lib/mock-data"
import { fichaProgress, checklistProgress, manualProgress, phaseProgress, progressForDevelopment } from "@/lib/progress"
import type { ManualContent } from "@/lib/manual-content"

export type PendingStage = { id: string; name: string; progress: number; pending: string[] }
export function assessManualReadiness(data: Record<string, unknown>, manual: "proprietario" | "sindico", finishingCount = 0) {
  const checklist = Array.isArray(data.checklist) ? data.checklist as ChecklistItem[] : []
  const ficha = data.ficha as Parameters<typeof fichaProgress>[0]
  const manuals = data.manuals as Record<string, ManualContent> | undefined
  const content = manuals?.[manual]
  const scope = manual === "proprietario" ? "unidade" : "comum"
  const stages: PendingStage[] = []
  const missingFicha = [ ["Torres",ficha?.towers ?? ficha?.torres],["Apartamentos",ficha?.apartments ?? ficha?.apartamentos],["Tipologias",ficha?.typologies ?? ficha?.tipologias],["Áreas",ficha?.areas],["Previsão de finalização",ficha?.completionDate] ].filter(([,v]) => !String(v ?? "").trim()).map(([name]) => "Ficha técnica: preencher " + name)
  stages.push({ id: "ficha", name: "Ficha Técnica do Empreendimento", progress: fichaProgress(ficha), pending: missingFicha })
  const relevant = Array.from(new Map(checklist.filter(i => checklistItemMatchesScope(i,scope)).map(i => [i.id,i])).values())
  const unanswered = relevant.filter(i=>i.status==="nao_especificado")
  stages.push({ id: "checklist", name: "Checklist Inicial", progress: checklistProgress(checklist,scope), pending: unanswered.map(i=>"Checklist: responder " + i.category + " / " + i.item) })
  const selected = relevant.filter(i=>i.status==="possui")
  const pendingSystems = selected.filter(i=> {
    const html = content?.sistemas?.[i.id+"::"+scope] ?? content?.sistemas?.[i.id] ?? ""
    return !html.replace(/<[^>]*>/g," ").trim()
  }).map(i=>"Sistemas construtivos: completar " + i.category + " / " + i.item)
  if (!selected.length) pendingSystems.push("Indicar ao menos um sistema existente para este manual.")
  if (manual==="proprietario" && finishingCount===0) pendingSystems.push("Cadastrar a Tabela de Acabamentos.")
  stages.push({ id: manual, name: manual==="proprietario"?"Manual do Proprietário":"Manual do Síndico", progress: manualProgress(checklist,scope,content), pending: pendingSystems })
  const all = progressForDevelopment(ficha,checklist,manuals)
  const schedule = Array.isArray(data.schedule) ? data.schedule as SchedulePhase[] : []
  const sum = schedule.reduce((s,p)=>s+p.weight,0)
  if (Math.abs(sum-100)>0.001) stages.push({id:"cronograma",name:"Cronograma",progress:0,pending:["Distribuir 100% dos pesos no cronograma."]})
  for (const stage of schedule) if ((stage.kind==="custom" || stage.id.startsWith("custom-")) && (stage.progress??0)<100) stages.push({id:stage.id,name:stage.name,progress:stage.progress??0,pending:["Concluir a etapa personalizada: "+stage.name]})
  const blocking = stages.flatMap(s=>s.pending)
  return {ok:!blocking.length,blocking,stages,overall:Math.round(stages.reduce((s,p)=>s+p.progress,0)/Math.max(stages.length,1)),progress:all}
}
