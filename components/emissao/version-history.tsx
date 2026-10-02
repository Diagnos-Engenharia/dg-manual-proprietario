"use client"

import { useState } from "react"
import { Check, Download, Eye, Loader2, Send, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export type ManualVersion = { id: string; revision: number; status: string; comment: string | null; filename: string; pathname: string; sections: number; pages: number; attachments: number; createdAt: string; createdBy?: string; authorName?: string | null }
export const versionStatusLabels: Record<string, string> = { rascunho: "Rascunho emitido", validacao: "Em validação", aprovado: "Aprovado", publicado: "Publicado", substituido: "Substituído" }
export function manualFileUrl(pathname: string) { return "/api/manuals/file?pathname=" + encodeURIComponent(pathname) }

export function VersionHistory({ open, onOpenChange, versions, role, onTransition }: { open: boolean; onOpenChange: (open: boolean) => void; versions: ManualVersion[]; role: "admin" | "editor" | "validator"; onTransition: (id: string, status: string) => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function transition(id: string, status: string) {
    setBusy(id); setError(null)
    try { await onTransition(id, status) } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a versão.") } finally { setBusy(null) }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-3xl">
      <DialogHeader><DialogTitle>Histórico de versões</DialogTitle><DialogDescription>Revisões emitidas, aprovação e publicação do documento.</DialogDescription></DialogHeader>
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">{versions.map((version, index) => <article key={version.id} className="rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Badge variant={index === 0 ? "default" : "secondary"}>Rev. {String(version.revision).padStart(2, "0")}</Badge><span className="text-sm font-medium">{versionStatusLabels[version.status] ?? version.status}</span></div><span className="text-xs tabular-nums text-muted-foreground">{version.pages} páginas</span></div>
        <p className="mt-2 text-xs text-muted-foreground">{new Date(version.createdAt).toLocaleString("pt-BR")} · Autor: {version.authorName ?? version.createdBy ?? "Não informado"}</p>
        {version.comment && <p className="mt-2 whitespace-pre-wrap text-sm">{version.comment}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {version.status === "rascunho" && role !== "validator" && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void transition(version.id, "validacao")}>{busy === version.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Enviar para validação</Button>}
          {version.status === "validacao" && role === "admin" && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void transition(version.id, "aprovado")}><Check className="h-3.5 w-3.5" />Aprovar documento</Button>}
          {version.status === "aprovado" && role === "admin" && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void transition(version.id, "publicado")}><ShieldCheck className="h-3.5 w-3.5" />Publicar</Button>}
          <a className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2.5 text-xs font-medium hover:bg-accent" href={manualFileUrl(version.pathname)} target="_blank" rel="noreferrer"><Eye className="h-3.5 w-3.5" />Visualizar</a>
          <a className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2.5 text-xs font-medium hover:bg-accent" href={manualFileUrl(version.pathname)} download={version.filename}><Download className="h-3.5 w-3.5" />Baixar</a>
        </div>
      </article>)}{versions.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma versão emitida.</p>}</div>
    </DialogContent>
  </Dialog>
}
