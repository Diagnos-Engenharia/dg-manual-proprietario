import { and,desc,eq,gt } from "drizzle-orm"
import { db } from "@/lib/db"
import { developments,manualVersions } from "@/lib/db/schema"
import { PublicApiError,parseLimit,parseSince,publicApiFailure,publicJson,publicOptions,requirePublicApiScope } from "@/lib/public-api"

export async function GET(request:Request){
  try{
    const auth=await requirePublicApiScope(request,"manuals:read")
    const url=new URL(request.url)
    const developmentId=url.searchParams.get("development_id")
    const manualType=url.searchParams.get("manual_type")
    const status=url.searchParams.get("status")
    const since=parseSince(url.searchParams.get("since"))
    const limit=parseLimit(url.searchParams.get("limit"))
    if(manualType&&manualType!=="proprietario"&&manualType!=="sindico")throw new PublicApiError(400,"invalid_manual_type","manual_type deve ser proprietario ou sindico.")

    const conditions=[eq(manualVersions.organizationId,auth.organizationId)]
    if(developmentId)conditions.push(eq(manualVersions.developmentId,developmentId))
    if(manualType)conditions.push(eq(manualVersions.manualType,manualType))
    if(status)conditions.push(eq(manualVersions.status,status))
    if(since)conditions.push(gt(manualVersions.createdAt,since))

    const rows=await db.select({
      id:manualVersions.id,
      developmentId:manualVersions.developmentId,
      developmentName:developments.name,
      client:developments.client,
      manualType:manualVersions.manualType,
      revision:manualVersions.revision,
      status:manualVersions.status,
      filename:manualVersions.filename,
      sections:manualVersions.sections,
      pages:manualVersions.pages,
      attachments:manualVersions.attachments,
      finishingRevision:manualVersions.finishingRevision,
      createdAt:manualVersions.createdAt,
    }).from(manualVersions)
      .innerJoin(developments,and(eq(manualVersions.developmentId,developments.id),eq(manualVersions.organizationId,developments.organizationId)))
      .where(and(...conditions))
      .orderBy(desc(manualVersions.createdAt))
      .limit(limit)

    const origin=url.origin
    return publicJson({
      data:rows.map(row=>({
        id:row.id,
        development:{id:row.developmentId,name:row.developmentName,client:row.client},
        manual_type:row.manualType,
        revision:row.revision,
        status:row.status,
        filename:row.filename,
        sections:row.sections,
        pages:row.pages,
        attachments:row.attachments,
        finishing_revision:row.finishingRevision,
        created_at:row.createdAt.toISOString(),
        detail_url:origin+"/api/v1/manuals/"+row.id,
        download_url:origin+"/api/v1/manuals/"+row.id+"/file",
      })),
      meta:{count:rows.length,limit,since:since?.toISOString()??null},
    })
  }catch(error){return publicApiFailure(error)}
}

export function OPTIONS(){return publicOptions()}
