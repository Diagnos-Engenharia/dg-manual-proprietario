"use server"

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { platformIntegrations } from "@/lib/db/schema"
import { requirePlatformManager } from "@/lib/organization"

const providers=["openai","google_ai"] as const
export type PlatformAiProvider=typeof providers[number]

function assertProvider(value:string): asserts value is PlatformAiProvider{
  if(!providers.includes(value as PlatformAiProvider))throw new Error("Provedor de IA inválido")
}

function encryptionKey(){
  const secret=process.env.INTEGRATION_ENCRYPTION_KEY||process.env.BETTER_AUTH_SECRET
  if(!secret||secret.length<24)throw new Error("Configure INTEGRATION_ENCRYPTION_KEY no servidor.")
  return scryptSync(secret,"dg-manual-platform-integrations-v1",32)
}

function seal(secret:string){
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv)
  const output=Buffer.concat([cipher.update(secret,"utf8"),cipher.final()])
  return [iv,cipher.getAuthTag(),output].map(buffer=>buffer.toString("base64url")).join(".")
}

function unseal(payload:string){
  const [iv,tag,body]=payload.split(".").map(value=>Buffer.from(value,"base64url"))
  if(!iv||!tag||!body)throw new Error("Credencial inválida")
  const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body),decipher.final()]).toString("utf8")
}

export async function getPlatformAiIntegration(){
  await requirePlatformManager()
  const rows=await db.select({provider:platformIntegrations.provider,status:platformIntegrations.status,testedAt:platformIntegrations.testedAt,config:platformIntegrations.config,updatedAt:platformIntegrations.updatedAt})
    .from(platformIntegrations).limit(1)
  const row=rows[0]
  return row?{provider:row.provider as PlatformAiProvider,status:row.status,testedAt:row.testedAt?.toISOString()??null,updatedAt:row.updatedAt.toISOString(),config:row.config as {model?:string}}:null
}

export async function savePlatformAiIntegration(input:{provider:PlatformAiProvider;apiKey:string;model:string}){
  const context=await requirePlatformManager()
  assertProvider(input.provider)
  const apiKey=input.apiKey.trim()
  const model=input.model.trim()
  if(!model)throw new Error("Informe o modelo que será utilizado")
  const existing=await db.select().from(platformIntegrations).limit(1)
  if(!apiKey&&!existing[0])throw new Error("Informe a chave da API")
  const encryptedKey=apiKey?seal(apiKey):existing[0].encryptedKey
  if(existing[0]){
    await db.update(platformIntegrations).set({provider:input.provider,encryptedKey,config:{model},status:"saved",testedAt:null,updatedBy:context.user.id,updatedAt:new Date()}).where(eq(platformIntegrations.id,existing[0].id))
  }else{
    await db.insert(platformIntegrations).values({id:crypto.randomUUID(),provider:input.provider,encryptedKey,config:{model},status:"saved",updatedBy:context.user.id})
  }
  revalidatePath("/gerenciador")
  return {ok:true}
}

export async function testPlatformAiIntegration(){
  await requirePlatformManager()
  const rows=await db.select().from(platformIntegrations).limit(1)
  const row=rows[0]
  if(!row)throw new Error("Configure a API antes de testar")
  assertProvider(row.provider)
  const key=unseal(row.encryptedKey)
  try{
    const target=row.provider==="openai"?"https://api.openai.com/v1/models":"https://generativelanguage.googleapis.com/v1beta/models"
    const headers=new Headers()
    if(row.provider==="openai")headers.set("Authorization","Bearer "+key)
    else headers.set("x-goog-api-key",key)
    const response=await fetch(target,{headers,cache:"no-store",signal:AbortSignal.timeout(8000)})
    const ok=response.ok
    await db.update(platformIntegrations).set({status:ok?"verified":"error",testedAt:new Date(),updatedAt:new Date()}).where(eq(platformIntegrations.id,row.id))
    revalidatePath("/gerenciador")
    return {ok,message:ok?"Conexão validada.":"A API respondeu HTTP "+response.status+"."}
  }catch{
    await db.update(platformIntegrations).set({status:"error",testedAt:new Date(),updatedAt:new Date()}).where(eq(platformIntegrations.id,row.id))
    revalidatePath("/gerenciador")
    return {ok:false,message:"Não foi possível conectar ao provedor."}
  }
}

export async function removePlatformAiIntegration(){
  await requirePlatformManager()
  await db.delete(platformIntegrations)
  revalidatePath("/gerenciador")
}
