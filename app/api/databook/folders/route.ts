import { NextResponse } from "next/server"
import { databookApiError, databookHeaders } from "@/lib/databook/http"
import { listDatabookCatalog, mutateDatabookFolder } from "@/lib/databook/service"

export const runtime = "nodejs"
export async function GET(request: Request) {
  try { return NextResponse.json(await listDatabookCatalog(new URL(request.url).searchParams.get("developmentId")), { headers: databookHeaders }) } catch (error) { return databookApiError(error) }
}
export async function POST(request: Request) {
  try { return NextResponse.json(await mutateDatabookFolder(await request.json()), { headers: databookHeaders }) } catch (error) { return databookApiError(error) }
}
