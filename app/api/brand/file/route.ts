import { get } from "@vercel/blob"
import { NextResponse } from "next/server"
import { requireDevelopmentAccess } from "@/lib/organization"

export async function GET(request: Request) {
  try{
    const pathname = new URL(request.url).searchParams.get("pathname")
    if (!pathname || !pathname.startsWith("brand/")) return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 })
    const developmentId = pathname.split("/")[1]
    if(!developmentId)return NextResponse.json({error:"Arquivo inválido"},{status:400})
    try{await requireDevelopmentAccess(developmentId)}catch{return NextResponse.json({error:"Arquivo não encontrado"},{status:404})}
    const result = await get(pathname, { access: "private" })
    if (!result) return new NextResponse("Not found", { status: 404 })
    return new NextResponse(result.stream, { headers: { "Content-Type": result.blob.contentType ?? "application/octet-stream", ETag: result.blob.etag, "Cache-Control": "private, no-cache" } })
  }catch(error){
    console.error("Brand file failed",error)
    return NextResponse.json({error:"Não foi possível abrir o arquivo"},{status:500})
  }
}
