import { checklistItemMatchesScope, type ChecklistItem, type SchedulePhase } from "@/lib/mock-data"
import { htmlToLines, type ManualContent } from "@/lib/manual-content"

export type TechnicalSheet = { towers?: string; apartments?: string; typologies?: string; areas?: string; torres?: string; apartamentos?: string; tipologias?: string; completionDate: string }
export type SectionProgress = { ficha: number; checklist: number; proprietario: number; sindico: number; master: number }
const pct = (done: number, total: number) => total === 0 ? 0 : Math.round(done / total * 100)
const filled = (v: unknown) => typeof v === "string" ? v.trim().length > 0 : v !== null && v !== undefined && v !== ""

export function fichaProgress(ficha: TechnicalSheet | undefined | null): number {
  const f = ficha ?? { completionDate: "" }
  return pct([f.towers ?? f.torres, f.apartments ?? f.apartamentos, f.typologies ?? f.tipologias, f.areas, f.completionDate].filter(filled).length, 5)
}
export function checklistProgress(items: ChecklistItem[] | undefined | null, scope?: "unidade" | "comum"): number {
  const all = Array.isArray(items) ? items : []
  const unique = Array.from(new Map(all.filter(i => !scope || checklistItemMatchesScope(i, scope)).map(i => [i.id, i])).values())
  return pct(unique.filter(i => i.status !== "nao_especificado").length, unique.length)
}
export function manualProgress(items: ChecklistItem[] | undefined | null, scope: "unidade" | "comum", content?: ManualContent): number {
  const linked = (items ?? []).filter(i => i.status === "possui" && checklistItemMatchesScope(i, scope))
  const unique = Array.from(new Map(linked.map(i => [i.id, i])).values())
  return pct(unique.filter(item => {
    const key = item.id + "::" + scope
    const html = content?.sistemas?.[key] ?? content?.sistemas?.[item.id] ?? ""
    return htmlToLines(html).join("").trim().length > 0
  }).length, unique.length)
}
export function progressForDevelopment(ficha: TechnicalSheet | undefined | null, items: ChecklistItem[] | undefined | null, manuals?: Record<string, unknown>): SectionProgress {
  const progress = { ficha: fichaProgress(ficha), checklist: checklistProgress(items), proprietario: manualProgress(items, "unidade", manuals?.proprietario as ManualContent | undefined), sindico: manualProgress(items, "comum", manuals?.sindico as ManualContent | undefined) }
  return { ...progress, master: Math.round((progress.ficha + progress.checklist + progress.proprietario + progress.sindico) / 4) }
}
export function stageStatus(stage: SchedulePhase, progress: number, today = new Date()): SchedulePhase["status"] {
  if (progress >= 100) return "concluido"
  const due = new Date(stage.scheduledDate.slice(0, 10) + "T23:59:59")
  return due < today ? "atrasado" : "no_prazo"
}
export function expectedProgress(stages: SchedulePhase[], today = new Date()): number {
  const start = new Date((stages[0]?.originalDate ?? "").slice(0,10) + "T00:00:00").getTime()
  const end = new Date((stages[stages.length - 1]?.scheduledDate ?? "").slice(0,10) + "T23:59:59").getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return Math.max(0, Math.min(100, Math.round((today.getTime() - start) / (end - start) * 100)))
}
export function riskLabel(stages: SchedulePhase[], realProgress: number, deliveryDate: string, today = new Date()): "normal" | "em_risco" | "atrasado" {
  if (new Date(deliveryDate.slice(0,10) + "T23:59:59") < today && realProgress < 100) return "atrasado"
  return expectedProgress(stages, today) - realProgress > 15 ? "em_risco" : "normal"
}
export function phaseProgress(stage: SchedulePhase | string, progress: SectionProgress): number {
  const name = typeof stage === "string" ? stage : stage.kind ?? stage.name
  const id = typeof stage === "string" ? "" : stage.id
  if (name === "ficha" || name === "Ficha Técnica do Empreendimento" || id === "stage-1" || id === "ph-sistemas") return progress.ficha
  if (name === "checklist" || name === "Checklist Inicial" || id === "stage-2" || id === "ph-fornecedores") return progress.checklist
  if (name === "proprietario" || name === "Manual do Proprietário" || id === "stage-3" || id === "ph-revestimentos") return progress.proprietario
  if (name === "sindico" || name === "Manual do Síndico" || id === "stage-4" || id === "ph-garantias") return progress.sindico
  return typeof stage === "string" ? 0 : (stage.progress ?? 0)
}
export function masterFromStages(stages: SchedulePhase[], progress: SectionProgress): number {
  const totalWeight = stages.reduce((sum, stage) => sum + (Number.isFinite(stage.weight) ? stage.weight : 0), 0)
  if (totalWeight <= 0) return 0
  return Math.round(stages.reduce((sum, stage) => sum + phaseProgress(stage, progress) * stage.weight, 0) / totalWeight)
}
export type ProgressSnapshot = ReturnType<typeof progressForDevelopment>
