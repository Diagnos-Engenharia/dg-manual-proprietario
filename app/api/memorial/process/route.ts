import { get } from "@vercel/blob"
import mammoth from "mammoth"
import { and,eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { developments,memorialEvidence,memorialImports,technicalContentTemplates } from "@/lib/db/schema"
import { getPlatformAiRuntime } from "@/lib/platform-ai"
import { checklistItems,type ChecklistItem,type ChecklistScope,type MaintenanceItem } from "@/lib/mock-data"
import { systemGuideline } from "@/lib/manual-content"
import { recordAudit,requireDevelopmentRole } from "@/lib/organization"

export const maxDuration=60

type Detail={key:string;value:string}
type Finding={checklistItemId:string;scopes:ChecklistScope[];confidence:number;page:number|null;evidence:string;details:Detail[]}
type AnalysisResult={findings:Finding[]}

const outputSchema={
  type:"object",additionalProperties:false,required:["findings"],properties:{findings:{type:"array",maxItems:250,items:{
    type:"object",additionalProperties:false,required:["checklistItemId","scopes","confidence","page","evidence","details"],
    properties:{
      checklistItemId:{type:"string"},scopes:{type:"array",minItems:1,maxItems:2,items:{type:"string",enum:["unidade","comum"]}},
      confidence:{type:"integer",minimum:0,maximum:100},page:{type:["integer","null"],minimum:1},evidence:{type:"string"},
      details:{type:"array",maxItems:12,items:{type:"object",additionalProperties:false,required:["key","value"],properties:{key:{type:"string"},value:{type:"string"}}}},
    },
  }}},
} as const

function prompt(){
  const catalog=checklistItems.map(item=>({id:item.id,category:item.category,item:item.item,defaultScope:item.scope}))
  return [
    "Classifique o Memorial Descritivo usando exclusivamente o catálogo oficial abaixo.",
    "Não redija o manual. Não crie IDs nem novos itens.",
    "Retorne apenas itens com evidência no documento. Ausência não significa não aplicado.",
    "Use confiança 80-100 para evidência clara, 50-79 para indício que exige conferência e menos de 50 para associação fraca.",
    "Indique scopes como unidade, comum ou ambos de acordo com a evidência, não apenas pelo defaultScope.",
    "Em PDF informe a página quando identificável; em DOCX use null.",
    "Em details extraia somente dados presentes no documento, como material, fabricante, modelo, acabamento, tipo, espessura e localização.",
    "CATÁLOGO:",JSON.stringify(catalog),
  ].join("\n")
}

function sanitize(value:unknown):AnalysisResult{
  const raw=value&&typeof value==="object"&&Array.isArray((value as {findings?:unknown}).findings)?(value as {findings:unknown[]}).findings:[]
  const allowed=new Set(checklistItems.map(item=>item.id)),findings:Finding[]=[]
  for(const entry of raw){
    if(!entry||typeof entry!=="object")continue
    const row=entry as Record<string,unknown>,id=String(row.checklistItemId??"")
    if(!allowed.has(id))continue
    const scopes=Array.isArray(row.scopes)?Array.from(new Set(row.scopes.filter(scope=>scope==="unidade"||scope==="comum"))) as ChecklistScope[]:[]
    if(!scopes.length)continue
    const confidence=Math.max(0,Math.min(100,Math.round(Number(row.confidence)||0)))
    const page=row.page===null||row.page===undefined?null:Math.max(1,Math.round(Number(row.page)||1))
    const details=Array.isArray(row.details)?row.details.flatMap(detail=>{
      if(!detail||typeof detail!=="object")return []
      const pair=detail as Record<string,unknown>,key=String(pair.key??"").trim().slice(0,80),value=String(pair.value??"").trim().slice(0,300)
      return key&&value?[{key,value}]:[]
    }).slice(0,12):[]
    findings.push({checklistItemId:id,scopes,confidence,page,evidence:String(row.evidence??"").trim().slice(0,700),details})
  }
  const best=new Map<string,Finding>()
  for(const finding of findings){
    const current=best.get(finding.checklistItemId)
    if(!current||finding.confidence>current.confidence)best.set(finding.checklistItemId,finding)
    else if(current&&finding.confidence===current.confidence)current.scopes=Array.from(new Set([...current.scopes,...finding.scopes]))
  }
  return {findings:[...best.values()].sort((a,b)=>b.confidence-a.confidence)}
}

function openAiText(payload:unknown){
  const output=(payload as {output?:Array<{content?:Array<{type?:string;text?:string}>}>})?.output??[]
  return output.flatMap(item=>item.content??[]).filter(part=>part.type==="output_text").map(part=>part.text??"").join("")
}

async function analyzeOpenAi(input:{apiKey:string;model:string;filename:string;bytes:Buffer;text?:string}){
  const content:Record<string,unknown>[]=[{type:"input_text",text:input.text?prompt()+"\n\nDOCUMENTO:\n"+input.text:prompt()}]
  if(!input.text)content.push({type:"input_file",filename:input.filename,file_data:input.bytes.toString("base64")})
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:"Bearer "+input.apiKey,"Content-Type":"application/json"},body:JSON.stringify({
    model:input.model,store:false,input:[{role:"user",content}],text:{format:{type:"json_schema",name:"memorial_checklist_analysis",strict:true,schema:outputSchema}},
  }),signal:AbortSignal.timeout(55000)})
  const payload=await response.json().catch(()=>({})) as {error?:{message?:string};output?:unknown[]}
  if(!response.ok)throw new Error("OpenAI: "+(payload.error?.message??("HTTP "+response.status)))
  const text=openAiText(payload)
  if(!text)throw new Error("OpenAI não retornou a análise estruturada")
  return sanitize(JSON.parse(text))
}

async function analyzeGoogle(input:{apiKey:string;model:string;mime:string;bytes:Buffer;text?:string}){
  const parts:Record<string,unknown>[]=[{text:prompt()}]
  if(input.text)parts.push({text:"DOCUMENTO:\n"+input.text})
  else parts.push({inlineData:{mimeType:input.mime||"application/pdf",data:input.bytes.toString("base64")}})
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(input.model)+":generateContent",{method:"POST",headers:{"x-goog-api-key":input.apiKey,"Content-Type":"application/json"},body:JSON.stringify({
    contents:[{role:"user",parts}],generationConfig:{responseMimeType:"application/json",responseJsonSchema:outputSchema,temperature:0},
  }),signal:AbortSignal.timeout(55000)})
  const payload=await response.json().catch(()=>({})) as {error?:{message?:string};candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>}
  if(!response.ok)throw new Error("Google AI: "+(payload.error?.message??("HTTP "+response.status)))
  const text=(payload.candidates??[]).flatMap(candidate=>candidate.content?.parts??[]).map(part=>part.text??"").join("")
  if(!text)throw new Error("Google AI não retornou a análise estruturada")
  return sanitize(JSON.parse(text))
}

function escapeHtml(value:string){return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}
function applyVariables(template:string,details:Detail[]){
  const values=new Map(details.map(detail=>[detail.key.trim().toLowerCase(),detail.value]))
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g,(match,key:string)=>{const value=values.get(key.trim().toLowerCase());return value?escapeHtml(value):match})
}
async function bytesFromBlob(pathname:string){
  const result=await get(pathname,{access:"private"})
  if(!result||result.statusCode!==200||!result.stream)throw new Error("Arquivo do Memorial não encontrado")
  return Buffer.from(await new Response(result.stream).arrayBuffer())
}
async function templateFor(item:ChecklistItem,scope:ChecklistScope,userId:string,cache:Map<string,{descriptionHtml:string;maintenance:MaintenanceItem[]}>){
  const key=item.id+"::"+scope,cached=cache.get(key)
  if(cached)return cached
  const existing=(await db.select().from(technicalContentTemplates).where(and(eq(technicalContentTemplates.checklistItemId,item.id),eq(technicalContentTemplates.scope,scope))).limit(1))[0]
  if(existing){
    const value={descriptionHtml:existing.descriptionHtml,maintenance:(Array.isArray(existing.maintenance)?existing.maintenance:[]) as MaintenanceItem[]}
    cache.set(key,value);return value
  }
  const value={descriptionHtml:systemGuideline(item,scope),maintenance:(item.maintenance??[]).map(row=>({...row,responsible:scope==="unidade"?"Proprietário" as const:"Síndico" as const}))}
  await db.insert(technicalContentTemplates).values({id:crypto.randomUUID(),checklistItemId:item.id,scope,title:item.item,descriptionHtml:value.descriptionHtml,maintenance:value.maintenance,variablesSchema:{},version:1,status:"seeded",updatedBy:userId})
  cache.set(key,value);return value
}

export async function POST(request:Request){
  let importId=""
  try{
    const body=await request.json().catch(()=>({})) as {importId?:string};importId=String(body.importId??"")
    if(!importId)return NextResponse.json({error:"Importação não informada"},{status:400})
    const memorial=(await db.select().from(memorialImports).where(eq(memorialImports.id,importId)).limit(1))[0]
    if(!memorial)return NextResponse.json({error:"Memorial não encontrado"},{status:404})
    const context=await requireDevelopmentRole(memorial.developmentId,["admin","admin_empreendimento","editor"])
    if(memorial.organizationId!==context.organization.id)return NextResponse.json({error:"Acesso não autorizado"},{status:403})
    const runtime=await getPlatformAiRuntime()
    if(!runtime)return NextResponse.json({error:"O Gerenciador ainda não configurou o motor de IA"},{status:409})

    await db.update(memorialImports).set({status:"processing",provider:runtime.provider,model:runtime.model,error:null,updatedAt:new Date()}).where(eq(memorialImports.id,importId))
    const bytes=await bytesFromBlob(memorial.pathname)
    let text:string|undefined
    if(/\.docx$/i.test(memorial.filename)||memorial.contentType==="application/vnd.openxmlformats-officedocument.wordprocessingml.document")text=(await mammoth.extractRawText({buffer:bytes})).value.slice(0,500000)
    const analysis=runtime.provider==="openai"
      ?await analyzeOpenAi({apiKey:runtime.apiKey,model:runtime.model,filename:memorial.filename,bytes,text})
      :await analyzeGoogle({apiKey:runtime.apiKey,model:runtime.model,mime:memorial.contentType??"application/pdf",bytes,text})

    const confirmed=analysis.findings.filter(f=>f.confidence>=80),review=analysis.findings.filter(f=>f.confidence>=50&&f.confidence<80),ignored=analysis.findings.filter(f=>f.confidence<50)
    const development=(await db.select().from(developments).where(and(eq(developments.id,memorial.developmentId),eq(developments.organizationId,context.organization.id))).limit(1))[0]
    if(!development)throw new Error("Empreendimento não encontrado")
    const byId=new Map(checklistItems.map(item=>[item.id,item])),confirmedMap=new Map(confirmed.map(f=>[f.checklistItemId,f]))
    const data={...((development.data??{}) as Record<string,unknown>)},current=(Array.isArray(data.checklist)?data.checklist:checklistItems) as ChecklistItem[]
    data.checklist=current.map(item=>{
      const finding=confirmedMap.get(item.id);if(!finding)return item
      const prior=Array.isArray(item.scopes)?item.scopes:[]
      const scopes=item.status==="nao_especificado"?finding.scopes:Array.from(new Set([...prior,...finding.scopes]))
      return {...item,status:"possui" as const,scopes}
    })

    const manuals=(data.manuals&&typeof data.manuals==="object"?data.manuals:{}) as Record<string,unknown>
    const propRaw=(manuals.proprietario&&typeof manuals.proprietario==="object"?manuals.proprietario:{}) as Record<string,unknown>
    const sindRaw=(manuals.sindico&&typeof manuals.sindico==="object"?manuals.sindico:{}) as Record<string,unknown>
    const prop={...propRaw,sistemas:{...((propRaw.sistemas??{}) as Record<string,string>)},manutencao:{...((propRaw.manutencao??{}) as Record<string,MaintenanceItem[]>)}}
    const sind={...sindRaw,sistemas:{...((sindRaw.sistemas??{}) as Record<string,string>)},manutencao:{...((sindRaw.manutencao??{}) as Record<string,MaintenanceItem[]>)}}
    const cache=new Map<string,{descriptionHtml:string;maintenance:MaintenanceItem[]}>()
    for(const finding of confirmed){
      const item=byId.get(finding.checklistItemId);if(!item)continue
      for(const scope of finding.scopes){
        const template=await templateFor(item,scope,context.user.id,cache),key=item.id+"::"+scope,target=scope==="unidade"?prop:sind
        ;(target.sistemas as Record<string,string>)[key]=applyVariables(template.descriptionHtml,finding.details)
        ;(target.manutencao as Record<string,MaintenanceItem[]>)[key]=template.maintenance
      }
    }
    data.manuals={...manuals,proprietario:prop,sindico:sind}
    await db.update(developments).set({data,lastEditorId:context.user.id,version:development.version+1,updatedAt:new Date()}).where(eq(developments.id,development.id))
    await db.delete(memorialEvidence).where(eq(memorialEvidence.importId,importId))
    if(analysis.findings.length)await db.insert(memorialEvidence).values(analysis.findings.flatMap(f=>f.scopes.map(scope=>({
      id:crypto.randomUUID(),importId,developmentId:development.id,checklistItemId:f.checklistItemId,scope,confidence:f.confidence,page:f.page,excerpt:f.evidence||null,variables:Object.fromEntries(f.details.map(detail=>[detail.key,detail.value])),
    }))))
    const summary={total:analysis.findings.length,confirmed:confirmed.length,review:review.length,ignored:ignored.length,threshold:80}
    await db.update(memorialImports).set({status:"processed",summary,provider:runtime.provider,model:runtime.model,error:null,updatedAt:new Date()}).where(eq(memorialImports.id,importId))
    await recordAudit({organizationId:context.organization.id,actorId:context.user.id,action:"memorial.processed",entityType:"development",entityId:development.id,metadata:{importId,summary,provider:runtime.provider,model:runtime.model}})
    return NextResponse.json({summary,findings:analysis.findings.map(f=>({...f,label:byId.get(f.checklistItemId)?.item??f.checklistItemId,category:byId.get(f.checklistItemId)?.category??""}))})
  }catch(error){
    console.error("Memorial processing failed",error)
    if(importId)await db.update(memorialImports).set({status:"error",error:error instanceof Error?error.message:"Falha no processamento",updatedAt:new Date()}).where(eq(memorialImports.id,importId)).catch(()=>{})
    return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível processar o Memorial"},{status:500})
  }
}
