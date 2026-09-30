"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, FlaskConical } from "lucide-react"
import {
  checklistItemMatchesScope,
  linkedSystemItems,
  type ChecklistItem,
  type ChecklistScope,
  type ChecklistStatus,
  type ManualType,
} from "@/lib/mock-data"
import { ManualSwitcher } from "@/components/autoria/manual-switcher"
import { ChecklistInicial } from "@/components/autoria/checklist-inicial"
import { SistemasConstrutivos } from "@/components/autoria/sistemas-construtivos"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"

const initialItems: ChecklistItem[] = [
  {
    id: "preview-esquadria-aluminio",
    category: "Sistema de Esquadrias",
    item: "Esquadria / Caixilho em alumínio",
    scope: "unidade",
    scopes: ["unidade", "comum"],
    status: "possui",
    obsProprietario: "Especificar as esquadrias instaladas nas unidades privativas.",
    obsSindico: "Especificar as esquadrias instaladas nas áreas comuns da edificação.",
    norms: ["NBR 10821", "NBR 7199"],
  },
  {
    id: "preview-porta-pronta",
    category: "Sistema de Esquadrias",
    item: "Porta pronta da unidade",
    scope: "unidade",
    scopes: ["unidade"],
    status: "possui",
    obsProprietario: "Descrever portas internas e de acesso às unidades.",
    obsSindico: "",
    norms: ["NBR 10821"],
  },
  {
    id: "preview-porta-corta-fogo",
    category: "Sistema de Prevenção e Combate a Incêndio",
    item: "Porta corta-fogo",
    scope: "comum",
    scopes: ["comum"],
    status: "possui",
    obsProprietario: "",
    obsSindico: "Descrever portas corta-fogo, inspeções e manutenção.",
    norms: ["NBR 11742"],
  },
  {
    id: "preview-pintura",
    category: "Sistema de Vedação",
    item: "Pintura",
    scope: "unidade",
    scopes: ["unidade", "comum"],
    status: "possui",
    obsProprietario: "Orientações de uso e conservação da pintura interna da unidade.",
    obsSindico: "Orientações para fachadas, halls e demais áreas comuns pintadas.",
    norms: ["NBR 15575-4"],
  },
]

export function ChecklistDualScopePreview() {
  const [manual, setManual] = useState<ManualType>("proprietario")
  const [items, setItems] = useState<ChecklistItem[]>(initialItems)
  const scope: ChecklistScope = manual === "proprietario" ? "unidade" : "comum"

  const scopedItems = useMemo(
    () => items.filter((item) => checklistItemMatchesScope(item, scope)),
    [items, scope],
  )
  const linked = useMemo(() => linkedSystemItems(scopedItems), [scopedItems])

  function setStatus(id: string, status: ChecklistStatus) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, status } : item))
  }

  function setScopes(id: string, scopes: ChecklistScope[]) {
    if (scopes.length === 0) return
    setItems((current) => current.map((item) => item.id === id ? { ...item, scopes } : item))
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Card className="border-primary/30 bg-primary/5 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <FlaskConical className="h-5 w-5" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold">Ambiente de teste — PR #1</h1>
                  <Badge variant="outline">Checklist por escopo</Badge>
                </div>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Ambiente isolado do banco de produção. Use os dois manuais para conferir quais itens aparecem em cada escopo e como itens compartilhados são separados na elaboração.
                </p>
              </div>
            </div>
            <Badge className="gap-1.5" variant="outline">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Preview isolado
            </Badge>
          </div>
        </Card>

        <ManualSwitcher value={manual} onChange={setManual} />

        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <section className="min-w-0">
            <div className="mb-3">
              <h2 className="text-base font-semibold">Checklist Inicial</h2>
              <p className="text-sm text-muted-foreground">
                Escopo atual: {scope === "unidade" ? "Unidade privativa" : "Área comum"} · {scopedItems.length} itens visíveis
              </p>
            </div>
            <ChecklistInicial
              items={items}
              scope={scope}
              onChangeStatus={setStatus}
              onChangeScopes={setScopes}
            />
          </section>

          <section className="min-w-0">
            <div className="mb-3">
              <h2 className="text-base font-semibold">Sistemas Construtivos</h2>
              <p className="text-sm text-muted-foreground">
                {linked.length} itens vinculados neste manual. O conteúdo editado é separado por item + escopo.
              </p>
            </div>
            <SistemasConstrutivos
              items={linked}
              scope={scope}
              manual={manual}
              previewMode
            />
          </section>
        </div>
      </div>
    </main>
  )
}
