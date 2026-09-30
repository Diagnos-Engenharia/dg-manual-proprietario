"use client"

import { useMemo } from "react"
import { Link2, Home, Building, ChevronDown } from "lucide-react"
import {
  checklistStatusLabels,
  scopeLabels,
  getChecklistItemScopes,
  checklistItemMatchesScope,
  type ChecklistItem,
  type ChecklistStatus,
  type ChecklistScope,
} from "@/lib/mock-data"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const statusOrder: ChecklistStatus[] = ["possui", "em_andamento", "nao_aplicado", "nao_especificado"]

const statusStyles: Record<ChecklistStatus, string> = {
  possui: "bg-success/10 text-success border-success/30",
  em_andamento: "bg-warning/10 text-warning-foreground border-warning/30",
  nao_aplicado: "bg-muted text-muted-foreground border-border",
  nao_especificado: "bg-muted text-muted-foreground border-border",
}

const scopeIcon: Record<ChecklistScope, typeof Home> = {
  unidade: Home,
  comum: Building,
}

export function ChecklistInicial({
  items,
  onChangeStatus,
  onChangeScopes,
  disabled,
  scope,
}: {
  items: ChecklistItem[]
  onChangeStatus: (id: string, status: ChecklistStatus) => void
  onChangeScopes?: (id: string, scopes: ChecklistScope[]) => void
  disabled?: boolean
  scope?: ChecklistScope
}) {
  const scopedItems = scope ? items.filter((item) => checklistItemMatchesScope(item, scope)) : items
  // Agrupa por categoria preservando a ordem de aparição dos itens.
  const grouped = useMemo(() => {
    const map = new Map<string, ChecklistItem[]>()
    for (const it of scopedItems) {
      const list = map.get(it.category) ?? []
      list.push(it)
      map.set(it.category, list)
    }
    return [...map.entries()]
  }, [scopedItems])

  const linkedCount = scopedItems.filter(
    (i) => i.status === "possui" || i.status === "em_andamento",
  ).length

  return (
    <div className="flex flex-col gap-4">
      {/* Banner de sincronização automática */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Link2 className="h-4 w-4" />
        </span>
        <div className="min-w-0 text-sm">
          <p className="text-pretty leading-relaxed text-foreground">
            Os itens marcados como{" "}
            <span className="font-medium text-success">Possui no empreendimento</span> são
            automaticamente vinculados e estruturados na aba{" "}
            <span className="font-medium">Sistemas Construtivos</span> para elaboração textual.
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {linkedCount} {linkedCount === 1 ? "item vinculado" : "itens vinculados"}
          </p>
        </div>
      </div>

      {grouped.map(([category, catItems]) => (
        <Card key={category} className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{category}</h3>
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {catItems.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Sistema / Item</th>
                  <th className="w-44 px-3 py-2 font-medium">Status</th>

                </tr>
              </thead>
              <tbody>
                {catItems.map((it) => {
                  const itemScopes = getChecklistItemScopes(it)
                  const primaryScope = scope && itemScopes.includes(scope) ? scope : itemScopes[0]
                  const ScopeIcon = scopeIcon[primaryScope]

                  function toggleScope(target: ChecklistScope) {
                    if (!onChangeScopes || disabled) return
                    const next = itemScopes.includes(target)
                      ? itemScopes.filter((value) => value !== target)
                      : [...itemScopes, target]
                    if (next.length === 0) return
                    onChangeScopes(it.id, next)
                  }

                  return (
                    <tr key={it.id} className="border-b border-border last:border-0 align-top">
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium leading-tight">{it.item}</span>
                          <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                            <ScopeIcon className="h-3 w-3" />
                            {itemScopes.map((itemScope) => (
                              <button
                                key={itemScope}
                                type="button"
                                disabled={!onChangeScopes || disabled}
                                onClick={() => toggleScope(itemScope)}
                                className="rounded border border-border bg-muted/40 px-1.5 py-0.5 disabled:cursor-default"
                                title={onChangeScopes && !disabled ? "Clique para remover este escopo" : undefined}
                              >
                                {scopeLabels[itemScope]}
                              </button>
                            ))}
                            {onChangeScopes && !disabled && itemScopes.length === 1 && (
                              <button
                                type="button"
                                onClick={() => toggleScope(itemScopes[0] === "unidade" ? "comum" : "unidade")}
                                className="rounded border border-dashed border-primary/40 px-1.5 py-0.5 text-primary"
                              >
                                + {itemScopes[0] === "unidade" ? "Área comum" : "Unidade privativa"}
                              </button>
                            )}
                          </span>
                          {it.norms.length > 0 && (
                            <span className="mt-0.5 flex flex-wrap gap-1">
                              {it.norms.map((n) => (
                                <Badge
                                  key={n}
                                  variant="outline"
                                  className="border-primary/20 bg-primary/5 px-1.5 py-0 font-mono text-[10px] text-primary"
                                >
                                  {n}
                                </Badge>
                              ))}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="relative">
                          <select
                            value={it.status}
                            disabled={disabled}
                            onChange={(e) =>
                              onChangeStatus(it.id, e.target.value as ChecklistStatus)
                            }
                            className={cn(
                              "w-full cursor-pointer appearance-none rounded-md border px-2.5 py-1.5 pr-7 text-xs font-medium outline-none transition-colors focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-70",
                              statusStyles[it.status],
                            )}
                          >
                            {statusOrder.map((s) => (
                              <option key={s} value={s} className="bg-card text-foreground">
                                {checklistStatusLabels[s]}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-70" />
                        </div>
                      </td>

                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  )
}
