import { checklistItems, checklistItemContextKey, checklistItemMatchesScope, getChecklistItemScopes, type ChecklistItem, type ChecklistScope, type MaintenanceItem, type ManualType } from "@/lib/mock-data"

export const optionalManualSectionIds = ["meio-ambiente", "uso-racional-agua", "telefones-uteis", "glossario"] as const
export type ManualEditorialSettings = {
  sections?: Record<string, { html?: string; status?: string; enabled?: boolean }>
  warranties?: Record<string, string>[]
  attachments?: Record<string, "include" | "reference" | "exclude">
  systemOrder?: string[]
}
export type ManualContent = {
  sistemas?: Record<string, string>
  manutencao?: Record<string, MaintenanceItem[]>
  workflow?: { statuses?: Record<string, string> }
  comissionamento?: Record<string, { company?: string; phone?: string; site?: string; instructions?: string }>
  editorial?: ManualEditorialSettings
}

export type ManualContentValidation = { contextKey: string; section: string; status: string; comment?: string | null }

export function manualValidationStatus(validations: ManualContentValidation[], contextKey: string, section: string): "rascunho" | "aguardando_validacao" | "aprovado" | "reprovado" {
  const status = validations.find(row => row.contextKey === contextKey && row.section === section)?.status
  return status === "aprovado" || status === "aguardando_validacao" || status === "reprovado" ? status : "rascunho"
}

export function manualScope(manual: ManualType): ChecklistScope {
  return manual === "proprietario" ? "unidade" : "comum"
}

/** Shared commissioning source selection for composition, review and readiness. */
export function selectManualCommissioning(data: Record<string, unknown>, manual: ManualType): Record<string, unknown> {
  const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const authoring = object(data.authoring)
  const content = object(object(data.manuals)[manual])
  return object(authoring.comissionamento ?? content.comissionamento)
}

export function systemGuideline(item: ChecklistItem, scope: ChecklistScope): string {
  if (item.guideline && getChecklistItemScopes(item).length === 1) return item.guideline
  const observation = scope === "unidade" ? item.obsProprietario : item.obsSindico
  return `<h2>${item.item}</h2><p>${observation && observation !== "—" ? observation : "Descreva as especificações técnicas deste sistema para este contexto."}</p>`
}

export function selectManualSystems(data: Record<string, unknown>, manual: ManualType, validations: ManualContentValidation[] = []) {
  const scope = manualScope(manual)
  const checklist = Array.isArray(data.checklist) ? data.checklist as ChecklistItem[] : checklistItems
  const content = (data.manuals as Partial<Record<ManualType, ManualContent>> | undefined)?.[manual] ?? {}
  const selected = Array.from(new Map(checklist.filter((item) => item.status === "possui" && checklistItemMatchesScope(item, scope)).map(item => [item.id, item])).values())
  return selected.map((item) => {
    const key = checklistItemContextKey(item, scope)
    const legacySafe = getChecklistItemScopes(item).length === 1
    return {
      item, key,
      // Legacy content may migrate within its original single scope. Template
      // suggestions are editor input, never approved publication content.
      html: content.sistemas?.[key] ?? (legacySafe ? content.sistemas?.[item.id] : undefined) ?? "",
      maintenance: content.manutencao?.[key] ?? (legacySafe ? content.manutencao?.[item.id] : undefined) ?? [],
      descriptionStatus: manualValidationStatus(validations, key, "sistemas"),
      maintenanceStatus: manualValidationStatus(validations, key, "manutencao"),
    }
  })
}

export function htmlToLines(html: string): string[] {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?(?:p|h[1-6]|li|tr|div|ul|ol)\b[^>]*>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => { const point = code[0].toLowerCase() === "x" ? Number.parseInt(code.slice(1), 16) : Number(code); return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "" })
    .split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}
