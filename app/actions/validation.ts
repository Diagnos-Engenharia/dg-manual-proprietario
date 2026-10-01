'use server'

import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  developmentContentValidations,
  developmentReviews,
  developments,
} from "@/lib/db/schema"
import { canEditContent,canValidateContent,recordAudit,requireDevelopmentAccess } from "@/lib/organization"
import { mutateTechnicalSystem, TechnicalContentError } from "@/lib/manual-document/technical-service"
import type { ManualType } from "@/lib/mock-data"

export type ValidationStatus="rascunho"|"em_elaboracao"|"aguardando_validacao"|"ajustes_solicitados"|"reenviado"|"aprovado"|"publicado"|"arquivado"
export type ContentValidationStatus="rascunho"|"aguardando_validacao"|"aprovado"|"reprovado"
export type ContentSection="sistemas"|"manutencao"

async function transition(id:string,next:ValidationStatus,comment?:string){
  const context=await requireDevelopmentAccess(id)
  const role=context.developmentRole
  if(["rascunho","em_elaboracao","aguardando_validacao","reenviado","arquivado"].includes(next)&&!canEditContent(role))throw new Error("Somente Administradores e Construtores podem alterar o conteúdo")
  if(["ajustes_solicitados","aprovado","publicado"].includes(next)&&!canValidateContent(role))throw new Error("Somente Administradores podem validar")
  if(next==="aprovado"&&context.development.lastEditorId===context.user.id)throw new Error("Quem editou por último não pode aprovar o próprio conteúdo")
  const version=context.development.version
  await db.update(developments).set({workflowStatus:next,...(next==="aprovado"?{approvedVersion:version,approvedBy:context.user.id,approvedAt:new Date()}:{}),updatedAt:new Date()}).where(and(eq(developments.id,id),eq(developments.organizationId,context.organization.id)))
  await db.insert(developmentReviews).values({id:crypto.randomUUID(),developmentId:id,organizationId:context.organization.id,version,status:next,editorId:context.development.lastEditorId??context.user.id,validatorId:["aprovado","publicado"].includes(next)?context.user.id:null,comment:comment?.trim()||null})
  await recordAudit({organizationId:context.organization.id,actorId:context.user.id,action:"development."+next,entityType:"development",entityId:id,metadata:{version,comment}})
  revalidatePath("/empreendimentos/"+id)
}

export async function submitDevelopmentForValidation(id:string){return transition(id,"aguardando_validacao")}
export async function requestDevelopmentAdjustments(id:string,comment:string){if(!comment.trim())throw new Error("Informe os ajustes necessários");return transition(id,"ajustes_solicitados",comment)}
export async function resubmitDevelopment(id:string){return transition(id,"reenviado")}
export async function approveDevelopment(id:string){return transition(id,"aprovado")}
export async function publishDevelopment(id:string){return transition(id,"publicado")}
export async function archiveDevelopment(id:string){return transition(id,"arquivado")}

export async function listSystemValidationStates(developmentId:string){
  const context=await requireDevelopmentAccess(developmentId)
  const rows=await db.select({
    contextKey:developmentContentValidations.contextKey,
    section:developmentContentValidations.section,
    status:developmentContentValidations.status,
    comment:developmentContentValidations.comment,
    updatedAt:developmentContentValidations.updatedAt,
  }).from(developmentContentValidations).where(and(eq(developmentContentValidations.developmentId,developmentId),eq(developmentContentValidations.organizationId,context.organization.id),inArray(developmentContentValidations.section,["sistemas","manutencao"])))
  return rows.map(row=>({...row,status:row.status as ContentValidationStatus,section:row.section as ContentSection,updatedAt:row.updatedAt.toISOString()}))
}

function manualForContext(contextKey:string):ManualType{return typeof contextKey==="string"&&contextKey.endsWith("::comum")?"sindico":"proprietario"}

export async function submitSystemItemForValidation(input:{developmentId:string;contextKey:string;section:ContentSection;label:string}){
  const system=await mutateTechnicalSystem({...input,manualType:manualForContext(input.contextKey),action:"submit"},false)
  revalidatePath("/empreendimentos/"+input.developmentId)
  return {status:input.section==="sistemas"?system.descriptionStatus:system.maintenanceStatus}
}

async function decideContentValidation(input:{developmentId:string;contextKey:string;section:ContentSection;label:string;decision:"aprovado"|"reprovado";comment?:string}){
  try{
    const system=await mutateTechnicalSystem({...input,manualType:manualForContext(input.contextKey),action:input.decision==="aprovado"?"approve":"reject"},false)
    revalidatePath("/empreendimentos/"+input.developmentId)
    return {status:input.section==="sistemas"?system.descriptionStatus:system.maintenanceStatus}
  }catch(error){
    if(error instanceof TechnicalContentError&&error.status===403&&error.message.startsWith("Quem enviou"))return {error:error.message}
    throw error
  }
}

export async function validateSystemItem(input:{developmentId:string;contextKey:string;section:ContentSection;label:string}){return decideContentValidation({...input,decision:"aprovado"})}
export async function rejectSystemItem(input:{developmentId:string;contextKey:string;section:ContentSection;label:string;comment:string}){return decideContentValidation({...input,decision:"reprovado"})}


export async function markSystemItemEdited(input:{developmentId:string;contextKey:string;section:ContentSection}){
  const system=await mutateTechnicalSystem({...input,manualType:manualForContext(input.contextKey),action:"mark-edited"},false)
  revalidatePath("/empreendimentos/"+input.developmentId)
  return {status:input.section==="sistemas"?system.descriptionStatus:system.maintenanceStatus}
}
