"use client"

import { useMemo, useState } from "react"
import { saveDevelopmentModulePath } from "@/app/actions/developments"
import { PersistenceStatus, usePersistenceStatus } from "@/hooks/use-persistence-status"
import {
  ChevronDown,
  FolderTree,
  BookMarked,
  Wrench,
  Plus,
  Home,
  Building,
  Link2,
  Inbox,
} from "lucide-react"
import {
  nbrNorms,
  scopeLabels,
  getChecklistItemScopes,
  checklistItemMatchesScope,
  checklistItemContextKey,
  type ChecklistItem,
  type ChecklistScope,
  type MaintenanceItem,
} from "@/lib/mock-data"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RichTextEditor } from "@/components/autoria/rich-text-editor"
import { cn } from "@/lib/utils"

const scopeIcon: Record<ChecklistScope, typeof Home> = {
  unidade: Home,
  comum: Building,
}

// Constrói a diretriz pré-preenchida a partir do item do checklist.
function buildGuideline(item: ChecklistItem, scope: ChecklistScope): string {
  if (item.guideline) return item.guideline
  const observation = scope === "unidade" ? item.obsProprietario : item.obsSindico
  return `<h2>${item.item}</h2><p>${
    observation && observation !== "—"
      ? observation
      : "Descreva as especificações técnicas deste sistema para este contexto."
  }</p>`
}

export function SistemasConstrutivos({
  items,
  disabled,
  scope,
  developmentId,
  manual,
}: {
  items: ChecklistItem[]
  disabled?: boolean
  scope?: ChecklistScope
  developmentId?: string
  manual?: "proprietario" | "sindico"
}) {
  const scopedItems = useMemo(() => scope ? items.filter((item) => checklistItemMatchesScope(item, scope)) : items, [items, scope])
  const [openScope, setOpenScope] = useState<Record<ChecklistScope, boolean>>({
    unidade: true,
    comum: true,
  })
  const [activeId, setActiveId] = useState<string | null>(scopedItems[0]?.id ?? null)
  const [contents, setContents] = useState<Record<string, string>>({})
  const save = async (value: Record<string, string>) => {
    if (!developmentId) throw new Error("Empreendimento não identificado")
    return saveDevelopmentModulePath(developmentId, ["manuals", manual ?? "proprietario", "sistemas"], value)
  }
  const persistence = usePersistenceStatus(contents, save)

  if (scopedItems.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Inbox className="h-6 w-6" />
        </span>
        <div>
          <p className="font-medium">Nenhum sistema vinculado ainda</p>
          <p className="mx-auto mt-1 max-w-md text-pretty text-sm text-muted-foreground">
            Marque itens como <span className="text-success">Possui no empreendimento</span> ou{" "}
            <span className="text-warning-foreground">Em andamento</span> na aba{" "}
            <span className="font-medium">Checklist Inicial</span> para estruturá-los aqui.
          </p>
        </div>
      </Card>
    )
  }

  // Se o item ativo saiu da lista (mudança no checklist), realinha.
  const active = scopedItems.find((i) => i.id === activeId) ?? scopedItems[0]

  const scopes: ChecklistScope[] = scope ? [scope] : ["unidade", "comum"]
  const byScope = (targetScope: ChecklistScope) => scopedItems.filter((item) => checklistItemMatchesScope(item, targetScope))
  const activeScope = scope ?? getChecklistItemScopes(active)[0]
  const activeContextKey = checklistItemContextKey(active, activeScope)

  function updateContent(html: string) {
    setContents((prev) => ({ ...prev, [activeContextKey]: html }))
  }

  const ScopeActiveIcon = scopeIcon[activeScope]

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      {/* Painel esquerdo — árvore dinâmica filtrada pelo checklist */}
      <Card className="h-fit p-2">
        <div className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold">
          <FolderTree className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">Sistemas vinculados</span>
          <Badge
            variant="outline"
            className="gap-1 border-primary/20 bg-primary/5 font-mono text-[10px] text-primary"
          >
            <Link2 className="h-3 w-3" />
            {scopedItems.length}
          </Badge>
        </div>

        {scopes.map((scope) => {
          const list = byScope(scope)
          if (list.length === 0) return null
          const ScopeIcon = scopeIcon[scope]
          const open = openScope[scope]
          return (
            <div key={scope} className="mt-1">
              <button
                type="button"
                onClick={() => setOpenScope((p) => ({ ...p, [scope]: !p[scope] }))}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent"
              >
                <ChevronDown
                  className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !open && "-rotate-90")}
                />
                <ScopeIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{scopeLabels[scope]}</span>
                <span className="font-mono">{list.length}</span>
              </button>

              {open && (
                <ul className="mb-1 ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-3">
                  {list.map((node) => {
                    const isActive = node.id === active.id
                    return (
                      <li key={node.id}>
                        <button
                          type="button"
                          onClick={() => setActiveId(node.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                            isActive
                              ? "bg-primary/10 font-medium text-foreground"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{node.item}</span>
                          {node.status === "em_andamento" && (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
                              title="Em andamento"
                            />
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </Card>

      {/* Painel central — editor normativo com diretriz herdada */}
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              {active.item}
            </h3>
            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <ScopeActiveIcon className="h-3 w-3" />
              {scopeLabels[activeScope]}
              <span className="text-muted-foreground/50">·</span>
              {active.category}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {active.norms.map((code) => (
              <Badge
                key={code}
                variant="outline"
                className="gap-1 border-primary/30 bg-primary/5 text-xs"
                title={nbrNorms[code]}
              >
                <BookMarked className="h-3 w-3 text-primary" />
                <span className="font-mono">{code}</span>
              </Badge>
            ))}
          </div>
        </div>

        {/* Aviso de herança do checklist */}
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
          Diretriz técnica pré-preenchida a partir do Checklist Inicial. Expanda e formate abaixo.
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Descrição técnica
          </p>
          <RichTextEditor
            key={activeContextKey}
            value={contents[activeContextKey] ?? buildGuideline(active, activeScope)}
            onChange={updateContent}
            disabled={disabled}
          />
          <div className="mt-2 flex justify-end"><PersistenceStatus state={persistence.state} savedAt={persistence.savedAt} error={persistence.error} onRetry={() => void persistence.persist()} /></div>
        </div>

        {active.maintenance && active.maintenance.length > 0 && (
          <MaintenanceTable key={active.id} items={active.maintenance} disabled={disabled} />
        )}

        {active.norms.length > 0 && <NormsReference norms={active.norms} />}
      </div>
    </div>
  )
}

function MaintenanceTable({ items, disabled }: { items: MaintenanceItem[]; disabled?: boolean }) {
  const [rows, setRows] = useState<MaintenanceItem[]>(items)

  function addRow() {
    setRows((prev) => [...prev, { task: "", frequency: "", responsible: "Proprietário" }])
  }

  function update(i: number, patch: Partial<MaintenanceItem>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Wrench className="h-3.5 w-3.5" />
          Manutenção preventiva
        </p>
        {!disabled && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" />
            Linha
          </Button>
        )}
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-medium">Atividade</th>
              <th className="w-32 px-3 py-2 font-medium">Frequência</th>
              <th className="w-44 px-3 py-2 font-medium">Responsável</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-border">
                <td className="p-0">
                  <input
                    value={row.task}
                    disabled={disabled}
                    onChange={(e) => update(i, { task: e.target.value })}
                    placeholder="Descrição da atividade"
                    className="w-full bg-transparent px-3 py-2 outline-none focus:bg-primary/5 disabled:opacity-70"
                  />
                </td>
                <td className="p-0">
                  <input
                    value={row.frequency}
                    disabled={disabled}
                    onChange={(e) => update(i, { frequency: e.target.value })}
                    placeholder="Ex.: Anual"
                    className="w-full bg-transparent px-3 py-2 outline-none focus:bg-primary/5 disabled:opacity-70"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex gap-1">
                    {(["Proprietário", "Síndico"] as const).map((resp) => {
                      const RespIcon = resp === "Proprietário" ? Home : Building
                      const isActive = row.responsible === resp
                      return (
                        <button
                          key={resp}
                          type="button"
                          disabled={disabled}
                          onClick={() => update(i, { responsible: resp })}
                          className={cn(
                            "flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:opacity-70",
                            isActive
                              ? resp === "Proprietário"
                                ? "bg-primary/15 text-primary"
                                : "bg-accent-foreground/10 text-foreground"
                              : "text-muted-foreground hover:bg-accent",
                          )}
                        >
                          <RespIcon className="h-3 w-3" />
                          {resp}
                        </button>
                      )
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NormsReference({ norms }: { norms: string[] }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <BookMarked className="h-3.5 w-3.5" />
        Normas técnicas aplicáveis
      </p>
      <ul className="flex flex-col gap-1.5">
        {norms.map((code) => (
          <li key={code} className="flex items-baseline gap-2 text-sm">
            <span className="shrink-0 font-mono text-xs text-primary">{code}</span>
            <span className="text-muted-foreground">{nbrNorms[code] ?? "Norma técnica"}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
