export type WorkflowRole = "admin_dg" | "editor" | "revisor" | "cliente"
export type WorkflowState = "rascunho" | "em_revisao" | "ajustes_solicitados" | "aprovado"

export type WorkflowTransition = {
  from: WorkflowState
  to: WorkflowState
  label: string
  requiresComment?: boolean
}

export const workflowTransitions: WorkflowTransition[] = [
  { from: "rascunho", to: "em_revisao", label: "Enviar para revisão" },
  { from: "ajustes_solicitados", to: "em_revisao", label: "Enviar para revisão" },
  { from: "em_revisao", to: "ajustes_solicitados", label: "Solicitar ajustes", requiresComment: true },
  { from: "em_revisao", to: "aprovado", label: "Aprovar" },
  { from: "aprovado", to: "rascunho", label: "Reabrir", requiresComment: true },
]

export function canTransition(role: WorkflowRole, from: WorkflowState, to: WorkflowState) {
  const transition = workflowTransitions.find((item) => item.from === from && item.to === to)
  if (!transition) return false
  if (to === "aprovado" || to === "ajustes_solicitados") return role === "revisor" || role === "admin_dg"
  if (to === "em_revisao") return role === "editor" || role === "admin_dg"
  if (to === "rascunho") return role === "admin_dg" || role === "revisor"
  return false
}

export function transitionFor(from: WorkflowState, to: WorkflowState) {
  return workflowTransitions.find((item) => item.from === from && item.to === to)
}

export const roleLabels: Record<WorkflowRole, string> = {
  admin_dg: "Admin DG",
  editor: "Editor",
  revisor: "Revisor",
  cliente: "Cliente",
}

export const workflowStateLabels: Record<WorkflowState, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  ajustes_solicitados: "Ajustes solicitados",
  aprovado: "Aprovado",
}

type HtmlSanitizer = { sanitize: (value: string) => string }

export function sanitizeHtml(html: string) {
  const fallback = () => html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
  if (typeof window === "undefined") return fallback()

  // O pacote pode chegar ao bundle como namespace ESM, default export ou factory.
  // Normalizamos os três formatos para evitar falha durante a hidratação do editor.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const imported = require("dompurify") as
    | HtmlSanitizer
    | ((targetWindow: Window) => HtmlSanitizer)
    | { default?: HtmlSanitizer | ((targetWindow: Window) => HtmlSanitizer) }

  const candidate =
    typeof imported === "object" && imported !== null && "default" in imported && imported.default
      ? imported.default
      : imported

  if (typeof candidate === "object" && candidate !== null && "sanitize" in candidate) {
    return (candidate as HtmlSanitizer).sanitize(html)
  }

  if (typeof candidate === "function") {
    const instance = candidate(window)
    if (instance && typeof instance.sanitize === "function") return instance.sanitize(html)
  }

  return fallback()
}

export const supportedVariables = ["{{nome_cliente}}", "{{construtora}}", "{{unidade}}", "{{data_entrega}}", "{{responsavel_tecnico}}"] as const

export function validateVariables(html: string, values: Partial<Record<(typeof supportedVariables)[number], string>>) {
  const variables = html.match(/\{\{[^}]+\}\}/g) ?? []
  const unknown = variables.filter((variable) => !supportedVariables.includes(variable as never))
  const empty = variables.filter((variable) => supportedVariables.includes(variable as never) && !values[variable as keyof typeof values])
  return { unknown, empty }
}

export type AuditEntry = { id: string; user: string; action: string; state: WorkflowState; timestamp: string; reason?: string }
export type SectionComment = { id: string; author: string; text: string; timestamp: string; resolved: boolean }
export type TextVersion = { id: string; html: string; author: string; timestamp: string; revision: string }

export function createAuditEntry(user: string, action: string, state: WorkflowState, reason?: string): AuditEntry {
  return { id: `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`, user, action, state, timestamp: new Date().toISOString(), reason }
}

export function diffText(previous: string, current: string) {
  const before = previous.replace(/<[^>]+>/g, "").trim().split(/\s+/)
  const after = current.replace(/<[^>]+>/g, "").trim().split(/\s+/)
  return after.map((word, index) => word === before[index] ? { value: word, type: "same" as const } : { value: word, type: "added" as const })
}

type ContentEvent = { event: string; user: string; tab: string; timestamp: string; read: boolean }
let notifications: ContentEvent[] = []
export function addNotification(event: Omit<ContentEvent, "timestamp" | "read">) { notifications = [{ ...event, timestamp: new Date().toISOString(), read: false }, ...notifications] }
export function getNotifications() { return notifications }
export function markNotificationRead(index: number) { notifications = notifications.map((item, i) => i === index ? { ...item, read: true } : item) }
export function unreadNotificationCount() { return notifications.filter((item) => !item.read).length }
