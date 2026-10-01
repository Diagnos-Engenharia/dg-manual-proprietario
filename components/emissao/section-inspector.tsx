"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Eye, FilePenLine, History, Loader2, Send } from "lucide-react"
import type { ManualAttachment, ManualSection } from "@/lib/manual-document/types"
import type { TechnicalContact } from "@/lib/mock-data"
import { Button } from "@/components/ui/button"
import { ContentStatusIcon, contentStatusLabels } from "./document-navigation"

type WarrantyRow = Record<string, string>
type FinishingReview = { id: string; tower: string; typology: string; unitModel?: string; revision: number; status: string; updatedAt?: string; data?: Record<string, Record<string, string>[]> }
export type EditorialData = { sections: Record<string, { html?: string; status?: string; comment?: string | null; enabled?: boolean }>; warranties?: WarrantyRow[]; contacts?: TechnicalContact[]; commissioning?: Record<string, { company?: string; phone?: string; site?: string; instructions?: string }>; finishing?: FinishingReview[]; attachments?: Record<string, ManualAttachment["policy"]>; canEdit?: boolean; canValidate?: boolean }
export type EditorialAction = { action: string; sectionId?: string; html?: string; comment?: string; warranties?: WarrantyRow[]; tableId?: string; revision?: number; attachments?: Record<string, ManualAttachment["policy"]>; optional?: Record<string, boolean> }
export type ManualInteractionMode = "view" | "edit"

type Props = {
  section: ManualSection | undefined
  page?: number
  role: "admin" | "editor" | "validator"
  editorial: EditorialData | null
  attachments: ManualAttachment[]
  onAction: (action: EditorialAction) => Promise<void>
  interactionMode: ManualInteractionMode
  onModeChange: (mode: ManualInteractionMode) => void
  onCompile: () => void
  onPending: () => void
  onHistory: () => void
  ready: boolean
  compileDisabled: boolean
  compiling: boolean
  pendingCount: number
}

export function SectionInspector({ section, page, role, editorial, attachments, onAction, interactionMode, onModeChange, onCompile, onPending, onHistory, ready, compileDisabled, compiling, pendingCount }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setError(null) }, [section?.id])
  const canEdit = editorial?.canEdit ?? role !== "validator"
  const files = section ? attachments.filter(file => file.sectionId === section.id || (section.type === "chapter" && section.number === "9")) : []
  async function run(action: EditorialAction) {
    setBusy(true); setError(null)
    try { await onAction(action) } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a configuração.") } finally { setBusy(false) }
  }

  return <div className="flex min-h-full flex-col">
    <div className="flex-1 space-y-5 p-4">
      {section ? <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Seção selecionada</p><h2 className="mt-2 text-sm font-semibold leading-relaxed">{section.number ? section.number + " " : ""}{section.title}</h2>{page && <p className="mt-1 text-xs text-muted-foreground">Página {page}</p>}</div> : <p className="text-xs text-muted-foreground">Selecione uma seção do Sumário.</p>}
      {section?.componentStatuses?.length ? <div className="space-y-3 rounded-lg border border-border p-3">{section.componentStatuses.map(part => <div key={part.label} className="flex items-start gap-2"><ContentStatusIcon status={part.status} className="mt-0.5" /><div className="text-[11px]"><p>{part.label}</p><p className="mt-0.5 text-muted-foreground">{contentStatusLabels[part.status]}</p></div></div>)}</div> : null}
      <div className="space-y-2 border-t border-border pt-4" aria-label="Interação com o manual">
        <Button variant={interactionMode === "edit" ? "default" : "outline"} size="sm" className="w-full justify-start" aria-pressed={interactionMode === "edit"} onClick={() => onModeChange("edit")}><FilePenLine className="h-3.5 w-3.5" />Modo edição</Button>
        <Button variant={interactionMode === "view" ? "default" : "outline"} size="sm" className="w-full justify-start" aria-pressed={interactionMode === "view"} onClick={() => onModeChange("view")}><Eye className="h-3.5 w-3.5" />Visualizar</Button>
        <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">{interactionMode === "edit" ? "Clique em um tópico ou texto para abrir sua edição na Elaboração." : "Clique no Sumário para ir à página do conteúdo."}</p>
      </div>
      {section?.optional && canEdit && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={section.validationStatus !== "nao_aplicavel"} disabled={busy} onChange={event => void run({ action: "settings", optional: { [section.id]: event.target.checked } })} />Incluir esta seção opcional</label>}
      {files.length > 0 && <div className="space-y-3 border-t border-border pt-4"><h3 className="text-xs font-semibold">Anexos</h3>{files.map(file => <div key={file.id} className="space-y-2"><p className="break-words text-xs">{file.name}</p><select aria-label={"Política do anexo " + file.name} disabled={!canEdit || busy} value={file.policy} onChange={event => void run({ action: "settings", attachments: { [file.id]: event.target.value as ManualAttachment["policy"] } })} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"><option value="reference">Apenas referenciar</option><option value="include">Incluir no PDF</option><option value="exclude">Não incluir</option></select></div>)}</div>}
      {busy && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Salvando…</p>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
    <div className="sticky bottom-0 space-y-3 border-t border-border bg-card p-4">
      <p className="text-xs font-semibold">Gerar PDF</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{ready ? "Gere a revisão para seguir com a validação e publicação em Manuais finalizados." : "Conclua as pendências e a validação dos conteúdos para gerar a revisão."}</p>
      <Button size="sm" className="w-full" onClick={onCompile} disabled={compileDisabled} title={role === "validator" ? "A geração está disponível para administradores e editores." : !ready ? "Conclua as pendências obrigatórias para gerar." : "Gerar o manual conferido no preview"}>{compiling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}{compiling ? "Gerando…" : "Gerar PDF"}</Button>
      {!ready && <button type="button" className="w-full text-left text-[11px] text-primary hover:underline" onClick={onPending}>Ver pendências{pendingCount ? " (" + pendingCount + ")" : ""}</button>}
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onHistory}><History className="h-3.5 w-3.5" />Ciclo de finalização</Button>
      <Link href="/manuais" prefetch={false} className="block text-xs font-medium text-primary hover:underline">Manuais finalizados</Link>
    </div>
  </div>
}
