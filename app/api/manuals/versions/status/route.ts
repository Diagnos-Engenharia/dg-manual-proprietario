import { NextResponse } from "next/server"
import { and, eq, isNull, ne, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { auditLogs, developments, manualVersions } from "@/lib/db/schema"
import { requireDevelopmentRole, type DevelopmentRole } from "@/lib/organization"
import { manualApiError } from "@/lib/manual-document/http"
import { FinishingContentError, loadFinishingSource } from "@/lib/finishing-units"
import { assertId } from "@/lib/security/input"
import { consumeRateLimit } from "@/lib/security/rate-limit"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (typeof body.id !== "string" || typeof body.status !== "string" || !["validacao", "aprovado", "publicado"].includes(body.status)) return NextResponse.json({ error: "Transição inválida" }, { status: 400 })
    const versionId = assertId(body.id, "Versão")
    const roles: DevelopmentRole[] = body.status === "publicado" || body.status === "aprovado" ? ["admin"] : ["admin", "admin_empreendimento", "editor"]
    const version = (await db.select().from(manualVersions).where(eq(manualVersions.id,versionId)).limit(1))[0]
    if(!version)return NextResponse.json({error:"Versão não encontrada"},{status:404})
    const context = await requireDevelopmentRole(version.developmentId,roles)
    await consumeRateLimit(`manual-status:${context.user.id}`, { max: 60, windowSeconds: 3600 })
    const previous: Record<string,string> = { validacao:"rascunho", aprovado:"validacao", publicado:"aprovado" }
    await db.transaction(async tx => {
      // Match issuance's lock order: parent first, then version. This serializes
      // competing publications before either checks/replaces the published row.
      const development = (await tx.select({ id: developments.id }).from(developments).where(and(eq(developments.id,context.development.id),eq(developments.organizationId,context.organization.id))).for("update"))[0]
      if(!development)throw new Error("Empreendimento não encontrado")
      const current = (await tx.select().from(manualVersions).where(and(eq(manualVersions.id,versionId),eq(manualVersions.developmentId,development.id),eq(manualVersions.organizationId,context.organization.id))).for("update"))[0]
      if(!current)throw new Error("Versão não encontrada")
      if(current.status!==previous[body.status])throw new Error("Transição inválida para o estado atual da versão")
      if(current.manualType==="acabamentos" && ["aprovado","publicado"].includes(body.status)) {
        await tx.execute(sql`SELECT id FROM organization WHERE id = ${context.organization.id} FOR SHARE`)
        if(!current.unitId)throw new FinishingContentError("Esta revisão não possui unidade identificada.",400)
        const source=await loadFinishingSource(context,current.unitId,tx)
        if(!current.sourceFingerprint || current.sourceFingerprint!==source.fingerprint)throw new FinishingContentError("A identificação, conteúdo ou aprovação da unidade mudou. Emita uma nova revisão antes de publicar.",409)
        if(source.source.table?.status!=="aprovado")throw new FinishingContentError("A tabela da unidade precisa estar aprovada.",400)
      }
      if(body.status==="publicado")await tx.update(manualVersions).set({status:"substituido"}).where(and(eq(manualVersions.developmentId,current.developmentId),eq(manualVersions.organizationId,context.organization.id),eq(manualVersions.manualType,current.manualType),current.unitId?eq(manualVersions.unitId,current.unitId):isNull(manualVersions.unitId),eq(manualVersions.status,"publicado"),ne(manualVersions.id,current.id)))
      await tx.update(manualVersions).set({status:body.status}).where(eq(manualVersions.id,current.id))
      await tx.insert(auditLogs).values({id:crypto.randomUUID(),organizationId:context.organization.id,actorId:context.user.id,action:"manual.version."+body.status,entityType:"development",entityId:current.developmentId,metadata:{path:["emissao",current.manualType],versionId:current.id,revision:current.revision,before:current.status,after:body.status}})
    })
    return NextResponse.json({ok:true})
  }catch(error){return manualApiError(error)}
}
