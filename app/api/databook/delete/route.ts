import { del } from "@vercel/blob"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { databookFiles, developments } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { recordAudit, requireDevelopmentRole } from "@/lib/organization"

export async function DELETE(request: NextRequest) {
  try {
    const { pathname } = await request.json() as { pathname?: string }
    if (!pathname) return NextResponse.json({ error: "Arquivo não informado" }, { status: 400 })
    const owned = await db.select({ pathname: databookFiles.pathname, name: databookFiles.name, folder: databookFiles.folder, developmentId: databookFiles.developmentId }).from(databookFiles).innerJoin(developments, eq(databookFiles.developmentId, developments.id)).where(and(eq(databookFiles.pathname, pathname), eq(developments.id,databookFiles.developmentId))).limit(1)
    if (!owned[0]) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 })
    const context = await requireDevelopmentRole(owned[0].developmentId,["admin","admin_empreendimento","editor"])
    await del(pathname)
    await db.delete(databookFiles).where(eq(databookFiles.pathname, pathname))
    await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "databook.deleted", entityType: "development", entityId: owned[0].developmentId, metadata: { path: ["databook", owned[0].folder, owned[0].name], before: { pathname }, after: null } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] DATABOOK delete failed", error)
    return NextResponse.json({ error: "Não foi possível excluir o arquivo" }, { status: 500 })
  }
}
