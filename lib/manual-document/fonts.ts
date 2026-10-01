import { readFile } from "node:fs/promises"
import path from "node:path"
import fontkit from "@pdf-lib/fontkit"
import { PDFDocument, type PDFFont, type PDFHexString } from "pdf-lib"
import { manualFontUrls } from "@/lib/manual-identity"

const bytesCache = new Map<string, Promise<Buffer>>()
const metricsCache = new Map<string, Promise<Record<"body" | "bold" | "heading", PDFFont>>>()

function cacheFontOperations(font: PDFFont) {
  const widths = new Map<string, number>(), encoded = new Map<string, PDFHexString>()
  const measure = font.widthOfTextAtSize.bind(font), encode = font.encodeText.bind(font)
  font.widthOfTextAtSize = (text,size) => {
    let value = widths.get(text)
    if (value === undefined) { value = measure(text,1); if(widths.size>12000) widths.clear(); widths.set(text,value) }
    return value * size
  }
  font.encodeText = text => {
    let value = encoded.get(text)
    if (!value) { value = encode(text); if(encoded.size>12000) encoded.clear(); encoded.set(text,value) }
    return value
  }
  return font
}

export function readManualFont(url: string) {
  if (!/^\/fonts\/[a-z\d-]+\.ttf$/.test(url)) throw new Error("Fonte editorial inválida")
  let value = bytesCache.get(url)
  if (!value) {
    value = readFile(path.join(process.cwd(), "public", url))
    bytesCache.set(url, value)
    value.catch(() => bytesCache.delete(url))
  }
  return value
}

export async function embedManualFonts(pdf: PDFDocument, typography: string) {
  pdf.registerFontkit(fontkit)
  const urls = manualFontUrls(typography)
  const [body, bold, heading] = await Promise.all((Object.keys(urls) as Array<keyof typeof urls>).map(async key => cacheFontOperations(await pdf.embedFont(await readManualFont(urls[key]), { subset: false, features: { liga: false, clig: false, kern: false } }))))
  return { body, bold, heading }
}

export function manualFontMetrics(typography: string) {
  let value = metricsCache.get(typography)
  if (!value) {
    value = PDFDocument.create().then(pdf => embedManualFonts(pdf, typography))
    metricsCache.set(typography, value)
    value.catch(() => metricsCache.delete(typography))
  }
  return value
}
