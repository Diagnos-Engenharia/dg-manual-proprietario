import { logSafeError } from "@/lib/security/logging"
import { put } from "@vercel/blob"
import { NextResponse } from "next/server"
import { requireDevelopmentRole } from "@/lib/organization"
import { consumeRateLimit,RateLimitError } from "@/lib/security/rate-limit"
import { assertImageFile,sanitizeFilename,UploadValidationError } from "@/lib/security/uploads"

export async function POST(request: Request) {
  try{
    const formData = await request.formData()
    const file = formData.get("file")
    const developmentId = String(formData.get("developmentId") || "")
    const kind = String(formData.get("kind") || "hero")
    if (!(file instanceof File) || !developmentId || !["hero", "logo"].includes(kind)) return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 })
    const context=await requireDevelopmentRole(developmentId,["admin","admin_empreendimento","editor"])
    await consumeRateLimit("brand-upload:"+context.user.id,{max:30,windowSeconds:3600})
    await assertImageFile(file,8*1024*1024)
    const blob = await put("brand/"+developmentId+"/"+kind+"-"+crypto.randomUUID()+"-"+sanitizeFilename(file.name), file, { access: "private", addRandomSuffix: false })
    return NextResponse.json({ url: "/api/brand/file?pathname="+encodeURIComponent(blob.pathname) })
  }catch(error){
    if(error instanceof RateLimitError)return NextResponse.json({error:error.message},{status:429,headers:{"Retry-After":String(error.retryAfterSeconds)}})
    if(error instanceof UploadValidationError)return NextResponse.json({error:error.message},{status:400})
    logSafeError("brand.upload",error)
    return NextResponse.json({error:"Não foi possível enviar a imagem"},{status:500})
  }
}
