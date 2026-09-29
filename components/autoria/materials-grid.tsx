"use client"

import { useState } from "react"
import { Copy, Plus, Check, Building2 } from "lucide-react"
import { referenceMaterials, type MaterialRow } from "@/lib/mock-data"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const columns: { key: keyof Omit<MaterialRow, "id">; label: string }[] = [
  { key: "ambiente", label: "Ambiente" },
  { key: "aplicacao", label: "Aplicação" },
  { key: "marca", label: "Marca" },
  { key: "linha", label: "Linha" },
  { key: "referencia", label: "Referência" },
  { key: "formato", label: "Formato" },
]

const targetUnits = ["Apto 21", "Apto 31", "Apto 41", "Apto 51"]

export function MaterialsGrid() {
  const [rows, setRows] = useState<MaterialRow[]>(referenceMaterials)
  const [cloned, setCloned] = useState<string[]>([])

  function updateCell(id: string, key: keyof MaterialRow, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)))
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        id: `m-${Date.now()}`,
        ambiente: "",
        aplicacao: "",
        marca: "",
        linha: "",
        referencia: "",
        formato: "",
      },
    ])
  }

  function cloneTo(unit: string) {
    setCloned((prev) => (prev.includes(unit) ? prev.filter((u) => u !== unit) : [...prev, unit]))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/20 bg-primary/5 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium">Unidade de referência — Apartamento 11</p>
            <p className="text-xs text-muted-foreground">
              Padrão-base para auditoria linha a linha e clonagem das demais unidades.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4" />
          Adicionar linha
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="w-10 border-b border-r border-border px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                #
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="border-b border-r border-border px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground last:border-r-0"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} className="group">
                <td className="border-b border-r border-border bg-muted/30 px-2 py-1 text-center font-mono text-xs text-muted-foreground">
                  {i + 1}
                </td>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className="border-b border-r border-border p-0 last:border-r-0"
                  >
                    <input
                      value={row[c.key]}
                      onChange={(e) => updateCell(row.id, c.key, e.target.value)}
                      className={cn(
                        "h-full w-full bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:bg-primary/5 focus:ring-1 focus:ring-inset focus:ring-primary",
                        (c.key === "marca" || c.key === "linha") && "font-medium",
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-border p-4">
        <div className="flex items-center gap-2">
          <Copy className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Clonar padrão para outras unidades</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Replica com precisão a especificação auditada do Apartamento 11 para os manuais
          selecionados.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {targetUnits.map((unit) => {
            const active = cloned.includes(unit)
            return (
              <button
                key={unit}
                type="button"
                onClick={() => cloneTo(unit)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent",
                )}
              >
                {active ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {unit}
              </button>
            )
          })}
        </div>
        {cloned.length > 0 && (
          <Badge
            variant="outline"
            className="mt-3 border-success/30 bg-success/10 text-success"
          >
            Padrão clonado para {cloned.length}{" "}
            {cloned.length === 1 ? "unidade" : "unidades"}
          </Badge>
        )}
      </div>
    </div>
  )
}
