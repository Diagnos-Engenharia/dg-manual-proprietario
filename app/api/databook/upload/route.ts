import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"
import { databookApiError, databookHeaders } from "@/lib/databook/http"
import { authorizeDatabookTicket, finalizeDatabookUpload, prepareDatabookUpload } from "@/lib/databook/service"
import { hasLocalDatabookStorage, requireDatabookStorage, writeLocalDatabookFile } from "@/lib/databook/storage"
import { DatabookError, validateFileMetadata } from "@/lib/databook/ticket"
import { assertDatabookFile } from "@/lib/security/uploads"

export const runtime = "nodejs"
export async function POST(request: Request) {
  try {
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      if (!hasLocalDatabookStorage()) throw new DatabookError("Envie o arquivo pela área de upload direto.")
      const form = await request.formData()
      const file = form.get("file")
      const value = form.get("ticket")
      const { ticket } = await authorizeDatabookTicket(value)
      if (!(file instanceof File) || file.size !== ticket.size || validateFileMetadata(file.name, file.type || "application/octet-stream", file.size).name !== ticket.name || (file.type || "application/octet-stream") !== ticket.contentType) throw new DatabookError("O arquivo não corresponde ao envio autorizado.")
      assertDatabookFile(file)
      await writeLocalDatabookFile(ticket.pathname, file)
      return NextResponse.json({ file: await finalizeDatabookUpload(value) }, { headers: databookHeaders })
    }
    const body = await request.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new DatabookError("Dados de envio inválidos.")
    if (body.action === "prepare") return NextResponse.json(await prepareDatabookUpload(body), { headers: databookHeaders })
    if (body.action === "finalize") return NextResponse.json({ file: await finalizeDatabookUpload(body.ticket) }, { headers: databookHeaders })
    if (body.type !== "blob.generate-client-token") throw new DatabookError("Ação de envio inválida.")
    requireDatabookStorage()
    const result = await handleUpload({ request, body: body as HandleUploadBody, onBeforeGenerateToken: async (pathname, payload) => {
      const { ticket } = await authorizeDatabookTicket(payload)
      if (pathname !== ticket.pathname) throw new DatabookError("Destino de envio inválido.")
      return { allowedContentTypes: [ticket.contentType], maximumSizeInBytes: ticket.size, validUntil: ticket.expiresAt, addRandomSuffix: false, allowOverwrite: false }
    } })
    return NextResponse.json(result, { headers: databookHeaders })
  } catch (error) { return databookApiError(error) }
}
