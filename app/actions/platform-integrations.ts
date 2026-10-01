"use server"

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { platformIntegrations } from "@/lib/db/schema"
import { recordAudit,requirePlatformManager } from "@/lib/organization"

export type PlatformAiProvider="openai"
export type PlatformActionResult={ok:true;message:string}|{ok:false;message:string}

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

function failure(error:unknown,fallback:string):PlatformActionResult{
  return {ok:false,message:error instanceof Error&&error.message?error.message:fallback}
}

export async function getPlatformAiIntegration(){
  await requirePlatformManager()
  const row=(await db.select({
    provider:platformIntegrations.provider,
    status:platformIntegrations.status,
    testedAt:platformIntegrations.testedAt,
    config:platformIntegrations.config,
    updatedAt:platformIntegrations.updatedAt,
  }).from(platformIntegrations).limit(1))[0]
  if(!row)return null
  return {
    provider:row.provider,
    status:row.status,
    testedAt:row.testedAt?.toISOString()??null,
    updatedAt:row.updatedAt.toISOString(),
    config:row.config as {model?:string},
  }
}

export async function savePlatformAiIntegration(input:{apiKey:string;model:string}):Promise<PlatformActionResult>{
  try{
    const context=await requirePlatformManager()
    const apiKey=input.apiKey.trim()
    const model=input.model.trim()
    if(!model)throw new Error("Informe o modelo da OpenAI que será utilizado")
    const existing=(await db.select().from(platformIntegrations).limit(1))[0]
    if(!apiKey&&!existing)throw new Error("Informe a chave da API da OpenAI")
    if(!apiKey&&existing?.provider!=="openai")throw new Error("Informe uma chave da OpenAI para substituir a integração atual")
    const encryptedKey=apiKey?seal(apiKey):existing!.encryptedKey
    if(existing){
      await db.update(platformIntegrations).set({
        provider:"openai",
        encryptedKey,
        config:{model},
        status:"saved",
        testedAt:null,
        updatedBy:context.user.id,
        updatedAt:new Date(),
      }).where(eq(platformIntegrations.id,existing.id))
    }else{
      await db.insert(platformIntegrations).values({
        id:crypto.randomUUID(),
        provider:"openai",
        encryptedKey,
        config:{model},
        status:"saved",
        updatedBy:context.user.id,
      })
    }
    await recordAudit({organizationId:"platform",actorId:context.user.id,action:"platform_ai.configured",entityType:"platform_integration",entityId:existing?.id??"openai",metadata:{provider:"openai",model}})
    revalidatePath("/gerenciador")
    return {ok:true,message:"Configuração da OpenAI salva. Teste a conexão antes de usar o pré-cadastro."}
  }catch(error){return failure(error,"Não foi possível salvar a integração")}
}

export async function testPlatformAiIntegration():Promise<PlatformActionResult>{
  try{
    const context=await requirePlatformManager()
    const row=(await db.select().from(platformIntegrations).limit(1))[0]
    if(!row)throw new Error("Configure a OpenAI antes de testar")
    if(row.provider!=="openai")throw new Error("A integração atual não é OpenAI. Salve novamente a configuração.")
    const config=(row.config??{}) as {model?:string}
    const model=config.model?.trim()
    if(!model)throw new Error("Modelo da OpenAI não configurado")
    const key=unseal(row.encryptedKey)
    const response=await fetch("https://api.openai.com/v1/models/"+encodeURIComponent(model),{
      headers:{Authorization:"Bearer "+key},
      cache:"no-store",
      signal:AbortSignal.timeout(10000),
    })
    if(!response.ok){
      const payload=await response.json().catch(()=>({})) as {error?:{message?:string}}
      await db.update(platformIntegrations).set({status:"error",testedAt:new Date(),updatedAt:new Date()}).where(eq(platformIntegrations.id,row.id))
      await recordAudit({organizationId:"platform",actorId:context.user.id,action:"platform_ai.test_failed",entityType:"platform_integration",entityId:row.id,metadata:{provider:"openai",model,status:response.status}})
      revalidatePath("/gerenciador")
      return {ok:false,message:payload.error?.message||`A OpenAI respondeu HTTP ${response.status}. Verifique a chave e o modelo.`}
    }
    await db.update(platformIntegrations).set({status:"verified",testedAt:new Date(),updatedAt:new Date()}).where(eq(platformIntegrations.id,row.id))
    await recordAudit({organizationId:"platform",actorId:context.user.id,action:"platform_ai.verified",entityType:"platform_integration",entityId:row.id,metadata:{provider:"openai",model}})
    revalidatePath("/gerenciador")
    return {ok:true,message:`Conexão validada. A chave possui acesso ao modelo ${model}.`}
  }catch(error){return failure(error,"Não foi possível conectar à OpenAI")}
}

export async function removePlatformAiIntegration():Promise<PlatformActionResult>{
  try{
    const context=await requirePlatformManager()
    const rows=await db.select({id:platformIntegrations.id,provider:platformIntegrations.provider,config:platformIntegrations.config}).from(platformIntegrations)
    await db.delete(platformIntegrations)
    for(const row of rows)await recordAudit({organizationId:"platform",actorId:context.user.id,action:"platform_ai.removed",entityType:"platform_integration",entityId:row.id,metadata:{provider:row.provider,model:(row.config as {model?:string})?.model??null}})
    revalidatePath("/gerenciador")
    return {ok:true,message:"Integração OpenAI removida."}
  }catch(error){return failure(error,"Não foi possível remover a integração")}
}
