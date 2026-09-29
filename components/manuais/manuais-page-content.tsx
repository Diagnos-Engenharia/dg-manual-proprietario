"use client"

import { useMemo, useState } from "react"
import { BookOpen, Building2, CalendarDays, Download, Eye, Search, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/mock-data"

type ManualRow = { type: string; name: string; size?: string; updated?: string }

type PersistedManualDevelopment = { id: string; name: string; client: string; status: string; deliveryDate: string; masterProgress: number; data: unknown }

function getManualRows(data: unknown): ManualRow[] {
  if (!data || typeof data !== "object" || !Array.isArray((data as { manuals?: unknown }).manuals)) return []
  return (data as { manuals: unknown[] }).manuals.filter((item): item is ManualRow => Boolean(item && typeof item === "object" && typeof (item as ManualRow).name === "string" && typeof (item as ManualRow).type === "string"))
}

export function ManuaisPageContent({ persisted = [] }: { persisted?: PersistedManualDevelopment[] }) {
  const finished = persisted.filter((item) => item.status === "finalizado")
  const [selectedId, setSelectedId] = useState(finished[0]?.id ?? "")
  const [query, setQuery] = useState("")
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState("")
  const selected = finished.find((item) => item.id === selectedId)
  const rows = useMemo(() => getManualRows(selected?.data).filter((row) => `${row.type} ${row.name}`.toLowerCase().includes(query.toLowerCase())), [query, selected?.data])

  async function downloadManual(type: string) {
    if (!selected) return
    setDownloading(type)
    setDownloadError("")
    try {
      const response = await fetch("/api/manuals/compile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ developmentId: selected.id, manualType: type }) })
      if (!response.ok) throw new Error("Falha ao gerar o manual")
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `Manual-${type}-${selected.name.replace(/[^a-z0-9]+/gi, "-")}.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("[v0] Falha ao baixar manual", error)
      setDownloadError("Não foi possível gerar o manual. Verifique se você está autenticado.")
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="space-y-6">
      {finished.length > 0 && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {finished.map((item) => {
          const active = item.id === selectedId
          return <button key={item.id} onClick={() => setSelectedId(item.id)} className={`rounded-xl border p-5 text-left transition-all ${active ? "border-primary/60 bg-primary/[0.06] shadow-md" : "border-border bg-card hover:border-primary/30"}`}>
            <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Building2 className="h-5 w-5" /></span><span className="min-w-0"><span className="block truncate font-semibold">{item.name}</span><span className="block text-xs text-muted-foreground">{item.client}</span></span></div><Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">Finalizado</Badge></div>
            <div className="mt-5"><div className="flex justify-between text-xs text-muted-foreground"><span>Progresso Master</span><strong className="text-foreground">100%</strong></div><div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-full w-full rounded-full"  /></div></div>
            <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatDate(item.deliveryDate)}</span><span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />Manuais publicados</span></div>
          </button>
        })}
      </div>}

      {selected ? <>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4"><div><p className="text-xs text-muted-foreground">Empreendimento selecionado</p><p className="font-semibold">{selected.name}</p></div><div className="relative w-full max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar manual..." className="pl-9" /></div></div>
        {downloadError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{downloadError}</p>}
        {rows.length === 0 ? <div className="rounded-xl border border-dashed border-border p-10 text-center"><p className="font-medium">Nenhum manual publicado</p><p className="mt-1 text-sm text-muted-foreground">Este empreendimento ainda não possui manuais persistidos.</p></div> : <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"><div className="hidden grid-cols-[1fr_150px_140px_170px_120px] gap-4 border-b border-border px-4 py-3 text-xs font-semibold text-muted-foreground md:grid"><span>Nome</span><span>Tipo</span><span>Tamanho</span><span>Última atualização</span><span>Ações</span></div>{rows.map((row) => <div key={row.type} className="grid gap-3 border-b border-border px-4 py-4 text-sm last:border-0 md:grid-cols-[1fr_150px_140px_170px_120px] md:items-center"><div className="flex min-w-0 items-center gap-3"><BookOpen className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{row.name}</span></div><Badge variant="outline" className="w-fit">{row.type}</Badge><span className="text-muted-foreground">{row.size}</span><span className="text-muted-foreground">{row.updated ? formatDate(row.updated) : "—"}</span><div className="flex items-center gap-1"><Button variant="ghost" size="icon" aria-label={`Visualizar manual ${row.type}`} onClick={() => window.open(`/empreendimentos/${selected.id}?modulo=emissao`, "_blank", "noopener,noreferrer")}><Eye className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Baixar manual ${row.type}`} onClick={() => void downloadManual(row.type)} disabled={downloading === row.type}><Download className="h-4 w-4" /></Button></div></div>)}</div>}
      </> : <div className="rounded-xl border border-dashed border-border p-12 text-center"><p className="font-medium">Nenhum manual publicado</p><p className="mt-1 text-sm text-muted-foreground">Os manuais aparecerão aqui quando forem persistidos e publicados.</p></div>}
    </div>
  )
}
