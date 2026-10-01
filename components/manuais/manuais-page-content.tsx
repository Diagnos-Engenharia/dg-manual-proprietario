"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, BookOpen, Building2, Download, Eye, FileText, Search } from "lucide-react"
import type { FinishingUnitSummary } from "@/lib/finishing-types"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { finishingSourceLabels, finishingUnitLabel, normalizeFinishing, unitEmissionLabels } from "@/components/autoria/finishing-ui"

type Category = "proprietario" | "sindico" | "unidades"
type PersistedDevelopment = { id: string; name: string; client: string; status: string; deliveryDate: string; masterProgress: number; data: unknown }
type PublishedManual = { id: string; developmentId: string; developmentName: string; client: string; manualType: string; revision: number; filename: string; pathname: string; pages: number; createdAt: string; authorName: string | null }
type ManualUnit = FinishingUnitSummary & { developmentName: string; client: string; canEdit: boolean }
type Props = { persisted?: PersistedDevelopment[]; published?: PublishedManual[]; publishedError?: boolean; units?: ManualUnit[]; unitsError?: boolean }
const categories = { proprietario: "Manual do Proprietário", sindico: "Manual do Síndico", unidades: "Unidades" }
const versionLabels: Record<string, string> = { rascunho: "Rascunho emitido", validacao: "Em validação", aprovado: "Aprovado para publicação", publicado: "Publicado", substituido: "Substituído" }
const actionClass = "inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2.5 text-xs font-medium hover:bg-accent"
function composerHref(id: string, manual: string, unitId?: string) { return "/empreendimentos/" + encodeURIComponent(id) + "?" + new URLSearchParams({ modulo: "emissao", manual, ...(unitId ? { unidade: unitId } : {}) }).toString() }
function sourceHref(id: string, unitId: string) { return "/empreendimentos/" + encodeURIComponent(id) + "?" + new URLSearchParams({ modulo: "elaboracao", aba: "acabamentos", manual: "acabamentos", unidade: unitId }).toString() }
function fileHref(pathname: string) { return "/api/manuals/file?pathname=" + encodeURIComponent(pathname) }
function dateLabel(value: string) { return new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) }

export function ManuaisPageContent({ persisted = [], published = [], publishedError = false, units = [], unitsError = false }: Props) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams()
  const requested = params.get("tipo")
  const requestedCategory: Category = requested === "sindico" || requested === "unidades" ? requested : "proprietario"
  const [category, setCategory] = useState<Category>(requestedCategory)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  useEffect(() => { setCategory(requestedCategory) }, [requestedCategory])
  function changeCategory(value: unknown) {
    if (value !== "proprietario" && value !== "sindico" && value !== "unidades") return
    setCategory(value)
    const next = new URLSearchParams(params.toString()); next.set("tipo", value)
    router.replace(pathname + "?" + next.toString(), { scroll: false })
  }
  const search = normalizeFinishing(query)
  const matchingPublished = useMemo(() => published.filter(item => normalizeFinishing(item.developmentName + " " + item.client + " " + categories[item.manualType as Exclude<Category, "unidades">]).includes(search)), [published, search])
  const matchingDevelopments = useMemo(() => persisted.filter(item => normalizeFinishing(item.name + " " + item.client).includes(search)), [persisted, search])
  const matchingUnits = useMemo(() => units.filter(item => normalizeFinishing([item.developmentName, item.client, item.number, item.tower].join(" ")).includes(search)), [units, search])
  const visibleUnits = matchingUnits.filter(item => status === "all" || item.emissionStatus === status)
  const unitCounts = Object.fromEntries(Object.keys(unitEmissionLabels).map(key => [key, matchingUnits.filter(item => item.emissionStatus === key).length]))
  return <div className="space-y-5">
    <div className="relative w-full max-w-xl"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar empreendimento, manual ou unidade…" aria-label="Buscar manuais" className="pl-9" /></div>
    <Tabs value={category} onValueChange={changeCategory} className="gap-5"><TabsList variant="line" className="h-auto w-full flex-wrap justify-start gap-2 border-b border-border pb-2">{Object.entries(categories).map(([key, label]) => <TabsTrigger key={key} value={key} className="gap-2 px-3 py-2 text-xs sm:text-sm">{label}<span className="rounded-md bg-muted px-1.5 text-[10px] tabular-nums">{key === "unidades" ? units.length : published.filter(item => item.manualType === key).length}</span></TabsTrigger>)}</TabsList>
      {(["proprietario", "sindico"] as const).map(type => <TabsContent key={type} value={type} className="space-y-6">
        <section aria-labelledby={type + "-published-heading"} className="space-y-3"><div><h2 id={type + "-published-heading"} className="text-base font-semibold">Manuais finalizados</h2><p className="mt-1 text-xs text-muted-foreground">{categories[type]} · Versões publicadas disponíveis para visualizar e baixar.</p></div>
          {publishedError ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Não foi possível carregar os manuais finalizados. Atualize esta página para tentar novamente.</p> : matchingPublished.some(item => item.manualType === type) ? <div className="grid gap-3 lg:grid-cols-2">{matchingPublished.filter(item => item.manualType === type).map(item => <PublishedCard key={item.id} item={item} />)}</div> : <EmptyState>{search ? "Nenhum manual publicado encontrado para esta busca." : "Os manuais aparecem aqui após a publicação no ciclo de finalização."}</EmptyState>}
        </section>
        <section aria-labelledby={type + "-developments-heading"} className="space-y-3"><h2 id={type + "-developments-heading"} className="text-base font-semibold">Empreendimentos</h2><div className="grid gap-3 lg:grid-cols-2">{matchingDevelopments.map(item => <Link key={item.id} href={composerHref(item.id, type)} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40"><span className="flex min-w-0 gap-3"><Building2 className="mt-1 h-5 w-5 shrink-0 text-primary" /><span className="min-w-0"><span className="block text-sm font-semibold">{item.name}</span><span className="mt-1 block text-xs text-muted-foreground">{item.client}</span><span className="mt-3 flex items-center gap-1.5 text-xs"><BookOpen className="h-3.5 w-3.5" />{categories[type]}</span></span></span><span className="shrink-0 text-xs text-primary">Abrir</span></Link>)}</div>{!matchingDevelopments.length && <EmptyState>Nenhum empreendimento encontrado.</EmptyState>}</section>
      </TabsContent>)}
      <TabsContent value="unidades" className="space-y-4"><div><h2 className="text-base font-semibold">Unidades cadastradas</h2><p className="mt-1 text-xs text-muted-foreground">Acompanhe a elaboração, emissão e publicação de cada tabela de acabamentos.</p></div>
        <div className="flex flex-wrap items-center gap-2" aria-label="Situação das unidades"><button type="button" aria-pressed={status === "all"} onClick={() => setStatus("all")} className={cn("rounded-lg border border-border px-3 py-2 text-xs", status === "all" && "border-primary/40 bg-primary/10")}>Todas <span className="ml-1 tabular-nums">{matchingUnits.length}</span></button>{Object.entries(unitEmissionLabels).map(([key, label]) => <button key={key} type="button" aria-pressed={status === key} onClick={() => setStatus(key)} className={cn("rounded-lg border border-border px-3 py-2 text-xs", status === key && "border-primary/40 bg-primary/10")}>{label} <span className="ml-1 tabular-nums">{unitCounts[key]}</span></button>)}</div>
        {unitsError ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Não foi possível carregar as unidades. Atualize esta página para tentar novamente.</p> : visibleUnits.length ? <div className="grid gap-3 lg:grid-cols-2">{visibleUnits.map(item => <UnitCard key={item.id} item={item} />)}</div> : <EmptyState>{search || status !== "all" ? "Nenhuma unidade corresponde à busca e à situação escolhida." : "As unidades aparecem aqui após o cadastro na Tabela de Acabamentos do empreendimento."}</EmptyState>}
        {!unitsError && <p className="text-xs text-muted-foreground">{visibleUnits.length} de {units.length} unidades cadastradas.</p>}
      </TabsContent>
    </Tabs>
  </div>
}
function EmptyState({ children }: { children: React.ReactNode }) { return <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{children}</div> }
function PublishedCard({ item }: { item: PublishedManual }) {
  const label = categories[item.manualType as Exclude<Category, "unidades">]
  return <article data-published-manual-id={item.id} aria-label={label + " · " + item.developmentName} className="rounded-xl border border-border bg-card p-4"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><FileText className="mt-1 h-5 w-5 shrink-0 text-primary" /><div className="min-w-0"><h3 className="text-sm font-semibold">{label}</h3><p className="mt-1 break-words text-sm">{item.developmentName}</p><p className="mt-0.5 break-words text-xs text-muted-foreground">{item.client}</p></div></div><Badge variant="outline" className="shrink-0 border-success/30 text-success">Publicado</Badge></div><p className="mt-3 text-xs text-muted-foreground">Rev. {String(item.revision).padStart(2, "0")} · {item.pages} páginas · Emitido em {dateLabel(item.createdAt)}</p>{item.authorName && <p className="mt-1 text-xs text-muted-foreground">Autor: {item.authorName}</p>}<div className="mt-4 flex flex-wrap items-center gap-2"><a href={fileHref(item.pathname)} target="_blank" rel="noreferrer" className={actionClass}><Eye className="h-3.5 w-3.5" />Visualizar PDF</a><a href={fileHref(item.pathname)} download={item.filename} className={actionClass}><Download className="h-3.5 w-3.5" />Baixar PDF</a><Link href={composerHref(item.developmentId, item.manualType)} className="px-2 py-1 text-xs font-medium text-primary hover:underline">Abrir compositor</Link></div></article>
}
function UnitCard({ item }: { item: ManualUnit }) {
  const published = item.publishedVersion, latest = item.latestVersion
  return <article data-unit-id={item.id} aria-label={finishingUnitLabel(item) + " · " + item.developmentName} className="rounded-xl border border-border bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted-foreground">{item.developmentName}</p><h3 className="mt-1 text-sm font-semibold">{finishingUnitLabel(item)}</h3></div><Badge variant="outline" className={cn(item.emissionStatus === "emitida" && "border-success/30 text-success", item.emissionStatus === "atualizacao_pendente" && "border-warning/40 text-warning-foreground")}>{unitEmissionLabels[item.emissionStatus]}</Badge></div><p className="mt-3 text-xs text-muted-foreground">Tabela: {finishingSourceLabels[item.table?.status ?? "sem_tabela"]}{item.table ? " · Rev. " + item.table.revision : ""}</p>{latest && <p className="mt-1 text-xs text-muted-foreground">Última emissão: rev. {String(latest.revision).padStart(2, "0")} · {versionLabels[latest.status] ?? latest.status} · {dateLabel(latest.createdAt)}</p>}{item.emissionStatus === "atualizacao_pendente" && <p className="mt-3 flex items-start gap-2 rounded-md bg-warning/10 p-2 text-xs"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />A fonte mudou após a publicação. O PDF anterior continua disponível; emita uma revisão com os dados atuais.</p>}<div className="mt-4 flex flex-wrap gap-2"><Link href={composerHref(item.developmentId, "acabamentos", item.id)} className={actionClass}><Eye className="h-3.5 w-3.5" />{!published && item.canEdit && item.table?.status === "aprovado" ? "Emitir PDF" : "Abrir prévia"}</Link>{item.canEdit && <Link href={sourceHref(item.developmentId, item.id)} className={actionClass}>Elaborar tabela</Link>}{published && <><a href={fileHref(published.pathname)} target="_blank" rel="noreferrer" className={actionClass}><Eye className="h-3.5 w-3.5" />Visualizar PDF</a><a href={fileHref(published.pathname)} download={published.filename} className={actionClass}><Download className="h-3.5 w-3.5" />Baixar PDF</a></>}</div>{published && <p className="mt-2 text-[10px] text-muted-foreground">PDF publicado: rev. {String(published.revision).padStart(2, "0")} · {published.pages} páginas.</p>}</article>
}
