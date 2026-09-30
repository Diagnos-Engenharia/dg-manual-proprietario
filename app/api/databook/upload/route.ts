import { put } from "@vercel/blob"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { databookFiles, developments } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { headers } from "next/headers"
import { recordAudit, requireDevelopmentRole } from "@/lib/organization"

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    const formData = await request.formData()
    const file = formData.get("file")
    const developmentId = String(formData.get("developmentId") || "")
    const folder = String(formData.get("folder") || "Arquivos")
    if (!(file instanceof File) || !developmentId) return NextResponse.json({ error: "Arquivo ou empreendimento não informado" }, { status: 400 })
    const context = await requireDevelopmentRole(developmentId,["admin","admin_empreendimento","editor"])
    const development = await db.select({ id: developments.id }).from(developments).where(and(eq(developments.id, developmentId), eq(developments.organizationId, context.organization.id))).limit(1)
    if (!development[0]) return NextResponse.json({ error: "Empreendimento não encontrado" }, { status: 404 })
    const pathname = `databook/${developmentId}/${folder.replace(/[^a-zA-Z0-9À-ÿ _-]/g, "-")}/${file.name}`
    const blob = await put(pathname, file, { access: "private", addRandomSuffix: true })
    await db.insert(databookFiles).values({ id: crypto.randomUUID(), userId: session.user.id, developmentId, folder, name: file.name, pathname: blob.pathname, contentType: file.type || null, sizeBytes: file.size })
    await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: "databook.uploaded", entityType: "development", entityId: developmentId, metadata: { path: ["databook", folder, file.name], before: null, after: { pathname: blob.pathname, size: file.size } } })
    return NextResponse.json({ pathname: blob.pathname, size: file.size, name: file.name })
  } catch (error) {
    console.error("[v0] DATABOOK upload failed", error)
    return NextResponse.json({ error: "Não foi possível enviar o arquivo" }, { status: 500 })
  }
}
