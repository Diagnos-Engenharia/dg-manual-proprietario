"use client"

import { memo, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, FileText, History, ListFilter, Loader2, Maximize, Minus, PanelRight, Plus, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { type ManualPage as ManualPageData, type ManualPreview } from "@/lib/manual-document/types"
import { editableManualSections } from "@/lib/manual-document/build"
import { optionalManualSectionIds } from "@/lib/manual-content"
import { cn } from "@/lib/utils"
import { ManualPage } from "./manual-page"
import { ContentStatusIcon, contentStatusLabels, DocumentNavigation } from "./document-navigation"
import { SectionInspector, type ManualInteractionMode } from "./section-inspector"
import { manualFileUrl, VersionHistory, versionStatusLabels } from "./version-history"
import { useCompilerData, type DocumentType } from "./use-compiler-data"
import { useDocumentViewport, pointToPixel, type ViewMode } from "./use-document-viewport"

const labels: Record<DocumentType, string> = { proprietario: "Manual do Proprietário", sindico: "Manual do Síndico", acabamentos: "Tabelas de acabamento" }

export function PdfCompiler({ developmentId, role }: { developmentId?: string; role: "admin" | "editor" | "validator" }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedManual = searchParams.get("manual") === "acabamentos" ? "acabamentos" : searchParams.get("manual") === "sindico" ? "sindico" : "proprietario"
  const requestedUnit = searchParams.get("unidade")
  const requestedSection = searchParams.get("secao")
  const [target, setTarget] = useState<{ manual: DocumentType; unitId: string | null }>({ manual: requestedManual, unitId: requestedUnit })
  const { manual, unitId } = target
  const [interactionMode, setInteractionMode] = useState<ManualInteractionMode>("view")
  const [dialog, setDialog] = useState<"history" | "pending" | "inspector" | "optional" | null>(null)
  const [now, setNow] = useState(Date.now())
  const onCompiled = useCallback(() => setDialog("history"), [])
  const { scope, preview, editorial, versions, units, unitsLoaded, loading, compiling, actionBusy, error, success, load, editorialAction, transition, compile, setError } = useCompilerData({ developmentId, manual, unitId, role, onCompiled })
  const { activeId, expanded, page, zoom, viewMode, setViewMode, sectionById, pendingSections, activeSection, pageCount, visiblePages, viewportRef, pageRefs, navigate, toggleExpanded, changeZoom, fit, movePage } = useDocumentViewport(preview, scope, requestedSection)
  useEffect(() => { setTarget({ manual: requestedManual, unitId: requestedUnit }) }, [requestedManual, requestedUnit])
  useEffect(() => { setInteractionMode("view"); setDialog(null) }, [scope])
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 10000); return () => window.clearInterval(timer) }, [])
  const historyOpen = dialog === "history", pendingOpen = dialog === "pending", inspectorOpen = dialog === "inspector", optionalOpen = dialog === "optional"
  const setHistoryOpen = (open: boolean) => setDialog(open ? "history" : null)
  const setPendingOpen = (open: boolean) => setDialog(open ? "pending" : null)
  const setInspectorOpen = (open: boolean) => setDialog(open ? "inspector" : null)
  const setOptionalOpen = (open: boolean) => setDialog(open ? "optional" : null)
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
    setTarget({ manual: next, unitId: nextUnit })
    const params = new URLSearchParams(searchParams.toString())
    params.set("modulo", "emissao"); params.set("manual", next)
    for (const key of ["secao", "item", "conteudo", "grupo", "ambiente", "unidade"]) params.delete(key)
    if (next === "acabamentos" && nextUnit) params.set("unidade", nextUnit)
    router.replace("/empreendimentos/" + encodeURIComponent(developmentId ?? "") + "?" + params, { scroll: false })
  }
  const selectedUnit = manual === "acabamentos" ? units.find(unit => unit.id === unitId) : undefined

  if (!developmentId) return <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">Selecione um empreendimento para compor o manual.</div>
  return <div className="flex min-w-0 flex-col gap-2">
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-3"><label className="sr-only" htmlFor="manual-type">Tipo de manual</label><select id="manual-type" value={manual} onChange={event => selectTarget(event.target.value as DocumentType)} className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm font-semibold">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{manual === "acabamentos" && <><label className="sr-only" htmlFor="finishing-unit">Unidade da tabela</label><select id="finishing-unit" value={unitId ?? ""} disabled={loading} onChange={event => selectTarget("acabamentos", event.target.value || null)} className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Selecione uma unidade</option>{unitId && !units.some(unit => unit.id === unitId) && <option value={unitId}>Unidade indisponível</option>}{units.map(unit => <option key={unit.id} value={unit.id}>{[unit.tower, "Unidade " + unit.number].filter(Boolean).join(" · ")}</option>)}</select></>}{preview && <><span className="text-xs tabular-nums text-muted-foreground">Rev. {String(revision).padStart(2, "0")} · {pageCount} páginas</span><Badge variant="outline" className={cn(ready && "border-success/30 text-success")}>{overall}% concluído</Badge></>}</div>
        <div className="flex flex-wrap items-center gap-1.5"><Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading || compiling || actionBusy}><RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />Atualizar preview</Button>{manual !== "acabamentos" && <Button variant="ghost" size="sm" onClick={() => setOptionalOpen(true)}><ListFilter className="h-3.5 w-3.5" />Módulos</Button>}<Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} disabled={manual === "acabamentos" && !unitId}><History className="h-3.5 w-3.5" />Histórico</Button><Button variant="outline" size="sm" onClick={() => setPendingOpen(true)} disabled={!preview}><AlertTriangle className="h-3.5 w-3.5" />Pendências{pendingCount > 0 && <span className="rounded bg-muted px-1.5 text-[10px]">{pendingCount}</span>}</Button></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-1.5">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">{ready ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <FileText className="h-3.5 w-3.5" />}<span>{documentState}</span>{versions[0] && <span className="hidden sm:inline">· Última emissão: {versionStatusLabels[versions[0].status] ?? versions[0].status}</span>}<span className="hidden md:inline">· {preview ? elapsed < 60 ? "Preview atualizado há " + elapsed + " s" : "Preview atualizado há " + Math.floor(elapsed / 60) + " min" : "Preparando preview"}</span></div>
        <div className="flex flex-wrap items-center gap-1"><Button variant="ghost" size="icon-sm" aria-label="Diminuir zoom" onClick={() => changeZoom(zoom - 0.1)}><Minus className="h-3.5 w-3.5" /></Button><span className="min-w-10 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span><Button variant="ghost" size="icon-sm" aria-label="Aumentar zoom" onClick={() => changeZoom(zoom + 0.1)}><Plus className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="sm" onClick={() => fit("page")} disabled={!preview}><Maximize className="h-3.5 w-3.5" />Página</Button><Button variant="ghost" size="sm" onClick={() => fit("width")} disabled={!preview}>Largura</Button><select aria-label="Modo de visualização" value={viewMode} onChange={event => setViewMode(event.target.value as ViewMode)} className="ml-1 h-7 rounded-md border border-input bg-background px-1.5 text-xs"><option value="continuous">Contínuo</option><option value="single">Página única</option></select><Button variant="ghost" size="icon-sm" aria-label="Abrir informações da seção" className="xl:hidden" onClick={() => setInspectorOpen(true)}><PanelRight className="h-4 w-4" /></Button></div>
      </div>
    </div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
    {success && <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-success/20 bg-success/5 px-3 py-2 text-xs"><CheckCircle2 className="h-4 w-4 text-success" /><span>Rev. {String(success.revision).padStart(2, "0")} emitida · {success.pages} páginas</span><a href={manualFileUrl(success.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><Eye className="h-3.5 w-3.5" />Visualizar</a><a href={manualFileUrl(success.id)} download={success.filename} className="inline-flex items-center gap-1 text-primary hover:underline"><Download className="h-3.5 w-3.5" />Baixar</a></div>}
    <div className="grid h-[clamp(440px,calc(100dvh-240px),680px)] min-h-0 min-w-0 grid-cols-[minmax(150px,210px)_minmax(0,1fr)] overflow-hidden rounded-xl border border-border xl:grid-cols-[220px_minmax(0,1fr)_230px]">
      {preview ? <DocumentNavigation sections={preview.document.sections} layout={preview.layout} activeId={activeId} expanded={expanded} onExpand={toggleExpanded} onNavigate={interactWithTopic} /> : <div className="border-r border-border bg-card p-4 text-sm text-muted-foreground">Sumário{loading && <p className="mt-4 text-xs">Carregando estrutura…</p>}</div>}
      <div className="flex min-h-0 min-w-0 flex-col bg-muted/50">
        <div ref={viewportRef} data-preview-viewport className="relative min-h-0 flex-1 overflow-auto [overflow-anchor:none]" aria-label={manual === "acabamentos" ? "Pré-visualização da tabela de acabamentos em páginas A4" : "Pré-visualização do manual em páginas A4"} aria-busy={loading}>
          {preview ? <div className="flex min-h-full min-w-max flex-col items-center gap-3 p-3">{visiblePages.map(item => <PageSheet key={item.number} page={item} preview={preview} zoom={zoom} pageRefs={pageRefs} onNavigate={navigate} editMode={interactionMode === "edit"} onEditSection={editSection} />)}</div> : <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><FileText className="h-10 w-10 text-muted-foreground/50" />{loading ? <><Loader2 className="h-5 w-5 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Preparando documento…</p></> : manual === "acabamentos" && !unitId ? <><p className="text-sm text-muted-foreground">{unitsLoaded && !units.length ? "Cadastre uma unidade e prepare sua tabela de acabamentos para visualizar e emitir o PDF." : "Selecione a unidade para conferir sua tabela de acabamentos."}</p><a href={stageHref("unidade")} className="text-sm font-medium text-primary hover:underline">{unitsLoaded && !units.length ? "Cadastrar unidade" : "Elaborar tabelas de acabamento"}</a></> : <><p className="text-sm text-muted-foreground">{manual === "acabamentos" ? "Não foi possível preparar a tabela desta unidade. Confira a seleção e tente novamente." : "O preview estará disponível com a estrutura do manual, mesmo antes de sua conclusão."}</p><Button variant="outline" size="sm" onClick={() => void load()}>Carregar preview</Button></>}</div>}
        </div>
        <div className="flex shrink-0 items-center justify-center gap-2 border-t border-border bg-card px-3 py-1.5"><Button variant="ghost" size="icon-sm" aria-label="Página anterior" disabled={page <= 1 || !preview} onClick={() => movePage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button><label className="flex items-center gap-2 text-xs text-muted-foreground">Página<input aria-label="Ir para página" type="number" min={1} max={pageCount || 1} value={page} onChange={event => { const next = Number(event.target.value); if (Number.isFinite(next) && next >= 1) movePage(next) }} className="h-7 w-12 rounded-md border border-input bg-background px-1 text-center text-foreground" />de {pageCount}</label><Button variant="ghost" size="icon-sm" aria-label="Próxima página" disabled={page >= pageCount || !preview} onClick={() => movePage(page + 1)}><ChevronRight className="h-4 w-4" /></Button></div>
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
