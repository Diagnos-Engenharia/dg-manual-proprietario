import { selectManualSystems } from "@/lib/manual-content"
import { assessManualReadiness } from "@/lib/completion"
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { developments, databookFiles, finishingTables } from "@/lib/db/schema"
import { requireActiveMembership } from "@/lib/organization"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { developmentId?: string; manualType?: string }
  if (!body.developmentId) return NextResponse.json({ error: "Empreendimento não informado" }, { status: 400 })
  const manualType = body.manualType === "sindico" ? "sindico" : "proprietario"
  const context = await requireActiveMembership()
  const row = await db.select({ id: developments.id, name: developments.name, data: developments.data, workflowStatus: developments.workflowStatus }).from(developments).where(and(eq(developments.id, body.developmentId), eq(developments.organizationId, context.organization.id))).limit(1)
  if (!row[0]) return NextResponse.json({ error: "Empreendimento não encontrado" }, { status: 404 })
  const data = (row[0].data ?? {}) as Record<string, unknown>
  const systems = selectManualSystems(data, manualType)
  const files = await db.select({ name: databookFiles.name, pathname: databookFiles.pathname, sizeBytes: databookFiles.sizeBytes }).from(databookFiles).where(eq(databookFiles.developmentId, body.developmentId))
  const finishing = manualType === "proprietario" ? await db.select().from(finishingTables).where(and(eq(finishingTables.developmentId, body.developmentId), eq(finishingTables.organizationId, context.organization.id))) : []
  const readiness = assessManualReadiness(data, manualType, finishing.length)
  const blocking: string[] = [...readiness.blocking]
  const alerts: string[] = []

  if (!row[0].name.trim()) blocking.push("O empreendimento não possui nome cadastrado.")
  const content = (data.manuals as Record<string, { sistemas?: Record<string, string> }> | undefined)?.[manualType]
  if (systems.some(({ item, key }) => content?.sistemas?.[key] === undefined && content?.sistemas?.[item.id] === undefined)) alerts.push("Há sistemas que ainda utilizam a diretriz inicial. Revise as especificações antes de emitir.")
  if (files.length === 0) alerts.push("Nenhum anexo do DATABOOK está associado a esta revisão.")

  if (finishing.some((table) => Object.values((table.data as Record<string, unknown>) ?? {}).every((value) => !Array.isArray(value) || value.length === 0))) alerts.push("Há grupos da Tabela de Acabamentos sem registros.")
  if (row[0].workflowStatus === "aprovado" || row[0].workflowStatus === "publicado") alerts.push("A emissão criará uma nova revisão sem apagar a versão anterior.")
  return NextResponse.json({ ok: blocking.length === 0, blocking, stages: readiness.stages, overall: readiness.overall, alerts, sections: systems.length + 1 + (manualType === "proprietario" && finishing.length ? 1 : 0), attachments: files, manualType, development: row[0].name, finishing: finishing.map((table) => ({ id: table.id, tower: table.tower, typology: table.typology, unitModel: table.unitModel, area: table.area, revision: table.revision, status: table.status, updatedAt: table.updatedAt })) })
}
