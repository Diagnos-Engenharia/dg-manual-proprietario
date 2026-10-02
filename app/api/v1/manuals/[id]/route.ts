import { and,eq,inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { developments,manualVersions } from "@/lib/db/schema"
import { publicApiFailure,publicJson,publicOptions,requirePublicApiScope } from "@/lib/public-api"

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const auth=await requirePublicApiScope(request,"manuals:read")
    const {id}=await params
    const manual=(await db.select().from(manualVersions).where(and(eq(manualVersions.id,id),eq(manualVersions.organizationId,auth.organizationId),inArray(manualVersions.manualType,["proprietario","sindico"]))).limit(1))[0]
    if(!manual)return publicJson({error:{code:"not_found",message:"Manual não encontrado."}},404,request)
    const development=(await db.select({id:developments.id,name:developments.name,client:developments.client}).from(developments).where(and(eq(developments.id,manual.developmentId),eq(developments.organizationId,auth.organizationId))).limit(1))[0]
    const origin=new URL(request.url).origin
    return publicJson({data:{
      id:manual.id,
      development:development??{id:manual.developmentId,name:"",client:""},
      manual_type:manual.manualType,
      revision:manual.revision,
      status:manual.status,
      comment:manual.comment,
      filename:manual.filename,
      sections:manual.sections,
      pages:manual.pages,
      attachments:manual.attachments,
      finishing_table_id:manual.finishingTableId,
      finishing_revision:manual.finishingRevision,
      finishing_rows:manual.finishingRows,
      created_at:manual.createdAt.toISOString(),
      download_url:origin+"/api/v1/manuals/"+manual.id+"/file",
    }},200,request)
  }catch(error){return publicApiFailure(error,request)}
}

export function OPTIONS(request:Request){return publicOptions(request)}
