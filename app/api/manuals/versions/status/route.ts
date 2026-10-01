import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { manualVersions } from "@/lib/db/schema"
import { requireDevelopmentRole, type DevelopmentRole } from "@/lib/organization"
import { consumeRateLimit,RateLimitError } from "@/lib/security/rate-limit"
import { assertId,InputValidationError } from "@/lib/security/input"

export async function POST(request: Request) {
  try{
    const body = await request.json().catch(() => ({})) as { id?: string; status?: string }
    if (!body.id || !["validacao", "aprovado", "publicado"].includes(body.status ?? "")) return NextResponse.json({ error: "Transição inválida" }, { status: 400 })
    const id=assertId(body.id,"Versão")
    const roles: DevelopmentRole[] = body.status === "publicado" || body.status === "aprovado" ? ["admin"] : ["admin", "admin_empreendimento", "editor"]
    const version = await db.select({developmentId:manualVersions.developmentId}).from(manualVersions).where(eq(manualVersions.id,id)).limit(1)
    if(!version[0])return NextResponse.json({error:"Versão não encontrada"},{status:404})
    let context
    try{context=await requireDevelopmentRole(version[0].developmentId,roles)}catch{return NextResponse.json({error:"Versão não encontrada"},{status:404})}
    await consumeRateLimit("manual-status:"+context.user.id,{max:120,windowSeconds:3600})
    const rows = await db.update(manualVersions).set({ status: body.status }).where(and(eq(manualVersions.id, id), eq(manualVersions.organizationId, context.organization.id))).returning({ id: manualVersions.id })
    if (!rows[0]) return NextResponse.json({ error: "Versão não encontrada" }, { status: 404 })
    return NextResponse.json({ ok: true })
  }catch(error){
    if(error instanceof RateLimitError)return NextResponse.json({error:error.message},{status:429,headers:{"Retry-After":String(error.retryAfterSeconds)}})
    if(error instanceof InputValidationError)return NextResponse.json({error:error.message},{status:400})
    console.error("Manual status update failed",error)
    return NextResponse.json({error:"Não foi possível atualizar o status"},{status:500})
  }
}
