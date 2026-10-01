import { saveManualFile } from "@/lib/manual-files"
import { assessManualReadiness } from "@/lib/completion"
import { selectManualSystems, htmlToLines } from "@/lib/manual-content"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { NextResponse } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { developments, databookFiles, finishingTables, manualVersions } from "@/lib/db/schema"
import { recordAudit, requireDevelopmentRole } from "@/lib/organization"
import { consumeRateLimit,RateLimitError } from "@/lib/security/rate-limit"
import { assertId,cleanText,InputValidationError } from "@/lib/security/input"

export async function POST(request: Request) {
  try{
  const body = await request.json().catch(() => ({})) as { developmentId?: string; manualType?: string; comment?: string }
  if (!body.developmentId) return NextResponse.json({ error: "Empreendimento não informado" }, { status: 400 })
  const developmentId=assertId(body.developmentId,"Empreendimento")
  if(body.manualType&&body.manualType!=="sindico"&&body.manualType!=="proprietario")return NextResponse.json({error:"Tipo de manual inválido"},{status:400})
  const manualType = body.manualType === "sindico" ? "sindico" : "proprietario"
  const comment=body.comment?.trim()?cleanText(body.comment,"Comentário",1000):null
  const context = await requireDevelopmentRole(developmentId,["admin","admin_empreendimento","editor"])
  await consumeRateLimit("manual-compile:"+context.user.id,{max:20,windowSeconds:3600})
  const row = await db.select({ id: developments.id, name: developments.name, organizationId: developments.organizationId, data: developments.data }).from(developments).where(and(eq(developments.id, developmentId), eq(developments.organizationId, context.organization.id))).limit(1)
  if (!row[0]) return NextResponse.json({ error: "Empreendimento não encontrado" }, { status: 404 })
  const existing = await db.select({ revision: manualVersions.revision }).from(manualVersions).where(and(eq(manualVersions.developmentId, developmentId), eq(manualVersions.organizationId, context.organization.id), eq(manualVersions.manualType, manualType))).orderBy(desc(manualVersions.revision)).limit(1)
  const finishing = manualType === "proprietario" ? (await db.select().from(finishingTables).where(and(eq(finishingTables.developmentId, developmentId), eq(finishingTables.organizationId, context.organization.id))).orderBy(desc(finishingTables.updatedAt)).limit(1))[0] : undefined
  const revision = (existing[0]?.revision ?? 0) + 1
  const data = (row[0].data ?? {}) as Record<string, unknown>
  const systems = selectManualSystems(data, manualType)
  const readiness = assessManualReadiness(data, manualType, finishing ? 1 : 0)
  if (!readiness.ok) return NextResponse.json({ error: "Não é possível emitir: " + readiness.blocking.join("; "), blocking: readiness.blocking, stages: readiness.stages }, { status: 400 })
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page = pdf.addPage([595, 842])
  let y = 790
  const clean = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/—|–/g, "-").replace(/[^\x20-\x7E]/g, "")
  const draw = (text: string, size = 10, heading = false) => {
    const selectedFont = heading ? bold : font
    const words = clean(text).split(/\s+/)
    const wrapped: string[] = []
    let line = ""
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (selectedFont.widthOfTextAtSize(candidate, size) > 510 && line) { wrapped.push(line); line = word }
      else line = candidate
    }
    if (line) wrapped.push(line)
    for (const value of wrapped) {
      if (y < 54) { page = pdf.addPage([595, 842]); y = 790 }
      page.drawText(value, { x: 42, y, size, font: selectedFont, color: heading ? rgb(0.12, 0.29, 0.56) : rgb(0.2, 0.22, 0.26) })
      y -= size + 8
    }
  }
  page.drawRectangle({ x: 0, y: 760, width: 595, height: 82, color: rgb(0.12, 0.29, 0.56) })
  page.drawText(clean(manualType === "sindico" ? "MANUAL DO SINDICO" : "MANUAL DO PROPRIETARIO"), { x: 42, y: 800, size: 20, font: bold, color: rgb(1, 1, 1) })
  page.drawText(clean(`${row[0].name} - Revisao ${String(revision).padStart(2, "0")}`), { x: 42, y: 778, size: 10, font, color: rgb(0.9, 0.94, 1) })
  y = 725
  const ficha = data.ficha as Record<string, unknown> | undefined
  draw("FICHA TECNICA DO EMPREENDIMENTO", 14, true)
  if (ficha) for (const [key, value] of Object.entries(ficha)) {
    if (typeof value === "string" || typeof value === "number") draw(`${key}: ${value}`)
  }
  draw(manualType === "sindico" ? "SISTEMAS DAS AREAS COMUNS" : "SISTEMAS DAS UNIDADES PRIVATIVAS", 14, true)
  for (const system of systems) {
    draw(`${system.item.category} - ${system.item.item}`, 12, true)
    for (const line of htmlToLines(system.html)) draw(line)
    if (system.maintenance.length) {
      draw("MANUTENCAO PREVENTIVA", 11, true)
      for (const task of system.maintenance) draw(`${task.task} | ${task.frequency} | ${task.responsible}`, 9)
    }
    if (system.item.norms.length) draw(`Normas: ${system.item.norms.join(", ")}`, 9)
  }
  const contacts = ((data.authoring as { contacts?: Array<{kind:string;name:string;company:string;discipline:string;registration:string;phone:string;email:string}> } | undefined)?.contacts ?? [])
  if (contacts.length) {
    draw("PROJETISTAS E FORNECEDORES",14,true)
    for (const contact of contacts) {
      draw((contact.kind==="projetista"?"Projetista: ":"Fornecedor: ")+contact.name+" - "+contact.company,11,true)
      draw((contact.kind==="projetista"?"Disciplina: ":"Ramo: ")+contact.discipline+" | Registro: "+(contact.registration||"Não informado"),9)
      draw("Telefone: "+(contact.phone||"Não informado")+" | E-mail: "+(contact.email||"Não informado"),9)
    }
  }
  const sectionCount = systems.length + 1 + (finishing ? 1 : 0) + (contacts.length ? 1 : 0)
  const finishingRows = finishing ? Object.values((finishing.data as Record<string, Array<Record<string, string>>>) ?? {}).flat() : []
  if (finishing) {
    draw("TABELA DE ACABAMENTOS", 14, true)
    draw(`${finishing.tower || "Bloco não informado"} - ${finishing.typology} - ${finishing.unitModel} - ${finishing.area}`, 10, true)
    for (const row of finishingRows) draw(Object.entries(row).filter(([key]) => key !== "id").map(([key, value]) => `${key}: ${value}`).join(" | "), 8)
  }
  const bytes = await pdf.save()
  const date = new Date().toISOString().slice(0, 10)
  const slug = row[0].name.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "empreendimento"
  const label = manualType === "sindico" ? "Manual-Sindico" : "Manual-Proprietario"
  const filename = `${slug}_${label}_Rev-${String(revision).padStart(2, "0")}_${date}.pdf`
  const blob = await saveManualFile(`manuals/${row[0].organizationId}/${developmentId}/${filename}`, Buffer.from(bytes))
  const id = crypto.randomUUID()
  await db.insert(manualVersions).values({ id, developmentId: developmentId, organizationId: context.organization.id, manualType, revision, status: "rascunho", comment, filename, pathname: blob.pathname, sections: sectionCount, pages: pdf.getPageCount(), attachments: (await db.select({ id: databookFiles.id }).from(databookFiles).where(eq(databookFiles.developmentId, developmentId))).length, finishingTableId: finishing?.id ?? null, finishingRevision: finishing?.revision ?? null, finishingRows: finishingRows.length, createdBy: context.user.id })
  await db.update(developments).set({ version: revision, lastEditorId: context.user.id, updatedAt: new Date() }).where(and(eq(developments.id, developmentId),eq(developments.organizationId,context.organization.id)))
  await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "manual.issued", entityType: "development", entityId: developmentId, metadata: { path: ["emissao", manualType], before: null, after: { filename, revision, pages: pdf.getPageCount() } } })
  return NextResponse.json({ id, filename, revision, sections: sectionCount, pages: pdf.getPageCount() }, { status: 201 })
  }catch(error){
    if(error instanceof RateLimitError)return NextResponse.json({error:error.message},{status:429,headers:{"Retry-After":String(error.retryAfterSeconds)}})
    if(error instanceof InputValidationError)return NextResponse.json({error:error.message},{status:400})
    console.error("Manual compile failed",error)
    return NextResponse.json({error:"Não foi possível emitir o manual"},{status:500})
  }
}
