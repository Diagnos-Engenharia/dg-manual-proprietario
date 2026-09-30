import { put } from "@vercel/blob"
import { NextResponse } from "next/server"
import { requireDevelopmentRole } from "@/lib/organization"

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get("file")
  const developmentId = String(formData.get("developmentId") || "")
  const kind = String(formData.get("kind") || "hero")
  if (!(file instanceof File) || !developmentId || !["hero", "logo"].includes(kind)) return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 })
  await requireDevelopmentRole(developmentId,["admin","admin_empreendimento","editor"])
  if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Imagem inválida" }, { status: 400 })
  const blob = await put(`brand/${developmentId}/${kind}-${crypto.randomUUID()}-${file.name}`, file, { access: "private", addRandomSuffix: false })
  return NextResponse.json({ url: `/api/brand/file?pathname=${encodeURIComponent(blob.pathname)}` })
}
