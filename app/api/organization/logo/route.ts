import { get, put } from "@vercel/blob"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"
import { requireActiveMembership, requireCompanyRole } from "@/lib/organization"
import { consumeRateLimit,RateLimitError } from "@/lib/security/rate-limit"
import { assertImageFile,UploadValidationError } from "@/lib/security/uploads"

const allowed = new Map([["image/png",".png"],["image/jpeg",".jpg"],["image/webp",".webp"]])
function previewFile(pathname:string){
  const root=process.env.DG_PREVIEW_FILES_DIR
  if(!root||process.env.VERCEL_ENV==="production")return null
  const file=path.resolve(root,pathname)
  if(!file.startsWith(path.resolve(root)+path.sep))throw new Error("Caminho inválido")
  return file
}
export async function POST(request:Request){
  try {
    const context=await requireCompanyRole(["admin"])
    await consumeRateLimit(`organization-logo:${context.user.id}`, { max: 20, windowSeconds: 3600 })
    const form=await request.formData()
    const file=form.get("file")
    if(!(file instanceof File)||!allowed.has(file.type)||file.size>5_000_000||file.size===0)
      return NextResponse.json({error:"Envie uma imagem PNG, JPG ou WebP de até 5 MB."},{status:400})
    await assertImageFile(file,5_000_000)
    const pathname="organization-logos/"+context.organization.id+"/"+crypto.randomUUID()+allowed.get(file.type)
    const target=previewFile(pathname)
    if(target){await mkdir(path.dirname(target),{recursive:true});await writeFile(target,Buffer.from(await file.arrayBuffer()))}
    else await put(pathname,file,{access:"private",contentType:file.type,addRandomSuffix:false})
    return NextResponse.json({url:"/api/organization/logo?pathname="+encodeURIComponent(pathname)})
  }catch(e){
    if(e instanceof RateLimitError)return NextResponse.json({error:e.message},{status:429,headers:{"Retry-After":String(e.retryAfterSeconds)}})
    if(e instanceof UploadValidationError)return NextResponse.json({error:e.message},{status:400})
    console.error("Organization logo upload failed",e)
    return NextResponse.json({error:"Falha no upload"},{status:500})
  }
}
export async function GET(request:Request){
  const context=await requireActiveMembership()
  const pathname=new URL(request.url).searchParams.get("pathname")
  if(!pathname||!pathname.startsWith("organization-logos/"+context.organization.id+"/"))
    return NextResponse.json({error:"Arquivo não encontrado"},{status:404})
  const target=previewFile(pathname)
  if(target){
    try { const bytes=await readFile(/* turbopackIgnore: true */ target); const type=pathname.endsWith(".png")?"image/png":pathname.endsWith(".webp")?"image/webp":"image/jpeg";return new NextResponse(new Uint8Array(bytes),{headers:{"Content-Type":type,"Cache-Control":"private, no-cache"}}) }
    catch {return NextResponse.json({error:"Arquivo não encontrado"},{status:404})}
  }
  const file=await get(pathname,{access:"private"})
  if(!file)return NextResponse.json({error:"Arquivo não encontrado"},{status:404})
  return new NextResponse(file.stream,{headers:{"Content-Type":file.blob.contentType??"application/octet-stream","Cache-Control":"private, no-cache"}})
}
