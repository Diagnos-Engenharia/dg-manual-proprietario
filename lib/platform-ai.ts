import { createDecipheriv,scryptSync } from "node:crypto"
import { db } from "@/lib/db"
import { platformIntegrations } from "@/lib/db/schema"

export type PlatformAiRuntime={provider:"openai";model:string;apiKey:string}

function encryptionKey(){
  const secret=process.env.INTEGRATION_ENCRYPTION_KEY||process.env.BETTER_AUTH_SECRET
  if(!secret||secret.length<24)throw new Error("Configure INTEGRATION_ENCRYPTION_KEY no servidor.")
  return scryptSync(secret,"dg-manual-platform-integrations-v1",32)
}

function unseal(payload:string){
  const parts=payload.split(".").map(value=>Buffer.from(value,"base64url"))
  if(parts.length!==3)throw new Error("Credencial de IA inválida")
  const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),parts[0])
  decipher.setAuthTag(parts[1])
  return Buffer.concat([decipher.update(parts[2]),decipher.final()]).toString("utf8")
}

export async function getPlatformAiRuntime():Promise<PlatformAiRuntime|null>{
  const row=(await db.select().from(platformIntegrations).limit(1))[0]
  if(!row)return null
  if(row.provider!=="openai")throw new Error("A integração de IA precisa ser configurada novamente como OpenAI")
  if(row.status!=="verified")throw new Error("A integração OpenAI precisa ser testada e validada antes do processamento")
  const config=(row.config??{}) as {model?:string}
  if(!config.model?.trim())throw new Error("Modelo de IA não configurado")
  return {provider:"openai",model:config.model.trim(),apiKey:unseal(row.encryptedKey)}
}
