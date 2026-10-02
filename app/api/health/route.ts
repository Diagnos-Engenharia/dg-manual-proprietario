import { sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const started = Date.now()
  try {
    await db.execute(sql`select 1 as ok`)
    return NextResponse.json(
      { status: "ok", checks: { database: "ok" }, durationMs: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("health.database", error)
    return NextResponse.json(
      { status: "degraded", checks: { database: "error" }, durationMs: Date.now() - started },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
}
