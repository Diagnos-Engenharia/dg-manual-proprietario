import { put } from "@vercel/blob"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { databookFiles, developments } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { recordAudit, requireDevelopmentRole } from "@/lib/organization"
import { consumeRateLimit,RateLimitError } from "@/lib/security/rate-limit"
import { assertDatabookFile,sanitizeFilename,sanitizePathSegment,UploadValidationError } from "@/lib/security/uploads"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")
    const developmentId = String(formData.get("developmentId") || "")
    const folder = sanitizePathSegment(String(formData.get("folder") || "Arquivos"))
    if (!(file instanceof File) || !developmentId) return NextResponse.json({ error: "Arquivo ou empreendimento não informado" }, { status: 400 })
    const context = await requireDevelopmentRole(developmentId,["admin","admin_empreendimento","editor"])
    await consumeRateLimit("databook-upload:"+context.user.id,{max:40,windowSeconds:3600})
    assertDatabookFile(file)
    const development = await db.select({ id: developments.id }).from(developments).where(and(eq(developments.id, developmentId), eq(developments.organizationId, context.organization.id))).limit(1)
    if (!development[0]) return NextResponse.json({ error: "Empreendimento não encontrado" }, { status: 404 })
    const name=sanitizeFilename(file.name)
    const pathname = "databook/"+developmentId+"/"+folder+"/"+name
    const blob = await put(pathname, file, { access: "private", addRandomSuffix: true })
    await db.insert(databookFiles).values({ id: crypto.randomUUID(), userId: context.user.id, developmentId, folder, name, pathname: blob.pathname, contentType: file.type || null, sizeBytes: file.size })
    await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "databook.uploaded", entityType: "development", entityId: developmentId, metadata: { path: ["databook", folder, name], before: null, after: { pathname: blob.pathname, size: file.size } } })
    return NextResponse.json({ pathname: blob.pathname, size: file.size, name })
  } catch (error) {
    if(error instanceof RateLimitError)return NextResponse.json({error:error.message},{status:429,headers:{"Retry-After":String(error.retryAfterSeconds)}})
    if(error instanceof UploadValidationError)return NextResponse.json({error:error.message},{status:400})
    console.error("DATABOOK upload failed", error)
    return NextResponse.json({ error: "Não foi possível enviar o arquivo" }, { status: 500 })
  }
}
