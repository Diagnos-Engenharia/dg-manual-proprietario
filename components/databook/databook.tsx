"use client"

import { useMemo, useRef, useState } from "react"
import JSZip from "jszip"
import { Archive, Download, FileText, Folder, FolderPlus, Pencil, Plus, Search, Trash2, Upload } from "lucide-react"
import { databookCategories, databookDocs as initialDocs, formatDateTime, formatFileSize, type DatabookDoc } from "@/lib/mock-data"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type FolderItem = { id: string; name: string; parentId: string | null }

const initialFolders: FolderItem[] = databookCategories.map((name, index) => ({ id: `folder-${index}`, name, parentId: null }))

type PersistedDatabookFile = { id: string; folder: string; name: string; pathname: string; contentType: string | null; sizeBytes: number; createdAt: string | Date; userId?: string; developmentId?: string }

export function Databook({ developmentId: _developmentId, persistedFiles }: { developmentId?: string; persistedFiles?: PersistedDatabookFile[] }) {
  const persistedFolders = Array.from(new Set((persistedFiles ?? []).map((file) => file.folder))).filter(Boolean)
  const folderNames = persistedFolders.length ? persistedFolders : databookCategories
  const [folders, setFolders] = useState<FolderItem[]>(folderNames.map((name, index) => ({ id: `folder-${index}`, name, parentId: null })))
  const initialPersistedDocs: DatabookDoc[] = (persistedFiles ?? []).map((file) => {
    const dot = file.name.lastIndexOf(".")
    return { id: file.id, name: dot > 0 ? file.name.slice(0, dot) : file.name, category: file.folder, ext: dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "bin", sizeKB: Math.max(1, Math.round(file.sizeBytes / 1024)), uploadedAt: new Date(file.createdAt).toISOString(), uploadedBy: "Usuário autenticado", pathname: file.pathname }
  })
  const [docs, setDocs] = useState<DatabookDoc[]>(persistedFiles ? initialPersistedDocs : initialDocs)
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [uploadFolder, setUploadFolder] = useState(initialFolders[0].id)
  const [newFolderName, setNewFolderName] = useState("")
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const folderByName = useMemo(() => Object.fromEntries(folders.map((f) => [f.name, f.id])), [folders])
  const visibleDocs = useMemo(() => docs.filter((doc) => {
    const folderId = folderByName[doc.category]
    return (!activeFolder || folderId === activeFolder) && doc.name.toLowerCase().includes(query.toLowerCase())
  }), [docs, activeFolder, folderByName, query])
  const activeName = folders.find((f) => f.id === activeFolder)?.name ?? "Todos os arquivos"

  async function upload(files: FileList | null) {
    if (!files?.length) return
    const folder = folders.find((item) => item.id === uploadFolder) ?? folders[0]
    setUploading(true)
    setError(null)
    try {
      const additions = await Promise.all([...files].map(async (file, index) => {
        const formData = new FormData()
        formData.append("file", file)
        formData.append("developmentId", _developmentId ?? "unknown")
        formData.append("folder", folder.name)
        const response = await fetch("/api/databook/upload", { method: "POST", body: formData })
        if (!response.ok) throw new Error("Falha no upload")
        const result = await response.json() as { pathname: string }
        const dot = file.name.lastIndexOf(".")
        return { id: `db-${Date.now()}-${index}`, name: dot > 0 ? file.name.slice(0, dot) : file.name, category: folder.name, ext: dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "bin", sizeKB: Math.max(1, Math.round(file.size / 1024)), uploadedAt: new Date().toISOString(), uploadedBy: "Usuário autenticado", pathname: result.pathname }
      }))
      setDocs((current) => [...additions, ...current])
    } catch (uploadError) {
      console.error("[v0] Databook upload error", uploadError)
      setError("Não foi possível enviar um ou mais arquivos.")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  function createFolder() {
    const name = newFolderName.trim()
    if (!name) return
    const folder = { id: `folder-${Date.now()}`, name, parentId: null }
    setFolders((current) => [...current, folder])
    setUploadFolder(folder.id)
    setNewFolderName("")
    setCreatingFolder(false)
  }

  async function deleteFolder(id: string) {
    const folder = folders.find((item) => item.id === id)
    if (!folder || !window.confirm(`Excluir a pasta “${folder.name}” e seus arquivos?`)) return
    const folderDocs = docs.filter((doc) => doc.category === folder.name && doc.pathname)
    await Promise.all(folderDocs.map((doc) => fetch("/api/databook/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pathname: doc.pathname }) })))
    setFolders((current) => current.filter((item) => item.id !== id))
    setDocs((current) => current.filter((doc) => doc.category !== folder.name))
    if (activeFolder === id) setActiveFolder(null)
  }

  async function deleteDoc(doc: DatabookDoc) {
    if (doc.pathname) await fetch("/api/databook/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pathname: doc.pathname }) })
    setDocs((current) => current.filter((item) => item.id !== doc.id))
  }

  async function downloadDatabook() {
    const zip = new JSZip()
    zip.file("README.txt", "DATABOOK\nArquivos compilados por pasta.\n")
    for (const folder of folders) {
      const folderZip = zip.folder(folder.name)
      for (const doc of docs.filter((item) => item.category === folder.name)) {
        if (doc.pathname) {
          const response = await fetch(`/api/databook/file?pathname=${encodeURIComponent(doc.pathname)}`)
          if (response.ok) folderZip?.file(`${doc.name}.${doc.ext}`, await response.blob())
        } else {
          folderZip?.file(`${doc.name}.${doc.ext}`, `Arquivo referenciado no DATABOOK\nNome: ${doc.name}.${doc.ext}\nTamanho: ${formatFileSize(doc.sizeKB)}\nEnviado por: ${doc.uploadedBy}\n`)
        }
      }
    }
    const blob = await zip.generateAsync({ type: "blob" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "DATABOOK.zip"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Archive className="h-5 w-5" /></span><h2 className="text-lg font-semibold">DATABOOK</h2></div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={downloadDatabook} className="gap-1.5"><Download className="h-4 w-4" />Baixar databook</Button>
          <select value={uploadFolder} onChange={(event) => setUploadFolder(event.target.value)} className="h-9 rounded-md border border-border bg-card px-2 text-sm" aria-label="Pasta do upload">{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(event) => upload(event.target.files)} />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-1.5"><Upload className="h-4 w-4" />{uploading ? "Enviando..." : "Adicionar arquivos"}</Button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
        <Card className="h-fit p-2">
          <button type="button" onClick={() => setActiveFolder(null)} className={cn("flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm", !activeFolder && "bg-primary/10 font-medium")}><span>Todos os arquivos</span><Badge variant="secondary">{docs.length}</Badge></button>
          <div className="my-1 border-t border-border" />
          {folders.map((folder) => <div key={folder.id} className="group flex items-center gap-1"><button type="button" onClick={() => setActiveFolder(folder.id)} className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-left text-sm", activeFolder === folder.id && "bg-primary/10 font-medium")}><Folder className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{folder.name}</span><span className="ml-auto text-xs text-muted-foreground">{docs.filter((doc) => doc.category === folder.name).length}</span></button><Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => deleteFolder(folder.id)} aria-label={`Excluir pasta ${folder.name}`}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div>)}
          {creatingFolder ? <div className="mt-2 flex gap-1"><input autoFocus value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createFolder()} placeholder="Nome da pasta" className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs" /><Button size="icon" className="h-7 w-7" onClick={createFolder}><Plus className="h-3.5 w-3.5" /></Button></div> : <Button variant="ghost" size="sm" className="mt-2 w-full justify-start gap-2 text-xs" onClick={() => setCreatingFolder(true)}><FolderPlus className="h-3.5 w-3.5" />Nova pasta</Button>}
        </Card>

        <div className="flex min-w-0 flex-col gap-3"><h3 className="text-sm font-medium">{activeName}</h3><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar arquivo..." className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-3 text-sm" /></div>{visibleDocs.length === 0 ? <Card className="p-10 text-center text-sm text-muted-foreground">Nenhum arquivo nesta pasta.</Card> : <ul className="flex flex-col gap-2">{visibleDocs.map((doc) => <li key={doc.id}><Card className="flex flex-wrap items-center gap-3 p-3"><FileText className="h-5 w-5 shrink-0 text-primary" /><div className="min-w-0 flex-1">{renameId === doc.id ? <input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onBlur={() => { setDocs((current) => current.map((item) => item.id === doc.id ? { ...item, name: renameValue.trim() || item.name } : item)); setRenameId(null) }} className="w-full rounded border border-primary/50 bg-background px-2 py-1 text-sm" /> : <p className="truncate text-sm font-medium">{doc.name}.<span className="uppercase text-muted-foreground">{doc.ext}</span></p>}<p className="text-xs text-muted-foreground">{formatFileSize(doc.sizeKB)} · {doc.uploadedBy} · {formatDateTime(doc.uploadedAt)}</p></div><Badge variant="outline">{doc.category}</Badge><Button variant="ghost" size="icon" onClick={() => { setRenameId(doc.id); setRenameValue(doc.name) }} aria-label="Renomear arquivo"><Pencil className="h-4 w-4" /></Button>{doc.pathname && <Button variant="ghost" size="icon" onClick={() => window.open(`/api/databook/file?pathname=${encodeURIComponent(doc.pathname!)}`, "_blank", "noopener,noreferrer")} aria-label="Baixar arquivo"><Download className="h-4 w-4" /></Button>}<Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteDoc(doc)} aria-label="Excluir arquivo"><Trash2 className="h-4 w-4" /></Button></Card></li>)}</ul>}</div>
      </div>
    </div>
  )
}
