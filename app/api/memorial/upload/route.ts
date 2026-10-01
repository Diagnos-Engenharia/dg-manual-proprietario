import { put } from "@vercel/blob"
import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { memorialImports, platformIntegrations } from "@/lib/db/schema"
import { recordAudit, requireDevelopmentRole } from "@/lib/organization"

const acceptedTypes=new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
])

export async function POST(request:Request){
  try{
    const formData=await request.formData()
    const file=formData.get("file")
    const developmentId=String(formData.get("developmentId")||"")
    if(!(file instanceof File)||!developmentId)return NextResponse.json({error:"Arquivo ou empreendimento não informado"},{status:400})
    if(!acceptedTypes.has(file.type)&&!/.(pdf|docx)$/i.test(file.name))return NextResponse.json({error:"Envie o Memorial em PDF ou DOCX"},{status:400})
    if(file.size>25*1024*1024)return NextResponse.json({error:"O Memorial deve ter no máximo 25 MB"},{status:400})

    const context=await requireDevelopmentRole(developmentId,["admin","admin_empreendimento","editor"])
    const configured=(await db.select({provider:platformIntegrations.provider,config:platformIntegrations.config,status:platformIntegrations.status}).from(platformIntegrations).limit(1))[0]
    const pathname=`memorials/${context.organization.id}/${developmentId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9À-ÿ._ -]/g,"-")}`
    const blob=await put(pathname,file,{access:"private",addRandomSuffix:false})
    const id=crypto.randomUUID()
    const config=(configured?.config??{}) as {model?:string}
    const status=configured?"ready_to_process":"awaiting_ai_configuration"
    await db.insert(memorialImports).values({
      id,
      developmentId,
      organizationId:context.organization.id,
      filename:file.name,
      pathname:blob.pathname,
      contentType:file.type||null,
      sizeBytes:file.size,
      status,
      provider:configured?.provider??null,
      model:config.model??null,
      createdBy:context.user.id,
    })
    await recordAudit({organizationId:context.organization.id,actorId:context.user.id,action:"memorial.uploaded",entityType:"development",entityId:developmentId,metadata:{importId:id,filename:file.name,status}})
    return NextResponse.json({id,filename:file.name,status,provider:configured?.provider??null,model:config.model??null})
  }catch(error){
    console.error("Memorial upload failed",error)
    return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível enviar o Memorial"},{status:500})
  }
}
