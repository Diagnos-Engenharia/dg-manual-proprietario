import type { ProjectStatus } from "@/lib/mock-data"

export const DASHBOARD_STAGES = ["Ficha Técnica", "Checklist Inicial", "Manual do Proprietário", "Manual do Síndico"] as const
export type DashboardStage = typeof DASHBOARD_STAGES[number]

export type DashboardDevelopment = {
  id: string
  name: string
  client: string
  status: ProjectStatus
  deliveryDate: string
  masterProgress: number
  data: Record<string, unknown>
  responsible?: string
}

export function stageProgress(data: Record<string, unknown>, index: number) {
  const progress = data.stageProgress
  if (Array.isArray(progress) && typeof progress[index] === "number") return Math.max(0, Math.min(100, progress[index] as number))
  if (typeof data.masterProgress === "number") return Math.max(0, Math.min(100, data.masterProgress))
  return index === 0 && data.ficha ? 100 : 0
}

export function expectedProgress(deliveryDate: string, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth() - 6, 1).getTime()
  const end = new Date(`${deliveryDate}T23:59:59`).getTime()
  if (end <= start) return 100
  return Math.round(Math.max(0, Math.min(100, ((now.getTime() - start) / (end - start)) * 100)))
}

export function situation(progress: number, expected: number, deliveryDate: string, status: ProjectStatus) {
  if (status === "pausado") return { label: "Pausado", tone: "muted" as const }
  if (progress >= 100 || status === "finalizado") return { label: "Concluído", tone: "success" as const }
  const overdue = new Date(`${deliveryDate}T23:59:59`).getTime() < Date.now()
  if (overdue) return { label: "Atrasado", tone: "critical" as const }
  const deviation = progress - expected
  if (deviation < -10) return { label: "Em risco", tone: "critical" as const }
  if (deviation < -5) return { label: "Atenção", tone: "warning" as const }
  return { label: "No prazo", tone: "success" as const }
}

export function daysUntil(date: string) {
  return Math.ceil((new Date(`${date}T23:59:59`).getTime() - Date.now()) / 86400000)
}

export function dashboardStages(data: Record<string, unknown>) {
  return DASHBOARD_STAGES.map((name, index) => ({ name, progress: stageProgress(data, index), scheduledDate: typeof data.stageDates === "object" && data.stageDates && name in data.stageDates ? String((data.stageDates as Record<string, unknown>)[name]) : undefined, pending: 0 }))
}

export function priorityScore(row: DashboardDevelopment) {
  const expected = expectedProgress(row.deliveryDate)
  const situationData = situation(row.masterProgress, expected, row.deliveryDate, row.status)
  return situationData.tone === "critical" ? 0 : situationData.tone === "warning" ? 1 : situationData.tone === "muted" ? 3 : 2
}

export function normalizeDashboardRow(row: { id: string; name: string; client: string; status: string; deliveryDate: string; masterProgress: number; data: unknown }): DashboardDevelopment {
  return { id: row.id, name: row.name, client: row.client, status: row.status === "finalizado" || row.status === "pausado" ? row.status : "em_andamento", deliveryDate: row.deliveryDate, masterProgress: row.masterProgress, data: row.data && typeof row.data === "object" ? row.data as Record<string, unknown> : {} }
}

export function formatDays(days: number) {
  if (days < 0) return `Atrasado há ${Math.abs(days)} dias`
  if (days === 0) return "Vence hoje"
  return `Faltam ${days} dias`
}

export const STATUS_TONES = {
  critical: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300",
  warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300",
  muted: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
} as const

export type StatusTone = keyof typeof STATUS_TONES

export function monthLabel(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${date}T12:00:00`))
}

export function buildPriorities(rows: DashboardDevelopment[]) {
  return rows.flatMap((row) => {
    const expected = expectedProgress(row.deliveryDate)
    const current = situation(row.masterProgress, expected, row.deliveryDate, row.status)
    if (current.tone === "success") return []
    return [{ id: `${row.id}-progress`, title: row.masterProgress < expected ? "Revisar avanço abaixo do previsto" : "Confirmar próxima etapa", development: row.name, stage: dashboardStages(row.data).find((stage) => stage.progress < 100)?.name ?? "Manual", responsible: row.responsible ?? "Sem responsável", detail: formatDays(daysUntil(row.deliveryDate)), tone: current.tone }]
  })
}

export function buildDeliveries(rows: DashboardDevelopment[]) {
  return [...rows].sort((a, b) => new Date(a.deliveryDate).getTime() - new Date(b.deliveryDate).getTime()).slice(0, 8).map((row) => ({ ...row, days: daysUntil(row.deliveryDate), detail: formatDays(daysUntil(row.deliveryDate)) }))
}

export function buildStageSummary(rows: DashboardDevelopment[]) {
  return DASHBOARD_STAGES.map((name, index) => ({ name, pending: rows.reduce((count, row) => count + (stageProgress(row.data, index) < 100 ? 1 : 0), 0), delayed: rows.reduce((count, row) => count + (stageProgress(row.data, index) < expectedProgress(row.deliveryDate) ? 1 : 0), 0) }))
}

export function compareRows(rows: DashboardDevelopment[], sort: "priority" | "deadline" | "progress" | "client" | "risk" | "name") {
  return [...rows].sort((a, b) => sort === "deadline" ? new Date(a.deliveryDate).getTime() - new Date(b.deliveryDate).getTime() : sort === "progress" ? a.masterProgress - b.masterProgress : sort === "client" ? a.client.localeCompare(b.client) : sort === "name" ? a.name.localeCompare(b.name) : sort === "risk" ? priorityScore(a) - priorityScore(b) : priorityScore(a) - priorityScore(b))
}

export function filteredRows(rows: DashboardDevelopment[], query: string, client: string, status: string, responsible: string, risk: string) {
  const term = query.trim().toLowerCase()
  return rows.filter((row) => {
    const haystack = `${row.name} ${row.client} ${row.responsible ?? ""} ${JSON.stringify(row.data)}`.toLowerCase()
    const expected = expectedProgress(row.deliveryDate)
    const current = situation(row.masterProgress, expected, row.deliveryDate, row.status)
    return (!term || haystack.includes(term)) && (!client || row.client === client) && (!status || row.status === status) && (!responsible || (row.responsible ?? "Sem responsável") === responsible) && (!risk || current.label === risk)
  })
}

export function kpiSummary(rows: DashboardDevelopment[]) {
  const currentMonth = new Date().getMonth()
  return { inProgress: rows.filter((row) => row.status === "em_andamento").length, atRisk: rows.filter((row) => ["Em risco", "Atrasado"].includes(situation(row.masterProgress, expectedProgress(row.deliveryDate), row.deliveryDate, row.status).label)).length, next30: rows.filter((row) => daysUntil(row.deliveryDate) >= 0 && daysUntil(row.deliveryDate) <= 30).length, critical: buildPriorities(rows).filter((item) => item.tone === "critical").length, completed: rows.filter((row) => row.status === "finalizado" && new Date(row.deliveryDate).getMonth() === currentMonth).length }
}

export function progressDeviation(row: DashboardDevelopment) { return row.masterProgress - expectedProgress(row.deliveryDate) }

export function responsibleOptions(rows: DashboardDevelopment[]) { return Array.from(new Set(rows.map((row) => row.responsible ?? "Sem responsável"))).sort() }

export function clientOptions(rows: DashboardDevelopment[]) { return Array.from(new Set(rows.map((row) => row.client))).sort() }

export function statusOptions(rows: DashboardDevelopment[]) { return Array.from(new Set(rows.map((row) => row.status))).sort() }

export function riskOptions(rows: DashboardDevelopment[]) { return ["No prazo", "Atenção", "Em risco", "Atrasado", "Pausado", "Concluído"].filter((risk) => rows.some((row) => situation(row.masterProgress, expectedProgress(row.deliveryDate), row.deliveryDate, row.status).label === risk)) }

export function isCritical(row: DashboardDevelopment) { return ["Em risco", "Atrasado"].includes(situation(row.masterProgress, expectedProgress(row.deliveryDate), row.deliveryDate, row.status).label) }

export function stageWeight(index: number) { return index < 4 ? 25 : 0 }

export function weightedProgress(values: number[]) { const applicable = values.filter((value) => Number.isFinite(value)); return applicable.length ? Math.round(applicable.reduce((sum, value) => sum + value, 0) / applicable.length) : 0 }

export function safeProgress(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : 0 }

export function isOverdue(date: string) { return daysUntil(date) < 0 }

export function isDueSoon(date: string, days = 30) { const value = daysUntil(date); return value >= 0 && value <= days }

export function stageLabel(index: number) { return DASHBOARD_STAGES[index] ?? "Etapa" }

export function statusLabel(status: ProjectStatus) { return status === "em_andamento" ? "Em andamento" : status === "finalizado" ? "Concluído" : "Pausado" }

export function dashboardDate(date: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(`${date}T12:00:00`)) }

export function dashboardPercent(value: number) { return `${safeProgress(value)}%` }

export function trendLabel(value: number) { return value > 0 ? `+${value} p.p. vs. período anterior` : `${value} p.p. vs. período anterior` }

export function riskRank(label: string) { const ranks: Record<string, number> = { Atrasado: 0, "Em risco": 1, Atenção: 2, "No prazo": 3, Pausado: 4, Concluído: 5 }; return ranks[label] ?? 6 }

export function sortByPriority(rows: DashboardDevelopment[]) { return [...rows].sort((a, b) => riskRank(situation(a.masterProgress, expectedProgress(a.deliveryDate), a.deliveryDate, a.status).label) - riskRank(situation(b.masterProgress, expectedProgress(b.deliveryDate), b.deliveryDate, b.status).label)) }

export function plannedRealized(rows: DashboardDevelopment[]) { return rows.map((row) => ({ name: row.name, planned: expectedProgress(row.deliveryDate), realized: row.masterProgress, deviation: progressDeviation(row) })) }

export function notificationCount(rows: DashboardDevelopment[]) { return buildPriorities(rows).length }

export function notificationLabel(row: DashboardDevelopment) { return situation(row.masterProgress, expectedProgress(row.deliveryDate), row.deliveryDate, row.status).label }

export function searchFields(row: DashboardDevelopment) { return [row.name, row.client, row.responsible ?? "Sem responsável", JSON.stringify(row.data)].join(" ") }

export function dashboardEmptyMessage(rows: DashboardDevelopment[]) { return rows.length ? "Nenhum empreendimento corresponde aos filtros." : "Nenhum empreendimento cadastrado ainda." }

export function deliveryGroup(days: number) { return days < 0 ? "Atrasadas" : days === 0 ? "Hoje" : days <= 7 ? "Próximos 7 dias" : "Próximos 30 dias" }

export function stageStatus(progress: number, expected: number) { return progress >= 100 ? "Concluída" : progress < expected ? "Atrasada" : "Em andamento" }

export function stageActionUrl(id: string, index: number) { return `/empreendimentos/${id}?modulo=${index === 0 ? "cronograma" : index === 1 ? "identidade" : index === 2 ? "elaboracao" : index === 3 ? "databook" : "emissao"}` }

export function dashboardSearchText(row: DashboardDevelopment) { return `${row.name} ${row.client} ${row.responsible ?? ""}`.toLowerCase() }

export function dataSourceLabel() { return "Neon" }

export function isSeedRow(id: string) { return id.startsWith("emp-") }

export function filterableRows(rows: DashboardDevelopment[]) { return rows }

export function dashboardVersion() { return "operational-v1" }

export function fixedStageCount() { return DASHBOARD_STAGES.length }

export function defaultResponsible() { return "Sem responsável" }

export function defaultRisk() { return "No prazo" }

export function defaultSort() { return "priority" as const }

export function dashboardPeriodDays() { return 30 }

export function stageWeights() { return [25, 25, 25, 25] }

export function noOpFallback() { return false }
