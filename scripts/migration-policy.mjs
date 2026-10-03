/** Test fixtures must never run on a shared or production database. */
export function allowMigration(name, env) {
  if (name !== "0011_seed_test_users.sql") return true
  if (env.DG_ALLOW_TEST_SEEDS !== "true") return false
  let hostname
  try { hostname = new URL(env.DATABASE_URL).hostname } catch { return false }
  if (env.NODE_ENV === "production" || env.VERCEL_ENV || !["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
    throw new Error("Contas de teste são permitidas somente em banco local isolado.")
  }
  return true
}
