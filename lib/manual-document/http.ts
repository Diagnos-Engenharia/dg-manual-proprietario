import { NextResponse } from "next/server"
import { InputValidationError } from "@/lib/security/input"
import { RateLimitError } from "@/lib/security/rate-limit"

const jsonError = (message:string,status:number,extra:Record<string,string>={}) => NextResponse.json({error:message},{status,headers:{"Cache-Control":"private, no-store",...extra}})

export function manualApiError(error: unknown) {
  if (error instanceof RateLimitError) return jsonError(error.message,429,{"Retry-After":String(error.retryAfterSeconds)})
  if (error instanceof InputValidationError) return jsonError(error.message,400)
  const message = error instanceof Error ? error.message : "Não foi possível processar o manual."
  if (error instanceof Error && "status" in error && typeof error.status === "number" && error.status >= 400 && error.status < 500) return jsonError(message,error.status)
  const status = /Não autenticado/i.test(message) ? 401 : /não encontrad[oa]/i.test(message) ? 404 : /permissão|autorizado|restrito|próprio|Quem editou|Quem enviou|Conta inativa|Organização não configurada|Selecione a construtora ativa/i.test(message) ? 403 : /inválid[oa]|Informe|transição|Conteúdo|Recarregue|Atualize|validação|fora do escopo|A inclusão física/i.test(message) ? 400 : 500
  if (status === 500) console.error("manual.document", error)
  return jsonError(status === 500 ? "Não foi possível processar o manual. Tente novamente." : message,status)
}
