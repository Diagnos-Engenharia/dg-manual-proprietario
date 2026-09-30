"use server"
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { organizationIntegrations } from "@/lib/db/schema"
import { recordAudit, requireCompanyRole } from "@/lib/organization"

const providers = ["openai","google_ai","webhook","custom"] as const
export type Provider = typeof providers[number]
function requireProvider(provider:string): asserts provider is Provider {
  if(!providers.includes(provider as Provider))throw new Error("Integração não reconhecida")
}
function encryptionKey(){
  const secret=process.env.INTEGRATION_ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET
  if(!secret || secret.length<24)throw new Error("Configure INTEGRATION_ENCRYPTION_KEY no servidor.")
  return scryptSync(secret,"dg-manual-integration-credentials-v1",32)
}
function seal(secret:string){
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv)
  const output=Buffer.concat([cipher.update(secret,"utf8"),cipher.final()])
  return [iv,cipher.getAuthTag(),output].map(b=>b.toString("base64url")).join(".")
}
function unseal(payload:string){
  const parts=payload.split(".").map(s=>Buffer.from(s,"base64url"))
  if(parts.length!==3)throw new Error("Credencial inválida")
  const dec=createDecipheriv("aes-256-gcm",encryptionKey(),parts[0]);dec.setAuthTag(parts[1])
  return Buffer.concat([dec.update(parts[2]),dec.final()]).toString("utf8")
}
export async function listIntegrationStatus(){
  const context=await requireCompanyRole(["admin"])
  const rows=await db.select({provider:organizationIntegrations.provider,status:organizationIntegrations.status,testedAt:organizationIntegrations.testedAt,config:organizationIntegrations.config})
    .from(organizationIntegrations).where(eq(organizationIntegrations.organizationId,context.organization.id))
  return rows.map(row=>({provider:row.provider,status:row.status,testedAt:row.testedAt?.toISOString()??null,configured:true,config:row.config as {endpoint?:string}}))
}
export async function saveIntegration(input:{provider:Provider;apiKey:string;endpoint?:string}){
  const context=await requireCompanyRole(["admin"]);requireProvider(input.provider)
  const endpoint=(input.endpoint??"").trim()
  if(endpoint && (!/^https:\/\//.test(endpoint)||endpoint.length>500))throw new Error("Informe uma URL HTTPS válida de até 500 caracteres")
  const existing=await db.select().from(organizationIntegrations).where(and(eq(organizationIntegrations.organizationId,context.organization.id),eq(organizationIntegrations.provider,input.provider))).limit(1)
  const apiKey=input.apiKey.trim()
  if(!apiKey&&!existing[0])throw new Error("Informe a chave de integração")
  if(apiKey.length>8192)throw new Error("Chave excede o tamanho permitido")
  const encryptedKey=apiKey?seal(apiKey):existing[0].encryptedKey
  if(existing[0])await db.update(organizationIntegrations).set({encryptedKey,config:{endpoint},status:"saved",testedAt:null,updatedAt:new Date()}).where(eq(organizationIntegrations.id,existing[0].id))
  else await db.insert(organizationIntegrations).values({id:crypto.randomUUID(),organizationId:context.organization.id,provider:input.provider,encryptedKey,config:{endpoint},status:"saved"})
  await recordAudit({organizationId:context.organization.id,actorId:context.user.id,action:"integration.configured",entityType:"organization",entityId:context.organization.id,metadata:{provider:input.provider}})
  return {ok:true}
}
export async function deleteIntegration(provider:Provider){
  const context=await requireCompanyRole(["admin"]);requireProvider(provider)
  await db.delete(organizationIntegrations).where(and(eq(organizationIntegrations.organizationId,context.organization.id),eq(organizationIntegrations.provider,provider)))
  await recordAudit({organizationId:context.organization.id,actorId:context.user.id,action:"integration.deleted",entityType:"organization",entityId:context.organization.id,metadata:{provider}})
  return {ok:true}
}
export async function testIntegration(provider:Provider){
  const context=await requireCompanyRole(["admin"]);requireProvider(provider)
  if(!["openai","google_ai"].includes(provider))throw new Error("O teste automático está disponível somente para OpenAI e Google AI. As demais credenciais ficam armazenadas até a implementação do conector.")
  const row=await db.select().from(organizationIntegrations).where(and(eq(organizationIntegrations.organizationId,context.organization.id),eq(organizationIntegrations.provider,provider))).limit(1)
  if(!row[0])throw new Error("Configure a integração antes de testar")
  const key=unseal(row[0].encryptedKey)
  try {
    const target=provider==="openai"?"https://api.openai.com/v1/models":"https://generativelanguage.googleapis.com/v1beta/models"
    const headers=provider==="openai"?{Authorization:"Bearer "+key}:{"x-goog-api-key":key}
    const response=await fetch(target,{method:"GET",headers,signal:AbortSignal.timeout(8000),cache:"no-store"})
    const verified=response.ok
    await db.update(organizationIntegrations).set({status:verified?"verified":"error",testedAt:new Date(),updatedAt:new Date()}).where(eq(organizationIntegrations.id,row[0].id))
    return {ok:verified,message:verified?"Conexão validada.":response.status===401||response.status===403?"Chave inválida ou sem autorização.":"Não foi possível validar a conexão (HTTP "+response.status+")."}
  }catch {return {ok:false,message:"Não foi possível conectar ao provedor. Verifique a rede e tente novamente."}}
}
