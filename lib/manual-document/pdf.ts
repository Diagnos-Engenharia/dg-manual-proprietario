import { clip, endPath, PDFArray, PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFPage, type PDFRef, popGraphicsState, pushGraphicsState, rectangle, rgb } from "pdf-lib"
import { embedManualFonts } from "./fonts"
import { paginateManualDocument } from "./paginate"
import type { ManualDocument, ManualSection, PaginatedManual } from "./types"

function color(value: string) {
  const hex = /^#[\da-f]{6}$/i.test(value) ? value.slice(1) : "17202A"
  return rgb(parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255)
}

function destination(pdf: PDFDocument, pages: PDFPage[], layout: PaginatedManual, id: string): PDFArray | undefined {
  const entry = layout.destinations[id]
  const page = entry ? pages[entry.page - 1] : undefined
  return page ? pdf.context.obj([page.ref, PDFName.of("XYZ"), 0, page.getHeight() - entry.y, null]) : undefined
}

function addBookmarks(pdf: PDFDocument, pages: PDFPage[], document: ManualDocument, layout: PaginatedManual) {
  const root = pdf.context.obj({ Type: "Outlines" })
  const rootRef = pdf.context.register(root)
  const addChildren = (sections: ManualSection[], parent: PDFRef): PDFRef[] => {
    const items = sections.filter(section => layout.destinations[section.id]).map(section => {
      const item = pdf.context.obj({ Title: PDFHexString.fromText(`${section.number ? `${section.number} ` : ""}${section.title}`), Parent: parent, Dest: destination(pdf,pages,layout,section.id)! })
      return { section, item, ref: pdf.context.register(item) }
    })
    items.forEach(({section,item,ref},index) => {
      if (index) item.set(PDFName.of("Prev"),items[index-1].ref)
      if (index < items.length - 1) item.set(PDFName.of("Next"),items[index+1].ref)
      const children = addChildren(section.children,ref)
      if (children.length) { item.set(PDFName.of("First"),children[0]); item.set(PDFName.of("Last"),children[children.length-1]); item.set(PDFName.of("Count"),PDFNumber.of(-children.length)) }
    })
    return items.map(item => item.ref)
  }
  const children = addChildren(document.sections,rootRef)
  if (children.length) {
    root.set(PDFName.of("First"),children[0]); root.set(PDFName.of("Last"),children[children.length-1]); root.set(PDFName.of("Count"),PDFNumber.of(children.length))
    pdf.catalog.set(PDFName.of("Outlines"),rootRef)
  }
}

/** Exports precisely the same page commands shown by the SVG preview. No HTML or strings are rebuilt here. */
export async function renderManualPdf(document: ManualDocument, suppliedLayout?: PaginatedManual): Promise<Uint8Array> {
  const layout = suppliedLayout ?? await paginateManualDocument(document)
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${document.metadata.title} · ${document.metadata.developmentName}`)
  pdf.setAuthor(document.metadata.organizationName)
  pdf.setSubject(`Rev. ${String(document.metadata.revision).padStart(2,"0")}`)
  pdf.setCreator("DG Manual · Compositor editorial")
  pdf.setProducer("DG Manual")
  pdf.catalog.set(PDFName.of("Lang"),PDFHexString.fromText("pt-BR"))
  const fonts = await embedManualFonts(pdf,document.identity.typography)
  const pages = layout.pages.map(page => pdf.addPage([page.width,page.height]))
  const images = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>()
  for (const [index,source] of layout.pages.entries()) {
    const page = pages[index], height = source.height
    for (const command of source.commands) {
      if (command.type === "rect") page.drawRectangle({ x: command.x, y: height-command.y-command.height, width: command.width, height: command.height, color: color(command.color), opacity: command.opacity ?? 1, borderWidth: 0 })
      else if (command.type === "line") page.drawLine({ start: {x:command.x,y:height-command.y}, end:{x:command.x2,y:height-command.y2}, color:color(command.color), thickness:command.width??1 })
      else if (command.type === "text") {
        const font = fonts[command.font]
        page.drawText(command.text,{x:command.x,y:height-command.y,size:command.size,font,color:color(command.color)})
        if (command.link?.startsWith("#")) {
          const target = destination(pdf,pages,layout,command.link.slice(1))
          if (target) {
            const annotation = pdf.context.obj({ Type:"Annot", Subtype:"Link", Rect:[command.x,height-command.y-2,command.x+font.widthOfTextAtSize(command.text,command.size),height-command.y+command.size], Border:[0,0,0], Dest:target })
            page.node.addAnnot(pdf.context.register(annotation))
          }
        }
      } else if (command.type === "image") {
        // Assets are hydrated after authorization by the document service. Never fetch arbitrary URLs here.
        if (!/^data:image\/(png|jpeg);base64,/i.test(command.src)) throw new Error("Uma imagem do Design do Manual não pôde ser carregada. Atualize o preview antes de emitir.")
        let image = images.get(command.src)
        if (!image) {
          const bytes = Buffer.from(command.src.slice(command.src.indexOf(",")+1),"base64")
          image = command.src.startsWith("data:image/png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
          images.set(command.src,image)
        }
        const cover = command.fit === "cover"
        const scale = cover ? Math.max(command.width/image.width,command.height/image.height) : Math.min(command.width/image.width,command.height/image.height)
        const width = image.width*scale, imageHeight = image.height*scale
        page.pushOperators(pushGraphicsState(),rectangle(command.x,height-command.y-command.height,command.width,command.height),clip(),endPath())
        page.drawImage(image,{x:command.x+(command.width-width)/2,y:height-command.y-command.height+(command.height-imageHeight)/2,width,height:imageHeight,opacity:command.opacity??1})
        page.pushOperators(popGraphicsState())
      }
    }
  }
  addBookmarks(pdf,pages,document,layout)
  return pdf.save()
}
