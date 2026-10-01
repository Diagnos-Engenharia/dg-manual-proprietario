import { NextResponse } from "next/server"
import { and, eq, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { auditLogs, developments, manualVersions } from "@/lib/db/schema"
import { requireDevelopmentRole, type DevelopmentRole } from "@/lib/organization"
import { manualApiError } from "@/lib/manual-document/http"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (typeof body.id !== "string" || !["validacao", "aprovado", "publicado"].includes(body.status)) return NextResponse.json({ error: "Transição inválida" }, { status: 400 })
    const roles: DevelopmentRole[] = body.status === "publicado" || body.status === "aprovado" ? ["admin"] : ["admin", "admin_empreendimento", "editor"]
    const version = (await db.select().from(manualVersions).where(eq(manualVersions.id,body.id)).limit(1))[0]
    if(!version)return NextResponse.json({error:"Versão não encontrada"},{status:404})
    const context = await requireDevelopmentRole(version.developmentId,roles)
    const previous: Record<string,string> = { validacao:"rascunho", aprovado:"validacao", publicado:"aprovado" }
    await db.transaction(async tx => {
      // Match issuance's lock order: parent first, then version. This serializes
      // competing publications before either checks/replaces the published row.
      const development = (await tx.select({ id: developments.id }).from(developments).where(and(eq(developments.id,context.development.id),eq(developments.organizationId,context.organization.id))).for("update"))[0]
      if(!development)throw new Error("Empreendimento não encontrado")
      const current = (await tx.select().from(manualVersions).where(and(eq(manualVersions.id,body.id),eq(manualVersions.developmentId,development.id),eq(manualVersions.organizationId,context.organization.id))).for("update"))[0]
      if(!current)throw new Error("Versão não encontrada")
      if(current.status!==previous[body.status])throw new Error("Transição inválida para o estado atual da versão")
      if(body.status==="publicado")await tx.update(manualVersions).set({status:"substituido"}).where(and(eq(manualVersions.developmentId,current.developmentId),eq(manualVersions.organizationId,context.organization.id),eq(manualVersions.manualType,current.manualType),eq(manualVersions.status,"publicado"),ne(manualVersions.id,current.id)))
      await tx.update(manualVersions).set({status:body.status}).where(eq(manualVersions.id,current.id))
      await tx.insert(auditLogs).values({id:crypto.randomUUID(),organizationId:context.organization.id,actorId:context.user.id,action:"manual.version."+body.status,entityType:"development",entityId:current.developmentId,metadata:{path:["emissao",current.manualType],versionId:current.id,revision:current.revision,before:current.status,after:body.status}})
    })
    return NextResponse.json({ok:true})
  }catch(error){return manualApiError(error)}
}
