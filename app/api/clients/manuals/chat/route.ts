import { NextResponse } from "next/server"
import { ClientAccessError, requireClientManual } from "@/lib/clients"
import { getPlatformAiRuntime } from "@/lib/platform-ai"
import { answerPublishedManual, MANUAL_CHAT_UNAVAILABLE, publishedManualCorpus } from "@/lib/manual-chat"
import { recordAudit } from "@/lib/organization"
import { cleanText, InputValidationError } from "@/lib/security/input"
import { consumeRateLimit, RateLimitError } from "@/lib/security/rate-limit"

export const runtime = "nodejs"
export const maxDuration = 30
const response = (body: unknown, status = 200, extra: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", ...extra } })

export async function POST(request: Request) {
  try {
    // The browser can only call this route from this application's origin.
    const origin = request.headers.get("origin")
    if (origin && origin !== new URL(request.url).origin) return response({ error: "Origem não autorizada." }, 403)
    if (Number(request.headers.get("content-length")) > 8000) return response({ error: "Pergunta muito longa." }, 400)
    const raw = await request.text()
    if (raw.length > 8000) return response({ error: "Pergunta muito longa." }, 400)
    let body: Record<string, unknown>
    try { body = JSON.parse(raw) } catch { return response({ error: "Pergunta inválida." }, 400) }
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.accessId !== "string" || typeof body.manualId !== "string" || typeof body.question !== "string") return response({ error: "Informe o manual e a pergunta." }, 400)
    const question = cleanText(body.question, "Pergunta", 1000, 3)
    const context = await requireClientManual({ accessId: body.accessId, manualId: body.manualId })
    if (context.manual.manualType !== "proprietario") return response({ error: "O chat está disponível apenas para o Manual do Proprietário." }, 400)
    await consumeRateLimit(`client-manual-chat:${context.user.id}`, { max: 30, windowSeconds: 3600 })
    await consumeRateLimit(`client-manual-chat-org:${context.access.organizationId}`, { max: 500, windowSeconds: 3600 })
    const sources = publishedManualCorpus(context.manual.sourceSnapshot, { developmentId: context.access.developmentId, revision: context.manual.revision })
    if (!sources.length) return response({ error: MANUAL_CHAT_UNAVAILABLE }, 409)
    const ai = await getPlatformAiRuntime().catch(() => null)
    if (!ai) return response({ error: MANUAL_CHAT_UNAVAILABLE }, 503)
    const answer = await answerPublishedManual({ question, sources, runtime: ai })
    // Recheck after the provider wait: a revoked access or unpublished version cannot return evidence.
    await requireClientManual({ accessId: body.accessId, manualId: body.manualId })
    await recordAudit({ organizationId: context.access.organizationId, actorId: context.user.id, action: "client.manual.chat", entityType: "manual", entityId: context.manual.id, metadata: { inScope: answer.inScope, citations: answer.citations.length } })
    return response(answer)
  } catch (error) {
    if (error instanceof ClientAccessError) return response({ error: error.message }, error.status)
    if (error instanceof InputValidationError) return response({ error: error.message }, 400)
    if (error instanceof RateLimitError) return response({ error: error.message }, 429, { "Retry-After": String(error.retryAfterSeconds) })
    // Never log the prompt, document passages, provider body or credentials.
    return response({ error: MANUAL_CHAT_UNAVAILABLE }, 503)
  }
}
