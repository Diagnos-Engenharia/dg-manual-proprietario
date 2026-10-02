"use client"

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, FileText, History, ListFilter, Loader2, Maximize, Minus, PanelRight, Plus, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { flattenSections, type ManualPage as ManualPageData, type ManualPreview, type ManualSection } from "@/lib/manual-document/types"
import { editableManualSections } from "@/lib/manual-document/build"
import { optionalManualSectionIds } from "@/lib/manual-content"
import { cn } from "@/lib/utils"
import { ManualPage } from "./manual-page"
import { ContentStatusIcon, contentStatusLabels, DocumentNavigation } from "./document-navigation"
import { SectionInspector, type EditorialAction, type EditorialData, type ManualInteractionMode } from "./section-inspector"
import { manualFileUrl, VersionHistory, versionStatusLabels, type ManualVersion } from "./version-history"
import type { FinishingUnitSummary, UnitCatalog } from "@/lib/finishing-types"

type DocumentType = "proprietario" | "sindico" | "acabamentos"
type ViewMode = "continuous" | "single"
type Compilation = { filename: string; pathname: string; revision: number; pages: number }
const labels: Record<DocumentType, string> = { proprietario: "Manual do Proprietário", sindico: "Manual do Síndico", acabamentos: "Tabelas de acabamento" }
const pointToPixel = 96 / 72

async function readJson<T>(response: Response): Promise<T> {
  let data: T & { error?: string }
  try { data = await response.json() as T & { error?: string } } catch { throw new Error(response.status === 401 ? "Sua sessão expirou." : "O servidor não retornou uma resposta válida.") }
  if (!response.ok) throw new Error(data.error ?? (response.status === 401 ? "Sua sessão expirou." : "Não foi possível concluir a solicitação."))
  return data
}

export function PdfCompiler({ developmentId, role }: { developmentId?: string; role: "admin" | "editor" | "validator" }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedManual = searchParams.get("manual") === "acabamentos" ? "acabamentos" : searchParams.get("manual") === "sindico" ? "sindico" : "proprietario"
  const requestedUnit = searchParams.get("unidade")
  const requestedSection = searchParams.get("secao")
  const [manual, setManual] = useState<DocumentType>(requestedManual)
  const [unitId, setUnitId] = useState<string | null>(requestedUnit)
  const [units, setUnits] = useState<FinishingUnitSummary[]>([])
  const [unitsLoaded, setUnitsLoaded] = useState(false)
  const [preview, setPreview] = useState<ManualPreview | null>(null)
  const [editorial, setEditorial] = useState<EditorialData | null>(null)
  const [versions, setVersions] = useState<ManualVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<Compilation | null>(null)
  const [activeId, setActiveId] = useState("capa")
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(0.7)
  const [viewMode, setViewMode] = useState<ViewMode>("continuous")
  const [interactionMode, setInteractionMode] = useState<ManualInteractionMode>("view")
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pendingOpen, setPendingOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [optionalOpen, setOptionalOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const viewportRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef(new Map<number, HTMLDivElement>())
  const positions = useRef<{ page: number; top: number; height: number }[]>([])
  const zoomAnchor = useRef<{ page: number; fraction: number; offset: number } | null>(null)
  const loadController = useRef<AbortController | null>(null)
  const operationController = useRef<AbortController | null>(null)
  const mutationScope = useRef<string | null>(null)
  const loadSequence = useRef(0)
  const operationSequence = useRef(0)
  const scope = (developmentId ?? "") + ":" + manual + (manual === "acabamentos" ? ":" + (unitId ?? "") : "")
  const currentScope = useRef(scope)
  currentScope.current = scope

  const load = useCallback(async () => {
    if (!developmentId) return
    const requestScope = developmentId + ":" + manual + (manual === "acabamentos" ? ":" + (unitId ?? "") : "")
    const sequence = ++loadSequence.current
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller
    setLoading(true); setError(null)
    const body = JSON.stringify({ developmentId, manualType: manual, ...(manual === "acabamentos" ? { unitId } : {}) })
    const query = "?" + new URLSearchParams({ developmentId, manualType: manual, ...(manual === "acabamentos" && unitId ? { unitId } : {}) })
    const sourceRequest = manual === "acabamentos"
      ? fetch("/api/finishing/units?" + new URLSearchParams({ developmentId }), { signal: controller.signal, cache: "no-store" }).then(response => readJson<UnitCatalog>(response))
      : fetch("/api/manuals/editorial" + query, { signal: controller.signal }).then(response => readJson<EditorialData>(response))
    if (manual === "acabamentos" && !unitId) {
      try {
        const catalog = await sourceRequest as UnitCatalog
        if (!controller.signal.aborted && sequence === loadSequence.current && currentScope.current === requestScope) { setUnits(catalog.units); setUnitsLoaded(true) }
      } catch (cause) {
        if (!controller.signal.aborted && sequence === loadSequence.current && currentScope.current === requestScope) setError(cause instanceof Error ? cause.message : "Não foi possível carregar as unidades.")
      } finally {
        if (!controller.signal.aborted && sequence === loadSequence.current && currentScope.current === requestScope) setLoading(false)
      }
      return
    }
    const results = await Promise.allSettled([
      fetch("/api/manuals/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal }).then(response => readJson<ManualPreview>(response)),
      fetch("/api/manuals/versions" + query, { signal: controller.signal }).then(response => readJson<{ versions: ManualVersion[] }>(response)),
      sourceRequest,
    ])
    if (controller.signal.aborted || sequence !== loadSequence.current || currentScope.current !== requestScope) return
    const [documentResult, versionsResult, editorialResult] = results
    const failures: string[] = []
    if (documentResult.status === "fulfilled") {
      setPreview(documentResult.value)
      setPage(current => Math.min(current, Math.max(1, documentResult.value.layout.pages.length)))
      setActiveId(current => flattenSections(documentResult.value.document.sections).some(section => section.id === current) ? current : documentResult.value.document.sections[0]?.id ?? "capa")
    } else failures.push(documentResult.reason instanceof Error ? documentResult.reason.message : "Não foi possível atualizar o preview.")
    if (versionsResult.status === "fulfilled") setVersions(versionsResult.value.versions ?? [])
    else failures.push("Não foi possível carregar o histórico de versões.")
    if (editorialResult.status === "fulfilled") {
      if (manual === "acabamentos") {
        const catalog = editorialResult.value as UnitCatalog
        setUnits(catalog.units); setUnitsLoaded(true)
        setEditorial({ sections: {}, canEdit: catalog.canEdit, canValidate: catalog.canValidate })
      } else setEditorial(editorialResult.value as EditorialData)
    } else failures.push(manual === "acabamentos" ? "Não foi possível carregar as unidades." : "Não foi possível carregar os textos para edição e revisão.")
    setError(failures.length ? failures.join(" ") : null)
    setLoading(false)
  }, [developmentId, manual, unitId])

  useEffect(() => { setManual(requestedManual) }, [requestedManual])
  useEffect(() => { setUnitId(requestedUnit) }, [requestedUnit])
  useEffect(() => { setUnits([]); setUnitsLoaded(false) }, [developmentId])
  useEffect(() => {
    setPreview(null); setEditorial(null); setVersions([]); setSuccess(null); setError(null); setActiveId("capa"); setPage(1); setExpanded(new Set()); setCompiling(false); setActionBusy(false); setInteractionMode("view"); mutationScope.current = null
    operationController.current?.abort(); operationSequence.current++; zoomAnchor.current = null
    setHistoryOpen(false); setInspectorOpen(false); setPendingOpen(false); setOptionalOpen(false)
    void load()
    return () => { loadController.current?.abort(); operationController.current?.abort() }
  }, [load])
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 10000); return () => window.clearInterval(timer) }, [])
  const sections = useMemo(() => preview ? flattenSections(preview.document.sections) : [], [preview])
  const sectionById = useMemo(() => new Map(sections.map(section => [section.id, section])), [sections])
  const pendingSections = useMemo(() => sections.filter(section => section.type !== "chapter" && section.type !== "cover" && section.type !== "toc" && section.validationStatus !== "aprovado" && section.validationStatus !== "nao_aplicavel"), [sections])
  const activeSection = sectionById.get(activeId)
  const pageCount = preview?.layout.pages.length ?? 0
  const visiblePages = useMemo(() => {
    const pages = preview?.layout.pages ?? []
    if (viewMode === "single") return pages.filter(item => item.number === page)
    return pages
  }, [preview, viewMode, page])
  const destinations = useMemo(() => Object.entries(preview?.layout.destinations ?? {}).map(([id, destination]) => ({ id, ...destination })).sort((a, b) => a.page - b.page || a.y - b.y), [preview])

  const collectPositions = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const top = viewport.getBoundingClientRect().top
    positions.current = Array.from(pageRefs.current.entries()).map(([number, element]) => { const box = element.getBoundingClientRect(); return { page: number, top: box.top - top + viewport.scrollTop, height: box.height } }).sort((a, b) => a.top - b.top)
  }, [])
  useLayoutEffect(() => {
    collectPositions()
    const viewport = viewportRef.current
    if (!viewport) return
    const anchor = zoomAnchor.current
    if (anchor) {
      const sheet = positions.current.find(candidate => candidate.page === anchor.page)
      if (sheet) viewport.scrollTop = Math.max(0, sheet.top + sheet.height * anchor.fraction - anchor.offset)
      zoomAnchor.current = null
    }
    const observer = new ResizeObserver(collectPositions)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [collectPositions, visiblePages, zoom])
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !preview) return
    let frame = 0
    const syncScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const cursor = viewport.scrollTop + 40
        const sheets = positions.current
        let sheet = sheets[0]
        for (const candidate of sheets) { if (candidate.top > cursor) break; sheet = candidate }
        if (!sheet) return
        const pageData = preview.layout.pages.find(item => item.number === sheet.page)
        if (!pageData) return
        const y = Math.max(0, cursor - sheet.top) * pageData.height / sheet.height
        const onPage = destinations.filter(destination => destination.page === sheet.page)
        let destination = onPage[0]
        for (const candidate of onPage) { if (candidate.y > y + 12) break; destination = candidate }
        setPage(sheet.page)
        setActiveId(destination?.id ?? pageData.sectionId)
      })
    }
    viewport.addEventListener("scroll", syncScroll, { passive: true })
    return () => { viewport.removeEventListener("scroll", syncScroll); if (frame) cancelAnimationFrame(frame) }
  }, [preview, destinations, viewMode])

  const navigate = useCallback((id: string, matchingPage?: number) => {
    if (!preview) return
    const sectionDestination = preview.layout.destinations[id]
    const destination = matchingPage ? { page: matchingPage, y: 0 } : sectionDestination
    if (!destination) return
    setActiveId(id); setPage(destination.page)
    requestAnimationFrame(() => {
      const viewport = viewportRef.current
      const element = pageRefs.current.get(destination.page)
      if (!viewport || !element) return
      collectPositions()
      const position = positions.current.find(item => item.page === destination.page)
      const pageData = preview.layout.pages.find(item => item.number === destination.page)
      if (position && pageData) viewport.scrollTo({ top: position.top + destination.y * position.height / pageData.height - 24, behavior: "auto" })
    })
  }, [preview, collectPositions])
  const editSection = useCallback((id: string, commandHref?: string) => {
    const section = sectionById.get(id)
    const href = commandHref ?? section?.editHref
    const path = "/empreendimentos/" + encodeURIComponent(developmentId ?? "") + "?"
    if (href?.startsWith(path)) {
      setInspectorOpen(false)
      router.push(href)
    } else navigate(id)
  }, [sectionById, developmentId, router, navigate])
  const interactWithTopic = useCallback((id: string, matchingPage?: number) => {
    if (interactionMode === "edit") editSection(id)
    else navigate(id, matchingPage)
  }, [interactionMode, editSection, navigate])
  const changeInteractionMode = useCallback((mode: ManualInteractionMode) => {
    setInteractionMode(mode)
    setInspectorOpen(false)
    if (mode === "view") navigate(activeId)
  }, [activeId, navigate])
  useEffect(() => { if (requestedSection && preview?.layout.destinations[requestedSection]) navigate(requestedSection) }, [requestedSection, preview?.fingerprint, navigate])
  useEffect(() => {
    if (!preview) return
    const ancestors: string[] = []
    function locate(tree: ManualSection[], path: string[]): boolean { for (const section of tree) { if (section.id === activeId) { ancestors.push(...path); return true } if (locate(section.children, [...path, section.id])) return true } return false }
    locate(preview.document.sections, [])
    if (ancestors.length) setExpanded(current => { if (ancestors.every(id => current.has(id))) return current; const next = new Set(current); ancestors.forEach(id => next.add(id)); return next })
  }, [activeId, preview])
  const toggleExpanded = useCallback((id: string) => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }), [])

  function changeZoom(next: number, wholePage = false) {
    const value = Math.max(0.25, Math.min(2, next))
    const viewport = viewportRef.current
    if (viewport) {
      collectPositions()
      const offset = 24
      const cursor = viewport.scrollTop + offset
      let sheet = positions.current[0]
      for (const candidate of positions.current) { if (candidate.top > cursor) break; sheet = candidate }
      if (sheet) {
        const fraction = wholePage ? 0 : Math.max(0, Math.min(1, (cursor - sheet.top) / sheet.height))
        zoomAnchor.current = { page: sheet.page, fraction, offset }
        if (value === zoom) { viewport.scrollTop = Math.max(0, sheet.top + sheet.height * fraction - offset); zoomAnchor.current = null }
      }
    }
    setZoom(value)
  }
  function fit(kind: "page" | "width") {
    const viewport = viewportRef.current
    const first = preview?.layout.pages[0]
    if (!viewport || !first) return
    const width = (viewport.clientWidth - 56) / (first.width * pointToPixel)
    const height = (viewport.clientHeight - 70) / (first.height * pointToPixel)
    changeZoom(kind === "page" ? Math.min(width, height) : width, kind === "page")
  }
  function movePage(next: number) {
    const number = Math.max(1, Math.min(pageCount, next))
    setPage(number)
    const pageData = preview?.layout.pages.find(item => item.number === number)
    if (pageData) setActiveId(pageData.sectionId)
    requestAnimationFrame(() => { const viewport = viewportRef.current; const element = pageRefs.current.get(number); if (viewport && element) { collectPositions(); const position = positions.current.find(item => item.page === number); if (position) viewport.scrollTo({ top: Math.max(0, position.top - 24), behavior: "auto" }) } })
  }

  async function scopedAction(url: string, body: Record<string, unknown>) {
    const actionScope = scope
    if (mutationScope.current === actionScope) throw new Error("Aguarde a conclusão da atualização em andamento.")
    mutationScope.current = actionScope
    const controller = new AbortController()
    const sequence = ++operationSequence.current
    operationController.current = controller
    setActionBusy(true)
    try {
      await readJson(await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal }))
      if (currentScope.current === actionScope && sequence === operationSequence.current && !controller.signal.aborted) await load()
    } finally { if (currentScope.current === actionScope && sequence === operationSequence.current) { mutationScope.current = null; setActionBusy(false) } }
  }
  async function editorialAction(action: EditorialAction) { await scopedAction("/api/manuals/editorial", { ...action, developmentId, manualType: manual }) }
  async function transition(id: string, status: string) { await scopedAction("/api/manuals/versions/status", { id, status }) }
  async function compile() {
    if (!developmentId || !preview?.readiness.ok || loading || compiling || actionBusy || mutationScope.current === scope || role === "validator") return
    const actionScope = scope
    const controller = new AbortController()
    const sequence = ++operationSequence.current
    operationController.current = controller
    mutationScope.current = actionScope
    setCompiling(true); setError(null); setSuccess(null)
    try {
      const response = await fetch("/api/manuals/compile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ developmentId, manualType: manual, ...(manual === "acabamentos" ? { unitId } : {}), previewFingerprint: preview.fingerprint }), signal: controller.signal })
      const result = await readJson<Compilation>(response)
      if (currentScope.current !== actionScope || sequence !== operationSequence.current || controller.signal.aborted) return
      setSuccess(result); await load()
      if (currentScope.current === actionScope && sequence === operationSequence.current && !controller.signal.aborted) { setInspectorOpen(false); setHistoryOpen(true) }
    } catch (cause) { if (currentScope.current === actionScope && sequence === operationSequence.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha ao emitir o PDF.") } finally { if (currentScope.current === actionScope && sequence === operationSequence.current) { mutationScope.current = null; setCompiling(false) } }
  }

  const ready = Boolean(preview?.readiness.ok)
  const overall = preview?.readiness.overall ?? 0
  const elapsed = preview ? Math.max(0, Math.floor((now - new Date(preview.updatedAt).getTime()) / 1000)) : 0
  const pendingCount = preview?.readiness.blocking.length ?? 0
  const revision = preview?.document.metadata.revision ?? versions[0]?.revision ?? 0
  const documentState = ready ? "Pronto para emissão" : "Em elaboração"
  const inspectorProps = {
    documentType: manual,
    section: activeSection, page: preview?.layout.destinations[activeId]?.page,
    role, editorial, attachments: preview?.document.attachments ?? [], onAction: editorialAction,
    interactionMode, onModeChange: changeInteractionMode, onCompile: () => void compile(),
    onPending: () => setPendingOpen(true), onHistory: () => setHistoryOpen(true), ready,
    compileDisabled: !ready || loading || compiling || actionBusy || role === "validator",
    compiling, pendingCount,
  }
  function stageHref(id: string) {
    if (manual === "acabamentos") return "/empreendimentos/" + encodeURIComponent(developmentId ?? "") + "?" + new URLSearchParams({ modulo: "elaboracao", aba: "acabamentos", ...(unitId ? { unidade: unitId } : {}) })
    const base = "/empreendimentos/" + encodeURIComponent(developmentId ?? "") + "?manual=" + manual
    if (id === "ficha") return base + "&modulo=informacoes"
    if (id === "cronograma" || id.startsWith("custom-")) return base + "&modulo=cronograma"
    if (id === "editorial") return base + "&modulo=elaboracao&aba=textos"
    return base + "&modulo=elaboracao&aba=" + (id === "acabamentos" ? "acabamentos" : id === "checklist" ? "checklist" : "textos&secao=sistemas" + (id === "manutencao" ? "&conteudo=manutencao" : ""))
  }
  function selectTarget(next: DocumentType, nextUnit: string | null = null) {
    setManual(next); setUnitId(nextUnit)
    const params = new URLSearchParams(searchParams.toString())
    params.set("modulo", "emissao"); params.set("manual", next)
    for (const key of ["secao", "item", "conteudo", "grupo", "ambiente", "unidade"]) params.delete(key)
    if (next === "acabamentos" && nextUnit) params.set("unidade", nextUnit)
    router.replace("/empreendimentos/" + encodeURIComponent(developmentId ?? "") + "?" + params, { scroll: false })
  }
  const selectedUnit = manual === "acabamentos" ? units.find(unit => unit.id === unitId) : undefined

  if (!developmentId) return <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">Selecione um empreendimento para compor o manual.</div>
  return <div className="flex min-w-0 flex-col gap-3">
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3"><label className="sr-only" htmlFor="manual-type">Tipo de manual</label><select id="manual-type" value={manual} onChange={event => selectTarget(event.target.value as DocumentType)} className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm font-semibold">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{manual === "acabamentos" && <><label className="sr-only" htmlFor="finishing-unit">Unidade da tabela</label><select id="finishing-unit" value={unitId ?? ""} disabled={loading} onChange={event => selectTarget("acabamentos", event.target.value || null)} className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Selecione uma unidade</option>{unitId && !units.some(unit => unit.id === unitId) && <option value={unitId}>Unidade indisponível</option>}{units.map(unit => <option key={unit.id} value={unit.id}>{[unit.tower, "Unidade " + unit.number].filter(Boolean).join(" · ")}</option>)}</select></>}{preview && <><span className="text-xs tabular-nums text-muted-foreground">Rev. {String(revision).padStart(2, "0")} · {pageCount} páginas</span><Badge variant="outline" className={cn(ready && "border-success/30 text-success")}>{overall}% concluído</Badge></>}</div>
        <div className="flex flex-wrap items-center gap-1.5"><Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading || compiling || actionBusy}><RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />Atualizar preview</Button>{manual !== "acabamentos" && <Button variant="ghost" size="sm" onClick={() => setOptionalOpen(true)}><ListFilter className="h-3.5 w-3.5" />Módulos</Button>}<Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} disabled={manual === "acabamentos" && !unitId}><History className="h-3.5 w-3.5" />Histórico</Button><Button variant="outline" size="sm" onClick={() => setPendingOpen(true)} disabled={!preview}><AlertTriangle className="h-3.5 w-3.5" />Pendências{pendingCount > 0 && <span className="rounded bg-muted px-1.5 text-[10px]">{pendingCount}</span>}</Button></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">{ready ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <FileText className="h-3.5 w-3.5" />}<span>{documentState}</span>{versions[0] && <span className="hidden sm:inline">· Última emissão: {versionStatusLabels[versions[0].status] ?? versions[0].status}</span>}<span className="hidden md:inline">· {preview ? elapsed < 60 ? "Preview atualizado há " + elapsed + " s" : "Preview atualizado há " + Math.floor(elapsed / 60) + " min" : "Preparando preview"}</span></div>
        <div className="flex flex-wrap items-center gap-1"><Button variant="ghost" size="icon-sm" aria-label="Diminuir zoom" onClick={() => changeZoom(zoom - 0.1)}><Minus className="h-3.5 w-3.5" /></Button><span className="min-w-10 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span><Button variant="ghost" size="icon-sm" aria-label="Aumentar zoom" onClick={() => changeZoom(zoom + 0.1)}><Plus className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="sm" onClick={() => fit("page")} disabled={!preview}><Maximize className="h-3.5 w-3.5" />Página</Button><Button variant="ghost" size="sm" onClick={() => fit("width")} disabled={!preview}>Largura</Button><select aria-label="Modo de visualização" value={viewMode} onChange={event => setViewMode(event.target.value as ViewMode)} className="ml-1 h-7 rounded-md border border-input bg-background px-1.5 text-xs"><option value="continuous">Contínuo</option><option value="single">Página única</option></select><Button variant="ghost" size="icon-sm" aria-label="Abrir informações da seção" className="xl:hidden" onClick={() => setInspectorOpen(true)}><PanelRight className="h-4 w-4" /></Button></div>
      </div>
    </div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
    {success && <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-success/20 bg-success/5 px-3 py-2 text-xs"><CheckCircle2 className="h-4 w-4 text-success" /><span>Rev. {String(success.revision).padStart(2, "0")} emitida · {success.pages} páginas</span><a href={manualFileUrl(success.pathname)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><Eye className="h-3.5 w-3.5" />Visualizar</a><a href={manualFileUrl(success.pathname)} download={success.filename} className="inline-flex items-center gap-1 text-primary hover:underline"><Download className="h-3.5 w-3.5" />Baixar</a></div>}
    <div className="grid h-[calc(100dvh-240px)] min-h-[560px] min-w-0 grid-cols-[minmax(160px,220px)_minmax(0,1fr)] overflow-hidden rounded-xl border border-border xl:grid-cols-[240px_minmax(0,1fr)_250px]">
      {preview ? <DocumentNavigation sections={preview.document.sections} layout={preview.layout} activeId={activeId} expanded={expanded} onExpand={toggleExpanded} onNavigate={interactWithTopic} /> : <div className="border-r border-border bg-card p-4 text-sm text-muted-foreground">Sumário{loading && <p className="mt-4 text-xs">Carregando estrutura…</p>}</div>}
      <div className="flex min-h-0 min-w-0 flex-col bg-muted/50">
        <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-auto [overflow-anchor:none]" aria-label={manual === "acabamentos" ? "Pré-visualização da tabela de acabamentos em páginas A4" : "Pré-visualização do manual em páginas A4"} aria-busy={loading}>
          {preview ? <div className="flex min-h-full min-w-max flex-col items-center gap-6 p-6">{visiblePages.map(item => <PageSheet key={item.number} page={item} preview={preview} zoom={zoom} pageRefs={pageRefs} onNavigate={navigate} editMode={interactionMode === "edit"} onEditSection={editSection} />)}</div> : <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><FileText className="h-10 w-10 text-muted-foreground/50" />{loading ? <><Loader2 className="h-5 w-5 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Preparando documento…</p></> : manual === "acabamentos" && !unitId ? <><p className="text-sm text-muted-foreground">{unitsLoaded && !units.length ? "Cadastre uma unidade e prepare sua tabela de acabamentos para visualizar e emitir o PDF." : "Selecione a unidade para conferir sua tabela de acabamentos."}</p><a href={stageHref("unidade")} className="text-sm font-medium text-primary hover:underline">{unitsLoaded && !units.length ? "Cadastrar unidade" : "Elaborar tabelas de acabamento"}</a></> : <><p className="text-sm text-muted-foreground">{manual === "acabamentos" ? "Não foi possível preparar a tabela desta unidade. Confira a seleção e tente novamente." : "O preview estará disponível com a estrutura do manual, mesmo antes de sua conclusão."}</p><Button variant="outline" size="sm" onClick={() => void load()}>Carregar preview</Button></>}</div>}
        </div>
        <div className="flex shrink-0 items-center justify-center gap-3 border-t border-border bg-card px-3 py-2"><Button variant="ghost" size="icon-sm" aria-label="Página anterior" disabled={page <= 1 || !preview} onClick={() => movePage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button><label className="flex items-center gap-2 text-xs text-muted-foreground">Página<input aria-label="Ir para página" type="number" min={1} max={pageCount || 1} value={page} onChange={event => { const next = Number(event.target.value); if (Number.isFinite(next) && next >= 1) movePage(next) }} className="h-7 w-12 rounded-md border border-input bg-background px-1 text-center text-foreground" />de {pageCount}</label><Button variant="ghost" size="icon-sm" aria-label="Próxima página" disabled={page >= pageCount || !preview} onClick={() => movePage(page + 1)}><ChevronRight className="h-4 w-4" /></Button></div>
      </div>
      <aside className="hidden min-h-0 overflow-y-auto border-l border-border bg-card xl:block" aria-label="Informações da seção"><SectionInspector key={scope} {...inspectorProps} /></aside>
    </div>
    <VersionHistory key={scope + ":versions"} open={historyOpen} onOpenChange={setHistoryOpen} versions={versions} role={role} onTransition={transition} />
    <Dialog open={pendingOpen} onOpenChange={setPendingOpen}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Pendências do documento</DialogTitle><DialogDescription>{labels[manual]}{selectedUnit ? " · " + [selectedUnit.tower, "Unidade " + selectedUnit.number].filter(Boolean).join(" / ") : ""} · {overall}% concluído. Corrija o conteúdo na elaboração e atualize o preview.</DialogDescription></DialogHeader><div className="max-h-[65vh] space-y-4 overflow-y-auto">
      {preview?.readiness.stages.map(stage => <div key={stage.id} className="rounded-lg border border-border p-3"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">{stage.name}</h3><span className="text-xs text-muted-foreground">{stage.progress}%</span></div>{stage.pending.map((item, index) => <p key={index} className="mt-1 text-xs text-destructive">{item}</p>)}{stage.pending.length > 0 && <a href={stageHref(stage.id)} className="mt-2 inline-block text-xs text-primary underline">Corrigir esta etapa</a>}</div>)}
      {pendingSections.length > 0 && <div><h3 className="mb-2 text-sm font-semibold">Conteúdo por seção</h3><div className="space-y-1">{pendingSections.map(section => <div key={section.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2"><ContentStatusIcon status={section.validationStatus} /><button type="button" onClick={() => { navigate(section.id); setPendingOpen(false) }} className="min-w-0 flex-1 text-left text-xs hover:text-primary">{section.number ? section.number + " " : ""}{section.title}<span className="mt-0.5 block text-[10px] text-muted-foreground">{contentStatusLabels[section.validationStatus]}</span></button>{section.editHref && <a href={section.editHref} className="shrink-0 text-xs text-primary underline">Corrigir</a>}</div>)}</div></div>}
      {preview?.readiness.blocking.length ? <div className="space-y-1 rounded-md bg-destructive/5 p-3">{preview.readiness.blocking.map((item, index) => <p key={index} className="text-xs text-destructive">{item}</p>)}</div> : <p className="text-sm text-success">Nenhuma pendência obrigatória para emissão.</p>}
      {preview?.layout.warnings.length ? <div className="space-y-1 rounded-md bg-warning/5 p-3">{preview.layout.warnings.map((item, index) => <p key={index} className="text-xs text-warning">{item}</p>)}</div> : null}
    </div></DialogContent></Dialog>
    <Dialog open={inspectorOpen} onOpenChange={setInspectorOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Informações da seção</DialogTitle></DialogHeader><div className="max-h-[70vh] overflow-y-auto"><SectionInspector key={scope + ":mobile"} {...inspectorProps} /></div></DialogContent></Dialog>
    <Dialog open={manual !== "acabamentos" && optionalOpen} onOpenChange={setOptionalOpen}><DialogContent><DialogHeader><DialogTitle>Módulos opcionais</DialogTitle><DialogDescription>Defina quais seções se aplicam a este manual. A macroestrutura permanece protegida.</DialogDescription></DialogHeader><div className="space-y-3">{optionalManualSectionIds.map(id => <label key={id} className="flex items-center gap-3 rounded-md border border-border p-3 text-sm"><input type="checkbox" checked={editorial?.sections[id]?.enabled !== false} disabled={!editorial || editorial.canEdit === false || role === "validator" || actionBusy || compiling} onChange={event => void editorialAction({ action: "settings", optional: { [id]: event.target.checked } }).catch(cause => setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a aplicabilidade."))} /><span>{editableManualSections.find(section => section.id === id)?.title ?? id}</span>{editorial?.sections[id]?.enabled === false && <span className="ml-auto text-xs text-muted-foreground">Não aplicável</span>}</label>)}</div></DialogContent></Dialog>
  </div>
}

const PageSheet = memo(function PageSheet({ page, preview, zoom, pageRefs, onNavigate, editMode, onEditSection }: { page: ManualPageData; preview: ManualPreview; zoom: number; pageRefs: React.RefObject<Map<number, HTMLDivElement>>; onNavigate: (id: string) => void; editMode: boolean; onEditSection: (id: string, editHref?: string) => void }) {
  const width = page.width * pointToPixel * zoom
  const height = page.height * pointToPixel * zoom
  return <div ref={element => { if (element) pageRefs.current.set(page.number, element); else pageRefs.current.delete(page.number) }} data-manual-page={page.number} className="shrink-0 bg-white shadow-lg ring-1 ring-black/5" style={{ width, height, contentVisibility: "auto", containIntrinsicSize: width + "px " + height + "px" }}><ManualPage page={page} layout={preview.layout} document={preview.document} onNavigate={onNavigate} editMode={editMode} onEditSection={onEditSection} /></div>
})
