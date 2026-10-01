import assert from "node:assert/strict"
import test from "node:test"
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib"
import { resolveManualIdentity } from "../lib/manual-identity"
import { manualFontMetrics } from "../lib/manual-document/fonts"
import { A4, paginateManualDocument } from "../lib/manual-document/paginate"
import { renderManualPdf } from "../lib/manual-document/pdf"
import type { ManualDocument, ManualSection } from "../lib/manual-document/types"

const portuguese = "á à ã â é ê í ó ô õ ú ç º ª – — “aspas” ‘técnicas’"
const content = (id: string, blocks: ManualSection["blocks"]): ManualSection => ({id,type:"content",title:`Seção ${id}`,number:`4.${id}`,validationStatus:"aprovado",renderPolicy:"approved",blocks,children:[]})
function document(sections: ManualSection[] = []): ManualDocument {
  return {schemaVersion:1,metadata:{developmentId:"test",developmentName:"Residencial São João",organizationName:"Construção Técnica",manualType:"proprietario",title:"Manual do Proprietário",revision:3,date:"01/10/2026",generatedAt:"2026-10-01T12:00:00Z"},identity:resolveManualIdentity({},"Residencial São João"),attachments:[],sections:[
    {id:"capa",type:"cover",title:"Capa",validationStatus:"aprovado",renderPolicy:"metadata",blocks:[],children:[]},
    {id:"sumario",type:"toc",title:"Sumário",validationStatus:"aprovado",renderPolicy:"metadata",blocks:[],children:[]},
    {id:"sistemas",type:"chapter",title:"Sistemas construtivos, uso e manutenção",number:"4",validationStatus:"aprovado",renderPolicy:"metadata",blocks:[],children:sections},
  ]}
}

test("Portuguese Unicode fonts, exact A4 pages, automatic TOC and PDF destinations",async()=>{
  const doc=document([content("1",[{type:"paragraph",text:portuguese}])])
  const layout=await paginateManualDocument(doc)
  assert.ok(layout.pages.length>=3)
  assert.equal(layout.pages[0].width,A4.width)
  assert.equal(layout.pages[0].height,A4.height)
  assert.ok(layout.pages.some(page=>page.commands.some(command=>command.type==="text"&&command.text===portuguese)))
  const tocPage=layout.pages.find(page=>page.sectionIds.includes("sumario"))!
  assert.ok(tocPage.commands.some(command=>command.type==="text"&&command.link==="#1"&&command.text===String(layout.destinations["1"].page)))
  const bytes=await renderManualPdf(doc,layout)
  const pdf=await PDFDocument.load(bytes)
  assert.equal(pdf.getPageCount(),layout.pages.length)
  assert.equal(pdf.getPage(0).getWidth(),A4.width)
  assert.equal(pdf.getPage(0).getHeight(),A4.height)
  assert.ok(pdf.catalog.get(PDFName.of("Outlines")))
  assert.ok(pdf.getPage(1).node.Annots()?.size())
  const cmaps=pdf.context.enumerateIndirectObjects().filter(([,object])=>object instanceof PDFRawStream).map(([,object])=>{
    try{return Buffer.from(decodePDFRawStream(object as PDFRawStream).decode()).toString("utf8")}catch{return""}
  }).join("\n")
  for(const code of ["00E1","00E7","00BA","2013","2014","201C","201D"]) assert.ok(cmaps.toUpperCase().includes(code),`Unicode CMap preserves ${code}`)
})

test("all configured typography choices encode Portuguese and keep distinct title fonts",async()=>{
  for(const typography of ["manrope-inter","dm-sans-lora","inter-source","merriweather"]){
    const fonts=await manualFontMetrics(typography)
    for(const font of Object.values(fonts)) assert.doesNotThrow(()=>font.encodeText(portuguese))
    const doc=document([content("1",[{type:"paragraph",text:portuguese}])]);doc.identity.typography=typography
    const layout=await paginateManualDocument(doc)
    assert.notEqual(layout.fonts.heading,layout.fonts.body)
    const pdf=await PDFDocument.load(await renderManualPdf(doc,layout))
    assert.equal(pdf.getPageCount(),layout.pages.length)
  }
})

test("the Síndico cover uses its own manual title even when Studio retains the default tagline",async()=>{
  const doc=document([content("1",[])])
  doc.metadata.manualType="sindico";doc.metadata.title="Manual do Síndico"
  const layout=await paginateManualDocument(doc)
  const cover=layout.pages.filter(page=>page.sectionId==="capa").flatMap(page=>page.commands).filter(command=>command.type==="text").map(command=>command.type==="text"?command.text:"").join(" ")
  assert.ok(cover.includes("MANUAL DO SÍNDICO"))
  assert.ok(!cover.includes("Manual do Proprietário"))
})

test("maintenance headers repeat and oversized rows preserve every measured text line",async()=>{
  const text=Array.from({length:900},(_,i)=>`atividade${i}`).join(" ")
  const doc=document([content("1",[{type:"maintenanceTable",headers:["Periodicidade","Atividade","Responsável"],widths:[1,3,1],rows:[["Anual",text,"Proprietário"],...Array.from({length:80},(_,i)=>["Semestral",`Verificação ${i} de impermeabilização e conservação`,"Proprietário"]) ]}])])
  const layout=await paginateManualDocument(doc)
  const tablePages=layout.pages.filter(page=>page.commands.some(command=>command.type==="text"&&command.text==="Periodicidade"))
  assert.ok(tablePages.length>4)
  for(const page of tablePages) assert.ok(page.commands.some(command=>command.type==="text"&&command.text==="Responsável"))
  const output=layout.pages.flatMap(page=>page.commands).filter(command=>command.type==="text").map(command=>command.type==="text"?command.text:"").join(" ")
  for(let i=0;i<900;i++) assert.ok(output.includes(`atividade${i}`))
  for(const page of layout.pages) for(const command of page.commands) if(command.type==="text"){
    assert.ok(command.y>=0&&command.y<page.height)
    assert.ok(command.x>=0&&command.x<page.width)
  }
  assert.equal((await PDFDocument.load(await renderManualPdf(doc,layout))).getPageCount(),layout.pages.length)
})

test("a 150–250 page manual maintains pagination, headers, navigation and final PDF page count",async()=>{
  const sections=Array.from({length:90},(_,index)=>content(String(index+1),[
    {type:"paragraph",text:Array.from({length:18},()=>"A conservação das instalações exige verificação periódica, registro das atividades e profissionais habilitados.").join(" ")},
    {type:"maintenanceTable",headers:["Periodicidade","Atividade","Responsável"],widths:[1,3,1],rows:Array.from({length:20},(_,row)=>["A cada seis meses",`Verificar conexões, vedação, funcionamento e acabamento do elemento ${row+1}.`,"Equipe especializada"])},
  ]))
  const doc=document(sections)
  const layout=await paginateManualDocument(doc)
  assert.ok(layout.pages.length>=150&&layout.pages.length<=250,`stress document produced ${layout.pages.length} pages`)
  for(const section of sections) assert.ok(layout.destinations[section.id].page>1)
  for(const page of layout.pages.slice(1)) assert.ok(page.commands.some(command=>command.type==="text"&&command.text===`${page.number} / ${layout.pages.length}`))
  const bytes=await renderManualPdf(doc,layout)
  const pdf=await PDFDocument.load(bytes)
  assert.equal(pdf.getPageCount(),layout.pages.length)
})

test("very long cover names, section titles and column labels stay inside A4 and retain their words",async()=>{
  const title=Array.from({length:500},(_,index)=>`título${index}`).join(" ")
  const header=Array.from({length:500},(_,index)=>`coluna${index}`).join(" ")
  const section=content("1",[{type:"paragraph",text:"Primeiro parágrafo após o título."},{type:"table",headers:[header,"Responsável"],widths:[1,1],rows:[["Atividade aprovada","Proprietário"]]}])
  section.title=title
  const doc=document([section])
  doc.identity.displayName=Array.from({length:160},(_,index)=>`empreendimento${index}`).join(" ")
  const layout=await paginateManualDocument(doc)
  assert.ok(layout.warnings.some(warning=>warning.includes("cabeçalhos")))
  assert.ok(layout.warnings.some(warning=>warning.includes("nome de apresentação")))
  const source=layout.pages.flatMap(page=>page.commands).filter(command=>command.type==="text").map(command=>command.type==="text"?command.text:"").join(" ")
  for(let index=0;index<500;index++){
    assert.ok(source.includes(`título${index}`))
    assert.ok(source.includes(`coluna${index}`))
  }
  for(let index=0;index<160;index++)assert.ok(source.includes(`empreendimento${index}`))
  const fonts=await manualFontMetrics(doc.identity.typography)
  for(const page of layout.pages)for(const command of page.commands)if(command.type==="text"){
    assert.ok(command.y>=0&&command.y<page.height-10,`${command.text.slice(0,30)} exceeds A4 vertically`)
    assert.ok(command.x>=0&&command.x+fonts[command.font].widthOfTextAtSize(command.text,command.size)<=page.width+0.1,`${command.text.slice(0,30)} exceeds A4 horizontally`)
  }
})
