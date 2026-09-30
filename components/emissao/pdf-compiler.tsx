"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Check, Download, Eye, FileOutput, Loader2, Paperclip, RefreshCw, Send, ShieldCheck } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

type ManualType = "proprietario" | "sindico"
type Validation = { development: string; stages?: Array<{id:string; name:string; progress:number; pending:string[]}>; overall?:number; blocking: string[]; alerts: string[]; sections: number; attachments: Array<{ name: string; sizeBytes: number; pathname: string }>; manualType: ManualType; finishing?: Array<{ id: string; typology: string; tower: string; unitModel: string; area: string; revision: number; status: string; updatedAt: string }> }
type Version = { id: string; revision: number; status: string; comment: string | null; filename: string; pathname: string; sections: number; pages: number; attachments: number; createdAt: string }

const labels: Record<ManualType, string> = { proprietario: "Manual do Proprietário", sindico: "Manual do Síndico" }
const statusLabels: Record<string, string> = { rascunho: "Rascunho", validacao: "Enviado para validação", aprovado: "Aprovado", publicado: "Publicado", substituido: "Substituído" }

export function PdfCompiler({ developmentId, role }: { developmentId?: string; role: "admin" | "editor" | "validator" }) {
  const [manual, setManual] = useState<ManualType>("proprietario")
  const [validation, setValidation] = useState<Validation | null>(null)
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ filename: string; pathname: string; revision: number; pages: number } | null>(null)

  async function load() {
    if (!developmentId) return
    setLoading(true); setError(null)
    try {
      const [validationResponse, versionsResponse] = await Promise.all([
        fetch("/api/manuals/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ developmentId, manualType: manual }) }),
        fetch(`/api/manuals/versions?developmentId=${encodeURIComponent(developmentId)}&manualType=${manual}`),
      ])
      const readJson = async <T,>(response: Response) => {
        const text = await response.text()
        try { return JSON.parse(text) as T } catch { throw new Error(response.status === 401 ? "Sua sessão expirou. Entre novamente para emitir o PDF." : "O servidor não retornou uma resposta válida.") }
      }
      const nextValidation = await readJson<Validation & { error?: string }>(validationResponse)
      if (!validationResponse.ok) throw new Error(nextValidation.error || "Não foi possível validar o manual.")
      setValidation(nextValidation)
      const nextVersions = await readJson<{ versions?: Version[] }>(versionsResponse)
      if (!versionsResponse.ok) throw new Error("Não foi possível carregar o histórico de versões.")
      setVersions(nextVersions.versions ?? [])
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar a emissão.") } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [developmentId, manual])

  async function compile() {
    if (!developmentId || !validation || validation.blocking.length) return
    setCompiling(true); setError(null); setSuccess(null)
    try {
      const response = await fetch("/api/manuals/compile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ developmentId, manualType: manual }) })
      const responseText = await response.text()
      let result: { error?: string; filename: string; pathname: string; revision: number; pages: number }
      try { result = JSON.parse(responseText) as typeof result } catch { throw new Error(response.status === 401 ? "Sua sessão expirou. Entre novamente para emitir o PDF." : "O servidor não retornou uma resposta válida.") }
      if (!response.ok) throw new Error(result.error || "Falha ao gerar o PDF.")
      setSuccess(result); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao gerar o PDF.") } finally { setCompiling(false) }
  }

  const fileUrl = (pathname: string) => `/api/manuals/file?pathname=${encodeURIComponent(pathname)}`
  async function transition(id: string, status: string) { await fetch("/api/manuals/versions/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }); await load() }
  const current = versions[0]

  return <div className="flex flex-col gap-6">
    <Card className="p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><FileOutput className="h-5 w-5 text-primary" /><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Emitir PDF</p></div><h2 className="mt-2 text-2xl font-semibold">{validation?.development || "Empreendimento"}</h2><p className="mt-1 text-sm text-muted-foreground">Valide, emita e acompanhe versões do manual selecionado.</p></div><Badge variant="outline">{current ? `Revisão ${String(current.revision).padStart(2, "0")}` : "Sem versão emitida"}</Badge></div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => setManual("proprietario")} className={`rounded-lg border p-4 text-left ${manual === "proprietario" ? "border-primary bg-primary/5" : "border-border"}`}><p className="font-medium">Manual do Proprietário</p><p className="mt-1 text-xs text-muted-foreground">Unidade privativa, uso e manutenção.</p></button><button type="button" onClick={() => setManual("sindico")} className={`rounded-lg border p-4 text-left ${manual === "sindico" ? "border-primary bg-primary/5" : "border-border"}`}><p className="font-medium">Manual do Síndico</p><p className="mt-1 text-xs text-muted-foreground">Áreas comuns, operação e condomínio.</p></button></div></Card>

    {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    <Card className="p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Pré-validação</h3><p className="text-sm text-muted-foreground">{loading ? "Verificando conteúdo, anexos e pendências…" : `Conteúdo do ${labels[manual]}.`}</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Atualizar</Button></div>{validation && <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-muted/40 p-3"><p className="text-2xl font-semibold">{validation.sections}</p><p className="text-xs text-muted-foreground">seções do conteúdo</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-2xl font-semibold">{validation.attachments.length}</p><p className="text-xs text-muted-foreground">anexos reais</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-2xl font-semibold">{validation.blocking.length}</p><p className="text-xs text-muted-foreground">erros bloqueantes</p></div></div>}{validation?.stages && <div className="mt-4 space-y-3">{validation.stages.map(stage=><div key={stage.id} className="rounded-lg border border-border p-3"><div className="flex items-center justify-between gap-3"><strong className="text-sm">{stage.name}</strong><span className="font-mono text-xs text-muted-foreground">{stage.progress}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{width:stage.progress+"%"}}/></div>{stage.pending.map((item,i)=><p key={i} className="mt-2 text-xs text-destructive">• {item}</p>)}{stage.pending.length>0&&developmentId&&<a className="mt-2 inline-block text-xs font-medium text-primary underline" href={"/empreendimentos/"+encodeURIComponent(developmentId)+"?modulo="+(stage.id==="cronograma"?"cronograma":"elaboracao")+"&manual="+manual}>Corrigir pendências</a>}</div>)}</div>}{validation?.blocking.length===0&&<p className="mt-3 text-sm text-success">Todas as verificações obrigatórias foram concluídas.</p>}{validation?.alerts.map((item) => <p key={item} className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">Alerta: {item}</p>)}</Card>

    {manual === "proprietario" && <Card className="p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Tabela de Acabamentos</h3><p className="text-sm text-muted-foreground">Resumo somente leitura da tabela usada nesta emissão.</p></div><Badge variant={validation?.finishing?.length ? "default" : "outline"}>{validation?.finishing?.length ? "Incluída" : "Não cadastrada"}</Badge></div>{validation?.finishing?.map((table) => <div key={table.id} className="mt-4 grid gap-2 text-sm sm:grid-cols-4"><div><p className="text-xs text-muted-foreground">Tipologia</p><p className="font-medium">{table.typology}</p></div><div><p className="text-xs text-muted-foreground">Unidade</p><p className="font-medium">{table.unitModel} · {table.area}</p></div><div><p className="text-xs text-muted-foreground">Revisão da tabela</p><p className="font-medium">Rev. {table.revision}</p></div><div><p className="text-xs text-muted-foreground">Última alteração</p><p className="font-medium">{new Date(table.updatedAt).toLocaleString("pt-BR")}</p></div></div>)}</Card>}

  <Card className="p-5"><div className="flex items-center justify-between"><div><h3 className="font-semibold">Resumo e anexos desta revisão</h3><p className="text-sm text-muted-foreground">O sumário é derivado do conteúdo do modelo e os anexos vêm do DATABOOK.</p></div><ShieldCheck className="h-5 w-5 text-muted-foreground" /></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{validation?.attachments.map((file) => <div key={file.pathname} className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"><span className="flex min-w-0 items-center gap-2"><Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{file.name}</span></span><span className="shrink-0 text-xs text-muted-foreground">{Math.ceil(file.sizeBytes / 1024)} KB</span></div>)}{validation && validation.attachments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum anexo associado a esta revisão.</p>}</div></Card>

    <Card className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Ações de emissão</h3><p className="text-sm text-muted-foreground">A emissão cria uma nova revisão sem apagar as anteriores.</p></div><div className="flex flex-wrap gap-2"><Button onClick={compile} disabled={compiling || loading || !validation || validation.blocking.length > 0 || validation.stages?.some(stage=>stage.progress<100)}>{compiling ? <><Loader2 className="h-4 w-4 animate-spin" />Gerando PDF…</> : <><Send className="h-4 w-4" />Emitir nova revisão</>}</Button>{success && <><a className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent" href={fileUrl(success.pathname)} target="_blank" rel="noreferrer"><Eye className="h-4 w-4" />Visualizar</a><a className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent" href={fileUrl(success.pathname)} download={success.filename}><Download className="h-4 w-4" />Baixar</a></>}</div></div>{success && <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300"><Check className="mr-2 inline h-4 w-4" />{success.filename} gerado com {success.pages} páginas.</div>}</Card>

    <Card className="p-5"><h3 className="font-semibold">Histórico de versões</h3><p className="mt-1 text-sm text-muted-foreground">{labels[manual]} — versões preservadas no banco.</p><div className="mt-4 flex flex-col gap-2">{versions.map((version, index) => <div key={version.id} className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Badge variant={index === 0 ? "default" : "secondary"}>Rev. {String(version.revision).padStart(2, "0")}</Badge><span className="text-sm font-medium">{statusLabels[version.status] ?? version.status}</span>{index === 0 && <Badge variant="outline">Atual</Badge>}</div><p className="mt-2 text-xs text-muted-foreground">{new Date(version.createdAt).toLocaleString("pt-BR")} · {version.pages} páginas · {version.attachments} anexos</p>{version.comment && <p className="mt-1 text-sm text-muted-foreground">{version.comment}</p>}</div><div className="flex flex-wrap gap-2">{version.status === "rascunho" && (role === "editor" || role === "admin") && <Button size="sm" variant="outline" onClick={() => void transition(version.id, "validacao")}><Send className="h-4 w-4" />Enviar para validação</Button>}{version.status === "validacao" && (role === "validator" || role === "admin") && <Button size="sm" variant="outline" onClick={() => void transition(version.id, "aprovado")}><Check className="h-4 w-4" />Aprovar</Button>}{version.status === "aprovado" && role === "admin" && <Button size="sm" variant="outline" onClick={() => void transition(version.id, "publicado")}><ShieldCheck className="h-4 w-4" />Publicar</Button>}<a className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent" href={fileUrl(version.pathname)} target="_blank" rel="noreferrer"><Eye className="h-4 w-4" />Visualizar</a><a className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent" href={fileUrl(version.pathname)} download={version.filename}><Download className="h-4 w-4" />Baixar</a></div></div>)}{versions.length === 0 && <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhuma versão emitida para este manual.</p>}</div></Card>
  </div>
}
