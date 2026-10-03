"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { BookOpen, Download, ExternalLink, LogOut, MessageCircle, Send } from "lucide-react"
import { useRouter } from "next/navigation"
import { signOut } from "@/lib/auth-client"
import type { ClientPortalData } from "@/lib/client-types"
import type { ManualChatAnswer } from "@/lib/manual-chat"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export function PortalSignOut() {
  const router = useRouter(), [busy, setBusy] = useState(false), [error, setError] = useState("")
  async function leave() {
    setBusy(true); setError("")
    try { const result = await signOut(); if (result.error) throw new Error("logout"); router.replace("/sign-in"); router.refresh() }
    catch { setError("Não foi possível sair. Tente novamente.") }
    finally { setBusy(false) }
  }
  return <div className="text-right"><Button variant="ghost" disabled={busy} onClick={() => void leave()}><LogOut />{busy ? "Saindo…" : "Sair"}</Button>{error && <p role="alert" className="text-xs text-red-600">{error}</p>}</div>
}

export function ClientPortal({ data }: { data: ClientPortalData }) {
  return <><div><h1 className="text-2xl font-semibold tracking-tight">Olá, {data.userName}</h1><p className="mt-1 text-sm text-muted-foreground">Consulte os documentos publicados da sua unidade.</p></div>{data.accesses.map(access => <ClientAccessDocuments key={access.id} access={access} />)}</>
}

function ClientAccessDocuments({ access }: { access: ClientPortalData["accesses"][number] }) {
  const ownerManuals = access.manuals.filter(manual => manual.manualType === "proprietario")
  const [manualId, setManualId] = useState(ownerManuals[0]?.id ?? "")
  const selected = ownerManuals.find(manual => manual.id === manualId) ?? ownerManuals[0]
  return <section className="overflow-hidden rounded-xl border border-border bg-card">
    <div className="border-b border-border px-5 py-4"><h2 className="font-semibold">{access.developmentName}</h2><p className="mt-1 text-sm text-muted-foreground">{access.unitLabel} · {access.organizationName}</p></div>
    {!access.manuals.length ? <div className="p-6 text-sm text-muted-foreground">Ainda não há documentos publicados para este acesso. A construtora disponibilizará o manual e a tabela de acabamentos após a publicação.</div> : <div className="grid lg:grid-cols-2">
      <div className="space-y-3 p-5"><h3 className="text-sm font-medium">Documentos disponíveis</h3>{access.manuals.map(manual => <article key={manual.id} className="rounded-lg border border-border p-3"><div className="flex items-start gap-2"><BookOpen aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /><div className="min-w-0"><h4 className="text-sm font-medium">{manual.manualType === "proprietario" ? "Manual do Proprietário" : "Tabela de acabamentos da unidade"}</h4><p className="mt-1 text-xs text-muted-foreground">Revisão {manual.revision} · {manual.pages} páginas · Publicado em {new Date(manual.publishedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p></div></div><div className="mt-3 flex flex-wrap gap-2"><a className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted" href={manual.downloadUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-3.5" />Visualizar</a><a className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted" href={manual.downloadUrl + "&download=1"}><Download className="size-3.5" />Baixar</a></div></article>)}</div>
      <div className="border-t border-border p-5 lg:border-t-0 lg:border-l"><div className="mb-3 flex items-center gap-2"><MessageCircle className="size-4 text-primary" /><h3 className="text-sm font-medium">Pergunte ao seu manual</h3></div>{selected ? <>{ownerManuals.length > 1 && <label className="mb-3 block text-xs text-muted-foreground">Versão publicada<select aria-label={"Versão do manual de " + access.developmentName} className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm" value={selected.id} onChange={event => setManualId(event.target.value)}>{ownerManuals.map(manual => <option key={manual.id} value={manual.id}>Manual do Proprietário · Revisão {manual.revision}</option>)}</select></label>}<ManualChat key={access.id + ":" + selected.id} accessId={access.id} manualId={selected.id} revision={selected.revision} /></> : <p className="text-sm text-muted-foreground">O chat estará disponível quando o Manual do Proprietário for publicado.</p>}</div>
    </div>}
  </section>
}

type ChatMessage = { question: string; result: ManualChatAnswer }
function ManualChat({ accessId, manualId, revision }: { accessId: string; manualId: string; revision: number }) {
  const [question, setQuestion] = useState(""), [messages, setMessages] = useState<ChatMessage[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("")
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = question.trim()
    if (busy || value.length < 3) return
    setBusy(true); setError("")
    const request = new AbortController(); controller.current = request
    try {
      const response = await fetch("/api/clients/manuals/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessId, manualId, question: value }), signal: request.signal, cache: "no-store" })
      const payload = await response.json()
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) setMessages([])
        throw new Error(typeof payload.error === "string" ? payload.error : "Não foi possível consultar o manual. Entre em contato com a construtora.")
      }
      setMessages(previous => [...previous.slice(-5), { question: value, result: payload as ManualChatAnswer }]); setQuestion("")
    } catch (failure) { if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : "Não foi possível consultar o manual.") }
    finally { if (!request.signal.aborted) setBusy(false) }
  }
  return <div className="space-y-3"><p className="text-xs leading-relaxed text-muted-foreground">As respostas usam trechos do Manual do Proprietário publicado, revisão {revision}. Para informações que não constam nele, procure a construtora.</p>
    <div aria-live="polite" aria-relevant="additions" className="max-h-96 space-y-3 overflow-y-auto">{messages.map((message, index) => <div key={index} className="space-y-2 text-sm"><p className="ml-6 rounded-lg bg-primary/10 px-3 py-2">{message.question}</p><div className="mr-3 rounded-lg bg-muted/50 px-3 py-3"><p>{message.result.answer}</p>{message.result.citations.map((citation, citationIndex) => <blockquote key={citationIndex} className="mt-3 border-l-2 border-primary/30 pl-3"><p className="whitespace-pre-wrap">{citation.quote}</p><cite className="mt-1 block text-xs text-muted-foreground not-italic">{citation.section} · Revisão {revision}</cite></blockquote>)}</div></div>)}</div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <form onSubmit={submit} className="space-y-2"><label htmlFor={"manual-question-" + accessId} className="sr-only">Sua pergunta sobre o manual</label><Textarea id={"manual-question-" + accessId} placeholder="Como devo cuidar dos revestimentos?" value={question} onChange={event => setQuestion(event.target.value)} maxLength={1000} rows={3} disabled={busy} /><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{question.length}/1000</span><Button type="submit" disabled={busy || question.trim().length < 3}><Send />{busy ? "Consultando…" : "Perguntar"}</Button></div></form>
  </div>
}
