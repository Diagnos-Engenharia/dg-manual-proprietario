import { NextResponse } from "next/server"

export function manualApiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Não foi possível processar o manual."
  if (error instanceof Error && "status" in error && typeof error.status === "number" && error.status >= 400 && error.status < 500) return NextResponse.json({ error: message }, { status: error.status })
  const status = /Não autenticado/i.test(message) ? 401 : /não encontrad[oa]/i.test(message) ? 404 : /permissão|autorizado|restrito|próprio|Quem editou|Quem enviou/i.test(message) ? 403 : /inválid[oa]|Informe|transição|Conteúdo|Recarregue|Atualize|validação|fora do escopo|A inclusão física/i.test(message) ? 400 : 500
  if (status === 500) console.error("manual.document", error)
  return NextResponse.json({ error: status === 500 ? "Não foi possível processar o manual. Tente novamente." : message }, { status })
}
