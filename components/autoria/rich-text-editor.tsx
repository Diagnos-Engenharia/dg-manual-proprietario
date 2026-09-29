"use client"

import { useEffect } from "react"
import { EditorContent, useEditor } from "@tiptap/react"
import type { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import Link from "@tiptap/extension-link"
import { Table } from "@tiptap/extension-table"
import TableRow from "@tiptap/extension-table-row"
import TableCell from "@tiptap/extension-table-cell"
import TableHeader from "@tiptap/extension-table-header"
import { Bold, ExternalLink, Italic, Link2, List, ListOrdered, Plus, Table2, Underline as UnderlineIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { sanitizeHtml, supportedVariables } from "@/lib/workflow"

const tools = [
  { label: "Título", icon: "H2", run: (editor: Editor | null) => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: "Negrito", icon: Bold, run: (editor: Editor | null) => editor?.chain().focus().toggleBold().run() },
  { label: "Itálico", icon: Italic, run: (editor: Editor | null) => editor?.chain().focus().toggleItalic().run() },
  { label: "Sublinhado", icon: UnderlineIcon, run: (editor: Editor | null) => editor?.chain().focus().toggleUnderline().run() },
  { label: "Lista", icon: List, run: (editor: Editor | null) => editor?.chain().focus().toggleBulletList().run() },
  { label: "Lista numerada", icon: ListOrdered, run: (editor: Editor | null) => editor?.chain().focus().toggleOrderedList().run() },
]

export function RichTextEditor({ value, onChange, disabled, onInsertVariable }: { value: string; onChange: (html: string) => void; disabled?: boolean; onInsertVariable?: (variable: string) => void }) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [StarterKit, Underline, Link.configure({ openOnClick: false }), Table.configure({ resizable: true }), TableRow, TableHeader, TableCell],
    content: sanitizeHtml(value),
    onUpdate: ({ editor: instance }) => onChange(sanitizeHtml(instance.getHTML())),
  })

  useEffect(() => { editor?.setEditable(!disabled) }, [disabled, editor])
  useEffect(() => { if (editor && editor.getHTML() !== value) editor.commands.setContent(sanitizeHtml(value), { emitUpdate: false }) }, [editor, value])

  function insertLink() {
    const url = window.prompt("URL do link")
    if (url) editor?.chain().focus().setLink({ href: url }).run()
  }

  return <div className="overflow-hidden rounded-md border border-border bg-card">
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 p-1.5">
      {tools.map((tool) => { const Icon = tool.icon; return <button key={tool.label} type="button" aria-label={tool.label} title={tool.label} disabled={disabled} onMouseDown={(event) => { event.preventDefault(); tool.run(editor) }} className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40">{typeof Icon === "string" ? <span className="text-xs font-bold">{Icon}</span> : <Icon className="h-4 w-4" />}</button> })}
      <span className="mx-1 h-5 w-px bg-border" />
      <button type="button" aria-label="Inserir tabela" title="Inserir tabela" disabled={disabled} onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-40"><Table2 className="h-4 w-4" /></button>
      <button type="button" aria-label="Inserir link" title="Inserir link" disabled={disabled} onClick={insertLink} className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-40"><Link2 className="h-4 w-4" /></button>
      <div className="ml-auto flex items-center gap-1"><span className="text-[10px] uppercase text-muted-foreground">Inserir variável</span><select disabled={disabled} defaultValue="" onChange={(event) => { if (event.target.value) { editor?.chain().focus().insertContent(event.target.value).run(); onInsertVariable?.(event.target.value); event.target.value = "" } }} className="h-8 rounded border border-border bg-background px-1 text-xs"><option value="">Selecionar</option>{supportedVariables.map((variable) => <option key={variable} value={variable}>{variable}</option>)}</select></div>
    </div>
    <EditorContent editor={editor} className={cn("prose-editor min-h-[280px] max-w-none p-4 text-sm leading-relaxed outline-none", disabled && "cursor-not-allowed opacity-70")} />
  </div>
}
