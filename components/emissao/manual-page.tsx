"use client"

import { memo } from "react"
import type { ManualDocument, ManualPage as Page, PaginatedManual } from "@/lib/manual-document/types"

type Props = { page: Page; layout: PaginatedManual; document: ManualDocument; onNavigate?: (sectionId: string) => void; editMode?: boolean; onEditSection?: (sectionId: string, editHref?: string) => void }

/** All geometry and line breaks come from the same display list exported to PDF. */
export const ManualPage = memo(function ManualPage({ page, layout, document, onNavigate, editMode = false, onEditSection }: Props) {
  const family = `DG-${document.identity.typography}`
  const font = (kind: "body" | "bold" | "heading") => `${family}-${kind}`
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${page.width} ${page.height}`} width="100%" height="100%" role={editMode ? "group" : "img"} aria-label={`${document.metadata.title}, página ${page.number}`} style={{ display: "block", background: document.identity.surface }}>
    <style>{`@font-face{font-family:'${font("body")}';src:url('${layout.fonts.body}') format('truetype');font-weight:400;font-display:block} @font-face{font-family:'${font("bold")}';src:url('${layout.fonts.bold}') format('truetype');font-weight:400;font-display:block} @font-face{font-family:'${font("heading")}';src:url('${layout.fonts.heading}') format('truetype');font-weight:400;font-display:block}`}</style>
    {page.commands.map((command,index) => {
      if (command.type === "rect") return <rect key={index} x={command.x} y={command.y} width={command.width} height={command.height} fill={command.color} opacity={command.opacity??1}/>
      if (command.type === "line") return <line key={index} x1={command.x} y1={command.y} x2={command.x2} y2={command.y2} stroke={command.color} strokeWidth={command.width??1}/>
      if (command.type === "image") return <image key={index} href={command.src} x={command.x} y={command.y} width={command.width} height={command.height} preserveAspectRatio={command.fit==="cover"?"xMidYMid slice":"xMidYMid meet"} opacity={command.opacity??1}/>
      const text = <text x={command.x} y={command.y} fontFamily={font(command.font)} fontSize={command.size} fill={command.color} style={{ fontKerning: "none", fontVariantLigatures: "none" }}>{command.text}</text>
      const targetSection = command.link?.startsWith("#") ? command.link.slice(1) : command.sectionId
      if (editMode && targetSection && onEditSection) {
        const editHref = command.link?.startsWith("#") ? undefined : command.editHref
        return <a key={index} href={editHref ?? "#" + targetSection} role="link" aria-label={"Editar na Elaboração: " + command.text} tabIndex={0} onClick={event => { event.preventDefault(); onEditSection(targetSection, editHref) }} className="hover:opacity-70 focus:opacity-70" style={{ cursor: "pointer" }}><title>Editar na Elaboração</title>{text}</a>
      }
      return command.link?.startsWith("#") ? <a key={index} href={command.link} onClick={event=>{if(onNavigate){event.preventDefault();onNavigate(command.link!.slice(1))}}} style={{cursor:"pointer"}}>{text}</a> : <g key={index}>{text}</g>
    })}
  </svg>
})
