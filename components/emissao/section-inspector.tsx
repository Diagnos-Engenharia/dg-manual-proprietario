"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { Check, ExternalLink, FilePenLine, Loader2, Plus, Save, Send, Trash2, X } from "lucide-react"
import type { ContentStatus, ManualAttachment, ManualSection } from "@/lib/manual-document/types"
import { editableManualSections } from "@/lib/manual-document/build"
import type { TechnicalContact } from "@/lib/mock-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ContentStatusIcon, contentStatusLabels } from "./document-navigation"

const RichTextEditor = dynamic(() => import("@/components/autoria/rich-text-editor").then(module => module.RichTextEditor), { ssr: false, loading: () => <p className="p-4 text-sm text-muted-foreground">Abrindo editor…</p> })
const editorialIds = new Set(editableManualSections.map(section => section.id))
type WarrantyRow = Record<string, string>
type FinishingReview = { id: string; tower: string; typology: string; unitModel?: string; revision: number; status: string; updatedAt?: string; data?: Record<string, Record<string, string>[]> }
export type EditorialData = { sections: Record<string, { html?: string; status?: string; comment?: string | null; enabled?: boolean }>; warranties?: WarrantyRow[]; contacts?: TechnicalContact[]; commissioning?: Record<string, { company?: string; phone?: string; site?: string; instructions?: string }>; finishing?: FinishingReview[]; attachments?: Record<string, ManualAttachment["policy"]>; canEdit?: boolean; canValidate?: boolean }
export type EditorialAction = { action: string; sectionId?: string; html?: string; comment?: string; warranties?: WarrantyRow[]; tableId?: string; revision?: number; attachments?: Record<string, ManualAttachment["policy"]>; optional?: Record<string, boolean> }

export function SectionInspector({ section, page, role, editorial, attachments, onAction }: { section: ManualSection | undefined; page?: number; role: "admin" | "editor" | "validator"; editorial: EditorialData | null; attachments: ManualAttachment[]; onAction: (action: EditorialAction) => Promise<void> }) {
  const [editorOpen, setEditorOpen] = useState(false)
  const [finishingOpen, setFinishingOpen] = useState<FinishingReview | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [warrantyDraft, setWarrantyDraft] = useState<WarrantyRow[] | null>(null)
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => { setEditorOpen(false); setFinishingOpen(null); setError(null); setNotice(null); setComment(""); setWarrantyDraft(null) }, [section?.id])
  if (!section) return <div className="p-4 text-xs text-muted-foreground">Selecione uma seção do Sumário.</div>
  const entry = editorial?.sections[section.id]
  const canEdit = editorial?.canEdit ?? role !== "validator"
  const canReview = editorial?.canValidate ?? role === "admin"
  const isWarranty = section.id === "garantias-tabela"
  const isContacts = section.id === "fornecedores" || section.id === "projetistas" || section.id === "responsaveis-tecnicos"
  const isEditorial = editorialIds.has(section.id)
  const html = drafts[section.id] ?? entry?.html ?? ""
  const dirty = html !== (entry?.html ?? "") || (isWarranty && warrantyDraft !== null)
  const status = section.validationStatus
  const editable = canEdit && status !== "aguardando_validacao"
  const files = attachments.filter(file => file.sectionId === section.id || (section.type === "chapter" && section.number === "9"))
  const contacts = (editorial?.contacts ?? []).filter(contact => contact.kind === (section.id === "fornecedores" ? "fornecedor" : "projetista"))
  const service = editorial?.commissioning?.[section.id]

  async function run(action: EditorialAction, message: string) {
    setBusy(true); setError(null); setNotice(null)
    try {
      await onAction(action)
      if (action.action === "save") { setDrafts(all => { const next = { ...all }; delete next[section!.id]; return next }); setWarrantyDraft(null) }
      setNotice(message)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o conteúdo.") } finally { setBusy(false) }
  }
  function save() { return run({ action: "save", sectionId: section!.id, ...(isWarranty ? { warranties: warrantyDraft ?? editorial?.warranties ?? [] } : { html }) }, "Rascunho salvo. Envie para validação quando concluir.") }
  const reviewButtons = (sectionId: string, reviewStatus: string, table?: FinishingReview) => <div className="flex flex-wrap gap-2">
    {canEdit && reviewStatus !== "aprovado" && reviewStatus !== "aguardando_validacao" && <Button size="sm" variant="outline" disabled={busy || dirty} onClick={() => void run(table ? { action: "finishing-submit", tableId: table.id, revision: table.revision } : { action: "submit", sectionId }, "Conteúdo enviado para validação.")}><Send className="h-3.5 w-3.5" />Enviar para validação</Button>}
    {canReview && reviewStatus === "aguardando_validacao" && <><Button size="sm" disabled={busy || dirty} onClick={() => void run(table ? { action: "finishing-approve", tableId: table.id, revision: table.revision } : { action: "approve", sectionId }, "Conteúdo aprovado.")}><Check className="h-3.5 w-3.5" />Aprovar</Button><Button size="sm" variant="outline" disabled={busy || !comment.trim()} onClick={() => void run(table ? { action: "finishing-reject", tableId: table.id, revision: table.revision, comment } : { action: "reject", sectionId, comment }, "Conteúdo reprovado com justificativa.")}><X className="h-3.5 w-3.5" />Reprovar</Button></>}
  </div>

  return <div className="space-y-5 p-4">
    <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Seção selecionada</p><h2 className="mt-2 text-sm font-semibold leading-relaxed">{section.number ? section.number + " " : ""}{section.title}</h2>{page && <p className="mt-1 text-xs text-muted-foreground">Página {page}</p>}</div>
    <div className="rounded-lg border border-border p-3"><div className="flex items-center gap-2"><ContentStatusIcon status={status} /><span className="text-xs font-medium">{contentStatusLabels[status]}</span></div>{section.componentStatuses?.map(part => <div key={part.label} className="mt-3 flex items-start gap-2"><ContentStatusIcon status={part.status} className="mt-0.5" /><div className="text-[11px]"><p>{part.label}</p><p className="mt-0.5 text-muted-foreground">{contentStatusLabels[part.status]}</p></div></div>)}</div>
    {section.renderPolicy === "structure" && <p className="text-xs leading-relaxed text-muted-foreground">A estrutura já faz parte do manual. O texto aparece nas páginas após a aprovação de cada conteúdo.</p>}
    {section.editHref && <a href={section.editHref} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" />Abrir edição desta seção</a>}
    {isEditorial && editorial && <div className="space-y-3 border-t border-border pt-4"><Button variant="outline" size="sm" className="w-full" onClick={() => { setEditorOpen(true); setError(null); setNotice(null) }}><FilePenLine className="h-3.5 w-3.5" />{isWarranty ? "Tabela de garantias" : isContacts ? "Revisar conteúdo" : canEdit ? "Editar texto da seção" : "Revisar texto"}</Button>{reviewButtons(section.id, status)}{canReview && status === "aguardando_validacao" && <Textarea aria-label="Justificativa de reprovação" placeholder="Justificativa para reprovar" value={comment} onChange={event => setComment(event.target.value)} rows={3} />}{entry?.comment && <p className="text-xs text-destructive">{entry.comment}</p>}</div>}
    {section.id === "acabamentos" && editorial?.finishing?.map(table => <div key={table.id} className="space-y-3 rounded-md border border-border p-3"><p className="text-xs font-medium">{[table.tower, table.typology, table.unitModel].filter(Boolean).join(" · ")}</p><Badge variant="outline">Rev. {table.revision} · {contentStatusLabels[table.status as ContentStatus] ?? table.status}</Badge><Button size="sm" variant="outline" onClick={() => setFinishingOpen(table)}><EyeIcon />Revisar dados</Button>{reviewButtons(section.id, table.status, table)}{canReview && table.status === "aguardando_validacao" && <Textarea aria-label="Justificativa de reprovação dos acabamentos" placeholder="Justificativa para reprovar" value={comment} onChange={event => setComment(event.target.value)} rows={3} />}</div>)}
    {section.optional && canEdit && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={status !== "nao_aplicavel"} disabled={busy} onChange={event => void run({ action: "settings", optional: { [section.id]: event.target.checked } }, "Aplicabilidade atualizada.")} />Incluir esta seção opcional</label>}
    {files.length > 0 && <div className="space-y-3 border-t border-border pt-4"><h3 className="text-xs font-semibold">Anexos</h3>{files.map(file => <div key={file.id} className="space-y-2"><p className="break-words text-xs">{file.name}</p><select aria-label={"Política do anexo " + file.name} disabled={!canEdit || busy} value={file.policy} onChange={event => void run({ action: "settings", attachments: { [file.id]: event.target.value as ManualAttachment["policy"] } }, "Política de anexo atualizada.")} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"><option value="reference">Apenas referenciar</option><option value="include">Incluir no PDF</option><option value="exclude">Não incluir</option></select></div>)}<p className="text-[11px] leading-relaxed text-muted-foreground">A inclusão física depende dos formatos suportados. O servidor informa quando um arquivo precisa ser apenas referenciado.</p></div>}
    {busy && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Salvando…</p>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}{notice && <p role="status" className="text-xs text-success">{notice}</p>}
    <Dialog open={editorOpen} onOpenChange={open => { if (!busy) setEditorOpen(open) }}><DialogContent className="sm:max-w-4xl"><DialogHeader><DialogTitle>{section.title}</DialogTitle><DialogDescription>O conteúdo em edição permanece fora das páginas até ser aprovado. Salve o rascunho antes de enviar para validação.</DialogDescription></DialogHeader><div className="max-h-[65vh] overflow-y-auto">
      {isWarranty ? <WarrantyEditor rows={warrantyDraft ?? editorial?.warranties ?? []} disabled={!editable || busy} onChange={setWarrantyDraft} /> : <div className="space-y-4">{isContacts && <div className="space-y-3">{contacts.length ? contacts.map(contact => <div key={contact.id} className="rounded-md border border-border p-3"><p className="font-medium">{contact.discipline} · {contact.company}</p><p className="mt-1 text-sm">{contact.name} {contact.registration && "· " + contact.registration}</p><p className="mt-1 text-xs text-muted-foreground">{[contact.phone, contact.whatsapp, contact.email].filter(Boolean).join(" · ")}</p></div>) : <p className="p-4 text-sm text-muted-foreground">Cadastre os contatos na elaboração desta seção.</p>}{section.editHref && <a href={section.editHref} className="text-sm text-primary underline">Editar contatos cadastrados</a>}</div>}{service && <div className="space-y-2 rounded-md border border-border p-4"><p className="text-sm font-medium">Dados cadastrados no comissionamento</p><p className="text-sm">{[service.company, service.phone, service.site].filter(Boolean).join(" · ")}</p>{service.instructions && <p className="whitespace-pre-wrap text-sm">{service.instructions}</p>}{section.editHref && <a href={section.editHref} className="inline-block text-xs text-primary underline">Editar dados de atendimento</a>}</div>}{(isContacts || service) && <p className="text-xs font-semibold text-muted-foreground">Texto complementar da seção</p>}<RichTextEditor value={html} onChange={value => setDrafts(all => ({ ...all, [section.id]: value }))} disabled={!editable || busy} /></div>}
    </div>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}<div className="flex flex-wrap items-center justify-between gap-2">{editable && <Button disabled={busy || !dirty} onClick={() => void save()}><Save className="h-4 w-4" />Salvar rascunho</Button>}{reviewButtons(section.id, status)}<Button variant="outline" disabled={busy} onClick={() => setEditorOpen(false)}>Fechar</Button></div>{canReview && status === "aguardando_validacao" && <Textarea aria-label="Justificativa de reprovação da seção" value={comment} onChange={event => setComment(event.target.value)} placeholder="Justificativa para reprovar" rows={3} />}</DialogContent></Dialog>
    <Dialog open={Boolean(finishingOpen)} onOpenChange={open => { if (!open) setFinishingOpen(null) }}><DialogContent className="sm:max-w-4xl"><DialogHeader><DialogTitle>Revisão da Tabela de Acabamentos</DialogTitle><DialogDescription>{finishingOpen && [finishingOpen.tower, finishingOpen.typology, finishingOpen.unitModel, "Rev. " + finishingOpen.revision].filter(Boolean).join(" · ")}</DialogDescription></DialogHeader><div className="max-h-[65vh] space-y-4 overflow-auto">{finishingOpen && <FinishingSource table={finishingOpen} />}</div></DialogContent></Dialog>
  </div>
}

function WarrantyEditor({ rows, disabled, onChange }: { rows: WarrantyRow[]; disabled: boolean; onChange: (rows: WarrantyRow[]) => void }) {
  const warrantyLabels: Record<string, string> = { system: "Sistema", sistema: "Sistema", element: "Elemento", elemento: "Elemento", defect: "Descrição da falha", failure: "Descrição da falha", descricaoFalha: "Descrição da falha", period: "Prazo", prazo: "Prazo", conditions: "Condições", condicoes: "Condições", observacoes: "Observações", ano1: "1 ano", ano3: "3 anos", ano5: "5 anos", oneYear: "1 ano", threeYears: "3 anos", fiveYears: "5 anos" }
  const keys = rows.length ? Array.from(new Set(rows.flatMap(row => Object.keys(row)))).filter(key => key !== "id") : ["system", "element", "defect", "period", "conditions"]
  const fields = keys.map(key => ({ key, label: warrantyLabels[key] ?? key }))
  return <div className="space-y-3"><div className="overflow-x-auto rounded-md border border-border"><table className="w-full min-w-[680px] text-xs"><thead className="bg-muted"><tr>{fields.map(field => <th key={field.key} className="p-2 text-left font-medium">{field.label}</th>)}{!disabled && <th className="w-8"><span className="sr-only">Remover</span></th>}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-t border-border">{fields.map(field => <td key={field.key} className="p-1"><Textarea aria-label={field.label + " da linha " + (index + 1)} disabled={disabled} value={row[field.key] ?? ""} rows={2} className="min-w-28 text-xs" onChange={event => onChange(rows.map((current, i) => i === index ? { ...current, [field.key]: event.target.value } : current))} /></td>)}{!disabled && <td><button type="button" aria-label={"Remover linha " + (index + 1)} onClick={() => onChange(rows.filter((_, i) => i !== index))} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></td>}</tr>)}</tbody></table></div>{!disabled && <Button size="sm" variant="outline" onClick={() => onChange([...rows, Object.fromEntries(fields.map(field => [field.key, ""]))])}><Plus className="h-3.5 w-3.5" />Adicionar garantia</Button>}{rows.length === 0 && <p className="text-xs text-muted-foreground">Nenhum prazo de garantia cadastrado.</p>}</div>
}

function EyeIcon() { return <FilePenLine className="h-3.5 w-3.5" /> }

function FinishingSource({ table }: { table: FinishingReview }) {
  const labels: Record<string, string> = { ambientes: "Acabamentos gerais", materiais: "Materiais", hidraulicas: "Instalações hidráulicas", esquadrias: "Esquadrias e ferragens", eletricas: "Instalações elétricas", ambiente: "Ambiente", pisoRodapeBancada: "Piso, rodapé e bancada", parede: "Parede", teto: "Teto", material: "Material", aplicacao: "Aplicação", loucaCuba: "Louça ou cuba", metais: "Metais", fabricante: "Fabricante", modelo: "Modelo", referencia: "Referência", observacoes: "Observações", portas: "Portas", janelas: "Janelas", ferragens: "Ferragens", vidros: "Vidros", acabamentoEletrico: "Acabamento elétrico", interruptores: "Interruptores", tomadas: "Tomadas", placas: "Placas", linha: "Linha", formato: "Formato", cor: "Cor", marca: "Marca" }
  const groups = Object.entries(table.data ?? {}).filter(([, values]) => Array.isArray(values) && values.length)
  return groups.length ? <>{groups.map(([group, rows]) => { const fields = Array.from(new Set(rows.flatMap(row => Object.keys(row)))).filter(key => key !== "id"); return <div key={group}><h3 className="mb-2 text-sm font-semibold">{labels[group] ?? group}</h3><div className="overflow-x-auto rounded-md border border-border"><table className="w-full text-xs"><thead className="bg-muted"><tr>{fields.map(field => <th key={field} className="whitespace-nowrap p-2 text-left">{labels[field] ?? field}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? index} className="border-t border-border">{fields.map(field => <td key={field} className="min-w-28 p-2 align-top">{String(row[field] ?? "")}</td>)}</tr>)}</tbody></table></div></div> })}</> : <p className="text-sm text-muted-foreground">Nenhum registro cadastrado nesta tabela.</p>
}
