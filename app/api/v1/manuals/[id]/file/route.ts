import { and,eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { manualVersions } from "@/lib/db/schema"
import { getManualFile } from "@/lib/manual-files"
import { publicApiFailure,publicJson,publicOptions,requirePublicApiScope } from "@/lib/public-api"
import { safeContentDisposition } from "@/lib/security/uploads"

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const auth=await requirePublicApiScope(request,"manuals:read")
    const {id}=await params
    const row=(await db.select({pathname:manualVersions.pathname,filename:manualVersions.filename}).from(manualVersions).where(and(eq(manualVersions.id,id),eq(manualVersions.organizationId,auth.organizationId))).limit(1))[0]
    if(!row)return publicJson({error:{code:"not_found",message:"Manual não encontrado."}},404)
    const result=await getManualFile(row.pathname)
    if(!result)return publicJson({error:{code:"file_not_found",message:"Arquivo do manual não encontrado."}},404)
    return new NextResponse(result.stream,{headers:{
      "Content-Type":result.blob.contentType||"application/pdf",
      "Content-Disposition":safeContentDisposition(row.filename),
      "Cache-Control":"private, no-store",
      "Access-Control-Allow-Origin":"*",
      "Access-Control-Allow-Headers":"Authorization, Content-Type",
      "X-DG-Manual-Id":id,
    }})
  }catch(error){return publicApiFailure(error)}
}

export function OPTIONS(){return publicOptions()}
