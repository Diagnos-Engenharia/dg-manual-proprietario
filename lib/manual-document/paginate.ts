import type { PDFFont } from "pdf-lib"
import { manualFontUrls } from "@/lib/manual-identity"
import { manualFontMetrics } from "./fonts"
import { flattenSections, type DrawingCommand, type ManualBlock, type ManualDocument, type ManualPage, type ManualSection, type PaginatedManual } from "./types"

export const A4 = { width: 210 * 72 / 25.4, height: 297 * 72 / 25.4 }
export const REVIEW_TEXT_COLOR = "#B77900"
const LEFT = 44
const RIGHT = A4.width - LEFT
const WIDTH = RIGHT - LEFT
const TOP = 90
const BOTTOM = A4.height - 65
type Font = "body" | "bold" | "heading"
type Fonts = Record<Font, PDFFont>
const wrappedTextCache = new WeakMap<PDFFont, Map<string, string[]>>()

function plain(value: string) { return String(value ?? "").normalize("NFC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "") }

/** Breaks from the actual embedded fonts, never from browser estimates. */
export function wrapManualText(text: string, font: PDFFont, size: number, width: number): string[] {
  let cache = wrappedTextCache.get(font)
  if (!cache) { cache = new Map(); wrappedTextCache.set(font, cache) }
  const key = JSON.stringify([size,width,text])
  const cached = cache.get(key)
  if (cached) return cached
  const lines: string[] = []
  for (const paragraph of plain(text).split(/\r?\n/)) {
    let line = ""
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue }
      if (line) { lines.push(line); line = "" }
      if (font.widthOfTextAtSize(word, size) <= width) { line = word; continue }
      for (const character of Array.from(word)) {
        if (line && font.widthOfTextAtSize(line + character, size) > width) { lines.push(line); line = "" }
        line += character
      }
    }
    lines.push(line)
  }
  const result = lines.length ? lines : [""]
  if (cache.size > 4000) cache.clear()
  cache.set(key,result)
  return result
}

class Paginator {
  pages: ManualPage[] = []
  destinations: PaginatedManual["destinations"] = {}
  page!: ManualPage
  y = TOP
  section!: ManualSection
  contentSection?: ManualSection
  activeBlock?: ManualBlock
  reviewTitle = false
  warnings: string[] = []
  constructor(readonly document: ManualDocument, readonly fonts: Fonts, readonly tocDestinations: PaginatedManual["destinations"]) {}
  get identity() { return this.document.identity }
  command(value: DrawingCommand) { this.page.commands.push(value) }
  text(text: string, x: number, top: number, size = 10, font: Font = "body", color = this.identity.text, link?: string) {
    const linked = link?.startsWith("#") ? flattenSections(this.document.sections).find(section => section.id === link.slice(1)) : undefined
    const origin = linked ?? this.contentSection
    const review = this.activeBlock?.reviewStatus === "aguardando_validacao" || this.reviewTitle
    this.command({ type: "text", x, y: top + this.fonts[font].heightAtSize(size, { descender: false }), text: plain(text), size, font, color: review ? REVIEW_TEXT_COLOR : color, ...(link ? { link } : {}), ...(origin ? { sectionId: origin.id, editHref: this.activeBlock?.editHref ?? origin.editHref } : {}), ...(review ? { reviewStatus: "aguardando_validacao" as const } : {}) })
  }
  rect(x: number, y: number, width: number, height: number, color: string, opacity?: number) { this.command({ type: "rect", x, y, width, height, color, ...(opacity === undefined ? {} : { opacity }) }) }
  line(x: number, y: number, x2: number, y2: number, color = this.identity.accent, width = 1) { this.command({ type: "line", x, y, x2, y2, color, width }) }
  image(src: string | null | undefined, x: number, y: number, width: number, height: number, opacity?: number, fit: "cover" | "contain" = "contain") {
    if (src && (/^data:image\/(png|jpeg);base64,/i.test(src) || /^\/(?:api\/brand\/file\?|api\/organization\/logo|[\w/-]+\.(?:png|jpe?g|webp))/i.test(src))) this.command({ type: "image", src, x, y, width, height, fit, ...(opacity === undefined ? {} : { opacity }) })
  }
  short(text: string, size: number, width: number, font: Font = "body") { return wrapManualText(text, this.fonts[font], size, width)[0] }
  newPage(cover = false) {
    this.page = { number: this.pages.length + 1, width: A4.width, height: A4.height, sectionId: this.section.id, sectionIds: [this.section.id], commands: [] }
    this.pages.push(this.page); this.y = TOP
    this.rect(0, 0, A4.width, A4.height, cover ? this.identity.primary : this.identity.surface)
    if (cover) return
    const contentSection = this.contentSection, activeBlock = this.activeBlock, reviewTitle = this.reviewTitle
    this.contentSection = undefined; this.activeBlock = undefined; this.reviewTitle = false
    const identity = this.identity
    if (identity.headerTemplate === "Brand") {
      this.rect(LEFT, 37, 3, 23, identity.primary)
      this.text(this.short(identity.displayName, 9, WIDTH * .55, "bold"), LEFT + 12, 41, 9, "bold", identity.primary)
      this.text(this.short(this.document.metadata.title, 8, WIDTH * .4), RIGHT - WIDTH * .4, 43, 8)
    } else if (identity.headerTemplate === "Technical") {
      this.text(this.short(this.document.metadata.developmentName, 9, WIDTH * .6, "bold"), LEFT, 38, 9, "bold")
      this.text(`REV. ${String(this.document.metadata.revision).padStart(2, "0")}`, RIGHT - 68, 38, 8, "bold")
      this.text(this.short(this.document.metadata.title, 7, WIDTH), LEFT, 54, 7)
    } else this.text(this.short(this.document.metadata.developmentName, 8, WIDTH), LEFT, 44, 8)
    this.line(LEFT, 69, RIGHT, 69, identity.accent, .7)
    this.contentSection = contentSection; this.activeBlock = activeBlock; this.reviewTitle = reviewTitle
  }
  ensure(height: number) { if (!this.page || this.y + height > BOTTOM) this.newPage() }
  register(section: ManualSection) {
    this.section = section
    if (!this.page) this.newPage(section.type === "cover")
    if (!this.page.sectionIds.includes(section.id)) this.page.sectionIds.push(section.id)
    if (!this.destinations[section.id]) this.destinations[section.id] = { page: this.page.number, y: this.y }
  }
  heading(text: string, level = 2, anchorId?: string) {
    const size = level === 1 ? 22 : level === 2 ? 15 : 11
    const height = size * 1.28
    const lines = wrapManualText(text, this.fonts.heading, size, WIDTH)
    const reserve = 60
    this.ensure(Math.min(lines.length * height + reserve, BOTTOM - TOP))
    if(anchorId) this.destinations[anchorId] = {page:this.page.number,y:this.y}
    let position = 0
    while(position < lines.length){
      let capacity = Math.floor((BOTTOM - this.y - reserve) / height)
      if(capacity<1){this.newPage();capacity=Math.max(1,Math.floor((BOTTOM-this.y-reserve)/height))}
      const take = Math.max(1,Math.min(capacity,lines.length-position))
      for (const line of lines.slice(position,position+take)) { this.text(line, LEFT, this.y, size, "heading", this.identity.primary); this.y += height }
      position+=take
      if(position<lines.length)this.newPage()
    }
    this.y += level === 1 ? 20 : 11
  }
  paragraph(text: string, size = 10, font: Font = "body", color = this.identity.text, x = LEFT, width = WIDTH) {
    const lines = wrapManualText(text, this.fonts[font], size, width)
    const lineHeight = size * 1.5
    let position = 0
    while (position < lines.length) {
      let capacity = Math.floor((BOTTOM - this.y) / lineHeight)
      const remaining = lines.length - position
      if (capacity < Math.min(remaining, 2) || (remaining > capacity && remaining - capacity === 1 && capacity <= 2)) { this.newPage(); capacity = Math.floor((BOTTOM - this.y) / lineHeight) }
      let take = Math.min(remaining, capacity)
      // Preserve two lines at each side of a paragraph split.
      if (remaining > take && remaining - take === 1 && take > 2) take -= 1
      if (take < 1) throw new Error("Margens editoriais inválidas")
      for (const line of lines.slice(position, position + take)) { this.text(line, x, this.y, size, font, color); this.y += lineHeight }
      position += take
      if (position < lines.length) this.newPage()
    }
    this.y += 9
  }
  cover() {
    const i = this.identity, m = this.document.metadata
    const firstPage = this.page.number
    const essence = i.template === "Essence"
    if (essence) this.rect(0, 0, A4.width, A4.height, i.surface)
    if (i.heroUrl) {
      const editorial = i.template === "Editorial"
      this.image(i.heroUrl, editorial ? A4.width * .47 : 0, 0, editorial ? A4.width * .53 : A4.width, A4.height, undefined, "cover")
      this.rect(0, 0, A4.width, A4.height, i.primary, i.overlay / 100)
    }
    const white = essence ? i.text : "#FFFFFF"
    if (i.template === "Frame") {
      for (const [x,y,x2,y2] of [[23,23,A4.width-23,23],[23,A4.height-23,A4.width-23,A4.height-23],[23,23,23,A4.height-23],[A4.width-23,23,A4.width-23,A4.height-23]]) this.line(x,y,x2,y2,i.secondary,2)
    } else if (i.template === "Axis") {
      this.rect(A4.width * .58, 0, A4.width * .42, A4.height, i.secondary, .2)
      this.line(A4.width * .58, 0, A4.width * .58, A4.height, i.secondary)
    } else if (i.template === "Monolith") {
      this.rect(0, A4.height * .45, A4.width, A4.height * .55, i.primary)
      this.rect(LEFT, 425, 8, 78, i.secondary)
    } else if (i.template === "Editorial") this.rect(0, 0, A4.width * .47, A4.height, i.primary)
    else if (i.template === "Signature") {
      this.rect(A4.width - 93, 0, 93, A4.height, i.secondary, .12)
      this.line(LEFT, 180, RIGHT, 180, i.secondary, 1.5)
    }
    if (i.graphicStyle === "architectural") for (let n = 0; n < 4; n++) this.line(RIGHT - 82 + n * 20, 665, RIGHT - 82 + n * 20, 747, i.secondary, .5)
    else if (i.graphicStyle === "blocks") { this.rect(RIGHT - 72, 666, 64, 64, i.secondary, .2); this.rect(RIGHT-106,632,34,34,i.secondary,.4) }
    else if (i.graphicStyle === "editorial") for(let n=0;n<3;n++) this.line(RIGHT-110,686+n*16,RIGHT,686+n*16,i.secondary,n===0?2:.5)
    else if (i.graphicStyle === "organic") for(let n=0;n<5;n++) this.line(RIGHT-116+n*8,680+n*13,RIGHT-16+n*4,654+n*17,i.secondary,.8)
    if(i.artDirection==="corporate") this.rect(LEFT,206,WIDTH,3,i.secondary)
    else if(i.artDirection==="editorial") this.line(LEFT,220,LEFT+WIDTH*.6,220,white,.5)
    else if(i.artDirection==="architectural") this.line(RIGHT-122,206,RIGHT-122,366,i.secondary,.5)
    else if(i.artDirection==="natural") this.rect(0,A4.height-13,A4.width,13,i.secondary)
    else if(i.artDirection==="essence") this.line(LEFT,220,LEFT+40,220,i.secondary,2)
    const logos = [
      ...(i.coBranding !== "organization" ? [{ url: i.developmentLogoUrl, label: i.displayName }] : []),
      ...(i.coBranding !== "development" ? [{ url: m.organizationLogo, label: m.organizationName }] : []),
    ]
    if (i.coBrandingOrder === "organization-first") logos.reverse()
    logos.forEach((logo, index) => {
      const vertical = i.coBrandingLayout === "vertical"
      const x = LEFT + (vertical ? 0 : index * (WIDTH * .52)), y = 52 + (vertical ? index * 58 : 0)
      if (logo.url) this.image(logo.url, x, y, 140, 45)
      else this.text(this.short(logo.label, 10, WIDTH * .45, "bold"), x, y + 12, 10, "bold", white)
    })
    const titleWidth = i.template === "Editorial" ? WIDTH * .5 : WIDTH * .9
    let titleSize = 34
    let titleLines = wrapManualText(i.displayName, this.fonts.heading, titleSize, titleWidth)
    while(titleSize>12 && titleLines.length*titleSize*1.32>250){titleSize-=1;titleLines=wrapManualText(i.displayName,this.fonts.heading,titleSize,titleWidth)}
    let y = 440
    this.text(this.short(m.title.toUpperCase(), 10, titleWidth), LEFT, y - 42, 10, "bold", white)
    const titleHeight = titleSize*1.32
    const exceedsCover = titleLines.length*titleHeight>250
    if(exceedsCover)this.warnings.push("O nome de apresentação excede o espaço da capa. Reduza o nome no Design do Manual antes de emitir.")
    for (const line of titleLines) {
      if(y+titleHeight>700){this.newPage(true);if(essence)this.rect(0,0,A4.width,A4.height,i.surface);y=TOP}
      this.text(line, LEFT, y, titleSize, "heading", white); y += titleHeight
    }
    this.line(LEFT, Math.min(y + 20, 690), LEFT + 100, Math.min(y + 20, 690), i.secondary, 2)
    if (i.tagline && !["Manual do Proprietário", "Manual do Síndico"].includes(i.tagline.trim()) && i.tagline !== m.title) this.text(this.short(i.tagline, 10, titleWidth), LEFT, Math.min(y + 43, 720), 10, "body", white)
    this.text(this.short(m.organizationName, 9, WIDTH * .65), LEFT, 766, 9, "bold", white)
    this.text(`Rev. ${String(m.revision).padStart(2, "0")} · ${m.date}`, LEFT, 787, 9, "body", white)
    this.destinations[this.section.id] = { page: firstPage, y: 0 }
  }
  chapter(section: ManualSection) {
    if (this.y > TOP || this.document.sections.some(item => item.id === this.page.sectionId && (item.type === "cover" || item.type === "toc"))) this.newPage()
    const i = this.identity
    this.destinations[section.id] = { page: this.page.number, y: TOP }
    if (i.chapterTemplate === "Hero Split") {
      this.rect(0, 90, A4.width * .42, 246, i.primary)
      this.text(section.number?.split(".")[0]?.padStart(2,"0") ?? "", LEFT, 130, 60, "heading", "#FFFFFF")
      this.y = 360
    } else if (i.chapterTemplate === "Number Focus") {
      this.text(section.number?.split(".")[0]?.padStart(2,"0") ?? "", LEFT, 110, 64, "heading", i.secondary)
      this.y = 218
    } else if (i.chapterTemplate === "Editorial") {
      this.rect(LEFT, 108, 8, 98, i.secondary)
      this.text(section.number ?? "", LEFT + 24, 118, 18, "bold", i.secondary)
      this.y = 166
    } else {
      this.text(section.number ?? "", LEFT, 102, 12, "bold", i.secondary)
      this.y = 136
    }
    this.heading(section.title, 1)
    this.line(LEFT, this.y, RIGHT, this.y, i.accent, 1.2)
    this.y += 25
  }
  toc() {
    this.heading("Sumário", 1)
    const entries = flattenSections(this.document.sections).filter(section => section.type !== "cover" && section.type !== "toc")
    for (const section of entries) {
      const depth = section.number?.split(".").length ?? 1
      const x = LEFT + (depth - 1) * 13
      const label = `${section.number ? `${section.number} ` : ""}${section.title}`
      const lines = wrapManualText(label, depth === 1 ? this.fonts.bold : this.fonts.body, 9, RIGHT - x - 40)
      const page = String(this.tocDestinations[section.id]?.page ?? "")
      let position = 0
      while(position<lines.length){
        this.ensure(Math.min(lines.length-position,2)*14+7)
        const capacity=Math.max(1,Math.floor((BOTTOM-this.y-7)/14))
        const take=Math.min(capacity,lines.length-position)
        lines.slice(position,position+take).forEach((line,index) => this.text(line, x, this.y + index * 14, 9, depth === 1 ? "bold" : "body", depth === 1 ? this.identity.primary : this.identity.text, `#${section.id}`))
        this.text(page, RIGHT - this.fonts.body.widthOfTextAtSize(page, 9), this.y, 9, "body", this.identity.text, `#${section.id}`)
        this.y += take*14+7;position+=take
        if(position<lines.length)this.newPage()
      }
    }
  }
  table(block: Extract<ManualBlock, { type: "table" | "maintenanceTable" | "warrantyTable" }>) {
    if (!block.headers.length || !block.rows.length) return
    if (block.title) this.heading(block.title, 3)
    const size = block.headers.length > 6 ? 7 : block.headers.length > 4 ? 8 : 9
    const lineHeight = size * 1.45, padding = 7
    const inputWeights = block.widths?.length === block.headers.length ? block.widths : block.headers.map(() => 1)
    const weights = inputWeights.map(weight=>Number.isFinite(weight)?Math.max(.05,weight):1)
    const sum = weights.reduce((a,b) => a+b,0)
    const widths = weights.map(weight => WIDTH * weight / sum)
    let headerLines = block.headers.map((text,index) => wrapManualText(text, this.fonts.bold, size, Math.max(size,widths[index] - padding * 2)))
    const maxHeaderLines = Math.max(2,Math.floor((180-padding*2)/lineHeight))
    if(headerLines.some(lines=>lines.length>maxHeaderLines)){
      this.warnings.push(`Os cabeçalhos da tabela “${block.title || this.section.title}” excedem o espaço editorial. Reduza os títulos das colunas antes de emitir.`)
      // Preserve the complete column labels in the preview; only their repeated
      // table headings are shortened. The warning blocks official issuance.
      block.headers.forEach((header,index)=>{if(headerLines[index].length>maxHeaderLines)this.paragraph(header,8,"bold")})
      headerLines=headerLines.map(lines=>lines.length>maxHeaderLines?[...lines.slice(0,maxHeaderLines-1),"…"]:lines)
    }
    const headerHeight = Math.max(...headerLines.map(lines => lines.length)) * lineHeight + padding * 2
    const fullRowHeight = (row: string[][]) => Math.max(...row.map(lines => lines.length),1) * lineHeight + padding * 2
    const paint = (row: string[][], height: number, header: boolean, alternate = false) => {
      const clean = this.identity.tableTemplate === "Clean"
      this.rect(LEFT, this.y, WIDTH, height, header ? this.identity.primary : alternate ? this.identity.accent : "#FFFFFF", header ? undefined : alternate ? .28 : .55)
      let x = LEFT
      row.forEach((lines,index) => {
        lines.forEach((text,position) => this.text(text, x + padding, this.y + padding + position * lineHeight, size, header ? "bold" : "body", header ? "#FFFFFF" : this.identity.text))
        if (!clean) this.line(x, this.y, x, this.y + height, header ? this.identity.secondary : this.identity.accent, .4)
        x += widths[index]
      })
      this.line(LEFT, this.y + height, RIGHT, this.y + height, this.identity.accent, .45)
      this.y += height
    }
    let needsHeader = true
    const contentPageHeight = BOTTOM - TOP - headerHeight
    block.rows.forEach((row,index) => {
      const cellLines = block.headers.map((_,column) => wrapManualText(row[column] ?? "", this.fonts.body, size, widths[column] - padding * 2))
      const rowHeight = fullRowHeight(cellLines)
      if (this.y + (needsHeader ? headerHeight : 0) + Math.min(rowHeight, contentPageHeight) > BOTTOM) { this.newPage(); needsHeader = true }
      if (needsHeader) { this.ensure(headerHeight + Math.min(rowHeight, contentPageHeight)); paint(headerLines, headerHeight, true); needsHeader = false }
      if (rowHeight <= contentPageHeight) {
        if (this.y + rowHeight > BOTTOM) { this.newPage(); paint(headerLines, headerHeight, true) }
        paint(cellLines, rowHeight, false, index % 2 === 1)
      } else {
        // A single cell may exceed an entire page: split at measured text lines.
        // Continue the same row on the next page with its column headings repeated.
        let position = 0
        const total = Math.max(...cellLines.map(lines => lines.length))
        while (position < total) {
          let capacity = Math.floor((BOTTOM - this.y - padding * 2) / lineHeight)
          if (capacity < 2) { this.newPage(); paint(headerLines, headerHeight, true); capacity = Math.floor((BOTTOM - this.y - padding * 2) / lineHeight) }
          const take = Math.max(1,Math.min(capacity, total - position))
          paint(cellLines.map(lines => lines.slice(position, position + take)), take * lineHeight + padding * 2, false, index % 2 === 1)
          position += take
          if (position < total) { this.newPage(); paint(headerLines, headerHeight, true) }
        }
      }
    })
    this.y += 15
  }
  callout(block: Extract<ManualBlock, {type:"callout"}>) {
    const style = this.identity.calloutStyles[block.kind]
    const lines = wrapManualText(block.text, this.fonts.body, 9, WIDTH - 30)
    let position = 0
    while (position < lines.length) {
      this.ensure(75)
      const take = Math.min(lines.length - position, Math.max(1, Math.floor((BOTTOM - this.y - 46) / 14)))
      const height = 38 + take * 14
      this.rect(LEFT, this.y, WIDTH, height, style === "neutral" ? "#E5E7EB" : this.identity.accent, .5)
      if (style === "border" || style === "soft") this.rect(LEFT, this.y, style === "border" ? 4 : 2, height, this.identity.secondary)
      if (style === "badge") this.rect(LEFT + 12, this.y + 10, Math.min(WIDTH - 30,this.fonts.bold.widthOfTextAtSize(block.title,9)+16), 17, this.identity.primary)
      this.text(this.short(block.title, 9, WIDTH - 35, "bold"), LEFT + (style === "badge" ? 20 : 15), this.y + 12, 9, "bold", style === "badge" ? "#FFFFFF" : this.identity.primary)
      lines.slice(position,position+take).forEach((line,index) => this.text(line, LEFT + 15, this.y + 33 + index * 14, 9))
      this.y += height + 12; position += take
      if (position < lines.length) this.newPage()
    }
  }
  block(block: ManualBlock) {
    this.activeBlock = block
    switch (block.type) {
      case "heading": this.heading(block.text, block.level ?? 3); break
      case "paragraph": this.paragraph(block.text); break
      case "callout": this.callout(block); break
      case "table": case "maintenanceTable": case "warrantyTable": this.table(block); break
      case "pageBreak": this.newPage(); break
      case "image": {
        const height = Math.min(block.height ?? 220, BOTTOM - TOP - 35)
        this.ensure(height + 35); this.image(block.src, LEFT, this.y, WIDTH, height); this.y += height + 8
        if (block.caption) this.paragraph(block.caption, 8)
        break
      }
    }
    this.activeBlock = undefined
  }
  visit(section: ManualSection) {
    this.section = section
    this.contentSection = section
    this.reviewTitle = this.document.metadata.purpose === "preview" && section.validationStatus === "aguardando_validacao"
    if (section.type === "cover") { this.newPage(true); this.register(section); this.cover() }
    else if (section.type === "toc") { this.newPage(); this.register(section); this.toc() }
    else if (section.type === "chapter") { if (!this.page) this.newPage(); this.chapter(section); this.register(section) }
    else {
      if (this.document.sections.some(item => item.id === this.page?.sectionId && (item.type === "cover" || item.type === "toc"))) this.newPage()
      this.ensure(75); this.register(section)
      this.heading(`${section.number ? `${section.number} ` : ""}${section.title}`, section.type === "system" ? 2 : 3, section.id)
    }
    this.reviewTitle = false
    section.blocks.forEach(block => this.block(block))
    section.children.forEach(child => this.visit(child))
  }
  finish() {
    this.contentSection = undefined; this.activeBlock = undefined; this.reviewTitle = false
    for (const page of this.pages) {
      if (page.commands.some(command => command.type === "text") && !this.document.sections.some(item => item.id === page.sectionId && item.type === "cover")) {
        this.page = page
        const footer = this.identity.footerTemplate, m = this.document.metadata
        this.line(LEFT, A4.height - 46, RIGHT, A4.height - 46, this.identity.accent, .7)
        if (footer === "Branded") { this.rect(LEFT, A4.height - 33, 3, 12, this.identity.secondary); this.text(this.short(m.organizationName,7,WIDTH*.58),LEFT+10,A4.height-31,7,"bold",this.identity.primary) }
        else if (footer === "Document Control") this.text(this.short(`${m.organizationName} · Rev. ${String(m.revision).padStart(2,"0")}`,7,WIDTH*.7),LEFT,A4.height-31,7)
        else this.text(this.short(m.developmentName,7,WIDTH*.7),LEFT,A4.height-31,7)
        this.text(`${page.number} / ${this.pages.length}`,RIGHT-52,A4.height-31,7)
      }
    }
    return { pages: this.pages, destinations: this.destinations, fonts: manualFontUrls(this.identity.typography), warnings: this.warnings }
  }
}

/** Both renderers consume this immutable, paginated display list. */
export async function paginateManualDocument(document: ManualDocument): Promise<PaginatedManual> {
  const fonts = await manualFontMetrics(document.identity.typography)
  let destinations: PaginatedManual["destinations"] = {}
  let result!: PaginatedManual
  for (let pass = 0; pass < 5; pass++) {
    const paginator = new Paginator(document, fonts, destinations)
    document.sections.forEach(section => paginator.visit(section))
    result = paginator.finish()
    const stable = JSON.stringify(Object.entries(destinations).map(([id,value])=>[id,value.page])) === JSON.stringify(Object.entries(result.destinations).map(([id,value])=>[id,value.page]))
    destinations = result.destinations
    if (stable) return result
  }
  result.warnings.push("O sumário excedeu o limite de recálculo editorial.")
  return result
}
