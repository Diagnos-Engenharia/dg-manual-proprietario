"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { BookOpen, Building2, Download, Eye, FileText, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

type PersistedManualDevelopment = { id: string; name: string; client: string; status: string; deliveryDate: string; masterProgress: number; data: unknown }
type PublishedManual = { id: string; developmentId: string; developmentName: string; client: string; manualType: string; revision: number; filename: string; pathname: string; pages: number; createdAt: string; authorName: string | null }
const statusLabel: Record<string, string> = { em_andamento: "Em andamento", finalizado: "Finalizado", pausado: "Pausado" }
const manualLabels: Record<string, string> = { proprietario: "Manual do Proprietário", sindico: "Manual do Síndico" }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() }
function composerHref(id: string, manual: string) { return "/empreendimentos/" + encodeURIComponent(id) + "?modulo=emissao&manual=" + encodeURIComponent(manual) }
function fileHref(pathname: string) { return "/api/manuals/file?pathname=" + encodeURIComponent(pathname) }

export function ManuaisPageContent({ persisted = [], published = [], publishedError = false }: { persisted?: PersistedManualDevelopment[]; published?: PublishedManual[]; publishedError?: boolean }) {
  const [query, setQuery] = useState("")
  const search = normalize(query.trim())
  const rows = useMemo(() => persisted.filter(item => normalize(item.name + " " + item.client).includes(search)), [persisted, search])
  const finished = useMemo(() => published.filter(item => normalize(item.developmentName + " " + item.client + " " + manualLabels[item.manualType]).includes(search)), [published, search])

  return <div className="space-y-6">
    <div className="relative mx-auto w-full max-w-xl"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar empreendimento ou manual…" aria-label="Buscar manuais" className="pl-9" /></div>
    <section aria-labelledby="published-manuals-heading" className="space-y-3">
      <div><h2 id="published-manuals-heading" className="text-base font-semibold">Manuais finalizados</h2><p className="mt-1 text-xs text-muted-foreground">Versões publicadas disponíveis para visualizar e baixar.</p></div>
      {publishedError ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Não foi possível carregar os manuais finalizados. Atualize esta página para tentar novamente.</p> : finished.length ? <div className="grid gap-3 lg:grid-cols-2">{finished.map(item => <article key={item.id} data-published-manual-id={item.id} aria-label={manualLabels[item.manualType] + " · " + item.developmentName} className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10"><FileText className="h-4 w-4 text-primary" /></span><div className="min-w-0"><h3 className="text-sm font-semibold">{manualLabels[item.manualType]}</h3><p className="mt-1 break-words text-sm">{item.developmentName}</p><p className="mt-0.5 break-words text-xs text-muted-foreground">{item.client}</p></div></div><Badge variant="outline" className="shrink-0 border-success/30 text-success">Publicado</Badge></div>
        <p className="mt-3 text-xs text-muted-foreground">Rev. {String(item.revision).padStart(2, "0")} · {item.pages} páginas · Emitido em {new Date(item.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
        {item.authorName && <p className="mt-1 text-xs text-muted-foreground">Autor: {item.authorName}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2"><a href={fileHref(item.pathname)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2.5 text-xs font-medium hover:bg-accent"><Eye className="h-3.5 w-3.5" />Visualizar PDF</a><a href={fileHref(item.pathname)} download={item.filename} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2.5 text-xs font-medium hover:bg-accent"><Download className="h-3.5 w-3.5" />Baixar PDF</a><Link href={composerHref(item.developmentId, item.manualType)} className="px-2 py-1 text-xs font-medium text-primary hover:underline">Abrir compositor</Link></div>
      </article>)}</div> : <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{search ? "Nenhum manual publicado encontrado para esta busca." : "Os manuais aparecem aqui após a publicação no ciclo de finalização."}</div>}
    </section>
    <section aria-labelledby="manual-developments-heading" className="space-y-3">
      <h2 id="manual-developments-heading" className="text-base font-semibold">Empreendimentos</h2>
      <div className="space-y-3">{rows.map(item => <div key={item.id} className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary"><Building2 className="h-4 w-4" /></span><div><p className="font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{item.client}</p></div></div><Badge variant="outline">{statusLabel[item.status] ?? item.status}</Badge></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{Object.entries(manualLabels).map(([type, label]) => <Link key={type} href={composerHref(item.id, type)} className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm font-medium hover:border-primary/40 hover:bg-muted/30"><span className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" />{label}</span><span className="text-primary">Abrir</span></Link>)}</div>
      </div>)}</div>
      {!rows.length && <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Nenhum empreendimento encontrado.</div>}
    </section>
  </div>
}
