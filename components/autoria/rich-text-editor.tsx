"use client"

import { useEffect, useState } from "react"
import { EditorContent, useEditor } from "@tiptap/react"
import type { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import Link from "@tiptap/extension-link"
import { Table } from "@tiptap/extension-table"
import TableRow from "@tiptap/extension-table-row"
import TableCell from "@tiptap/extension-table-cell"
import TableHeader from "@tiptap/extension-table-header"
import { Bold, Italic, Link2, List, ListOrdered, Table2, Underline as UnderlineIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { sanitizeHtml } from "@/lib/workflow"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const tools = [
  { label: "Título", icon: "H2", run: (editor: Editor | null) => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: "Negrito", icon: Bold, run: (editor: Editor | null) => editor?.chain().focus().toggleBold().run() },
  { label: "Itálico", icon: Italic, run: (editor: Editor | null) => editor?.chain().focus().toggleItalic().run() },
  { label: "Sublinhado", icon: UnderlineIcon, run: (editor: Editor | null) => editor?.chain().focus().toggleUnderline().run() },
  { label: "Lista", icon: List, run: (editor: Editor | null) => editor?.chain().focus().toggleBulletList().run() },
  { label: "Lista numerada", icon: ListOrdered, run: (editor: Editor | null) => editor?.chain().focus().toggleOrderedList().run() },
]

export function RichTextEditor({ value, onChange, disabled }: { value: string; onChange: (html: string) => void; disabled?: boolean }) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  const [linkError, setLinkError] = useState<string | null>(null)
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [StarterKit, Underline, Link.configure({ openOnClick: false }), Table.configure({ resizable: true }), TableRow, TableHeader, TableCell],
    content: sanitizeHtml(value),
    onUpdate: ({ editor: instance }) => onChange(sanitizeHtml(instance.getHTML())),
  })

  // Permission/loading changes are not text edits. Tiptap otherwise emits an
  // update before a newly loaded value is synchronized, restoring a stale draft.
  useEffect(() => { editor?.setEditable(!disabled, false) }, [disabled, editor])
  useEffect(() => { if (editor && editor.getHTML() !== value) editor.commands.setContent(sanitizeHtml(value), { emitUpdate: false }) }, [editor, value])

  function insertLink() {
    setLinkUrl(editor?.getAttributes("link").href ?? "")
    setLinkError(null); setLinkOpen(true)
  }
  function saveLink() {
    const url = linkUrl.trim()
    if (disabled || !editor) return
    if (!url) editor.chain().focus().extendMarkRange("link").unsetLink().run()
    else {
      try { const parsed = new URL(url); if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) throw new Error() }
      catch { setLinkError("Informe um endereço completo, como https://exemplo.com."); return }
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
    }
    setLinkOpen(false)
  }

  return <div className="overflow-hidden rounded-md border border-border bg-card">
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 p-1.5">
      {tools.map((tool) => { const Icon = tool.icon; return <button key={tool.label} type="button" aria-label={tool.label} title={tool.label} disabled={disabled} onMouseDown={(event) => { event.preventDefault(); tool.run(editor) }} className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40">{typeof Icon === "string" ? <span className="text-xs font-bold">{Icon}</span> : <Icon className="h-4 w-4" />}</button> })}
      <span className="mx-1 h-5 w-px bg-border" />
      <button type="button" aria-label="Inserir tabela" title="Inserir tabela" disabled={disabled} onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-40"><Table2 className="h-4 w-4" /></button>
      <button type="button" aria-label="Inserir link" title="Inserir link" disabled={disabled} onClick={insertLink} className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-40"><Link2 className="h-4 w-4" /></button>
    </div>
    <EditorContent editor={editor} onClick={(event)=>{if(disabled||!editor)return;if(event.target===event.currentTarget)editor.chain().focus("start").run()}} className={cn("prose-editor min-h-[280px] max-w-none cursor-text p-4 text-sm leading-relaxed outline-none [&_.ProseMirror]:min-h-[248px] [&_.ProseMirror]:outline-none", disabled && "cursor-not-allowed opacity-70")} />
    <Dialog open={linkOpen} onOpenChange={setLinkOpen}><DialogContent><DialogHeader><DialogTitle>Inserir link</DialogTitle><DialogDescription>Informe o endereço do link para o texto selecionado. Deixe vazio para remover o link.</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); saveLink() }} className="space-y-4"><label className="block space-y-2 text-sm"><span>Endereço do link</span><Input autoFocus value={linkUrl} onChange={event => setLinkUrl(event.target.value)} placeholder="https://" /></label>{linkError && <p role="alert" className="text-sm text-destructive">{linkError}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>Cancelar</Button><Button type="submit" disabled={disabled}>Salvar link</Button></div></form></DialogContent></Dialog>
  </div>
}
