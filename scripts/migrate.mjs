import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import pg from "pg"
import { allowMigration } from "./migration-policy.mjs"

const { Pool } = pg
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error("DATABASE_URL não está configurada.")
  process.exit(1)
}

const pool = new Pool({ connectionString })

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "_dg_migration" (
      "name" text PRIMARY KEY,
      "appliedAt" timestamptz NOT NULL DEFAULT now()
    )
  `)

  const dir = path.join(process.cwd(), "migrations")
  const files = (await readdir(dir))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()

  for (const name of files) {
    if (!allowMigration(name, process.env)) {
      console.log(`skip test fixture ${name}`)
      continue
    }
    const applied = await pool.query('SELECT 1 FROM "_dg_migration" WHERE "name" = $1 LIMIT 1', [name])
    if (applied.rowCount) {
      console.log(`skip  ${name}`)
      continue
    }

    const sql = await readFile(path.join(dir, name), "utf8")
    console.log(`apply ${name}`)
    await pool.query(sql)
    await pool.query('INSERT INTO "_dg_migration" ("name") VALUES ($1)', [name])
  }

  console.log("Migrações concluídas.")
} catch (error) {
  console.error("Falha ao executar migrações:", error)
  process.exitCode = 1
} finally {
  await pool.end()
}
