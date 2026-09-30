'use server'

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { developmentReviews, developments } from "@/lib/db/schema"
import { canEditContent, canValidateContent, recordAudit, requireDevelopmentAccess, requireCompanyRole } from "@/lib/organization"

export type ValidationStatus = "rascunho" | "em_elaboracao" | "aguardando_validacao" | "ajustes_solicitados" | "reenviado" | "aprovado" | "publicado" | "arquivado"

async function transition(id: string, next: ValidationStatus, comment?: string) {
  const context = await requireDevelopmentAccess(id)
  const role = context.developmentRole
  if (["rascunho", "em_elaboracao", "ajustes_solicitados", "reenviado"].includes(next) && !canEditContent(role)) throw new Error("Somente administradores e editores podem alterar o conteúdo")
  if (["aguardando_validacao", "aprovado", "publicado"].includes(next) && !canValidateContent(role)) throw new Error("Somente administradores e validadores podem validar")
  if (next === "aprovado" && context.development.lastEditorId === context.user.id) throw new Error("Quem editou por último não pode aprovar o próprio conteúdo")
  const version = context.development.version
  await db.update(developments).set({ workflowStatus: next, ...(next === "aprovado" ? { approvedVersion: version, approvedBy: context.user.id, approvedAt: new Date() } : {}), updatedAt: new Date() }).where(and(eq(developments.id, id), eq(developments.organizationId, context.organization.id)))
  await db.insert(developmentReviews).values({ id: crypto.randomUUID(), developmentId: id, organizationId: context.organization.id, version, status: next, editorId: context.development.lastEditorId ?? context.user.id, validatorId: ["aprovado", "publicado"].includes(next) ? context.user.id : null, comment: comment?.trim() || null })
  await recordAudit({ organizationId: context.organization.id, actorId: context.user.id, action: `development.${next}`, entityType: "development", entityId: id, metadata: { version, comment } })
  revalidatePath(`/empreendimentos/${id}`)
}

export async function submitDevelopmentForValidation(id: string) { return transition(id, "aguardando_validacao") }
export async function requestDevelopmentAdjustments(id: string, comment: string) { if (!comment.trim()) throw new Error("Informe os ajustes necessários"); return transition(id, "ajustes_solicitados", comment) }
export async function resubmitDevelopment(id: string) { return transition(id, "reenviado") }
export async function approveDevelopment(id: string) { return transition(id, "aprovado") }
export async function publishDevelopment(id: string) { return transition(id, "publicado") }
export async function archiveDevelopment(id: string) { return transition(id, "arquivado") }
