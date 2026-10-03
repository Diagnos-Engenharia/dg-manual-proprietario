import { logSafeError } from "@/lib/security/logging"
import { NextResponse } from "next/server"
import { DatabookError } from "./ticket"
import { RateLimitError } from "@/lib/security/rate-limit"
export const databookHeaders = { "Cache-Control": "private, no-store" }
export function databookApiError(error: unknown) {
  if (error instanceof DatabookError) return NextResponse.json({ error: error.message }, { status: error.status, headers: databookHeaders })
  if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { ...databookHeaders, "Retry-After": String(error.retryAfterSeconds) } })
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Dados de arquivo inválidos." }, { status: 400, headers: databookHeaders })
  logSafeError("databook.operation", error)
  const message = error instanceof Error ? error.message : ""
  const storage = /token|store|blob|private|public/i.test(message)
  return NextResponse.json({ error: storage ? "O armazenamento privado não respondeu. Verifique a configuração desta prévia ou tente novamente." : "Não foi possível concluir a operação. Tente novamente." }, { status: storage ? 503 : 500, headers: databookHeaders })
}
