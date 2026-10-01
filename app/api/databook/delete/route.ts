import { NextResponse } from "next/server"
import { databookApiError, databookHeaders } from "@/lib/databook/http"
import { deleteDatabookFile } from "@/lib/databook/service"

export const runtime = "nodejs"
export async function DELETE(request: Request) {
  try { return NextResponse.json(await deleteDatabookFile(await request.json()), { headers: databookHeaders }) } catch (error) { return databookApiError(error) }
}
