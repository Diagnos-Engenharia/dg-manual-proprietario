"use server"

import { createHash,randomBytes } from "node:crypto"
import { and,desc,eq,isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { auditLogs,organizationApiKeys } from "@/lib/db/schema"
import { recordAudit,requireCompanyRole } from "@/lib/organization"

const DEFAULT_SCOPES=["manuals:read","developments:read"]

function hashToken(token:string){
  return createHash("sha256").update(token).digest("hex")
}

export async function listPublicApiKeys(){
  const context=await requireCompanyRole(["admin"])
  const rows=await db.select({
    id:organizationApiKeys.id,
    name:organizationApiKeys.name,
    keyPrefix:organizationApiKeys.keyPrefix,
    scopes:organizationApiKeys.scopes,
    lastUsedAt:organizationApiKeys.lastUsedAt,
    expiresAt:organizationApiKeys.expiresAt,
    createdAt:organizationApiKeys.createdAt,
  }).from(organizationApiKeys)
    .where(and(eq(organizationApiKeys.organizationId,context.organization.id),isNull(organizationApiKeys.revokedAt)))
    .orderBy(desc(organizationApiKeys.createdAt))
  return rows.map(row=>({
    id:row.id,
    name:row.name,
    keyPrefix:row.keyPrefix,
    scopes:(row.scopes??[]) as string[],
    lastUsedAt:row.lastUsedAt?.toISOString()??null,
    expiresAt:row.expiresAt?.toISOString()??null,
    createdAt:row.createdAt.toISOString(),
  }))
}

export async function createPublicApiKey(input:{name?:string}={}){
  const context=await requireCompanyRole(["admin"])
  const name=(input.name??"Portal do Cliente").trim().slice(0,80)||"Portal do Cliente"
  const token="dg_live_"+randomBytes(32).toString("base64url")
  const keyPrefix=token.slice(0,18)
  const id=crypto.randomUUID()
  await db.transaction(async tx=>{
    await tx.insert(organizationApiKeys).values({
      id,
      organizationId:context.organization.id,
      name,
      keyPrefix,
      keyHash:hashToken(token),
      scopes:DEFAULT_SCOPES,
      createdBy:context.user.id,
    })
    await tx.insert(auditLogs).values({
      id:crypto.randomUUID(),
      organizationId:context.organization.id,
      actorId:context.user.id,
      action:"public_api.key_created",
      entityType:"organization_api_key",
      entityId:id,
      metadata:{name,scopes:DEFAULT_SCOPES,keyPrefix},
    })
  })
  return {ok:true,token,id,name,keyPrefix,scopes:DEFAULT_SCOPES}
}

export async function revokePublicApiKey(id:string){
  const context=await requireCompanyRole(["admin"])
  const rows=await db.select({id:organizationApiKeys.id,name:organizationApiKeys.name,keyPrefix:organizationApiKeys.keyPrefix})
    .from(organizationApiKeys)
    .where(and(eq(organizationApiKeys.id,id),eq(organizationApiKeys.organizationId,context.organization.id),isNull(organizationApiKeys.revokedAt)))
    .limit(1)
  if(!rows[0])throw new Error("Chave não encontrada ou já revogada.")
  await db.transaction(async tx=>{
    await tx.update(organizationApiKeys).set({revokedAt:new Date()}).where(eq(organizationApiKeys.id,id))
    await tx.insert(auditLogs).values({
      id:crypto.randomUUID(),
      organizationId:context.organization.id,
      actorId:context.user.id,
      action:"public_api.key_revoked",
      entityType:"organization_api_key",
      entityId:id,
      metadata:{name:rows[0].name,keyPrefix:rows[0].keyPrefix},
    })
  })
  return {ok:true}
}
