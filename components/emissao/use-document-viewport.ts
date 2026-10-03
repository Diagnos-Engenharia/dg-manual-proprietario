"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { flattenSections, type ManualPreview, type ManualSection } from "@/lib/manual-document/types"

export type ViewMode = "continuous" | "single"
export const pointToPixel = 96 / 72

/** Owns page geometry, scrolling, zoom and table-of-contents selection. */
export function useDocumentViewport(preview: ManualPreview | null, scope: string, requestedSection: string | null) {
  const [activeId, setActiveId] = useState("capa")
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(0.7)
  const [viewMode, setViewMode] = useState<ViewMode>("single")
  const viewportRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef(new Map<number, HTMLDivElement>())
  const positions = useRef<{ page: number; top: number; height: number }[]>([])
  const zoomAnchor = useRef<{ page: number; fraction: number; offset: number } | null>(null)

  useEffect(() => {
    setActiveId("capa"); setPage(1); setExpanded(new Set()); zoomAnchor.current = null
  }, [scope])
  useEffect(() => {
    if (!preview) return
    setPage(current => Math.min(current, Math.max(1, preview.layout.pages.length)))
    setActiveId(current => flattenSections(preview.document.sections).some(section => section.id === current) ? current : preview.document.sections[0]?.id ?? "capa")
  }, [preview])
  const sections = useMemo(() => preview ? flattenSections(preview.document.sections) : [], [preview])
  const sectionById = useMemo(() => new Map(sections.map(section => [section.id, section])), [sections])
  const pendingSections = useMemo(() => sections.filter(section => section.type !== "chapter" && section.type !== "cover" && section.type !== "toc" && section.validationStatus !== "aprovado" && section.validationStatus !== "nao_aplicavel"), [sections])
  const activeSection = sectionById.get(activeId)
  const pageCount = preview?.layout.pages.length ?? 0
  const visiblePages = useMemo(() => {
    const pages = preview?.layout.pages ?? []
    if (viewMode === "single") return pages.filter(item => item.number === page)
    return pages
  }, [preview, viewMode, page])
  const destinations = useMemo(() => Object.entries(preview?.layout.destinations ?? {}).map(([id, destination]) => ({ id, ...destination })).sort((a, b) => a.page - b.page || a.y - b.y), [preview])

  const collectPositions = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const top = viewport.getBoundingClientRect().top
    positions.current = Array.from(pageRefs.current.entries()).map(([number, element]) => { const box = element.getBoundingClientRect(); return { page: number, top: box.top - top + viewport.scrollTop, height: box.height } }).sort((a, b) => a.top - b.top)
  }, [])
  useLayoutEffect(() => {
    collectPositions()
    const viewport = viewportRef.current
    if (!viewport) return
    const anchor = zoomAnchor.current
    if (anchor) {
      const sheet = positions.current.find(candidate => candidate.page === anchor.page)
      if (sheet) viewport.scrollTop = Math.max(0, sheet.top + sheet.height * anchor.fraction - anchor.offset)
      zoomAnchor.current = null
    }
    const observer = new ResizeObserver(collectPositions)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [collectPositions, visiblePages, zoom])
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !preview) return
    let frame = 0
    const syncScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const cursor = viewport.scrollTop + 40
        const sheets = positions.current
        let sheet = sheets[0]
        for (const candidate of sheets) { if (candidate.top > cursor) break; sheet = candidate }
        if (!sheet) return
        const pageData = preview.layout.pages.find(item => item.number === sheet.page)
        if (!pageData) return
        const y = Math.max(0, cursor - sheet.top) * pageData.height / sheet.height
        const onPage = destinations.filter(destination => destination.page === sheet.page)
        let destination = onPage[0]
        for (const candidate of onPage) { if (candidate.y > y + 12) break; destination = candidate }
        setPage(sheet.page)
        setActiveId(destination?.id ?? pageData.sectionId)
      })
    }
    viewport.addEventListener("scroll", syncScroll, { passive: true })
    return () => { viewport.removeEventListener("scroll", syncScroll); if (frame) cancelAnimationFrame(frame) }
  }, [preview, destinations, viewMode])

  const navigate = useCallback((id: string, matchingPage?: number) => {
    if (!preview) return
    const sectionDestination = preview.layout.destinations[id]
    const destination = matchingPage ? { page: matchingPage, y: 0 } : sectionDestination
    if (!destination) return
    setActiveId(id); setPage(destination.page)
    requestAnimationFrame(() => {
      const viewport = viewportRef.current
      const element = pageRefs.current.get(destination.page)
      if (!viewport || !element) return
      collectPositions()
      const position = positions.current.find(item => item.page === destination.page)
      const pageData = preview.layout.pages.find(item => item.number === destination.page)
      if (position && pageData) viewport.scrollTo({ top: position.top + destination.y * position.height / pageData.height - 24, behavior: "auto" })
    })
  }, [preview, collectPositions])
  useEffect(() => { if (requestedSection && preview?.layout.destinations[requestedSection]) navigate(requestedSection) }, [requestedSection, preview?.fingerprint, navigate])
  useEffect(() => {
    if (!preview) return
    const ancestors: string[] = []
    function locate(tree: ManualSection[], path: string[]): boolean { for (const section of tree) { if (section.id === activeId) { ancestors.push(...path); return true } if (locate(section.children, [...path, section.id])) return true } return false }
    locate(preview.document.sections, [])
    if (ancestors.length) setExpanded(current => { if (ancestors.every(id => current.has(id))) return current; const next = new Set(current); ancestors.forEach(id => next.add(id)); return next })
  }, [activeId, preview])
  const toggleExpanded = useCallback((id: string) => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }), [])

  function changeZoom(next: number, wholePage = false) {
    const value = Math.max(0.25, Math.min(2, next))
    const viewport = viewportRef.current
    if (viewport) {
      collectPositions()
      const offset = 24
      const cursor = viewport.scrollTop + offset
      let sheet = positions.current[0]
      for (const candidate of positions.current) { if (candidate.top > cursor) break; sheet = candidate }
      if (sheet) {
        const fraction = wholePage ? 0 : Math.max(0, Math.min(1, (cursor - sheet.top) / sheet.height))
        zoomAnchor.current = { page: sheet.page, fraction, offset }
        if (value === zoom) { viewport.scrollTop = Math.max(0, sheet.top + sheet.height * fraction - offset); zoomAnchor.current = null }
      }
    }
    setZoom(value)
  }
  function fit(kind: "page" | "width") {
    const viewport = viewportRef.current
    const first = preview?.layout.pages[0]
    if (!viewport || !first) return
    const width = (viewport.clientWidth - 28) / (first.width * pointToPixel)
    const height = (viewport.clientHeight - 36) / (first.height * pointToPixel)
    changeZoom(kind === "page" ? Math.min(width, height) : width, kind === "page")
  }
  useLayoutEffect(() => {
    if (!preview) return
    let frame = 0
    const viewport = viewportRef.current
    const apply = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => fit("page"))
    }
    apply()
    if (!viewport) return () => { if (frame) cancelAnimationFrame(frame) }
    const observer = new ResizeObserver(apply)
    observer.observe(viewport)
    return () => { if (frame) cancelAnimationFrame(frame); observer.disconnect() }
  }, [preview?.fingerprint, viewMode])
  function movePage(next: number) {
    const number = Math.max(1, Math.min(pageCount, next))
    setPage(number)
    const pageData = preview?.layout.pages.find(item => item.number === number)
    if (pageData) setActiveId(pageData.sectionId)
    requestAnimationFrame(() => { const viewport = viewportRef.current; const element = pageRefs.current.get(number); if (viewport && element) { collectPositions(); const position = positions.current.find(item => item.page === number); if (position) viewport.scrollTo({ top: Math.max(0, position.top - 24), behavior: "auto" }) } })
  }


  return { activeId, expanded, page, zoom, viewMode, setViewMode, sections, sectionById, pendingSections, activeSection, pageCount, visiblePages, viewportRef, pageRefs, navigate, toggleExpanded, changeZoom, fit, movePage }
}
