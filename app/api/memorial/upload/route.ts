import { put } from "@vercel/blob"
import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { memorialImports, platformIntegrations } from "@/lib/db/schema"
import { recordAudit, requireDevelopmentRole } from "@/lib/organization"
import { consumeRateLimit,RateLimitError } from "@/lib/security/rate-limit"
import { assertMemorialFile,sanitizeFilename,UploadValidationError } from "@/lib/security/uploads"

export async function POST(request:Request){
  try{
    const formData=await request.formData()
    const file=formData.get("file")
    const developmentId=String(formData.get("developmentId")||"")
    if(!(file instanceof File)||!developmentId)return NextResponse.json({error:"Arquivo ou empreendimento não informado"},{status:400})

    const context=await requireDevelopmentRole(developmentId,["admin","admin_empreendimento","editor"])
    await consumeRateLimit("memorial-upload:"+context.user.id,{max:20,windowSeconds:3600})
    const detectedContentType=await assertMemorialFile(file)
    const configured=(await db.select({provider:platformIntegrations.provider,config:platformIntegrations.config,status:platformIntegrations.status}).from(platformIntegrations).limit(1))[0]
    const pathname=`memorials/${context.organization.id}/${developmentId}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`
    const blob=await put(pathname,file,{access:"private",addRandomSuffix:false})
    const id=crypto.randomUUID()
    const config=(configured?.config??{}) as {model?:string}
    const aiReady=configured?.provider==="openai"&&configured.status==="verified"
    const status=aiReady?"ready_to_process":"awaiting_ai_configuration"
    await db.insert(memorialImports).values({
      id,
      developmentId,
      organizationId:context.organization.id,
      filename:file.name,
      pathname:blob.pathname,
      contentType:detectedContentType,
      sizeBytes:file.size,
      status,
      provider:aiReady?configured.provider:null,
      model:aiReady?config.model??null:null,
      createdBy:context.user.id,
    })
    await recordAudit({organizationId:context.organization.id,actorId:context.user.id,action:"memorial.uploaded",entityType:"development",entityId:developmentId,metadata:{importId:id,filename:file.name,status}})
    return NextResponse.json({id,filename:sanitizeFilename(file.name),status,provider:aiReady?configured.provider:null,model:aiReady?config.model??null:null})
  }catch(error){
    if(error instanceof RateLimitError)return NextResponse.json({error:error.message},{status:429,headers:{"Retry-After":String(error.retryAfterSeconds)}})
    if(error instanceof UploadValidationError)return NextResponse.json({error:error.message},{status:400})
    console.error("Memorial upload failed",error)
    return NextResponse.json({error:"Não foi possível enviar o Memorial"},{status:500})
  }
}
