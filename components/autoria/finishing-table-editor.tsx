"use client"

import { useEffect, useState } from "react"
import { Plus, Search, Trash2 } from "lucide-react"
import type { FinishingGroup, FinishingTableData } from "@/lib/finishing-types"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { finishingFieldLabels, finishingGroups, newFinishingRow, normalizeFinishing } from "./finishing-ui"

export function FinishingTableEditor({ data, group, environment, readOnly, locked, sourceLocked = false, onGroup, onChange, onRemove }: {
  data: FinishingTableData; group: FinishingGroup; environment: string; readOnly: boolean; locked: boolean; sourceLocked?: boolean
  onGroup: (group: FinishingGroup) => void; onChange: (update: (data: FinishingTableData) => FinishingTableData) => void
  onRemove: (group: FinishingGroup, rowId: string, environment: string) => void
}) {
  const [query, setQuery] = useState(environment)
  useEffect(() => { setQuery(environment) }, [group, environment])
  const config = finishingGroups.find(item => item.id === group)!
  const editingLocked = locked || sourceLocked
  const rows = data[group].filter(row => !query.trim() || Object.entries(row).some(([key, value]) => key !== "id" && normalizeFinishing(value).includes(normalizeFinishing(query))))
  return <Card className="gap-0 overflow-hidden">
    <div className="flex flex-wrap gap-1 border-b border-border p-2" aria-label="Grupos de acabamento">{finishingGroups.map(item => <button key={item.id} type="button" aria-pressed={group === item.id} disabled={locked} onClick={() => onGroup(item.id)} className={cn("rounded-md px-3 py-2 text-xs font-medium hover:bg-muted", group === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground")}>{item.label}<span className="ml-2 text-[10px]">{data[item.id].length}</span></button>)}</div>
    <div className="space-y-3 border-b border-border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h5 className="text-sm font-semibold">{config.label}</h5><p className="mt-1 text-xs text-muted-foreground">{config.description}</p></div>{!readOnly && <Button size="sm" disabled={editingLocked} onClick={() => onChange(current => ({ ...current, [group]: [...current[group], newFinishingRow(config)] }))}><Plus className="h-3.5 w-3.5" />{group === "ambientes" ? "Adicionar ambiente" : "Adicionar item"}</Button>}</div><div className="relative max-w-sm"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-8" aria-label="Buscar itens da tabela" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar ambiente ou acabamento…" /></div></div>
    {rows.length ? <div className="overflow-x-auto"><table className="w-full text-xs"><caption className="sr-only">{config.label}</caption><thead className="bg-muted/30"><tr>{config.columns.map(field => <th key={field} scope="col" className="min-w-44 px-3 py-3 text-left font-semibold">{finishingFieldLabels[field]}{config.required.includes(field) && <span className="ml-1 text-destructive">*</span>}</th>)}{!readOnly && <th scope="col"><span className="sr-only">Excluir</span></th>}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id} className="border-t border-border">{config.columns.map(field => <td key={field} className="p-2 align-top">{readOnly ? <span className="block whitespace-pre-wrap p-1">{row[field] || "—"}</span> : <Textarea aria-label={finishingFieldLabels[field] + " da linha " + (index + 1)} rows={2} value={row[field] ?? ""} disabled={editingLocked} onChange={event => onChange(current => ({ ...current, [group]: current[group].map(item => item.id === row.id ? { ...item, [field]: event.target.value } : item) }))} className={cn("min-h-16 resize-y text-xs", config.required.includes(field) && !row[field]?.trim() && "border-warning/60")} />}</td>)}{!readOnly && <td className="p-2 align-top"><Button variant="ghost" size="icon-sm" disabled={editingLocked} aria-label={group === "ambientes" ? "Excluir ambiente " + (row.ambiente || index + 1) : "Excluir item " + (index + 1)} onClick={() => onRemove(group, row.id, row.ambiente ?? "")}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>}</tr>)}</tbody></table></div> : <div className="space-y-2 p-8 text-center"><p className="text-sm font-medium">{query ? "Nenhum item encontrado." : "Nenhum " + (group === "ambientes" ? "ambiente" : "item") + " cadastrado nesta seção."}</p><p className="text-xs text-muted-foreground">{query ? "Ajuste a busca para ver outros registros." : readOnly ? "Selecione outro grupo para conferir os dados." : "Use o botão Adicionar para começar o preenchimento."}</p></div>}
  </Card>
}
