import type { ManualType } from "@/lib/mock-data"
import type { ManualIdentity } from "@/lib/manual-identity"

export type ContentStatus = "sem_conteudo" | "rascunho" | "aguardando_validacao" | "aprovado" | "reprovado" | "nao_aplicavel"
export type ManualBlock = { reviewStatus?: "aguardando_validacao"; editHref?: string } & (
  | { type: "heading"; text: string; level?: number }
  | { type: "paragraph"; text: string }
  | { type: "callout"; title: string; text: string; kind: "atencoes" | "recomendacoes" | "garantias" | "avisos" }
  | { type: "table" | "maintenanceTable" | "warrantyTable"; headers: string[]; rows: string[][]; widths?: number[]; title?: string }
  | { type: "image"; src: string; caption?: string; height?: number }
  | { type: "pageBreak" }
)

export type ManualSection = {
  id: string
  type: "cover" | "toc" | "chapter" | "content" | "system" | "attachment"
  title: string
  number?: string
  validationStatus: ContentStatus
  renderPolicy: "approved" | "review" | "structure" | "metadata"
  componentStatuses?: { label: string; status: ContentStatus }[]
  blocks: ManualBlock[]
  children: ManualSection[]
  editHref?: string
  optional?: boolean
}

export type ManualAttachment = { id: string; name: string; pathname: string; contentType: string; sizeBytes: number; policy: "include" | "reference" | "exclude"; sectionId: string }
export type ManualDocument = {
  schemaVersion: 1
  metadata: { developmentId: string; developmentName: string; organizationName: string; organizationLogo?: string | null; manualType: ManualType; title: string; revision: number; date: string; generatedAt: string; fingerprint?: string; purpose?: "preview" | "publication" }
  identity: ManualIdentity
  sections: ManualSection[]
  attachments: ManualAttachment[]
}

/** Top-left A4 coordinates in PDF points, shared by both renderers. */
export type DrawingCommand =
  | { type: "text"; x: number; y: number; text: string; size: number; font: "body" | "bold" | "heading"; color: string; link?: string; sectionId?: string; editHref?: string; reviewStatus?: "aguardando_validacao" }
  | { type: "rect"; x: number; y: number; width: number; height: number; color: string; opacity?: number }
  | { type: "line"; x: number; y: number; x2: number; y2: number; color: string; width?: number }
  | { type: "image"; x: number; y: number; width: number; height: number; src: string; opacity?: number; fit?: "contain" | "cover" }
export type ManualPage = { number: number; width: number; height: number; sectionId: string; sectionIds: string[]; commands: DrawingCommand[] }
export type PaginatedManual = { pages: ManualPage[]; destinations: Record<string, { page: number; y: number }>; fonts: { body: string; bold: string; heading: string }; warnings: string[] }
export type ManualPreview = { document: ManualDocument; layout: PaginatedManual; readiness: { ok: boolean; blocking: string[]; overall: number; stages: { id: string; name: string; progress: number; pending: string[] }[] }; updatedAt: string; fingerprint: string }

export function flattenSections(sections: ManualSection[]): ManualSection[] {
  return sections.flatMap(section => [section, ...flattenSections(section.children)])
}
