"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, Check, Copy, Eye, FileSpreadsheet, Loader2, Pencil, Plus, RotateCcw, Save, Search, Send, X } from "lucide-react"
import type { FinishingGroup, FinishingMutation, FinishingTable, FinishingTableData, FinishingUnitSummary, UnitCatalog, UnitInput } from "@/lib/finishing-types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { FinishingUnitDialog } from "./finishing-unit-dialog"
import { FinishingTableEditor } from "./finishing-table-editor"
import { useFinishingDrafts } from "./finishing-drafts"
import { duplicateFinishingData, emptyFinishingData, finishingDataCount, finishingGroups, finishingIncompleteCount, finishingSourceLabels, finishingUnitLabel, normalizeFinishing } from "./finishing-ui"

type Props = { developmentId: string; disabled?: boolean; role: "admin" | "editor" | "validator"; onUnsavedChange?: (dirty: boolean, discard?: () => void) => void }
type Confirmation = { kind: "discard"; unitId: string } | { kind: "rebase"; unitId: string } | { kind: "row"; unitId: string; group: FinishingGroup; rowId: string; environment: string } | { kind: "environment"; unitId: string; group: FinishingGroup; rowId: string; environment: string }
const emptyCatalog: UnitCatalog = { units: [], legacyTables: [], canEdit: false, canValidate: false, actorId: "" }
const linkClass = "inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted"
async function readJson<T>(response: Response): Promise<T> {
  const result = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir a operação.")
  return result
}
function baseLabel(table: FinishingTable) { return [table.tower, table.typology, table.unitModel].filter(Boolean).join(" · ") || "Base de acabamentos" }
function sortUnits(units: FinishingUnitSummary[]) { return [...units].sort((a, b) => a.tower.localeCompare(b.tower, "pt-BR", { numeric: true }) || a.number.localeCompare(b.number, "pt-BR", { numeric: true })) }

export function TabelaAcabamentos({ developmentId, disabled = false, role, onUnsavedChange }: Props) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams()
  const requestedUnit = params.get("unidade"), requestedBase = params.get("base"), requestedGroup = params.get("grupo"), environment = params.get("ambiente") ?? ""
  const [catalog, setCatalog] = useState<UnitCatalog>(emptyCatalog)
  const [catalogDevelopmentId, setCatalogDevelopmentId] = useState<string | null>(null)
  const { drafts, setDrafts, discard, restored, storageWarning } = useFinishingDrafts(catalogDevelopmentId === developmentId ? catalog.actorId : undefined, developmentId, catalog.units.map(unit => unit.id))
  const [selectedId, setSelectedId] = useState<string | null>(requestedUnit)
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(requestedBase)
  const [group, setGroup] = useState<FinishingGroup>("ambientes")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null)
  const [unitDialog, setUnitDialog] = useState<"new" | FinishingUnitSummary | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [copy, setCopy] = useState<{ sourceId: string; unitId: string } | null>(null)
  const [comments, setComments] = useState<Record<string, string>>({})
  const controller = useRef<AbortController | null>(null), loadSequence = useRef(0), mutation = useRef(false), alive = useRef(true)
  const dirtyCallback = useRef(onUnsavedChange)
  dirtyCallback.current = onUnsavedChange
  const hasDrafts = Object.keys(drafts).length > 0
  useEffect(() => { dirtyCallback.current?.(hasDrafts, discard) }, [hasDrafts, discard])
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); dirtyCallback.current?.(false) } }, [])
  const load = useCallback(async () => {
    if (mutation.current) return
    const sequence = ++loadSequence.current
    controller.current?.abort()
    const abort = new AbortController(); controller.current = abort
    setLoading(true); setError(null)
    try {
      const result = await readJson<UnitCatalog>(await fetch("/api/finishing/units?developmentId=" + encodeURIComponent(developmentId), { signal: abort.signal, cache: "no-store" }))
      if (!abort.signal.aborted && sequence === loadSequence.current && alive.current) { setCatalog({ ...result, units: sortUnits(result.units) }); setCatalogDevelopmentId(developmentId) }
    } catch (cause) { if (!abort.signal.aborted && sequence === loadSequence.current && alive.current) setError(cause instanceof Error ? cause.message : "Não foi possível carregar as unidades.") }
    finally { if (!abort.signal.aborted && sequence === loadSequence.current && alive.current) setLoading(false) }
  }, [developmentId])
  useEffect(() => { setCatalog(emptyCatalog); setCatalogDevelopmentId(null); void load(); return () => controller.current?.abort() }, [load])
  useEffect(() => { setSelectedId(requestedUnit); setSelectedBaseId(requestedBase) }, [requestedUnit, requestedBase])
  useEffect(() => { setGroup(finishingGroups.some(item => item.id === requestedGroup) ? requestedGroup as FinishingGroup : "ambientes") }, [requestedGroup])
  const unit = catalog.units.find(item => item.id === selectedId), legacy = catalog.legacyTables.find(item => item.id === selectedBaseId)
  const draft = unit ? drafts[unit.id] : undefined
  const data = legacy?.data ?? draft?.data ?? unit?.table?.data ?? emptyFinishingData()
  const total = finishingDataCount(data), incomplete = finishingIncompleteCount(data)
  const canEdit = !disabled && role !== "validator" && catalog.canEdit, canValidate = !disabled && catalog.canValidate
  const sourceLocked = unit?.table?.status === "aguardando_validacao"
  const locked = loading || busy || !restored, conflict = Boolean(unit && draft && draft.fingerprint !== unit.fingerprint)
  const visibleUnits = useMemo(() => {
    const terms = normalizeFinishing(search).split(" ").filter(Boolean)
    return catalog.units.filter(item => terms.every(term => normalizeFinishing([item.tower, item.number].join(" ")).includes(term)))
  }, [catalog.units, search])
  function navigate(id: string | null, baseId: string | null = null) {
    if (locked || mutation.current) return
    setSelectedId(id); setSelectedBaseId(baseId); setGroup("ambientes"); setError(null); setNotice(null)
    const next = new URLSearchParams({ modulo: "elaboracao", aba: "acabamentos", manual: "acabamentos" })
    if (id) next.set("unidade", id)
    if (baseId) next.set("base", baseId)
    router.replace(pathname + "?" + next.toString(), { scroll: false })
  }
  function changeGroup(nextGroup: FinishingGroup) {
    setGroup(nextGroup)
    const next = new URLSearchParams(params.toString()); next.set("grupo", nextGroup); next.delete("ambiente")
    router.replace(pathname + "?" + next.toString(), { scroll: false })
  }
  function editData(update: (data: FinishingTableData) => FinishingTableData) {
    if (!unit || !canEdit || locked || sourceLocked || selectedBaseId) return
    setDrafts(current => {
      const existing = current[unit.id], next = update(existing?.data ?? unit.table?.data ?? emptyFinishingData()), result = { ...current }
      if (!existing?.sourceTableId && JSON.stringify(next) === JSON.stringify(unit.table?.data ?? emptyFinishingData())) delete result[unit.id]
      else result[unit.id] = { ...existing, data: next, fingerprint: existing?.fingerprint ?? unit.fingerprint }
      return result
    }); setNotice(null)
  }
  function updateUnit(next: FinishingUnitSummary) { setCatalog(current => ({ ...current, units: sortUnits([...current.units.filter(item => item.id !== next.id), next]) })) }
  async function saveUnit(input: UnitInput) {
    if (mutation.current || loading || !canEdit) throw new Error("Aguarde a operação em andamento.")
    const previous = input.id ? catalog.units.find(item => item.id === input.id) : undefined
    if (previous?.table?.status === "aguardando_validacao") throw new Error("Aguarde a conclusão da validação antes de editar a identificação.")
    mutation.current = true; setBusy(true)
    try {
      const { unit: next } = await readJson<{ unit: FinishingUnitSummary }>(await fetch("/api/finishing/units", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ developmentId, ...input }) }))
      if (!alive.current) return
      updateUnit(next)
      // Identity writes advance the table revision without changing its content.
      // A concurrent source edit must keep the local draft in conflict instead.
      const identityOnly = previous && next.revision === previous.revision + 1 && (
        !previous.table && !next.table || previous.table && next.table &&
        next.table.revision === previous.table.revision + 1 &&
        JSON.stringify(next.table.data) === JSON.stringify(previous.table.data)
      )
      if (identityOnly && previous) setDrafts(current => current[next.id]?.fingerprint === previous.fingerprint ? { ...current, [next.id]: { ...current[next.id], fingerprint: next.fingerprint } } : current)
      setSelectedId(next.id); setSelectedBaseId(null)
      router.replace(pathname + "?" + new URLSearchParams({ modulo: "elaboracao", aba: "acabamentos", manual: "acabamentos", unidade: next.id }).toString(), { scroll: false })
      setNotice(input.id ? "Identificação atualizada." : "Unidade cadastrada. Adicione seus acabamentos.")
    } finally { mutation.current = false; if (alive.current) setBusy(false) }
  }
  async function perform(action: FinishingMutation["action"]) {
    if (!unit || locked || mutation.current || conflict || (sourceLocked && action !== "approve" && action !== "reject") || (action === "approve" || action === "reject" ? !canValidate : !canEdit)) return
    mutation.current = true; setBusy(true); setError(null); setNotice(null)
    const request: FinishingMutation = { developmentId, unitId: unit.id, action, expectedFingerprint: draft?.fingerprint ?? unit.fingerprint, ...(action === "save" || action === "copy" ? { data, sourceTableId: draft?.sourceTableId } : {}), ...(action === "reject" ? { comment: comments[unit.id]?.trim() } : {}) }
    try {
      const { unit: next } = await readJson<{ unit: FinishingUnitSummary }>(await fetch("/api/finishing/tables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }))
      if (!alive.current) return
      updateUnit(next)
      if (action === "save" || action === "copy") setDrafts(current => { const nextDrafts = { ...current }; delete nextDrafts[unit.id]; return nextDrafts })
      setComments(current => ({ ...current, [unit.id]: "" }))
      setNotice(action === "save" || action === "copy" ? "Tabela salva como rascunho." : action === "submit" ? "Tabela enviada para validação." : action === "approve" ? "Tabela aprovada." : "Tabela reprovada com justificativa.")
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a tabela.") }
    finally { mutation.current = false; if (alive.current) setBusy(false) }
  }
  function confirmChange() {
    if (!confirmation || locked) return
    const target = catalog.units.find(item => item.id === confirmation.unitId)
    if (!target) return
    setDrafts(current => {
      const result = { ...current }, existing = current[target.id]
      if (confirmation.kind === "discard") { delete result[target.id]; return result }
      if (confirmation.kind === "rebase") { if (existing) result[target.id] = { ...existing, fingerprint: target.fingerprint }; return result }
      const original = existing?.data ?? target.table?.data ?? emptyFinishingData(), next = { ...original }
      if (confirmation.kind === "row") next[confirmation.group] = original[confirmation.group].filter(row => row.id !== confirmation.rowId)
      else for (const item of finishingGroups) next[item.id] = original[item.id].filter(row => row.id !== confirmation.rowId && (!confirmation.environment.trim() || normalizeFinishing(row.ambiente ?? "") !== normalizeFinishing(confirmation.environment)))
      if (!existing?.sourceTableId && JSON.stringify(next) === JSON.stringify(target.table?.data ?? emptyFinishingData())) delete result[target.id]
      else result[target.id] = { ...existing, data: next, fingerprint: existing?.fingerprint ?? target.fingerprint }
      return result
    }); setConfirmation(null); setNotice(null)
  }
  function applyBase() {
    if (!copy || locked || !canEdit) return
    const source = catalog.legacyTables.find(item => item.id === copy.sourceId), target = catalog.units.find(item => item.id === copy.unitId)
    if (!source || !target || target.table?.status === "aguardando_validacao") return
    setDrafts(current => ({ ...current, [target.id]: { data: duplicateFinishingData(source.data), fingerprint: target.fingerprint, sourceTableId: source.id } }))
    setCopy(null); navigate(target.id)
    setNotice("Base copiada para o rascunho local. Salve a tabela para confirmar. A base original permanece preservada.")
  }
  const confirmationUnit = confirmation ? catalog.units.find(item => item.id === confirmation.unitId) : undefined
  const copySource = copy ? catalog.legacyTables.find(item => item.id === copy.sourceId) : undefined, copyTarget = copy ? catalog.units.find(item => item.id === copy.unitId) : undefined
  const previewHref = unit ? "/empreendimentos/" + encodeURIComponent(developmentId) + "?modulo=emissao&manual=acabamentos&unidade=" + encodeURIComponent(unit.id) : ""
  const invalid = !loading && (selectedBaseId ? !legacy : selectedId ? !unit : false)
  return <div className="space-y-4">
    <Card className="flex flex-col gap-3 p-5 md:flex-row md:items-start md:justify-between"><div><h3 className="flex items-center gap-2 text-lg font-semibold"><FileSpreadsheet className="h-5 w-5 text-primary" />Tabela de Acabamentos</h3><p className="mt-1 text-sm text-muted-foreground">Cadastre a unidade, prepare sua tabela e emita um PDF individual.</p></div>{canEdit && <Button disabled={locked} onClick={() => setUnitDialog("new")}><Plus className="h-4 w-4" />Cadastrar unidade</Button>}</Card>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><span>{error} {hasDrafts && "Suas alterações locais permanecem preservadas."}</span><Button size="sm" variant="outline" disabled={locked} onClick={() => void load()}>Recarregar cadastro</Button></div>}
    {notice && <p role="status" className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm">{notice}</p>}
    {storageWarning && <p role="alert" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">{storageWarning}</p>}
    <div className="grid min-w-0 gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
      <Card className="h-fit gap-0 overflow-hidden"><div className="space-y-3 border-b border-border p-3"><div className="flex justify-between"><h4 className="text-sm font-semibold">Unidades</h4><span className="text-xs text-muted-foreground">{catalog.units.length}</span></div><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar unidades cadastradas" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar unidade ou torre…" className="pl-8" /></div></div>
        <nav aria-label="Unidades cadastradas" className="max-h-[55vh] space-y-1 overflow-y-auto p-2">{visibleUnits.map(item => <button key={item.id} type="button" disabled={locked} aria-current={!selectedBaseId && selectedId === item.id ? "page" : undefined} onClick={() => navigate(item.id)} className={cn("w-full rounded-md p-3 text-left text-xs hover:bg-muted disabled:opacity-60", !selectedBaseId && selectedId === item.id && "bg-primary/10")}><span className="block font-medium">{finishingUnitLabel(item)}</span><span className="mt-1.5 block text-[10px] text-muted-foreground">{drafts[item.id] ? "Alterações não salvas" : finishingSourceLabels[item.table?.status ?? "sem_tabela"]}</span></button>)}{!visibleUnits.length && <p className="p-3 text-xs text-muted-foreground">{loading ? "Carregando unidades…" : search ? "Nenhuma unidade encontrada." : "Cadastre uma unidade para iniciar sua tabela."}</p>}</nav>
        {catalog.legacyTables.length > 0 && <div className="border-t border-border p-2"><h4 className="px-2 py-2 text-xs font-semibold">Bases sem unidade vinculada</h4><div className="max-h-48 space-y-1 overflow-y-auto">{catalog.legacyTables.map(table => <button key={table.id} disabled={locked} onClick={() => navigate(selectedId, table.id)} aria-current={selectedBaseId === table.id ? "page" : undefined} className={cn("w-full rounded-md px-2 py-2 text-left text-xs text-muted-foreground hover:bg-muted", selectedBaseId === table.id && "bg-primary/10 text-foreground")}><span className="block">{baseLabel(table)}</span><span className="mt-1 block text-[10px]">Rev. {table.revision} · {finishingDataCount(table.data)} itens</span></button>)}</div></div>}
      </Card>
      <div className="min-w-0 space-y-4">
        {invalid ? <Card className="p-6"><p role="alert" className="text-sm text-destructive">A unidade ou base deste link não pertence ao cadastro disponível. Selecione uma unidade na lista.</p></Card> : loading && !unit && !legacy ? <Card className="p-8"><p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando cadastro…</p></Card> : legacy ? <><Card className="gap-4 p-5"><Badge variant="outline" className="w-fit">Sem unidade vinculada</Badge><h4 className="font-semibold">{baseLabel(legacy)}</h4><p className="text-xs text-muted-foreground">Esta base permanece preservada. Copie os dados para uma unidade cadastrada.</p>{canEdit && <Button className="w-fit" disabled={locked || !catalog.units.length} onClick={() => setCopy({ sourceId: legacy.id, unitId: unit?.id ?? "" })}><Copy className="h-4 w-4" />Usar como base</Button>}{!catalog.units.length && <p className="text-xs text-muted-foreground">Cadastre uma unidade para utilizar esta base.</p>}</Card><FinishingTableEditor key={legacy.id} data={data} group={group} environment={environment} readOnly locked={locked} onGroup={changeGroup} onChange={() => {}} onRemove={() => {}} /></> : !unit ? <Card className="items-center gap-3 px-6 py-14 text-center"><FileSpreadsheet className="h-8 w-8 text-muted-foreground" /><p className="text-sm font-medium">Selecione uma unidade para preparar os acabamentos.</p><p className="text-xs text-muted-foreground">Cada unidade tem sua própria tabela e histórico de emissão.</p>{canEdit && !catalog.units.length && <Button onClick={() => setUnitDialog("new")} disabled={locked}><Plus className="h-4 w-4" />Cadastrar primeira unidade</Button>}</Card> : <>
          <Card className="gap-4 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-base font-semibold">{finishingUnitLabel(unit)}</h4><div className="mt-3 flex flex-wrap items-center gap-2"><Badge variant="outline">{finishingSourceLabels[unit.table?.status ?? "sem_tabela"]}</Badge>{unit.table && <span className="text-xs text-muted-foreground">Rev. {unit.table.revision}</span>}{draft && <Badge variant="outline" className="border-warning/40 text-warning-foreground">Alterações não salvas</Badge>}</div></div><div className="flex flex-wrap gap-2">{canEdit && <Button variant="outline" size="sm" disabled={locked || sourceLocked} onClick={() => setUnitDialog(unit)}><Pencil className="h-3.5 w-3.5" />Editar identificação</Button>}{draft || locked ? <span aria-disabled="true" className={cn(linkClass, "cursor-not-allowed opacity-50")}><Eye className="h-3.5 w-3.5" />Visualizar PDF</span> : <Link prefetch={false} href={previewHref} className={linkClass}><Eye className="h-3.5 w-3.5" />Visualizar PDF</Link>}</div></div>
            {conflict && <div role="alert" className="space-y-2 rounded-md bg-warning/10 p-3 text-xs"><p>A fonte mudou enquanto havia alterações locais. Recarregue o cadastro para conferir a revisão atual antes de salvar.</p><Button variant="outline" size="sm" disabled={locked} onClick={() => setConfirmation({ kind: "rebase", unitId: unit.id })}>Manter alterações sobre a revisão atual</Button></div>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"><p className="text-xs text-muted-foreground">{total} itens{incomplete ? " · " + incomplete + " com campos obrigatórios pendentes" : total ? " · Campos obrigatórios preenchidos" : " · Adicione o primeiro ambiente ou item"}</p><div className="flex flex-wrap gap-2">{canEdit && catalog.legacyTables.length > 0 && <Button variant="outline" size="sm" disabled={locked || sourceLocked} onClick={() => setCopy({ sourceId: "", unitId: unit.id })}><Copy className="h-3.5 w-3.5" />Copiar base existente</Button>}{canEdit && draft && <Button variant="outline" size="sm" disabled={locked} onClick={() => setConfirmation({ kind: "discard", unitId: unit.id })}><RotateCcw className="h-3.5 w-3.5" />Descartar alterações</Button>}{canEdit && <Button size="sm" disabled={locked || sourceLocked || !draft || conflict} onClick={() => void perform(draft?.sourceTableId ? "copy" : "save")}><Save className="h-3.5 w-3.5" />{busy ? "Salvando…" : "Salvar tabela"}</Button>}</div></div>
          </Card>
          <FinishingTableEditor key={unit.id} data={data} group={group} environment={environment} readOnly={!canEdit} locked={locked} sourceLocked={sourceLocked} onGroup={changeGroup} onChange={editData} onRemove={(rowGroup, rowId, rowEnvironment) => setConfirmation({ kind: rowGroup === "ambientes" ? "environment" : "row", unitId: unit.id, group: rowGroup, rowId, environment: rowEnvironment })} />
          <Card className="gap-3 p-5"><h5 className="text-sm font-semibold">Validação da tabela</h5><p className="text-xs text-muted-foreground">Salvar alterações coloca a fonte em rascunho. Quem editou por último não pode aprovar a própria tabela.</p>{unit.table?.comment && <p className="whitespace-pre-wrap rounded-md bg-destructive/5 p-3 text-xs">Justificativa: {unit.table.comment}</p>}{draft && <p className="text-xs text-warning-foreground">Salve as alterações antes de enviar para validação ou abrir a prévia.</p>}{canValidate && unit.table?.status === "aguardando_validacao" && <Textarea aria-label="Justificativa de reprovação da tabela" placeholder="Justificativa para reprovar" rows={3} value={comments[unit.id] ?? ""} disabled={locked} onChange={event => setComments(current => ({ ...current, [unit.id]: event.target.value }))} />}<div className="flex flex-wrap gap-2">{canEdit && unit.table?.status !== "aprovado" && unit.table?.status !== "aguardando_validacao" && <Button variant="outline" size="sm" disabled={locked || Boolean(draft) || !unit.table || !total || incomplete > 0} onClick={() => void perform("submit")}><Send className="h-3.5 w-3.5" />Enviar para validação</Button>}{canValidate && unit.table?.status === "aguardando_validacao" && <><Button size="sm" disabled={locked || Boolean(draft)} onClick={() => void perform("approve")}><Check className="h-3.5 w-3.5" />Aprovar tabela</Button><Button variant="outline" size="sm" disabled={locked || Boolean(draft) || !comments[unit.id]?.trim()} onClick={() => void perform("reject")}><X className="h-3.5 w-3.5" />Reprovar tabela</Button></>}{unit.table?.status === "aprovado" && <p className="text-xs text-success">Fonte aprovada para gerar o PDF desta unidade.</p>}{!canEdit && !canValidate && <p className="text-xs text-muted-foreground">Acesso de leitura à tabela de acabamentos.</p>}</div></Card>
        </>}
      </div>
    </div>
    {unitDialog && <FinishingUnitDialog key={unitDialog === "new" ? "new" : unitDialog.id} unit={unitDialog === "new" ? undefined : unitDialog} onClose={() => setUnitDialog(null)} onSave={saveUnit} />}
    <Dialog open={Boolean(confirmation)} onOpenChange={open => { if (!open) setConfirmation(null) }}><DialogContent><DialogHeader><DialogTitle>{confirmation?.kind === "discard" ? "Descartar alterações?" : confirmation?.kind === "rebase" ? "Aplicar alterações sobre a revisão atual?" : confirmation?.kind === "environment" ? "Excluir ambiente e seus itens?" : "Excluir item?"}</DialogTitle><DialogDescription>{confirmationUnit && finishingUnitLabel(confirmationUnit)}. {confirmation?.kind === "discard" ? "Os dados locais desta unidade serão descartados. Os rascunhos das outras unidades permanecem preservados." : confirmation?.kind === "rebase" ? "No próximo salvamento, seus dados locais substituirão o conteúdo da revisão atual. Esta ação apenas prepara o rascunho para salvar." : confirmation?.kind === "environment" ? "O ambiente " + (confirmation.environment || "sem nome") + " e todos os itens associados serão removidos do rascunho. Salve para confirmar a exclusão." : "O item será removido do rascunho. Salve a tabela para confirmar."}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmation(null)}>Cancelar</Button><Button variant={confirmation?.kind === "rebase" ? "default" : "destructive"} disabled={locked} onClick={confirmChange}>{confirmation?.kind === "discard" ? "Descartar alterações" : confirmation?.kind === "rebase" ? "Manter meus dados" : confirmation?.kind === "environment" ? "Excluir ambiente e itens" : "Excluir item"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(copy)} onOpenChange={open => { if (!open) setCopy(null) }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Copiar base para uma unidade</DialogTitle><DialogDescription>A base original permanece preservada. A cópia substitui o rascunho local da unidade escolhida e exige salvamento e nova aprovação.</DialogDescription></DialogHeader><div className="space-y-4"><label className="block space-y-1.5 text-xs font-medium"><span>Base sem unidade vinculada</span><select aria-label="Base de acabamentos" value={copy?.sourceId ?? ""} onChange={event => setCopy(current => current ? { ...current, sourceId: event.target.value } : null)} className="h-9 w-full rounded-md border border-input bg-background px-2"><option value="">Selecione uma base</option>{catalog.legacyTables.map(table => <option key={table.id} value={table.id}>{baseLabel(table)}</option>)}</select></label><label className="block space-y-1.5 text-xs font-medium"><span>Unidade de destino</span><select aria-label="Unidade de destino da cópia" value={copy?.unitId ?? ""} onChange={event => setCopy(current => current ? { ...current, unitId: event.target.value } : null)} className="h-9 w-full rounded-md border border-input bg-background px-2"><option value="">Selecione uma unidade</option>{catalog.units.map(item => <option key={item.id} value={item.id} disabled={item.table?.status === "aguardando_validacao"}>{finishingUnitLabel(item)}</option>)}</select></label>{copySource && <p className="text-xs text-muted-foreground">A base contém {finishingDataCount(copySource.data)} itens.</p>}{copyTarget && (copyTarget.table || drafts[copyTarget.id]) && <p className="flex gap-2 rounded-md bg-warning/10 p-3 text-xs"><AlertTriangle className="h-4 w-4 shrink-0" />Os dados locais de {finishingUnitLabel(copyTarget)} serão substituídos. A tabela salva só muda quando você clicar em Salvar tabela.</p>}</div><DialogFooter><Button variant="outline" onClick={() => setCopy(null)}>Cancelar</Button><Button disabled={locked || !copySource || !copyTarget || copyTarget.table?.status === "aguardando_validacao"} onClick={applyBase}><Copy className="h-4 w-4" />Copiar para o rascunho</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
