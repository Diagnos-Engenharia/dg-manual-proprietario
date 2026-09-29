import type { ChecklistItem, SchedulePhase } from "@/lib/mock-data"

export type TechnicalSheet = { towers: string; apartments: string; typologies: string; areas: string; completionDate: string }
export type SectionProgress = { ficha: number; checklist: number; proprietario: number; sindico: number; master: number }

const filled = (value: unknown) => typeof value === "string" ? value.trim().length > 0 : Boolean(value)
const pct = (done: number, total: number) => total === 0 ? 0 : Math.round((done / total) * 100)

export function fichaProgress(ficha: TechnicalSheet | undefined | null): number {
  const safeFicha = ficha ?? { towers: "", apartments: "", typologies: "", areas: "", completionDate: "" }
  const fields = [safeFicha.towers, safeFicha.apartments, safeFicha.typologies, safeFicha.areas, safeFicha.completionDate]
  return pct(fields.filter(filled).length, fields.length)
}

export function checklistProgress(items: ChecklistItem[] | undefined | null): number {
  const safeItems = Array.isArray(items) ? items : []
  return pct(safeItems.filter((item) => item.status !== "nao_especificado").length, safeItems.length)
}

export function manualProgress(items: ChecklistItem[] | undefined | null, scope: "unidade" | "comum"): number {
  const safeItems = Array.isArray(items) ? items : []
  const linked = safeItems.filter((item) => item.status === "possui" && item.scope === scope)
  return pct(linked.filter((item) => item.approvalStatus === "aprovado").length, linked.length)
}

export function progressForDevelopment(ficha: TechnicalSheet | undefined | null, items: ChecklistItem[] | undefined | null): SectionProgress {
  const progress = { ficha: fichaProgress(ficha), checklist: checklistProgress(items), proprietario: manualProgress(items, "unidade"), sindico: manualProgress(items, "comum") }
  return { ...progress, master: Math.round((progress.ficha + progress.checklist + progress.proprietario + progress.sindico) / 4) }
}

export function stageStatus(stage: SchedulePhase, progress: number, today = new Date()): SchedulePhase["status"] {
  if (progress >= 100) return "concluido"
  const due = new Date(`${stage.scheduledDate.slice(0, 10)}T23:59:59`)
  return due < today ? "atrasado" : "no_prazo"
}

export function expectedProgress(stages: SchedulePhase[], today = new Date()): number {
  const start = new Date(`${stages[0]?.originalDate.slice(0, 10)}T00:00:00`).getTime()
  const end = new Date(`${stages[stages.length - 1]?.scheduledDate.slice(0, 10)}T23:59:59`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return Math.max(0, Math.min(100, Math.round(((today.getTime() - start) / (end - start)) * 100)))
}

export function riskLabel(stages: SchedulePhase[], realProgress: number, deliveryDate: string, today = new Date()): "normal" | "em_risco" | "atrasado" {
  if (new Date(`${deliveryDate.slice(0, 10)}T23:59:59`) < today && realProgress < 100) return "atrasado"
  return expectedProgress(stages, today) - realProgress > 15 ? "em_risco" : "normal"
}

export function phaseProgress(stageName: string, progress: SectionProgress): number {
  if (stageName === "Ficha Técnica do Empreendimento") return progress.ficha
  if (stageName === "Checklist Inicial") return progress.checklist
  if (stageName === "Manual do Proprietário") return progress.proprietario
  return progress.sindico
}

export function masterFromStages(stages: SchedulePhase[], progress: SectionProgress): number {
  const totalWeight = stages.reduce((sum, stage) => sum + (Number.isFinite(stage.weight) ? stage.weight : 0), 0)
  if (totalWeight <= 0) return 0
  return Math.round(stages.reduce((sum, stage) => sum + phaseProgress(stage.name, progress) * stage.weight, 0) / totalWeight)
}

export type ProgressSnapshot = ReturnType<typeof progressForDevelopment>
