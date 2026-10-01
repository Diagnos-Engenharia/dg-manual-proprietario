"use client"

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { upload as uploadBlob } from "@vercel/blob/client"
import { Archive, CheckCircle2, Download, FileText, Folder, FolderPlus, Loader2, Pencil, Search, Trash2, Upload, XCircle } from "lucide-react"
import { formatDateTime, formatFileSize } from "@/lib/mock-data"
import { DATABOOK_GENERAL_FOLDER, DATABOOK_MAX_BYTES, resolveDatabookFolders, type DatabookCatalog, type DatabookFile, type DatabookFolder } from "@/lib/databook/types"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { databookArchivePaths } from "@/lib/databook/archive-paths"

type PersistedFile = Omit<DatabookFile, "createdAt"> & { createdAt: string | Date }
type PreparedUpload = { ticket: string; pathname: string; transport: "local" | "blob" }
type UploadJob = { id: string; file: File; folderId: string | null; folderName: string; state: "queued" | "uploading" | "done" | "error"; progress: number; error?: string; prepared?: PreparedUpload; uploaded?: boolean }
type ChangeDialog = { kind: "create" } | { kind: "rename-folder"; folder: DatabookFolder } | { kind: "delete-folder"; folder: DatabookFolder } | { kind: "rename-file"; file: DatabookFile } | { kind: "delete-file"; file: DatabookFile }

async function readResponse<T>(response: Response): Promise<T> {
  let result: { error?: string } & T
  try { result = await response.json() } catch { throw new Error(response.status === 413 ? "O arquivo deve ter no máximo 50 MB." : "O servidor não respondeu ao envio. Tente novamente.") }
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir a operação. Tente novamente.")
  return result
}
async function jsonRequest<T>(url: string, body: unknown, method = "POST") { return readResponse<T>(await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })) }

export function Databook({ developmentId, persistedFiles = [] }: { developmentId?: string; persistedFiles?: PersistedFile[] }) {
  const [catalog, setCatalog] = useState<DatabookCatalog>(() => ({ folders: resolveDatabookFolders(null, persistedFiles), files: persistedFiles.map(file => ({ ...file, createdAt: new Date(file.createdAt).toISOString() })), canEdit: false }))
  const [loading, setLoading] = useState(true)
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [dragging, setDragging] = useState(false)
  const [dialog, setDialog] = useState<ChangeDialog | null>(null)
  const [name, setName] = useState("")
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestSequence = useRef(0)
  const alive = useRef(true)
  const running = useRef(new Set<string>())
  const jobData = useRef(new Map<string, UploadJob>())
  const dragDepth = useRef(0)

  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    const sequence = ++requestSequence.current
    setLoading(true)
    if (!developmentId) { setLoading(false); setError("Selecione um empreendimento para acessar os arquivos."); return () => { alive.current = false } }
    fetch(`/api/databook/folders?developmentId=${encodeURIComponent(developmentId)}`, { signal: controller.signal, cache: "no-store" }).then(readResponse<DatabookCatalog>).then(result => {
      if (sequence === requestSequence.current) { setCatalog(result); setError(null) }
    }).catch(reason => { if (!controller.signal.aborted && sequence === requestSequence.current) setError(reason instanceof Error ? reason.message : "Não foi possível carregar os arquivos.") }).finally(() => { if (sequence === requestSequence.current && !controller.signal.aborted) setLoading(false) })
    return () => { alive.current = false; controller.abort() }
  }, [developmentId])

  async function refresh() {
    const sequence = ++requestSequence.current
    const result = await readResponse<DatabookCatalog>(await fetch(`/api/databook/folders?developmentId=${encodeURIComponent(developmentId || "")}`, { cache: "no-store" }))
    if (alive.current && sequence === requestSequence.current) {
      setCatalog(result)
      setActiveFolder(current => current && !result.folders.some(folder => folder.id === current) ? null : current)
    }
    return result
  }

  const active = catalog.folders.find(folder => folder.id === activeFolder)
  const destination = active?.name || DATABOOK_GENERAL_FOLDER
  const uploading = jobs.some(job => job.state === "queued" || job.state === "uploading")
  const visible = useMemo(() => catalog.files.filter(file => (!active || file.folder === active.name) && `${file.name} ${file.folder}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))), [catalog.files, active, query])
  const counts = useMemo(() => { const result = new Map<string, number>(); catalog.files.forEach(file => result.set(file.folder, (result.get(file.folder) || 0) + 1)); return result }, [catalog.files])

  function updateJob(id: string, patch: Partial<UploadJob>) {
    const job = jobData.current.get(id)
    if (!job) return
    Object.assign(job, patch)
    if (alive.current) setJobs(current => current.map(item => item.id === id ? { ...job } : item))
  }

  async function runUpload(id: string) {
    const job = jobData.current.get(id)
    if (!job || running.current.has(id) || !developmentId) return
    running.current.add(id)
    updateJob(id, { state: "uploading", error: undefined, progress: 0 })
    try {
      if (!job.file.size) throw new Error("O arquivo está vazio.")
      if (job.file.size > DATABOOK_MAX_BYTES) throw new Error("O arquivo deve ter no máximo 50 MB.")
      let file: DatabookFile | undefined
      // A transport response can fail after the object was stored. Retry registration first.
      if (job.prepared) {
        try { file = (await jsonRequest<{ file: DatabookFile }>("/api/databook/upload", { action: "finalize", ticket: job.prepared.ticket })).file } catch (reason) {
          const expired = reason instanceof Error && /autoriza[çc][ãa]o.*expir/i.test(reason.message)
          if (job.uploaded && !expired) throw reason
        }
      }
      if (!file) {
        const prepared = await jsonRequest<PreparedUpload>("/api/databook/upload", { action: "prepare", developmentId, folderId: job.folderId, name: job.file.name, contentType: job.file.type || "application/octet-stream", size: job.file.size })
        updateJob(id, { prepared, uploaded: false })
        if (prepared.transport === "local") {
          const form = new FormData()
          form.append("ticket", prepared.ticket)
          form.append("file", job.file)
          file = (await readResponse<{ file: DatabookFile }>(await fetch("/api/databook/upload", { method: "POST", body: form }))).file
        } else {
          await uploadBlob(prepared.pathname, job.file, { access: "private", contentType: job.file.type || "application/octet-stream", handleUploadUrl: "/api/databook/upload", clientPayload: prepared.ticket, multipart: job.file.size > 10 * 1024 * 1024, onUploadProgress: progress => updateJob(id, { progress: Math.min(95, Math.round(progress.percentage)) }) })
          updateJob(id, { uploaded: true, progress: 95 })
          file = (await jsonRequest<{ file: DatabookFile }>("/api/databook/upload", { action: "finalize", ticket: prepared.ticket })).file
        }
      }
      const registered = file
      if (!registered?.id) throw new Error("O servidor não confirmou o arquivo. Tente novamente.")
      if (alive.current) setCatalog(current => ({ ...current, files: [registered, ...current.files.filter(item => item.id !== registered.id)] }))
      updateJob(id, { state: "done", progress: 100 })
    } catch (reason) { updateJob(id, { state: "error", error: reason instanceof Error ? reason.message : "Não foi possível enviar este arquivo." }) }
    finally { running.current.delete(id) }
  }

  async function enqueue(files: File[]) {
    if (!catalog.canEdit || busy || !files.length) return
    const additions = files.map(file => ({ id: crypto.randomUUID(), file, folderId: activeFolder, folderName: destination, state: "queued" as const, progress: 0 }))
    additions.forEach(job => jobData.current.set(job.id, job))
    setJobs(current => [...current, ...additions])
    setError(null)
    if (inputRef.current) inputRef.current.value = ""
    for (const job of additions) await runUpload(job.id)
    try { await refresh() } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a lista.") }
  }
  async function retry(id: string) { await runUpload(id); try { await refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a lista.") } }

  function fileDrag(event: DragEvent) { return Array.from(event.dataTransfer.types).includes("Files") }
  function dragEnter(event: DragEvent) { if (catalog.canEdit && fileDrag(event)) { event.preventDefault(); dragDepth.current++; setDragging(true) } }
  function dragLeave(event: DragEvent) { if (fileDrag(event)) { event.preventDefault(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false) } } }
  function drop(event: DragEvent) { if (!fileDrag(event)) return; event.preventDefault(); dragDepth.current = 0; setDragging(false); void enqueue(Array.from(event.dataTransfer.files)) }

  function openDialog(next: ChangeDialog) {
    setDialog(next)
    setDialogError(null)
    setName(next.kind === "create" ? "" : "folder" in next ? next.folder.name : next.file.name)
  }
  async function confirmChange() {
    if (!dialog || busy) return
    setBusy(true)
    setDialogError(null)
    try {
      if (dialog.kind === "create" || dialog.kind === "rename-folder" || dialog.kind === "delete-folder") {
        const result = await jsonRequest<DatabookCatalog>("/api/databook/folders", { developmentId, action: dialog.kind === "create" ? "create" : dialog.kind === "rename-folder" ? "rename" : "delete", name, ...(dialog.kind === "create" ? {} : { id: dialog.folder.id, expectedName: dialog.folder.name }) })
        setCatalog(result)
        if (dialog.kind === "create") setActiveFolder(result.folders.find(folder => folder.name === name.trim().replace(/\s+/g, " "))?.id || null)
        if (dialog.kind === "delete-folder" && activeFolder === dialog.folder.id) setActiveFolder(null)
      } else if (dialog.kind === "rename-file") {
        const result = await jsonRequest<{ file: DatabookFile }>("/api/databook/file", { developmentId, id: dialog.file.id, expectedName: dialog.file.name, name }, "PATCH")
        setCatalog(current => ({ ...current, files: current.files.map(file => file.id === result.file.id ? result.file : file) }))
      } else {
        await jsonRequest("/api/databook/delete", { developmentId, id: dialog.file.id, expectedName: dialog.file.name }, "DELETE")
        setCatalog(current => ({ ...current, files: current.files.filter(file => file.id !== dialog.file.id) }))
      }
      setDialog(null)
    } catch (reason) {
      setDialogError(reason instanceof Error ? reason.message : "Não foi possível concluir a operação.")
      // A folder deletion may finish some files before another fails; keep the remaining list accurate.
      try { await refresh() } catch { /* Keep the current list and original actionable error. */ }
    } finally { setBusy(false) }
  }

  async function downloadDatabook() {
    setDownloading(true); setError(null)
    try {
      const { default: JSZip } = await import("jszip")
      const zip = new JSZip()
      const archive = databookArchivePaths()
      for (const folder of catalog.folders) zip.folder(archive.folder(folder.name))
      for (const file of catalog.files) {
        const response = await fetch(`/api/databook/file?pathname=${encodeURIComponent(file.pathname)}`)
        if (!response.ok) { await readResponse(response); throw new Error(`Não foi possível baixar ${file.name}.`) }
        zip.file(archive.file(file.folder, file.name), await response.blob())
      }
      const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }))
      const anchor = document.createElement("a")
      anchor.href = url; anchor.download = "DATABOOK.zip"; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível baixar o DATABOOK.") }
    finally { setDownloading(false) }
  }

  const destructive = dialog?.kind === "delete-folder" || dialog?.kind === "delete-file"
  const dialogTitle = dialog?.kind === "create" ? "Nova pasta" : dialog?.kind === "rename-folder" ? "Renomear pasta" : dialog?.kind === "delete-folder" ? "Excluir pasta" : dialog?.kind === "rename-file" ? "Renomear arquivo" : "Excluir arquivo"

  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Archive className="h-5 w-5" /></span><h2 className="text-lg font-semibold">DATABOOK</h2></div>
      <div className="flex flex-wrap items-center gap-2"><Button variant="outline" disabled={loading || downloading || uploading || !catalog.files.length} onClick={() => void downloadDatabook()} className="gap-1.5"><Download className="h-4 w-4" />{downloading ? "Preparando arquivo..." : "Baixar databook"}</Button><Button disabled={loading || !catalog.canEdit || busy} onClick={() => inputRef.current?.click()} className="gap-1.5"><Upload className="h-4 w-4" />Adicionar arquivos</Button></div>
    </div>
    <input ref={inputRef} aria-label="Arquivos do DATABOOK" type="file" multiple className="hidden" onChange={event => void enqueue(Array.from(event.target.files || []))} />
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" onClick={() => { setLoading(true); void refresh().then(() => setError(null)).catch(reason => setError(reason.message)).finally(() => setLoading(false)) }}>Tentar carregar novamente</Button></div>}
    <div className="grid items-start gap-6 lg:grid-cols-[250px_1fr]">
      <Card className="p-2" aria-label="Pastas do DATABOOK">
        <button type="button" onClick={() => setActiveFolder(null)} className={cn("flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm", !activeFolder && "bg-primary/10 font-medium")}><span>Todos os arquivos</span><Badge variant="secondary">{catalog.files.length}</Badge></button>
        <div className="my-1 border-t border-border" />
        {catalog.folders.map(folder => <div key={folder.id} className="group flex items-center gap-0.5"><button type="button" onClick={() => setActiveFolder(folder.id)} className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-left text-sm", activeFolder === folder.id && "bg-primary/10 font-medium")}><Folder className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{folder.name}</span><span className="ml-auto text-xs text-muted-foreground">{counts.get(folder.name) || 0}</span></button>{catalog.canEdit && <><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-50 group-hover:opacity-100 focus-visible:opacity-100" disabled={busy || uploading} onClick={() => openDialog({ kind: "rename-folder", folder })} aria-label={`Renomear pasta ${folder.name}`}><Pencil className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-50 group-hover:opacity-100 focus-visible:opacity-100" disabled={busy || uploading} onClick={() => openDialog({ kind: "delete-folder", folder })} aria-label={`Excluir pasta ${folder.name}`}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></>}</div>)}
        {catalog.canEdit && <Button variant="ghost" size="sm" disabled={busy || uploading} className="mt-2 w-full justify-start gap-2 text-xs" onClick={() => openDialog({ kind: "create" })}><FolderPlus className="h-3.5 w-3.5" />Nova pasta</Button>}
      </Card>
      <div className={cn("flex min-w-0 flex-col gap-3 rounded-xl", dragging && "ring-2 ring-primary ring-offset-4 ring-offset-background")} onDragEnter={dragEnter} onDragLeave={dragLeave} onDragOver={event => { if (catalog.canEdit && fileDrag(event)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy" } }} onDrop={drop}>
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input aria-label="Buscar arquivo" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar arquivo..." className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-3 text-sm" /></div>
        {catalog.canEdit && <button type="button" disabled={loading || busy} onClick={() => inputRef.current?.click()} className={cn("flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-5 text-center transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60", dragging && "border-primary bg-primary/15")} aria-label="Arraste arquivos ou clique para adicionar"><Upload className="h-6 w-6 text-primary" /><span className="text-sm font-medium">Arraste arquivos ou clique para adicionar</span><span className="text-xs text-muted-foreground">Destino: <strong className="font-medium text-foreground">{destination}</strong> · Até 50 MB por arquivo</span></button>}
        {jobs.length > 0 && <ul aria-label="Envios de arquivos" className="space-y-2">{jobs.map(job => <li key={job.id} className="rounded-lg border border-border bg-card p-3"><div className="flex flex-wrap items-center gap-2">{job.state === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : job.state === "error" ? <XCircle className="h-4 w-4 text-destructive" /> : <Loader2 className="h-4 w-4 animate-spin text-primary" />}<span className="min-w-0 flex-1 truncate text-sm font-medium">{job.file.name}</span><span className="text-xs text-muted-foreground">{job.folderName}</span>{job.state === "error" && <Button variant="outline" size="sm" disabled={busy} onClick={() => void retry(job.id)}>Tentar novamente</Button>}</div><p role={job.state === "error" ? "alert" : "status"} className={cn("mt-1 text-xs", job.state === "error" ? "text-destructive" : "text-muted-foreground")}>{job.state === "done" ? "Arquivo enviado." : job.state === "error" ? job.error : job.state === "queued" ? "Aguardando envio..." : job.progress === 95 ? "Confirmando arquivo..." : `Enviando: ${job.progress}%`}</p>{job.state === "uploading" && <progress max={100} value={job.progress} aria-label={`Progresso do envio de ${job.file.name}`} className="mt-2 h-1 w-full accent-primary" />}</li>)}</ul>}
        {loading ? <Card className="p-10 text-center text-sm text-muted-foreground" role="status">Carregando arquivos...</Card> : visible.length === 0 ? <Card className="min-h-36 p-10 text-center text-sm text-muted-foreground">{query ? "Nenhum arquivo corresponde à pesquisa." : "Nenhum arquivo nesta pasta."}</Card> : <ul className="flex flex-col gap-2">{visible.map(file => <li key={file.id}><Card className="flex flex-row flex-wrap items-center gap-3 p-3"><FileText className="h-5 w-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{formatFileSize(Math.max(1, Math.round(file.sizeBytes / 1024)))} · {formatDateTime(file.createdAt)}</p></div><Badge variant="outline">{file.folder}</Badge>{catalog.canEdit && <Button variant="ghost" size="icon" disabled={busy || uploading} onClick={() => openDialog({ kind: "rename-file", file })} aria-label={`Renomear arquivo ${file.name}`}><Pencil className="h-4 w-4" /></Button>}<a href={`/api/databook/file?pathname=${encodeURIComponent(file.pathname)}`} target="_blank" rel="noopener noreferrer" aria-label={`Baixar arquivo ${file.name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"><Download className="h-4 w-4" /></a>{catalog.canEdit && <Button variant="ghost" size="icon" disabled={busy || uploading} className="text-destructive" onClick={() => openDialog({ kind: "delete-file", file })} aria-label={`Excluir arquivo ${file.name}`}><Trash2 className="h-4 w-4" /></Button>}</Card></li>)}</ul>}
      </div>
    </div>
    <Dialog open={Boolean(dialog)} onOpenChange={open => { if (!open && !busy) setDialog(null) }}>
      <DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>{dialogTitle}</DialogTitle><DialogDescription>{dialog?.kind === "delete-folder" ? `Excluir a pasta “${dialog.folder.name}” e seus ${counts.get(dialog.folder.name) || 0} arquivos?` : dialog?.kind === "delete-file" ? `Excluir “${dialog.file.name}” da pasta ${dialog.file.folder}?` : dialog?.kind === "create" ? "A nova pasta ficará disponível neste empreendimento." : "O nome será atualizado neste empreendimento."}</DialogDescription></DialogHeader>
        {!destructive && <form id="databook-name-form" onSubmit={event => { event.preventDefault(); void confirmChange() }}><label className="space-y-1 text-sm"><span>{dialog?.kind === "rename-file" ? "Nome do arquivo" : "Nome da pasta"}</span><input autoFocus required disabled={busy} value={name} maxLength={dialog?.kind === "rename-file" ? 240 : 100} onChange={event => setName(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3" /></label></form>}
        {dialogError && <p role="alert" className="text-sm text-destructive">{dialogError}</p>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDialog(null)}>Cancelar</Button><Button form={destructive ? undefined : "databook-name-form"} type={destructive ? "button" : "submit"} variant={destructive ? "destructive" : "default"} disabled={busy || (!destructive && !name.trim())} onClick={destructive ? () => void confirmChange() : undefined}>{busy ? "Aguarde..." : destructive ? dialog?.kind === "delete-folder" ? "Excluir pasta" : "Excluir arquivo" : dialog?.kind === "create" ? "Criar pasta" : "Salvar nome"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
