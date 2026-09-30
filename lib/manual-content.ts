import { checklistItems, checklistItemContextKey, checklistItemMatchesScope, getChecklistItemScopes, type ChecklistItem, type ChecklistScope, type MaintenanceItem, type ManualType } from "@/lib/mock-data"

export type ManualContent = {
  sistemas?: Record<string, string>
  manutencao?: Record<string, MaintenanceItem[]>
  workflow?: { statuses?: Record<string, string> }
}

export function manualScope(manual: ManualType): ChecklistScope {
  return manual === "proprietario" ? "unidade" : "comum"
}

export function systemGuideline(item: ChecklistItem, scope: ChecklistScope): string {
  if (item.guideline && getChecklistItemScopes(item).length === 1) return item.guideline
  const observation = scope === "unidade" ? item.obsProprietario : item.obsSindico
  return `<h2>${item.item}</h2><p>${observation && observation !== "—" ? observation : "Descreva as especificações técnicas deste sistema para este contexto."}</p>`
}

export function selectManualSystems(data: Record<string, unknown>, manual: ManualType) {
  const scope = manualScope(manual)
  const checklist = Array.isArray(data.checklist) ? data.checklist as ChecklistItem[] : checklistItems
  const content = (data.manuals as Partial<Record<ManualType, ManualContent>> | undefined)?.[manual] ?? {}
  return checklist.filter((item) => item.status === "possui" && checklistItemMatchesScope(item, scope)).map((item) => {
    const key = checklistItemContextKey(item, scope)
    return {
      item, key,
      html: content.sistemas?.[key] ?? content.sistemas?.[item.id] ?? systemGuideline(item, scope),
      maintenance: content.manutencao?.[key] ?? (item.maintenance ?? []).map((row) => ({ ...row, responsible: scope === "unidade" ? "Proprietário" as const : "Síndico" as const })),
    }
  })
}

export function htmlToLines(html: string): string[] {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?(?:p|h[1-6]|li|tr|div|ul|ol)\b[^>]*>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}
