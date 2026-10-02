import { createHash } from "node:crypto"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { organizationApiKeys } from "@/lib/db/schema"
import { consumeRateLimit,RateLimitError } from "@/lib/security/rate-limit"

export type PublicApiScope="manuals:read"|"developments:read"

const BASE_CORS_HEADERS={
  "Access-Control-Allow-Methods":"GET, OPTIONS",
  "Access-Control-Allow-Headers":"Authorization, Content-Type",
  "Access-Control-Max-Age":"86400",
}

export function publicCorsHeaders(request?:Request){
  const headers:Record<string,string>={...BASE_CORS_HEADERS}
  const origin=request?.headers.get("origin")?.trim()
  if(!origin)return headers
  const allowed=(process.env.PUBLIC_API_ALLOWED_ORIGINS??"").split(",").map(value=>value.trim()).filter(Boolean)
  if(allowed.includes(origin)){
    headers["Access-Control-Allow-Origin"]=origin
    headers["Vary"]="Origin"
  }
  return headers
}

export class PublicApiError extends Error{
  constructor(public status:number,public code:string,message:string){
    super(message)
  }
}

function hashToken(token:string){
  return createHash("sha256").update(token).digest("hex")
}

export async function requirePublicApiScope(request:Request,scope:PublicApiScope){
  const realIp=request.headers.get("x-real-ip")?.trim()
  const forwarded=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const ip=realIp||forwarded||"unknown"
  await consumeRateLimit("public-api-ip:"+ip,{max:180,windowSeconds:60})
  const authorization=request.headers.get("authorization")?.trim()??""
  if(!authorization.toLowerCase().startsWith("bearer "))throw new PublicApiError(401,"missing_token","Envie Authorization: Bearer <chave>.")
  const token=authorization.slice(7).trim()
  if(!token.startsWith("dg_live_"))throw new PublicApiError(401,"invalid_token","Chave de API inválida.")

  const rows=await db.select().from(organizationApiKeys).where(eq(organizationApiKeys.keyHash,hashToken(token))).limit(1)
  const apiKey=rows[0]
  if(!apiKey||apiKey.revokedAt)throw new PublicApiError(401,"invalid_token","Chave de API inválida ou revogada.")
  await consumeRateLimit("public-api-key:"+apiKey.id,{max:120,windowSeconds:60})
  if(apiKey.expiresAt&&apiKey.expiresAt.getTime()<=Date.now())throw new PublicApiError(401,"expired_token","Chave de API expirada.")
  const scopes=(apiKey.scopes??[]) as string[]
  if(!scopes.includes(scope))throw new PublicApiError(403,"insufficient_scope","A chave não possui permissão para este recurso.")

  await db.update(organizationApiKeys).set({lastUsedAt:new Date()}).where(eq(organizationApiKeys.id,apiKey.id))
  return {organizationId:apiKey.organizationId,keyId:apiKey.id,scopes}
}

export function publicJson(body:unknown,status=200,request?:Request){
  return NextResponse.json(body,{status,headers:{...publicCorsHeaders(request),"Cache-Control":"no-store"}})
}

export function publicOptions(request?:Request){
  return new NextResponse(null,{status:204,headers:publicCorsHeaders(request)})
}

export function publicApiFailure(error:unknown,request?:Request){
  if(error instanceof RateLimitError)return NextResponse.json({error:{code:"rate_limited",message:error.message}},{status:429,headers:{...publicCorsHeaders(request),"Cache-Control":"no-store","Retry-After":String(error.retryAfterSeconds)}})
  if(error instanceof PublicApiError)return publicJson({error:{code:error.code,message:error.message}},error.status,request)
  console.error("Public API error",error)
  return publicJson({error:{code:"internal_error",message:"Não foi possível processar a solicitação."}},500,request)
}

export function parseLimit(value:string|null,defaultValue=50,maxValue=100){
  if(!value)return defaultValue
  const parsed=Number.parseInt(value,10)
  if(!Number.isFinite(parsed)||parsed<1)return defaultValue
  return Math.min(parsed,maxValue)
}

export function parseSince(value:string|null){
  if(!value)return null
  const date=new Date(value)
  if(Number.isNaN(date.getTime()))throw new PublicApiError(400,"invalid_since","O parâmetro since deve ser uma data ISO 8601 válida.")
  return date
}
