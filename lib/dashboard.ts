import type { ProjectStatus } from "@/lib/mock-data"

export const dashboardStages = [
  "Ficha Técnica do Empreendimento",
  "Checklist Inicial",
  "Manual do Proprietário",
  "Manual do Síndico",
] as const

export type DashboardStage = {
  name: string
  progress: number
  planned: number
  dueDate?: string
  responsible?: string
  pending: number
}

export type DashboardDevelopment = {
  id: string
  name: string
  client: string
  status: ProjectStatus
  deliveryDate: string
  masterProgress: number
  data?: unknown
  stages: DashboardStage[]
}

export function normalizeStages(data: unknown): DashboardStage[] {
  const source = data && typeof data === "object" && Array.isArray((data as { stages?: unknown }).stages)
    ? (data as { stages: unknown[] }).stages
    : []
  return dashboardStages.map((name, index) => {
    const item = source[index] && typeof source[index] === "object" ? source[index] as Partial<DashboardStage> : {}
    return {
      name,
      progress: Math.max(0, Math.min(100, Number(item.progress ?? 0))),
      planned: Math.max(0, Math.min(100, Number(item.planned ?? 0))),
      dueDate: typeof item.dueDate === "string" ? item.dueDate : undefined,
      responsible: typeof item.responsible === "string" ? item.responsible : undefined,
      pending: Math.max(0, Number(item.pending ?? 0)),
    }
  })
}

export function calculateSituation(status: ProjectStatus, real: number, planned: number, deliveryDate: string) {
  if (status === "pausado") return { label: "Pausado", tone: "muted" as const }
  if (real >= 100) return { label: "Concluído", tone: "success" as const }
  const days = calendarDaysUntil(deliveryDate)
  const deviation = real - planned
  if (days < 0) return { label: "Atrasado", tone: "critical" as const }
  if (deviation < -10) return { label: "Em risco", tone: "critical" as const }
  if (deviation < -5) return { label: "Atenção", tone: "warning" as const }
  return { label: "No prazo", tone: "success" as const }
}

export function calendarDaysUntil(date: string) {
  const target = new Date(`${date}T12:00:00`)
  const today = new Date()
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12)
  return Math.ceil((target.getTime() - current.getTime()) / 86400000)
}

export function formatDeadline(date: string) {
  const days = calendarDaysUntil(date)
  if (days < 0) return `Atrasado há ${Math.abs(days)} dias`
  if (days === 0) return "Vence hoje"
  return `Faltam ${days} dias`
}

export function priorityRank(item: DashboardDevelopment) {
  const stage = item.stages.reduce((sum, current) => sum + current.progress, 0) / item.stages.length
  const planned = item.stages.reduce((sum, current) => sum + current.planned, 0) / item.stages.length
  const situation = calculateSituation(item.status, item.masterProgress || stage, planned, item.deliveryDate).label
  return { Atrasado: 0, "Em risco": 1, Atenção: 2, "No prazo": 3, Concluído: 4, Pausado: 5 }[situation] ?? 6
}

export function toDashboardDevelopment(item: { id: string; name: string; client: string; status: string; deliveryDate: string; masterProgress: number; data?: unknown }): DashboardDevelopment {
  const stages = normalizeStages(item.data)
  const masterProgress = item.masterProgress || Math.round(stages.reduce((sum, stage) => sum + stage.progress, 0) / stages.length)
  return { ...item, status: item.status === "finalizado" || item.status === "pausado" ? item.status : "em_andamento", masterProgress, stages }
}
