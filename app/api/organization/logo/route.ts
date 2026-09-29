import { put } from "@vercel/blob"
import { NextResponse } from "next/server"
import { requireCompanyRole } from "@/lib/organization"

export async function POST(request: Request) {
  try { await requireCompanyRole(["admin"]); const form = await request.formData(); const file = form.get("file"); if (!(file instanceof File) || file.size > 5_000_000) return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 }); const blob = await put(`organization-logos/${crypto.randomUUID()}-${file.name}`, file, { access: "public", contentType: file.type }); return NextResponse.json({ url: blob.url }) } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha no upload" }, { status: 500 }) }
}
