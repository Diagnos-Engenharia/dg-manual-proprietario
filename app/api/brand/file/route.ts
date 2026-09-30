import { get } from "@vercel/blob"
import { NextResponse } from "next/server"
import { requireDevelopmentAccess } from "@/lib/organization"

export async function GET(request: Request) {
  const pathname = new URL(request.url).searchParams.get("pathname")
  if (!pathname || !pathname.startsWith("brand/")) return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 })
  const developmentId = pathname.split("/")[1]
  if(!developmentId)return NextResponse.json({error:"Arquivo inválido"},{status:400})
  await requireDevelopmentAccess(developmentId)
  const result = await get(pathname, { access: "private" })
  if (!result) return new NextResponse("Not found", { status: 404 })
  return new NextResponse(result.stream, { headers: { "Content-Type": result.blob.contentType ?? "application/octet-stream", ETag: result.blob.etag, "Cache-Control": "private, no-cache" } })
}
