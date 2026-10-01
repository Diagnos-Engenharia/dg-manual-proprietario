"use client"

import { memo, useDeferredValue, useMemo, useState } from "react"
import { Check, ChevronDown, Circle, CircleAlert, CircleDashed, Clock3, Minus, Search } from "lucide-react"
import type { ContentStatus, ManualSection, PaginatedManual } from "@/lib/manual-document/types"
import { flattenSections } from "@/lib/manual-document/types"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export const contentStatusLabels: Record<ContentStatus, string> = {
  aprovado: "Aprovado", aguardando_validacao: "Aguardando validação", rascunho: "Rascunho",
  reprovado: "Reprovado", sem_conteudo: "Sem conteúdo", nao_aplicavel: "Não aplicável",
}

export function ContentStatusIcon({ status, className }: { status: ContentStatus; className?: string }) {
  const Icon = status === "aprovado" ? Check : status === "aguardando_validacao" ? Clock3 : status === "reprovado" ? CircleAlert : status === "rascunho" ? CircleDashed : status === "nao_aplicavel" ? Minus : Circle
  return <Icon aria-label={contentStatusLabels[status]} className={cn("h-3.5 w-3.5 shrink-0", status === "aprovado" ? "text-success" : status === "aguardando_validacao" ? "text-warning" : status === "reprovado" ? "text-destructive" : "text-muted-foreground", className)} />
}

function sectionSearchText(section: ManualSection) {
  const blocks = section.blocks.map(block => {
    if (block.type === "paragraph" || block.type === "heading") return block.text
    if (block.type === "callout") return block.title + " " + block.text
    if (block.type === "table" || block.type === "maintenanceTable" || block.type === "warrantyTable") return block.headers.join(" ") + " " + block.rows.flat().join(" ")
    if (block.type === "image") return block.caption ?? ""
    return ""
  }).join(" ")
  return normalize(section.number + " " + section.title + " " + blocks)
}
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() }

type NavigationProps = { sections: ManualSection[]; layout: PaginatedManual; activeId: string; expanded: Set<string>; onExpand: (id: string) => void; onNavigate: (id: string, page?: number) => void }

export const DocumentNavigation = memo(function DocumentNavigation({ sections, layout, activeId, expanded, onExpand, onNavigate }: NavigationProps) {
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const index = useMemo(() => flattenSections(sections).map(section => ({ section, text: sectionSearchText(section) })), [sections])
  const pageText = useMemo(() => layout.pages.map(page => ({ number: page.number, sectionIds: new Set(page.sectionIds), text: normalize(page.commands.filter(command => command.type === "text").map(command => command.text).join(" ")) })), [layout])
  const matches = useMemo(() => {
    const terms = normalize(deferredQuery.trim()).split(/\s+/).filter(Boolean)
    return terms.length ? index.filter(entry => terms.every(term => entry.text.includes(term))).map(entry => {
      const matchingPage = pageText.find(page => page.sectionIds.has(entry.section.id) && terms.every(term => page.text.includes(term)))
      return { ...entry, matchingPage: matchingPage?.number }
    }) : null
  }, [index, deferredQuery, pageText])

  return <nav aria-label="Sumário do manual" className="flex min-h-0 flex-col border-r border-border bg-card">
    <div className="border-b border-border p-3">
      <h2 className="mb-3 text-sm font-semibold">Sumário</h2>
      <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar no manual" aria-label="Buscar no manual" className="pl-8" /></div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {matches ? <div aria-live="polite"><p className="px-2 py-2 text-xs text-muted-foreground">{matches.length} resultado{matches.length === 1 ? "" : "s"}</p><ul>{matches.map(({ section, matchingPage }) => <li key={section.id}><NavigationItem section={section} page={matchingPage ?? layout.destinations[section.id]?.page} targetPage={matchingPage} active={activeId === section.id} onNavigate={onNavigate} /></li>)}</ul></div> : <SectionTree sections={sections} layout={layout} activeId={activeId} expanded={expanded} onExpand={onExpand} onNavigate={onNavigate} />}
    </div>
    <div className="border-t border-border p-3 text-[11px] leading-relaxed text-muted-foreground">Os estados indicam a revisão do conteúdo. Apenas conteúdo aprovado aparece nas páginas.</div>
  </nav>
})

function SectionTree({ sections, layout, activeId, expanded, onExpand, onNavigate }: NavigationProps) {
  return <ul className="space-y-0.5">{sections.map(section => <li key={section.id}>
    <div className="flex items-start">
      {section.children.length ? <button type="button" className="mt-1 flex h-7 w-6 shrink-0 items-center justify-center rounded hover:bg-accent" aria-label={(expanded.has(section.id) ? "Recolher " : "Expandir ") + section.title} aria-expanded={expanded.has(section.id)} onClick={() => onExpand(section.id)}><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !expanded.has(section.id) && "-rotate-90")} /></button> : <span className="w-6 shrink-0" />}
      <NavigationItem section={section} page={layout.destinations[section.id]?.page} active={activeId === section.id} onNavigate={onNavigate} />
    </div>
    {section.children.length > 0 && expanded.has(section.id) && <div className="ml-3 border-l border-border pl-1"><SectionTree sections={section.children} layout={layout} activeId={activeId} expanded={expanded} onExpand={onExpand} onNavigate={onNavigate} /></div>}
  </li>)}</ul>
}

function NavigationItem({ section, page, targetPage, active, onNavigate }: { section: ManualSection; page?: number; targetPage?: number; active: boolean; onNavigate: (id: string, page?: number) => void }) {
  return <button type="button" aria-current={active ? "location" : undefined} onClick={() => onNavigate(section.id, targetPage)} title={contentStatusLabels[section.validationStatus]} className={cn("flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-2 text-left text-xs leading-relaxed", active ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-accent")}>
    <ContentStatusIcon status={section.validationStatus} className="mt-0.5" /><span className="min-w-0 flex-1">{section.number ? section.number + " " : ""}{section.title}</span>{page ? <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{page}</span> : null}
  </button>
}
