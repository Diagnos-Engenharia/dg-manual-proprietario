import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { manualVersions } from "@/lib/db/schema"
import { requireCompanyRole, type CompanyRole } from "@/lib/organization"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { id?: string; status?: string }
  if (!body.id || !["validacao", "aprovado", "publicado"].includes(body.status ?? "")) return NextResponse.json({ error: "Transição inválida" }, { status: 400 })
  const roles: CompanyRole[] = body.status === "publicado" || body.status === "aprovado" ? ["admin", "validator"] : ["admin", "editor"]
  const context = await requireCompanyRole(roles)
  const rows = await db.update(manualVersions).set({ status: body.status }).where(and(eq(manualVersions.id, body.id), eq(manualVersions.organizationId, context.organization.id))).returning({ id: manualVersions.id })
  if (!rows[0]) return NextResponse.json({ error: "Versão não encontrada" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
