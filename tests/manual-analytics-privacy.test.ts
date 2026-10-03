import assert from "node:assert/strict"
import test from "node:test"
import { analyticsUrlAllowed } from "../lib/analytics-privacy"

test("authentication and bearer links are excluded from metrics", () => {
  for (const path of ["/convite/secret", "/redefinir-senha/secret", "/sign-up?invite=secret", "/sign-in?next=%2Fconvite%2Fsecret", "/%63onvite/secret", "/manuais?token=secret", "/usuarios?email=private@example.test", "/%broken"])
    assert.equal(analyticsUrlAllowed("https://app.example" + path), false, path)
  assert.equal(analyticsUrlAllowed("https://app.example/manuais?tipo=proprietario"), true)
})
