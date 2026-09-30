'use server'

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  developmentAssignments,
  developmentContentValidations,
  developmentReviews,
  developments,
  members,
  organizationNotifications,
} from "@/lib/db/schema"
import { canEditContent,canValidateContent,recordAudit,requireDevelopmentAccess,requireDevelopmentRole } from "@/lib/organization"

export type ValidationStatus="rascunho"|"em_elaboracao"|"aguardando_validacao"|"ajustes_solicitados"|"reenviado"|"aprovado"|"publicado"|"arquivado"
export type ContentValidationStatus="rascunho"|"aguardando_validacao"|"aprovado"|"reprovado"
export type ContentSection="sistemas"|"manutencao"

async function transition(id:string,next:ValidationStatus,comment?:string){
  const context=await requireDevelopmentAccess(id)
  const role=context.developmentRole
  if(["rascunho","em_elaboracao","aguardando_validacao","reenviado","arquivado"].includes(next)&&!canEditContent(role))throw new Error("Somente administradores e editores podem alterar o conteúdo")
  if(["ajustes_solicitados","aprovado","publicado"].includes(next)&&!canValidateContent(role))throw new Error("Somente administradores e validadores podem validar")
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
  }).from(developmentContentValidations).where(and(eq(developmentContentValidations.developmentId,developmentId),eq(developmentContentValidations.organizationId,context.organization.id)))
  return rows.map(row=>({...row,status:row.status as ContentValidationStatus,section:row.section as ContentSection,updatedAt:row.updatedAt.toISOString()}))
}

async function validatorsForDevelopment(developmentId:string,organizationId:string){
  const rows=await db.select({userId:members.userId}).from(developmentAssignments)
    .innerJoin(members,eq(developmentAssignments.memberId,members.id))
    .where(and(eq(developmentAssignments.developmentId,developmentId),eq(developmentAssignments.organizationId,organizationId),eq(developmentAssignments.role,"validator"),eq(members.status,"active")))
  return Array.from(new Set(rows.map(row=>row.userId)))
}

async function getContentValidation(developmentId:string,organizationId:string,contextKey:string,section:ContentSection){
  return (await db.select().from(developmentContentValidations).where(and(
    eq(developmentContentValidations.developmentId,developmentId),
    eq(developmentContentValidations.organizationId,organizationId),
    eq(developmentContentValidations.contextKey,contextKey),
    eq(developmentContentValidations.section,section),
  )).limit(1))[0]
}

export async function submitSystemItemForValidation(input:{developmentId:string;contextKey:string;section:ContentSection;label:string}){
  const context=await requireDevelopmentRole(input.developmentId,["admin","admin_empreendimento","editor"])
  const existing=await getContentValidation(input.developmentId,context.organization.id,input.contextKey,input.section)
  const now=new Date()
  if(existing)await db.update(developmentContentValidations).set({status:"aguardando_validacao",lastEditorId:context.user.id,validatorId:null,comment:null,updatedAt:now}).where(eq(developmentContentValidations.id,existing.id))
  else await db.insert(developmentContentValidations).values({id:crypto.randomUUID(),developmentId:input.developmentId,organizationId:context.organization.id,contextKey:input.contextKey,section:input.section,status:"aguardando_validacao",lastEditorId:context.user.id,updatedAt:now})
  const validators=await validatorsForDevelopment(input.developmentId,context.organization.id)
  const sectionLabel=input.section==="sistemas"?"Descrição técnica":"Manutenção preventiva"
  if(validators.length)await db.insert(organizationNotifications).values(validators.map(userId=>({id:crypto.randomUUID(),organizationId:context.organization.id,userId,type:"validation_requested",title:"1 item enviado para validação",body:input.label+" · "+sectionLabel})))
  await recordAudit({organizationId:context.organization.id,actorId:context.user.id,action:"content.sent_for_validation",entityType:"development",entityId:input.developmentId,metadata:{path:["validacao",input.contextKey,input.section],before:existing?.status??"rascunho",after:"aguardando_validacao",label:input.label}})
  revalidatePath("/empreendimentos/"+input.developmentId)
  return {status:"aguardando_validacao" as ContentValidationStatus}
}

async function decideContentValidation(input:{developmentId:string;contextKey:string;section:ContentSection;label:string;decision:"aprovado"|"reprovado";comment?:string}){
  const context=await requireDevelopmentRole(input.developmentId,["admin","admin_empreendimento","validator"])
  const existing=await getContentValidation(input.developmentId,context.organization.id,input.contextKey,input.section)
  if(!existing||existing.status!=="aguardando_validacao")throw new Error("Este conteúdo não está aguardando validação")
  if(input.decision==="aprovado"&&existing.lastEditorId===context.user.id)throw new Error("Quem enviou o conteúdo não pode aprovar a própria edição. Solicite a validação de outro usuário.")
  if(input.decision==="reprovado"&&!input.comment?.trim())throw new Error("Informe o motivo da reprovação")
  await db.update(developmentContentValidations).set({status:input.decision,validatorId:context.user.id,comment:input.comment?.trim()||null,updatedAt:new Date()}).where(eq(developmentContentValidations.id,existing.id))
  if(existing.lastEditorId)await db.insert(organizationNotifications).values({id:crypto.randomUUID(),organizationId:context.organization.id,userId:existing.lastEditorId,type:input.decision==="aprovado"?"validation_approved":"validation_rejected",title:input.decision==="aprovado"?"Item validado":"Ajustes solicitados",body:input.label+" · "+(input.section==="sistemas"?"Descrição técnica":"Manutenção preventiva")+(input.comment?" · "+input.comment:"")})
  await recordAudit({organizationId:context.organization.id,actorId:context.user.id,action:input.decision==="aprovado"?"content.approved":"content.rejected",entityType:"development",entityId:input.developmentId,metadata:{path:["validacao",input.contextKey,input.section],before:existing.status,after:input.decision,label:input.label,comment:input.comment??null}})
  revalidatePath("/empreendimentos/"+input.developmentId)
  return {status:input.decision as ContentValidationStatus}
}

export async function validateSystemItem(input:{developmentId:string;contextKey:string;section:ContentSection;label:string}){return decideContentValidation({...input,decision:"aprovado"})}
export async function rejectSystemItem(input:{developmentId:string;contextKey:string;section:ContentSection;label:string;comment:string}){return decideContentValidation({...input,decision:"reprovado"})}


export async function markSystemItemEdited(input:{developmentId:string;contextKey:string;section:ContentSection}){
  const context=await requireDevelopmentRole(input.developmentId,["admin","admin_empreendimento","editor"])
  const existing=await getContentValidation(input.developmentId,context.organization.id,input.contextKey,input.section)
  if(!existing||existing.status==="rascunho")return {status:"rascunho" as ContentValidationStatus}
  await db.update(developmentContentValidations).set({status:"rascunho",validatorId:null,comment:null,lastEditorId:context.user.id,updatedAt:new Date()}).where(eq(developmentContentValidations.id,existing.id))
  return {status:"rascunho" as ContentValidationStatus}
}
