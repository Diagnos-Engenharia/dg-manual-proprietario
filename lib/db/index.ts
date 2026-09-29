import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

function normalizeDatabaseUrl(value?: string) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (url.searchParams.has("sslmode")) url.searchParams.set("sslmode", "verify-full")
    return url.toString()
  } catch {
    return value
  }
}

export const pool = new Pool({ connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL) })
export const db = drizzle(pool, { schema })
