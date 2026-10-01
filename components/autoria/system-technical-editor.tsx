"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { BookMarked, Check, Loader2, Plus, Save, Send, Trash2, Wrench, X } from "lucide-react"
import { htmlToLines } from "@/lib/manual-content"
import { nbrNorms, type MaintenanceItem, type ManualType } from "@/lib/mock-data"
import type { TechnicalSystem, TechnicalSystemDraft } from "@/lib/technical-content"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ContentStatusIcon, contentStatusLabels } from "@/components/emissao/document-navigation"
import { cn } from "@/lib/utils"

const RichTextEditor = dynamic(() => import("./rich-text-editor").then(module => module.RichTextEditor), {
  ssr: false, loading: () => <p className="p-4 text-sm text-muted-foreground">Abrindo editor…</p>,
})
type ContentSection = "sistemas" | "manutencao"
type Action = "save" | "submit" | "approve" | "reject"
const contentLabels: Record<ContentSection, string> = { sistemas: "Descrição técnica", manutencao: "Manutenção" }
const contentOrder: ContentSection[] = ["sistemas", "manutencao"]
const manualLabels: Record<ManualType, string> = { proprietario: "Manual do Proprietário", sindico: "Manual do Síndico" }

type Props = {
  developmentId: string
  manualType: ManualType
  system: TechnicalSystem
  number?: string
  activeContent: ContentSection
  onContentChange: (content: ContentSection) => void
  draft?: TechnicalSystemDraft
  onDraftChange: (patch: TechnicalSystemDraft) => void
  onSystemUpdated: (system: TechnicalSystem) => void
  canEdit: boolean
  canValidate: boolean
  onBusyChange?: (busy: boolean) => void
}

/** A single system panel; the parent owns the catalogue, manual and local drafts. */
export function SystemTechnicalEditor({ developmentId, manualType, system, number, activeContent, onContentChange, draft, onDraftChange, onSystemUpdated, canEdit, canValidate, onBusyChange }: Props) {
  const id = useId()
  const scope = developmentId + ":" + manualType + ":" + system.key
  const currentScope = useRef(scope)
  currentScope.current = scope
  const tabs = useRef(new Map<ContentSection, HTMLButtonElement>())
  const operation = useRef<{ controller: AbortController; sequence: number } | null>(null)
  const sequence = useRef(0)
  const busyRef = useRef(false)
  const busyCallback = useRef(onBusyChange)
  busyCallback.current = onBusyChange
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [comment, setComment] = useState("")
  const html = draft?.html ?? system.html
  const rows = draft?.maintenance ?? system.maintenance
  const isDescription = activeContent === "sistemas"
  const status = isDescription ? system.descriptionStatus : system.maintenanceStatus
  const sourceComment = isDescription ? system.descriptionComment : system.maintenanceComment
  const fingerprint = isDescription ? system.descriptionFingerprint : system.maintenanceFingerprint
  const dirty = isDescription ? html !== system.html : JSON.stringify(rows) !== JSON.stringify(system.maintenance)
  const hasUnsavedDraft = html !== system.html || JSON.stringify(rows) !== JSON.stringify(system.maintenance)
  const locked = status === "aguardando_validacao"
  const editable = canEdit && !locked && !busy
  const complete = isDescription ? htmlToLines(html).length > 0 : rows.every(row => row.task.trim() && row.frequency.trim())
  const showSend = canEdit && status !== "aguardando_validacao" && status !== "aprovado"
  const showReview = canValidate && status === "aguardando_validacao"

  useEffect(() => {
    setError(null); setNotice(null); setRejectOpen(false); setComment("")
  }, [scope, activeContent])
  useEffect(() => () => {
    operation.current?.controller.abort()
    sequence.current++
    if (busyRef.current) busyCallback.current?.(false)
    busyRef.current = false
  }, [scope])

  function switchWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (busy) return
    const next = event.key === "Home" ? "sistemas" : event.key === "End" ? "manutencao" : event.key === "ArrowLeft" || event.key === "ArrowRight" ? activeContent === "sistemas" ? "manutencao" : "sistemas" : null
    if (!next) return
    event.preventDefault()
    onContentChange(next)
    tabs.current.get(next)?.focus()
  }
  function changeRows(next: MaintenanceItem[]) { onDraftChange({ maintenance: next }); setError(null); setNotice(null) }

  async function run(action: Action) {
    if (busyRef.current || (action === "save" && (!editable || !dirty)) || (action === "submit" && (!showSend || dirty || !complete)) || ((action === "approve" || action === "reject") && (!showReview || dirty))) return
    if (action === "reject" && !comment.trim()) { setError("Informe o motivo da reprovação."); return }
    const requestScope = scope, section = activeContent
    const controller = new AbortController(), requestSequence = ++sequence.current
    operation.current = { controller, sequence: requestSequence }
    busyRef.current = true
    setBusy(true); busyCallback.current?.(true); setError(null); setNotice(null)
    try {
      const response = await fetch("/api/manuals/technical", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ developmentId, manualType, contextKey: system.key, section, action, expectedFingerprint: fingerprint, ...(action === "save" ? section === "sistemas" ? { html } : { maintenance: rows } : {}), ...(action === "reject" ? { comment: comment.trim() } : {}) }),
      })
      let result: { system?: TechnicalSystem; error?: string }
      try { result = await response.json() } catch { throw new Error(response.status === 401 ? "Sua sessão expirou. Entre novamente para continuar." : "O servidor não retornou uma resposta válida. Tente novamente.") }
      if (!response.ok) throw new Error(result.error ?? (response.status === 409 ? "Este conteúdo mudou em outra sessão. Atualize o catálogo e revise as alterações antes de tentar novamente." : "Não foi possível atualizar o conteúdo. Tente novamente."))
      if (!result.system || result.system.key !== system.key) throw new Error("Não foi possível confirmar o conteúdo salvo. Atualize o catálogo antes de continuar.")
      if (controller.signal.aborted || sequence.current !== requestSequence || currentScope.current !== requestScope) return
      onSystemUpdated(result.system)
      if (action === "save") onDraftChange(section === "sistemas" ? { html: undefined } : { maintenance: undefined })
      if (action === "reject") { setRejectOpen(false); setComment("") }
      setNotice(action === "save" ? section === "sistemas" ? "Descrição salva." : "Manutenção salva." : action === "submit" ? "Conteúdo enviado para validação." : action === "approve" ? "Conteúdo aprovado." : "Conteúdo reprovado com justificativa.")
    } catch (cause) {
      if (!controller.signal.aborted && sequence.current === requestSequence && currentScope.current === requestScope) setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o conteúdo. Tente novamente.")
    } finally {
      if (!controller.signal.aborted && sequence.current === requestSequence && currentScope.current === requestScope) { busyRef.current = false; operation.current = null; setBusy(false); busyCallback.current?.(false) }
    }
  }

  return <div className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">{manualLabels[manualType]} · {manualType === "sindico" ? "Áreas comuns" : "Unidades privativas"}</p><h3 className="mt-1 text-base font-semibold">{number ? number + " " : ""}{system.item.item}</h3><p className="mt-1 text-xs text-muted-foreground">{system.item.category}</p></div>{system.item.norms.length > 0 && <div className="flex flex-wrap gap-1.5">{system.item.norms.map(code => <Badge key={code} variant="outline" title={nbrNorms[code]} className="gap-1 border-primary/30 bg-primary/5"><BookMarked className="h-3 w-3 text-primary" /><span className="font-mono">{code}</span></Badge>)}</div>}</div>
    <div role="tablist" aria-label="Conteúdo do sistema" className="flex gap-1 border-b border-border">{contentOrder.map(section => <button key={section} ref={element => { if (element) tabs.current.set(section, element); else tabs.current.delete(section) }} type="button" role="tab" id={id + "-tab-" + section} aria-label={contentLabels[section]} aria-selected={activeContent === section} aria-controls={id + "-panel-" + section} tabIndex={activeContent === section ? 0 : -1} disabled={busy} onClick={() => onContentChange(section)} onKeyDown={switchWithKeyboard} className={cn("flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60", activeContent === section ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}><span>{contentLabels[section]}</span><ContentStatusIcon status={section === "sistemas" ? system.descriptionStatus : system.maintenanceStatus} /></button>)}</div>
    <div role="tabpanel" id={id + "-panel-" + activeContent} aria-labelledby={id + "-tab-" + activeContent} tabIndex={0} className="space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={cn(locked && "border-amber-500/40 text-amber-600", status === "aprovado" && "border-success/30 text-success")}><ContentStatusIcon status={status} />{contentStatusLabels[status]}</Badge>{dirty && <span className="text-xs text-amber-600">Alterações não salvas</span>}{locked && <span className="text-xs text-muted-foreground">Conteúdo bloqueado durante a validação.</span>}{!canEdit && !canValidate && <span className="text-xs text-muted-foreground">Somente leitura.</span>}</div>
      {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}{notice && <p role="status" className="rounded-md border border-success/30 p-3 text-sm text-success">{notice}</p>}
      {isDescription ? <RichTextEditor key={scope + ":description"} value={html} disabled={!editable} onChange={value => { onDraftChange({ html: value }); setError(null); setNotice(null) }} /> : <MaintenanceEditor rows={rows} disabled={!editable} defaultResponsible={manualType === "sindico" ? "Síndico" : "Proprietário"} onChange={changeRows} />}
      {sourceComment && status === "reprovado" && <p className="text-sm text-destructive">Motivo da reprovação: {sourceComment}</p>}
      {showSend && !complete && <p className="text-xs text-muted-foreground">{isDescription ? "Preencha a descrição e salve antes de enviar para validação." : "Preencha a atividade e a periodicidade de todas as linhas antes de enviar para validação."}</p>}
      {hasUnsavedDraft && <p className="text-xs text-muted-foreground">Salve as alterações deste sistema antes de visualizar o manual.</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">{canEdit && !locked && <Button disabled={busy || !dirty} onClick={() => void run("save")}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{isDescription ? "Salvar descrição" : "Salvar manutenção"}</Button>}{showSend && <Button variant="outline" disabled={busy || dirty || !complete} onClick={() => void run("submit")}><Send className="h-4 w-4" />Enviar para validação</Button>}{showReview && <><Button disabled={busy || dirty} onClick={() => void run("approve")}><Check className="h-4 w-4" />Aprovar</Button><Button variant="outline" disabled={busy || dirty} onClick={() => { setError(null); setRejectOpen(true) }}><X className="h-4 w-4" />Reprovar</Button></>}{busy && <span role="status" className="text-xs text-muted-foreground">Atualizando conteúdo…</span>}<Link href={"/empreendimentos/" + encodeURIComponent(developmentId) + "?" + new URLSearchParams({ modulo: "emissao", manual: manualType, secao: "sistema-" + system.item.id })} prefetch={false} aria-disabled={busy || hasUnsavedDraft} tabIndex={busy || hasUnsavedDraft ? -1 : 0} onClick={event => { if (busy || hasUnsavedDraft) event.preventDefault() }} className={cn("ml-auto text-xs font-medium", busy || hasUnsavedDraft ? "cursor-not-allowed text-muted-foreground opacity-60" : "text-primary hover:underline")}>Visualizar no manual</Link></div>
    </div>
    <div role="tabpanel" id={id + "-panel-" + (isDescription ? "manutencao" : "sistemas")} aria-labelledby={id + "-tab-" + (isDescription ? "manutencao" : "sistemas")} hidden />
    <Dialog open={rejectOpen} onOpenChange={open => { if (!busy) { setRejectOpen(open); if (!open) setComment("") } }}><DialogContent><DialogHeader><DialogTitle>Reprovar {isDescription ? "descrição técnica" : "manutenção"}</DialogTitle><DialogDescription>Informe o ajuste necessário em {system.item.item}. A justificativa ficará registrada para o editor.</DialogDescription></DialogHeader><label className="space-y-2 text-sm font-medium"><span>Motivo da reprovação</span><Textarea aria-label="Motivo da reprovação do sistema" value={comment} onChange={event => setComment(event.target.value)} rows={4} disabled={busy} placeholder="Descreva o que precisa ser corrigido" /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setRejectOpen(false)}>Cancelar</Button><Button variant="destructive" disabled={busy || !comment.trim()} onClick={() => void run("reject")}>{busy ? "Reprovando…" : "Confirmar reprovação"}</Button></DialogFooter></DialogContent></Dialog>
  </div>
}

function MaintenanceEditor({ rows, disabled, defaultResponsible, onChange }: { rows: MaintenanceItem[]; disabled: boolean; defaultResponsible: MaintenanceItem["responsible"]; onChange: (rows: MaintenanceItem[]) => void }) {
  function update(index: number, patch: Partial<MaintenanceItem>) { onChange(rows.map((row, current) => current === index ? { ...row, ...patch } : row)) }
  return <div className="space-y-3">
    {!disabled && <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => onChange([...rows, { task: "", frequency: "", responsible: defaultResponsible }])}><Plus className="h-3.5 w-3.5" />Adicionar atividade</Button></div>}
    <div className="overflow-x-auto rounded-md border border-border"><table className="w-full min-w-[580px] text-sm"><caption className="sr-only">Atividades de manutenção do sistema</caption><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th scope="col" className="px-3 py-2 font-medium">Atividade</th><th scope="col" className="w-36 px-3 py-2 font-medium">Periodicidade</th><th scope="col" className="w-36 px-3 py-2 font-medium">Responsável</th>{!disabled && <th scope="col" className="w-10"><span className="sr-only">Remover</span></th>}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-t border-border"><td className="p-2 align-top"><Textarea aria-label={"Atividade da linha " + (index + 1)} value={row.task} disabled={disabled} onChange={event => update(index, { task: event.target.value })} rows={2} placeholder="Descrição da atividade" className="min-w-52 text-sm" /></td><td className="p-2 align-top"><input aria-label={"Periodicidade da linha " + (index + 1)} value={row.frequency} disabled={disabled} onChange={event => update(index, { frequency: event.target.value })} placeholder="Ex.: Anual" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70" /></td><td className="p-2 align-top"><select aria-label={"Responsável da linha " + (index + 1)} value={row.responsible} disabled={disabled} onChange={event => update(index, { responsible: event.target.value as MaintenanceItem["responsible"] })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"><option value="Proprietário">Proprietário</option><option value="Síndico">Síndico</option></select></td>{!disabled && <td className="p-2 align-top"><Button size="icon-sm" variant="ghost" aria-label={"Remover atividade da linha " + (index + 1)} onClick={() => onChange(rows.filter((_, current) => current !== index))}><Trash2 className="h-3.5 w-3.5" /></Button></td>}</tr>)}{!rows.length && <tr><td colSpan={disabled ? 3 : 4} className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma atividade de manutenção cadastrada.</td></tr>}</tbody></table></div>
    {!rows.length && <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Ao enviar a manutenção vazia para validação, você registra a decisão de não cadastrar atividades para este sistema.</span></p>}
  </div>
}
