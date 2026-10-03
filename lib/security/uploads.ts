import JSZip from "jszip"

export class UploadValidationError extends Error{}

export function sanitizeFilename(value:string){
  const clean=value.replace(/[\r\n"\\/<>:*?|\u0000-\u001f]/g,"-").replace(/\s+/g," ").trim().slice(0,160)
  return clean||"arquivo"
}

export function sanitizePathSegment(value:string){
  const clean=value.normalize("NFKC").replace(/[^a-zA-Z0-9À-ÿ _.-]/g,"-").replace(/\.{2,}/g,".").trim().slice(0,100)
  return clean||"Arquivos"
}

export function safeContentDisposition(filename:string,mode:"inline"|"attachment"="attachment"){
  const normalized=sanitizeFilename(filename)
  const safe=normalized.replace(/[^\x20-\x7E]/g,"_").replace(/["\\]/g,"_")
  const encoded=encodeURIComponent(normalized).replace(/['()*]/g,char=>"%"+char.charCodeAt(0).toString(16).toUpperCase())
  return mode+'; filename="'+safe+'"; filename*=UTF-8\'\''+encoded
}

async function head(file:File,length=16){
  return new Uint8Array(await file.slice(0,length).arrayBuffer())
}

function starts(bytes:Uint8Array,signature:number[]){
  return signature.every((value,index)=>bytes[index]===value)
}

export async function assertImageFile(file:File,maxBytes:number){
  if(file.size<=0||file.size>maxBytes)throw new UploadValidationError("Imagem vazia ou acima do limite permitido.")
  const bytes=await head(file,16)
  const png=starts(bytes,[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])
  const jpeg=starts(bytes,[0xff,0xd8,0xff])
  const webp=starts(bytes,[0x52,0x49,0x46,0x46])&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50
  const valid=(file.type==="image/png"&&png)||(file.type==="image/jpeg"&&jpeg)||(file.type==="image/webp"&&webp)
  if(!valid)throw new UploadValidationError("O conteúdo do arquivo não corresponde a uma imagem PNG, JPG ou WebP válida.")
}

export async function assertMemorialFile(file:File,maxBytes=25*1024*1024){
  if(file.size<=0||file.size>maxBytes)throw new UploadValidationError("O Memorial deve ter entre 1 byte e 25 MB.")
  const name=file.name.toLowerCase()
  const bytes=await head(file,8)
  if(name.endsWith(".pdf")){
    if(file.type&&file.type!=="application/pdf")throw new UploadValidationError("O tipo informado não corresponde a PDF.")
    if(!starts(bytes,[0x25,0x50,0x44,0x46,0x2d]))throw new UploadValidationError("O arquivo não possui assinatura PDF válida.")
    return "application/pdf"
  }
  if(name.endsWith(".docx")){
    const expected="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if(file.type&&file.type!==expected&&file.type!=="application/octet-stream")throw new UploadValidationError("O tipo informado não corresponde a DOCX.")
    if(!starts(bytes,[0x50,0x4b]))throw new UploadValidationError("O arquivo não possui estrutura DOCX válida.")
    try{
      const zip=await JSZip.loadAsync(await file.arrayBuffer())
      if(!zip.file("[Content_Types].xml")||!zip.file("word/document.xml"))throw new Error("invalid")
    }catch{throw new UploadValidationError("O arquivo DOCX está inválido ou corrompido.")}
    return expected
  }
  throw new UploadValidationError("Envie o Memorial em PDF ou DOCX.")
}

function databookContentLooksActive(bytes:Uint8Array){
  const sample=Buffer.from(bytes.slice(0,8192)).toString("utf8").replace(/^\\uFEFF/,"").trimStart().toLowerCase()
  return /^(?:<!doctype\\s+html|<html\\b|<svg\\b|<script\\b|<\\?php\\b|<%|#!\\s*\\/)/i.test(sample)
}

export function assertDatabookContent(name:string,contentType:string,bytes:Uint8Array){
  if(!bytes.length)throw new UploadValidationError("O arquivo recebido está vazio.")
  const lower=name.toLowerCase(),type=contentType.toLowerCase()
  if(starts(bytes,[0x4d,0x5a])||starts(bytes,[0x7f,0x45,0x4c,0x46])||databookContentLooksActive(bytes))
    throw new UploadValidationError("O conteúdo real do arquivo não é permitido no Databook.")
  if((lower.endsWith(".pdf")||type==="application/pdf")&&!starts(bytes,[0x25,0x50,0x44,0x46,0x2d]))
    throw new UploadValidationError("O conteúdo do arquivo não corresponde a um PDF válido.")
  if((lower.endsWith(".png")||type==="image/png")&&!starts(bytes,[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
    throw new UploadValidationError("O conteúdo do arquivo não corresponde a uma imagem PNG válida.")
  if((/\\.jpe?g$/.test(lower)||type==="image/jpeg")&&!starts(bytes,[0xff,0xd8,0xff]))
    throw new UploadValidationError("O conteúdo do arquivo não corresponde a uma imagem JPEG válida.")
  if((lower.endsWith(".webp")||type==="image/webp")&&!(starts(bytes,[0x52,0x49,0x46,0x46])&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50))
    throw new UploadValidationError("O conteúdo do arquivo não corresponde a uma imagem WebP válida.")
  if((/\\.(?:docx|xlsx|pptx)$/.test(lower)||/officedocument/.test(type))&&!starts(bytes,[0x50,0x4b]))
    throw new UploadValidationError("O conteúdo do arquivo não corresponde a um documento Office válido.")
}

export async function assertDatabookFile(file:File,maxBytes=50*1024*1024){
  if(file.size<=0||file.size>maxBytes)throw new UploadValidationError("O arquivo deve ter no máximo 50 MB.")
  const lower=file.name.toLowerCase()
  const blocked=[".html",".htm",".svg",".js",".mjs",".cjs",".exe",".dll",".bat",".cmd",".ps1",".sh",".php",".jsp",".msi"]
  if(blocked.some(ext=>lower.endsWith(ext)))throw new UploadValidationError("Este tipo de arquivo não é permitido no Databook.")
  const blockedMime=new Set(["text/html","image/svg+xml","application/javascript","text/javascript","application/x-msdownload"])
  if(blockedMime.has(file.type))throw new UploadValidationError("Este tipo de conteúdo não é permitido no Databook.")
  assertDatabookContent(file.name,file.type||"application/octet-stream",await head(file,8192))
}
