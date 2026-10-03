import assert from "node:assert/strict"
import test from "node:test"

test("regular migrations exclude known credential fixtures, including on production", async () => {
  const { allowMigration } = await import("../scripts/migration-policy.mjs")
  assert.equal(allowMigration("0011_seed_test_users.sql", { DATABASE_URL: "postgres://host/db", NODE_ENV: "production" }), false)
  assert.equal(allowMigration("0019_client_access.sql", { NODE_ENV: "production" }), true)
})

test("test account fixture opt-in rejects shared databases and Vercel", async () => {
  const { allowMigration } = await import("../scripts/migration-policy.mjs")
  for (const env of [
    { DATABASE_URL:"postgres://shared.example/db", DG_ALLOW_TEST_SEEDS:"true" },
    { DATABASE_URL:"postgres://localhost/db", DG_ALLOW_TEST_SEEDS:"true", NODE_ENV:"production" },
    { DATABASE_URL:"postgres://localhost/db", DG_ALLOW_TEST_SEEDS:"true", VERCEL_ENV:"preview" },
  ]) assert.throws(() => allowMigration("0011_seed_test_users.sql", env), /local isolado/)
  assert.equal(allowMigration("0011_seed_test_users.sql", { DATABASE_URL:"postgres://127.0.0.1/db", DG_ALLOW_TEST_SEEDS:"true" }), true)
})
