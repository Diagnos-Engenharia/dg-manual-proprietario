import { strict as assert } from "node:assert"
import { test } from "node:test"
import { safeErrorDetails } from "../lib/security/logging"

test("server error details omit credentials, SQL, request bodies and stack", () => {
  const error = Object.assign(new Error("secret-password token=supersecret SELECT private_data"), { code: "23505", query: "secret query", parameters: ["private customer"], detail: "api-key" })
  assert.deepEqual(safeErrorDetails(error), { kind: "Error", code: "23505" })
  assert.deepEqual(safeErrorDetails({ message: "secret", name: "secret", code: "token-secret" }), { kind: "Unknown" })
  assert.deepEqual(safeErrorDetails(new TypeError("secret URL")), { kind: "TypeError" })
})
