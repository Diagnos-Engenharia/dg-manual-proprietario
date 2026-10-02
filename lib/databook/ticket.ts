import { createHmac, timingSafeEqual } from "node:crypto"
import { DATABOOK_MAX_BYTES, normalizeDatabookName } from "./types"

export class DatabookError extends Error { constructor(message: string, public status = 400, public code?: string) { super(message) } }
export type UploadTicket = { id: string; developmentId: string; organizationId: string; userId: string; folderId: string; name: string; contentType: string; size: number; pathname: string; expiresAt: number }

export function validateFileMetadata(name: unknown, contentType: unknown, size: unknown) {
  if (typeof name !== "string" || !normalizeDatabookName(name) || name.length > 240 || /[\x00-\x1f\x7f\\/]/.test(name)) throw new DatabookError("Nome de arquivo inválido.")
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) throw new DatabookError("O arquivo está vazio.")
  if (size > DATABOOK_MAX_BYTES) throw new DatabookError("O arquivo deve ter no máximo 50 MB.", 413)
  if (typeof contentType !== "string" || contentType.length > 200 || (contentType.trim() && !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(contentType.trim()))) throw new DatabookError("Tipo de arquivo inválido.")
  return { name: normalizeDatabookName(name), contentType: contentType.trim().toLowerCase() || "application/octet-stream", size }
}

export function uploadPath(organizationId: string, developmentId: string, id: string, name: string) {
  const segment = (value: string) => encodeURIComponent(value).replace(/\./g, "%2E")
  const filename = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._ -]/g, "-").replace(/^\.+/, "").slice(0, 180) || "arquivo"
  return `databook/${segment(organizationId)}/${segment(developmentId)}/${id}/${filename}`
}

function secret() {
  const value = process.env.BETTER_AUTH_SECRET
  if (!value) throw new DatabookError("O envio de arquivos está indisponível. A configuração de segurança precisa ser concluída.", 503)
  return value
}

export function signUploadTicket(ticket: UploadTicket) {
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url")
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`
}

export function verifyUploadTicket(value: unknown, now = Date.now(), allowExpired = false): UploadTicket {
  if (typeof value !== "string" || value.length > 5000) throw new DatabookError("Autorização de envio inválida.")
  const parts = value.split(".")
  if (parts.length !== 2) throw new DatabookError("Autorização de envio inválida.")
  const expected = createHmac("sha256", secret()).update(parts[0]).digest()
  const received = Buffer.from(parts[1], "base64url")
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new DatabookError("Autorização de envio inválida.")
  let ticket: UploadTicket
  try { ticket = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) } catch { throw new DatabookError("Autorização de envio inválida.") }
  if (!ticket || typeof ticket !== "object" || !/^[0-9a-f-]{36}$/i.test(ticket.id) || ![ticket.developmentId, ticket.organizationId, ticket.userId, ticket.folderId].every(item => typeof item === "string" && item.length > 0 && item.length < 1200) || typeof ticket.expiresAt !== "number" || !Number.isFinite(ticket.expiresAt)) throw new DatabookError("Autorização de envio inválida.")
  const metadata = validateFileMetadata(ticket.name, ticket.contentType, ticket.size)
  if (ticket.pathname !== uploadPath(ticket.organizationId, ticket.developmentId, ticket.id, metadata.name)) throw new DatabookError("Destino do arquivo inválido.")
  if (!allowExpired && ticket.expiresAt <= now) throw new DatabookError("A autorização de envio expirou. Tente novamente.", 409)
  return ticket
}
