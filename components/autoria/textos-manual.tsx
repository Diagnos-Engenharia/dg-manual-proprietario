"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Check, ExternalLink, Loader2, Plus, Save, Search, Send, Trash2, X } from "lucide-react"
import { editableManualSections } from "@/lib/manual-document/build"
import { htmlToLines, manualScope, optionalManualSectionIds } from "@/lib/manual-content"
import type { ContentStatus } from "@/lib/manual-document/types"
import type { ManualType, TechnicalContact } from "@/lib/mock-data"
import type { TechnicalCatalog, TechnicalSection, TechnicalSystem, TechnicalSystemDraft } from "@/lib/technical-content"
import { SystemTechnicalEditor } from "./system-technical-editor"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ContentStatusIcon, contentStatusLabels } from "@/components/emissao/document-navigation"
import { cn } from "@/lib/utils"

const RichTextEditor = dynamic(() => import("./rich-text-editor").then(module => module.RichTextEditor), {
  ssr: false, loading: () => <p className="p-4 text-sm text-muted-foreground">Abrindo editor…</p>,
})

type WarrantyRow = Record<string, string>
type EditorialSection = { html?: string; status?: string; comment?: string | null; enabled?: boolean }
type EditorialData = {
  sections: Record<string, EditorialSection>; warranties?: WarrantyRow[]; contacts?: TechnicalContact[]
  commissioning?: Record<string, { company?: string; phone?: string; site?: string; instructions?: string }>
  canEdit?: boolean; canValidate?: boolean
}
type EditorialAction = { action: string; sectionId?: string; html?: string; comment?: string; warranties?: WarrantyRow[]; tableId?: string; revision?: number; optional?: Record<string, boolean> }
type FixedSection = { id: string; title: string; number?: string }
type CatalogEntry = { kind: "section" | "system"; id: string; title: string; number?: string; chapter: string; category?: string; searchText: string; status: ContentStatus; descriptionStatus?: ContentStatus; maintenanceStatus?: ContentStatus }
const manualLabels: Record<ManualType, string> = { proprietario: "Manual do Proprietário", sindico: "Manual do Síndico" }
const optionalIds = new Set<string>(optionalManualSectionIds)
const sourceIds = new Set(["projetistas", "fornecedores", "responsaveis-tecnicos"])
const serviceIds = new Set(["agua", "energia", "gas", "telecom"])

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() }
function sectionTitle(id: string, title: string, manual: ManualType) {
  if (manual === "sindico" && id === "reformas") return "Reformas nas áreas comuns"
  if (manual === "sindico" && id === "documentacao") return "Documentação das áreas comuns"
  return title
}
function contentStatus(value: string | undefined): ContentStatus {
  return value === "aprovado" || value === "aguardando_validacao" || value === "reprovado" ? value : "rascunho"
}
async function readEditorial(response: Response): Promise<EditorialData> {
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar os textos do manual.")
  return result
}
async function readTechnical(response: Response): Promise<TechnicalCatalog> {
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar os sistemas do manual.")
  return result
}

function fixedSectionStatus(section: FixedSection, data: EditorialData | null): ContentStatus {
  const entry = data?.sections[section.id]
  if (optionalIds.has(section.id) && entry?.enabled === false) return "nao_aplicavel"
  const hasHtml = htmlToLines(entry?.html ?? "").length > 0
  const hasContacts = sourceIds.has(section.id) && (data?.contacts ?? []).some(contact => contact.kind === (section.id === "fornecedores" ? "fornecedor" : "projetista"))
  const hasService = serviceIds.has(section.id) && Object.values(data?.commissioning?.[section.id] ?? {}).some(value => value?.trim())
  const hasWarranty = section.id === "garantias-tabela" && (data?.warranties ?? []).some(row => Object.values(row).some(value => value.trim()))
  return hasHtml || hasContacts || hasService || hasWarranty ? contentStatus(entry?.status) : "sem_conteudo"
}
function systemDisplayStatus(system: TechnicalSystem, part: TechnicalSection): ContentStatus {
  const status = part === "sistemas" ? system.descriptionStatus : system.maintenanceStatus
  const empty = part === "sistemas" ? !htmlToLines(system.html).length : system.maintenance.length === 0
  return status === "rascunho" && empty ? "sem_conteudo" : contentStatus(status)
}

/** One catalog owns the manual, stable selection and drafts for both content sources. */
export function TextosManual({ developmentId }: { developmentId: string }) {
  const router = useRouter(), pathname = usePathname(), searchParams = useSearchParams()
  const manualParam = searchParams.get("manual")
  const requestedItem = searchParams.get("item")
  const requestedContent = searchParams.get("conteudo")
  const requestedSection = searchParams.get("secao")
  const requestedDefault = searchParams.get("aba") === "sistemas" || (!requestedSection && requestedContent === "manutencao") ? "sistemas" : "apresentacao"
  const requestedManual = manualParam === "sindico" || (!manualParam && requestedItem?.endsWith("::comum")) ? "sindico" : "proprietario"
  const [manual, setManual] = useState<ManualType>(requestedManual)
  const [sectionId, setSectionId] = useState(requestedSection ?? requestedDefault)
  const [itemKey, setItemKey] = useState<string | null>(requestedItem)
  const [activeContent, setActiveContent] = useState<TechnicalSection>(requestedContent === "manutencao" || requestedSection === "manutencao-tabela" ? "manutencao" : "sistemas")
  const [loaded, setLoaded] = useState<{ scope: string; value: EditorialData } | null>(null)
  const [technicalLoaded, setTechnicalLoaded] = useState<{ scope: string; value: TechnicalCatalog } | null>(null)
  const [systemDrafts, setSystemDrafts] = useState<Record<string, TechnicalSystemDraft>>({})
  const [systemBusyKey, setSystemBusyKey] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [warrantyDrafts, setWarrantyDrafts] = useState<Partial<Record<ManualType, WarrantyRow[]>>>({})
  const [comments, setComments] = useState<Record<string, string>>({})
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const scope = developmentId + ":" + manual
  const data = loaded?.scope === scope ? loaded.value : null
  const technical = technicalLoaded?.scope === scope ? technicalLoaded.value : null
  const currentScope = useRef(scope)
  currentScope.current = scope
  const loadController = useRef<AbortController | null>(null)
  const operationController = useRef<AbortController | null>(null)
  const loadSequence = useRef(0)
  const operationSequence = useRef(0)
  const sections = useMemo(() => editableManualSections.map(section => ({ ...section, title: sectionTitle(section.id, section.title, manual) })), [manual])
  const wantsSystem = itemKey !== null || sectionId === "sistemas" || sectionId === "manutencao-tabela" || sectionId.startsWith("sistema-")
  const selectedSystem = wantsSystem ? itemKey !== null
    ? technical?.systems.find(system => system.key === itemKey)
    : sectionId.startsWith("sistema-") ? technical?.systems.find(system => system.item.id === sectionId.slice("sistema-".length)) : technical?.systems[0] : undefined
  const hasExplicitSystem = itemKey !== null || sectionId.startsWith("sistema-")
  const malformedKey = itemKey !== null && (itemKey.split("::").length !== 2 || !itemKey.split("::")[0] || !/::(?:unidade|comum)$/.test(itemKey))
  const invalidScope = itemKey !== null && !itemKey.endsWith("::" + manualScope(manual))
  const panelKey = selectedSystem ? scope + ":" + selectedSystem.key : null
  const activePanel = useRef(panelKey)
  activePanel.current = panelKey
  const systemBusy = panelKey !== null && systemBusyKey === panelKey
  const navigationBusy = busy || systemBusy
  const selected = sections.find(section => section.id === sectionId) ?? sections[0]
  const fixedSelectionAvailable = sections.some(section => section.id === sectionId)
  const draftKey = manual + ":" + selected.id
  const entry = data?.sections[selected.id]
  const status = entry?.enabled === false && optionalIds.has(selected.id) ? "nao_aplicavel" : contentStatus(entry?.status)
  const canEdit = data?.canEdit === true
  const canReview = data?.canValidate === true
  const editable = canEdit && status !== "aguardando_validacao" && !busy && !loading
  const isWarranty = selected.id === "garantias-tabela"
  const html = drafts[draftKey] ?? entry?.html ?? ""
  const warranties = warrantyDrafts[manual] ?? data?.warranties ?? []
  const dirty = isWarranty ? JSON.stringify(warranties) !== JSON.stringify(data?.warranties ?? []) : html !== (entry?.html ?? "")
  const comment = comments[draftKey] ?? ""
  const contacts = sourceIds.has(selected.id) ? (data?.contacts ?? []).filter(contact => contact.kind === (selected.id === "fornecedores" ? "fornecedor" : "projetista")) : []
  const service = serviceIds.has(selected.id) ? data?.commissioning?.[selected.id] : undefined
  const hasContent = isWarranty ? warranties.some(row => Object.values(row).some(value => value.trim())) : htmlToLines(html).length > 0 || contacts.length > 0 || Boolean(service && Object.values(service).some(value => value?.trim()))
  const catalog = useMemo<CatalogEntry[]>(() => [
    ...sections.map(section => ({ kind: "section" as const, id: section.id, title: section.title, number: section.number, chapter: section.number?.split(".")[0] ?? "0", searchText: normalize(section.title + " " + (section.number ?? "")), status: fixedSectionStatus(section, data) })),
    ...(technical?.systems ?? []).map((system, index) => ({ kind: "system" as const, id: system.key, title: system.item.item, number: `4.${index + 1}`, chapter: "4", category: system.item.category, searchText: normalize(system.item.item + " " + system.item.category + " " + system.item.norms.join(" ") + ` 4.${index + 1}`), status: systemDisplayStatus(system, "sistemas"), descriptionStatus: systemDisplayStatus(system, "sistemas"), maintenanceStatus: systemDisplayStatus(system, "manutencao") })),
  ].sort((first, second) => Number(first.chapter) - Number(second.chapter) || (first.number ?? "").localeCompare(second.number ?? "", "pt-BR", { numeric: true })), [sections, data, technical])

  const load = useCallback(async () => {
    loadController.current?.abort()
    const controller = new AbortController(), sequence = ++loadSequence.current
    loadController.current = controller
    const requestScope = developmentId + ":" + manual
    setLoading(true)
    try {
      const params = new URLSearchParams({ developmentId, manualType: manual })
      const results = await Promise.allSettled([
        fetch("/api/manuals/editorial?" + params, { signal: controller.signal, cache: "no-store" }).then(readEditorial),
        fetch("/api/manuals/technical?" + params, { signal: controller.signal, cache: "no-store" }).then(readTechnical),
      ])
      if (controller.signal.aborted || loadSequence.current !== sequence || currentScope.current !== requestScope) return
      const [editorialResult, technicalResult] = results
      const failures: string[] = []
      if (editorialResult.status === "fulfilled") setLoaded({ scope: requestScope, value: editorialResult.value })
      else failures.push(editorialResult.reason instanceof Error ? editorialResult.reason.message : "Não foi possível carregar os textos fixos.")
      if (technicalResult.status === "fulfilled") setTechnicalLoaded({ scope: requestScope, value: technicalResult.value })
      else failures.push(technicalResult.reason instanceof Error ? technicalResult.reason.message : "Não foi possível carregar os sistemas.")
      setError(failures.length ? failures.join(" ") : null)
      return editorialResult.status === "fulfilled" ? editorialResult.value : undefined
    } catch (cause) {
      if (!controller.signal.aborted && loadSequence.current === sequence && currentScope.current === requestScope) setError(cause instanceof Error ? cause.message : "Não foi possível carregar os textos.")
    } finally {
      if (!controller.signal.aborted && loadSequence.current === sequence && currentScope.current === requestScope) setLoading(false)
    }
  }, [developmentId, manual])

  useEffect(() => { setManual(requestedManual) }, [requestedManual])
  useEffect(() => { setSectionId(requestedSection ?? requestedDefault); setItemKey(requestedItem); setActiveContent(requestedContent === "manutencao" || requestedSection === "manutencao-tabela" ? "manutencao" : "sistemas"); setNotice(null); setError(null) }, [requestedSection, requestedDefault, requestedItem, requestedContent])
  useEffect(() => {
    setLoaded(null); setTechnicalLoaded(null); setError(null); setNotice(null); setBusy(false)
    operationController.current?.abort(); operationSequence.current++
    void load()
    return () => { loadController.current?.abort(); operationController.current?.abort() }
  }, [load])

  function navigate(nextManual: ManualType, nextSection: string, nextItem: string | null = null, content: TechnicalSection = "sistemas") {
    setManual(nextManual); setSectionId(nextSection); setItemKey(nextItem); setActiveContent(content); setError(null); setNotice(null)
    const params = new URLSearchParams(searchParams.toString())
    params.set("modulo", "elaboracao"); params.set("aba", "textos"); params.set("manual", nextManual)
    params.delete("item"); params.delete("servico"); params.delete("tipologia"); params.delete("secao"); params.delete("conteudo")
    if (nextItem) params.set("item", nextItem)
    else params.set("secao", nextSection)
    if ((nextItem || nextSection === "sistemas") && content === "manutencao") params.set("conteudo", "manutencao")
    router.push(pathname + "?" + params.toString(), { scroll: false })
  }
  function updateSystem(system: TechnicalSystem) {
    if (currentScope.current !== scope) return
    setTechnicalLoaded(current => current?.scope === scope ? { ...current, value: { ...current.value, systems: current.value.systems.map(entry => entry.key === system.key ? system : entry) } } : current)
  }
  function updateSystemDraft(patch: TechnicalSystemDraft) {
    if (!panelKey) return
    const key = panelKey
    setSystemDrafts(current => {
      const next = { ...current[key], ...patch }
      for (const part of Object.keys(patch) as Array<keyof TechnicalSystemDraft>) if (patch[part] === undefined) delete next[part]
      const result = { ...current }
      if (Object.keys(next).length) result[key] = next
      else delete result[key]
      return result
    })
  }
  function sourceHref(tab: string, extra?: string) {
    const params = new URLSearchParams({ modulo: "elaboracao", aba: tab, manual })
    if (extra) params.set(tab === "acabamentos" ? "tipologia" : "servico", extra)
    return pathname + "?" + params.toString()
  }
  async function run(action: EditorialAction, message: string) {
    if (busy || loading) return
    const actionScope = scope, actionDraftKey = draftKey, actionManual = manual
    const sequence = ++operationSequence.current, controller = new AbortController()
    operationController.current = controller
    setBusy(true); setError(null); setNotice(null)
    try {
      const response = await fetch("/api/manuals/editorial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...action, developmentId, manualType: actionManual }), signal: controller.signal })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? "Não foi possível atualizar o conteúdo.")
      if (controller.signal.aborted || currentScope.current !== actionScope || operationSequence.current !== sequence) return
      const refreshed = await load()
      if (controller.signal.aborted || currentScope.current !== actionScope || operationSequence.current !== sequence) return
      if (action.action === "save" && refreshed) {
        setDrafts(all => { const next = { ...all }; delete next[actionDraftKey]; return next })
        if (action.warranties) setWarrantyDrafts(all => { const next = { ...all }; delete next[actionManual]; return next })
      }
      if (currentScope.current === actionScope && operationSequence.current === sequence) setNotice(message)
    } catch (cause) {
      if (!controller.signal.aborted && currentScope.current === actionScope && operationSequence.current === sequence) setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o conteúdo.")
    } finally {
      if (currentScope.current === actionScope && operationSequence.current === sequence) setBusy(false)
    }
  }
  function save() {
    return run({ action: "save", sectionId: selected.id, ...(isWarranty ? { warranties } : { html }) }, "Texto salvo. Envie para validação quando concluir a revisão.")
  }

  return <div className="space-y-4">
    <Card className="flex flex-wrap items-start justify-between gap-4 p-5 md:flex-row">
      <div className="min-w-0 flex-1"><h2 className="text-lg font-semibold">Textos técnicos</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Edite os textos fixos, a descrição e a manutenção dos sistemas no mesmo catálogo. O checklist define os sistemas de cada manual.</p><a href={sourceHref("checklist")} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" />Ajustar Checklist Inicial</a></div>
      <div className="flex shrink-0 flex-wrap items-center gap-2"><label className="sr-only" htmlFor="editorial-manual-type">Tipo de manual dos textos</label><select id="editorial-manual-type" value={manual} disabled={navigationBusy} onChange={event => { const next = event.target.value as ManualType; navigate(next, wantsSystem ? "sistemas" : selected.id, null, wantsSystem ? activeContent : "sistemas") }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">{Object.entries(manualLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    </Card>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <TechnicalCatalogNavigation entries={catalog} manual={manual} selectedId={wantsSystem ? selectedSystem?.key : fixedSelectionAvailable ? selected.id : undefined} query={query} onQueryChange={setQuery} disabled={navigationBusy || loading} loading={loading} hasSystems={Boolean(technical?.systems.length)} onSelect={entry => navigate(manual, entry.kind === "system" ? "sistemas" : entry.id, entry.kind === "system" ? entry.id : null)} checklistHref={sourceHref("checklist")} />
      <Card className="min-w-0 p-5">
        {!wantsSystem && fixedSelectionAvailable && <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">{manualLabels[manual]}</p><h3 className="mt-1 text-base font-semibold">{selected.number ? selected.number + " " : ""}{selected.title}</h3></div>{data && <Badge variant="outline" className={cn(status === "aguardando_validacao" && "border-amber-500/40 text-amber-600", status === "aprovado" && "border-success/30 text-success")}>{contentStatusLabels[status]}</Badge>}</div>}
        {error && <div role="alert" className="mb-4 space-y-2 rounded-md border border-destructive/30 p-3 text-sm text-destructive"><p>{error}</p><Button size="sm" variant="outline" disabled={loading || navigationBusy} onClick={() => void load()}>Tentar novamente</Button></div>}
        {notice && <p role="status" className="mb-4 rounded-md border border-success/30 p-3 text-sm text-success">{notice}</p>}
        {loading && <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando conteúdo…</p>}
        {wantsSystem ? selectedSystem && technical && !invalidScope && !malformedKey ? <SystemTechnicalEditor key={panelKey} developmentId={developmentId} manualType={manual} system={selectedSystem} number={catalog.find(entry => entry.kind === "system" && entry.id === selectedSystem.key)?.number} activeContent={activeContent} onContentChange={content => navigate(manual, "sistemas", selectedSystem.key, content)} draft={panelKey ? systemDrafts[panelKey] : undefined} onDraftChange={updateSystemDraft} onSystemUpdated={updateSystem} canEdit={technical.canEdit && !loading} canValidate={technical.canValidate && !loading} onBusyChange={value => { if (value && activePanel.current === panelKey) setSystemBusyKey(panelKey); else if (!value) setSystemBusyKey(current => current === panelKey ? null : current) }} /> : !loading && <div className="space-y-3 rounded-md border border-border p-4"><h3 className="font-semibold">{hasExplicitSystem ? "Sistema indisponível" : "Sistemas do manual"}</h3><p role={hasExplicitSystem ? "alert" : "status"} className="text-sm text-muted-foreground">{malformedKey ? "Este link de sistema é inválido. Selecione um conteúdo do catálogo." : invalidScope ? "O sistema deste link pertence a outro manual. Selecione o manual correspondente ou escolha um sistema do catálogo." : hasExplicitSystem ? "Este sistema não está selecionado no checklist para este manual. Ajuste o checklist ou escolha outro conteúdo no catálogo." : technical ? "Nenhum sistema está selecionado no checklist para este manual." : "Os sistemas não puderam ser carregados. Tente novamente no aviso acima."}</p><a href={sourceHref("checklist")} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" />Ajustar Checklist Inicial</a></div> : !fixedSelectionAvailable ? <p role="alert" className="rounded-md border border-border p-4 text-sm text-muted-foreground">Esta seção não está disponível neste manual. Selecione um conteúdo no catálogo.</p> : data && <div className="space-y-4">
          {optionalIds.has(selected.id) && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={entry?.enabled !== false} disabled={!canEdit || busy || loading || dirty} onChange={event => void run({ action: "settings", optional: { [selected.id]: event.target.checked } }, "Aplicabilidade atualizada.")} />Incluir esta seção opcional no manual</label>}
          {sourceIds.has(selected.id) && <ContactSource contacts={contacts} editHref={sourceHref("contatos")} />}
          {serviceIds.has(selected.id) && <div className="space-y-2 rounded-md border border-border p-4"><p className="text-sm font-medium">Dados do comissionamento</p>{service && Object.values(service).some(value => value?.trim()) ? <><p className="text-sm">{[service.company, service.phone, service.site].filter(Boolean).join(" · ")}</p>{service.instructions && <p className="whitespace-pre-wrap text-sm">{service.instructions}</p>}</> : <p className="text-sm text-muted-foreground">Nenhum dado cadastrado para este atendimento.</p>}<a href={sourceHref("comissionamento", selected.id)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" />Editar dados do comissionamento</a></div>}
          {isWarranty ? <WarrantyEditor rows={warranties} disabled={!editable || status === "nao_aplicavel"} onChange={rows => setWarrantyDrafts(all => ({ ...all, [manual]: rows }))} /> : <div><p className="mb-2 text-xs font-medium text-muted-foreground">{sourceIds.has(selected.id) || serviceIds.has(selected.id) ? "Texto complementar da seção" : "Texto da seção"}</p><RichTextEditor key={draftKey} value={html} disabled={!editable || status === "nao_aplicavel"} onChange={value => setDrafts(all => ({ ...all, [draftKey]: value }))} /></div>}
          {entry?.comment && <p className="text-sm text-destructive">Motivo da reprovação: {entry.comment}</p>}
          {canReview && status === "aguardando_validacao" && <label className="block space-y-2 text-xs font-medium"><span>Justificativa de reprovação</span><Textarea aria-label="Justificativa de reprovação do texto" value={comment} onChange={event => setComments(all => ({ ...all, [draftKey]: event.target.value }))} placeholder="Informe o motivo para solicitar ajustes" rows={3} /></label>}
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {canEdit && status !== "aguardando_validacao" && status !== "nao_aplicavel" && <Button disabled={busy || loading || !dirty} onClick={() => void save()}><Save className="h-4 w-4" />Salvar texto</Button>}
            {canEdit && status !== "aprovado" && status !== "aguardando_validacao" && status !== "nao_aplicavel" && <Button variant="outline" disabled={busy || loading || dirty || !hasContent} onClick={() => void run({ action: "submit", sectionId: selected.id }, "Conteúdo enviado para validação.")}><Send className="h-4 w-4" />Enviar para validação</Button>}
            {canReview && status === "aguardando_validacao" && <><Button disabled={busy || loading || dirty} onClick={() => void run({ action: "approve", sectionId: selected.id }, "Conteúdo aprovado.")}><Check className="h-4 w-4" />Aprovar</Button><Button variant="outline" disabled={busy || loading || dirty || !comment.trim()} onClick={() => void run({ action: "reject", sectionId: selected.id, comment }, "Conteúdo reprovado com justificativa.")}><X className="h-4 w-4" />Reprovar</Button></>}
            {dirty && <span className="text-xs text-amber-600">Alterações ainda não salvas</span>}
            {status === "aguardando_validacao" && <span className="text-xs text-muted-foreground">Conteúdo enviado para revisão.</span>}
            {dirty || busy || loading ? <span aria-disabled="true" title={dirty ? "Salve as alterações antes de visualizar o manual" : "Aguarde a atualização do conteúdo"} className="ml-auto text-xs font-medium text-muted-foreground">Visualizar no manual</span> : <Link href={pathname + "?" + new URLSearchParams({ modulo: "emissao", manual, secao: selected.id })} prefetch={false} className="ml-auto text-xs font-medium text-primary hover:underline">Visualizar no manual</Link>}
          </div>
        </div>}
      </Card>
    </div>
  </div>
}

const chapterLabels: Record<string, string> = { "0": "Abertura", "1": "1 Introdução", "2": "2 Identificação do Empreendimento", "3": "3 Providências Iniciais", "4": "4 Sistemas Construtivos", "5": "5 Garantias e Assistência Técnica", "6": "6 Reformas", "7": "7 Documentação", "8": "8 Definições e Conceitos" }
function TechnicalCatalogNavigation({ entries, manual, selectedId, query, onQueryChange, disabled, loading, hasSystems, onSelect, checklistHref }: {
  entries: CatalogEntry[]; manual: ManualType; selectedId?: string; query: string; onQueryChange: (value: string) => void
  disabled: boolean; loading: boolean; hasSystems: boolean
  onSelect: (entry: CatalogEntry) => void; checklistHref: string
}) {
  const navigation = useRef<HTMLElement>(null)
  useEffect(() => {
    const container = navigation.current
    const selected = container?.querySelector<HTMLButtonElement>('button[aria-current="page"]')
    if (!container || !selected) return
    const containerBounds = container.getBoundingClientRect(), selectedBounds = selected.getBoundingClientRect()
    if (selectedBounds.top < containerBounds.top) container.scrollTop += selectedBounds.top - containerBounds.top
    else if (selectedBounds.bottom > containerBounds.bottom) container.scrollTop += selectedBounds.bottom - containerBounds.bottom
  }, [selectedId])
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean)
  const visible = entries.filter(entry => terms.every(term => entry.searchText.includes(term)))
  const chapters = Array.from(new Set(visible.map(entry => entry.chapter)))
  const filtered = Boolean(query.trim())
  function clearFilters() { onQueryChange("") }
  function renderEntry(entry: CatalogEntry) {
    const statusId = "technical-catalog-status-" + entry.kind + "-" + entry.id
    const title = (entry.number ? entry.number + " " : "") + entry.title
    return <li key={entry.kind + ":" + entry.id}><button type="button" aria-label={title} aria-describedby={statusId} disabled={disabled} aria-current={selectedId === entry.id ? "page" : undefined} onClick={() => onSelect(entry)} className={cn("w-full rounded-md px-2.5 py-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", selectedId === entry.id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted")}>
      <span className="flex items-start gap-2">{entry.kind === "section" && <ContentStatusIcon status={entry.status} className="mt-0.5" />}<span className="min-w-0 flex-1 leading-relaxed">{title}</span></span>
      {entry.kind === "system" ? <span id={statusId} className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px]"><span className="inline-flex items-center gap-1" title={"Descrição: " + contentStatusLabels[entry.descriptionStatus!]}><span>Descrição</span><ContentStatusIcon status={entry.descriptionStatus!} /></span><span className="inline-flex items-center gap-1" title={"Manutenção: " + contentStatusLabels[entry.maintenanceStatus!]}><span>Manutenção</span><ContentStatusIcon status={entry.maintenanceStatus!} /></span></span> : <span id={statusId} className="sr-only">{contentStatusLabels[entry.status]}</span>}
    </button></li>
  }
  return <Card className="h-fit overflow-hidden">
    <div className="space-y-2 border-b border-border p-3">
      <h3 className="text-sm font-semibold">Catálogo de textos técnicos</h3>
      <label className="relative block"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar textos técnicos" placeholder="Título, categoria ou norma" value={query} onChange={event => onQueryChange(event.target.value)} className="pl-8" /></label>
      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground"><span>{visible.length} de {entries.length} conteúdos</span>{filtered && <button type="button" onClick={clearFilters} className="font-medium text-primary hover:underline">Limpar pesquisa</button>}</div>
    </div>
    <nav ref={navigation} aria-label="Catálogo de textos técnicos" className="max-h-[70vh] space-y-3 overflow-y-auto p-2">
      {chapters.map(chapter => <div key={chapter}><h4 className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{chapterLabels[chapter] ?? chapter}</h4>{chapter === "4" ? Array.from(new Set(visible.filter(entry => entry.chapter === chapter).map(entry => entry.category ?? "Sistemas"))).map(category => <div key={category}><h5 className="border-l border-border px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground">{category}</h5><ul>{visible.filter(entry => entry.chapter === chapter && (entry.category ?? "Sistemas") === category).map(renderEntry)}</ul></div>) : <ul>{visible.filter(entry => entry.chapter === chapter).map(renderEntry)}</ul>}</div>)}
      {!visible.length && !loading && <p role="status" className="p-3 text-xs text-muted-foreground">Nenhum conteúdo corresponde à pesquisa.</p>}
      {!loading && !hasSystems && !filtered && <div className="rounded-md border border-border p-3 text-xs text-muted-foreground"><p>Nenhum sistema selecionado para {manualLabels[manual]}.</p><a href={checklistHref} className="mt-2 inline-block font-medium text-primary hover:underline">Ajustar Checklist Inicial</a></div>}
    </nav>
  </Card>
}

function ContactSource({ contacts, editHref }: { contacts: TechnicalContact[]; editHref: string }) {
  return <div className="space-y-3 rounded-md border border-border p-4"><p className="text-sm font-medium">Dados cadastrados de identificação e contato</p>{contacts.length ? contacts.map(contact => <div key={contact.id} className="rounded-md bg-muted/30 p-3"><p className="text-sm font-medium">{contact.discipline} · {contact.company}</p><p className="mt-1 text-sm">{[contact.name, contact.registration].filter(Boolean).join(" · ")}</p><p className="mt-1 text-xs text-muted-foreground">{[contact.phone, contact.whatsapp, contact.email].filter(Boolean).join(" · ")}</p></div>) : <p className="text-sm text-muted-foreground">Nenhum contato cadastrado.</p>}<a href={editHref} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" />Editar contatos cadastrados</a></div>
}

const warrantyLabels: Record<string, string> = { system: "Sistema", sistema: "Sistema", element: "Elemento", elemento: "Elemento", defect: "Descrição da falha", failure: "Descrição da falha", descricaoFalha: "Descrição da falha", period: "Prazo", prazo: "Prazo", conditions: "Condições", condicoes: "Condições", observacoes: "Observações", ano1: "1 ano", ano3: "3 anos", ano5: "5 anos", oneYear: "1 ano", threeYears: "3 anos", fiveYears: "5 anos" }
function WarrantyEditor({ rows, disabled, onChange }: { rows: WarrantyRow[]; disabled: boolean; onChange: (rows: WarrantyRow[]) => void }) {
  const keys = rows.length ? Array.from(new Set(rows.flatMap(row => Object.keys(row)))).filter(key => key !== "id") : ["sistema", "elemento", "descricaoFalha", "prazo", "condicoes"]
  return <div className="space-y-3"><div className="overflow-x-auto rounded-md border border-border"><table className="w-full min-w-[680px] text-xs"><caption className="sr-only">Prazos de garantia cadastrados</caption><thead className="bg-muted"><tr>{keys.map(key => <th key={key} scope="col" className="p-2 text-left font-medium">{warrantyLabels[key] ?? key}</th>)}{!disabled && <th scope="col" className="w-8"><span className="sr-only">Remover</span></th>}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? index} className="border-t border-border">{keys.map(key => <td key={key} className="p-1"><Textarea aria-label={(warrantyLabels[key] ?? key) + " da linha " + (index + 1)} disabled={disabled} value={row[key] ?? ""} rows={2} className="min-w-28 text-xs" onChange={event => onChange(rows.map((current, i) => i === index ? { ...current, [key]: event.target.value } : current))} /></td>)}{!disabled && <td><button type="button" aria-label={"Remover garantia da linha " + (index + 1)} onClick={() => onChange(rows.filter((_, i) => i !== index))} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></td>}</tr>)}</tbody></table></div>{!disabled && <Button size="sm" variant="outline" onClick={() => onChange([...rows, Object.fromEntries(keys.map(key => [key, ""]))])}><Plus className="h-3.5 w-3.5" />Adicionar garantia</Button>}{!rows.length && <p className="text-xs text-muted-foreground">Nenhum prazo de garantia cadastrado.</p>}</div>
}
