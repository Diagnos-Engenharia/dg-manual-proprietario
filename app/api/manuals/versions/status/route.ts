import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { manualVersions } from "@/lib/db/schema"
import { requireDevelopmentRole, type DevelopmentRole } from "@/lib/organization"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { id?: string; status?: string }
  if (!body.id || !["validacao", "aprovado", "publicado"].includes(body.status ?? "")) return NextResponse.json({ error: "Transição inválida" }, { status: 400 })
  const roles: DevelopmentRole[] = body.status === "publicado" || body.status === "aprovado" ? ["admin", "admin_empreendimento", "validator"] : ["admin", "admin_empreendimento", "editor"]
  const version = await db.select({developmentId:manualVersions.developmentId}).from(manualVersions).where(eq(manualVersions.id,body.id)).limit(1)
  if(!version[0])return NextResponse.json({error:"Versão não encontrada"},{status:404})
  const context = await requireDevelopmentRole(version[0].developmentId,roles)
  const rows = await db.update(manualVersions).set({ status: body.status }).where(and(eq(manualVersions.id, body.id), eq(manualVersions.organizationId, context.organization.id))).returning({ id: manualVersions.id })
  if (!rows[0]) return NextResponse.json({ error: "Versão não encontrada" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
