import { and,desc,eq,gt } from "drizzle-orm"
import { db } from "@/lib/db"
import { developments } from "@/lib/db/schema"
import { parseLimit,parseSince,publicApiFailure,publicJson,publicOptions,requirePublicApiScope } from "@/lib/public-api"

export async function GET(request:Request){
  try{
    const auth=await requirePublicApiScope(request,"developments:read")
    const url=new URL(request.url)
    const limit=parseLimit(url.searchParams.get("limit"))
    const since=parseSince(url.searchParams.get("since"))
    const conditions=[eq(developments.organizationId,auth.organizationId)]
    if(since)conditions.push(gt(developments.updatedAt,since))
    const rows=await db.select({
      id:developments.id,
      name:developments.name,
      client:developments.client,
      status:developments.status,
      workflowStatus:developments.workflowStatus,
      deliveryDate:developments.deliveryDate,
      version:developments.version,
      createdAt:developments.createdAt,
      updatedAt:developments.updatedAt,
    }).from(developments).where(and(...conditions)).orderBy(desc(developments.updatedAt)).limit(limit)

    return publicJson({
      data:rows.map(row=>({
        id:row.id,
        name:row.name,
        client:row.client,
        status:row.status,
        workflow_status:row.workflowStatus,
        delivery_date:row.deliveryDate,
        version:row.version,
        created_at:row.createdAt.toISOString(),
        updated_at:row.updatedAt.toISOString(),
      })),
      meta:{count:rows.length,limit,since:since?.toISOString()??null},
    },200,request)
  }catch(error){return publicApiFailure(error,request)}
}

export function OPTIONS(request:Request){return publicOptions(request)}
