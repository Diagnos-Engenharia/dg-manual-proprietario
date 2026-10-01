import test from "node:test"
import assert from "node:assert/strict"
import { finishingDraftStorageKey, restoreFinishingDrafts } from "../components/autoria/finishing-drafts"
import { emptyFinishingData } from "../lib/finishing-content"

const fingerprint = "a".repeat(64)
const data = { ...emptyFinishingData(), ambientes: [{ id: "room-1", ambiente: "Sala", teto: "Pintura acetinada" }] }
test("finishing drafts use distinct actor and development namespaces", () => {
  assert.notEqual(finishingDraftStorageKey("actor-a", "development"), finishingDraftStorageKey("actor-b", "development"))
  assert.notEqual(finishingDraftStorageKey("actor", "development-a"), finishingDraftStorageKey("actor", "development-b"))
  assert.notEqual(finishingDraftStorageKey("actor:a", "b"), finishingDraftStorageKey("actor", "a:b"))
})
test("finishing drafts restore content, original revision and explicit base only for authorized units", () => {
  const raw = JSON.stringify({ version: 1, drafts: { unit1: { data, fingerprint, sourceTableId: "base-1" }, foreignUnit: { data, fingerprint } } })
  assert.deepEqual(restoreFinishingDrafts(raw, new Set(["unit1"])), { drafts: { unit1: { data, fingerprint, sourceTableId: "base-1" } }, invalid: false })
})
test("one corrupt draft does not discard another valid unit draft", () => {
  const raw = JSON.stringify({ version: 1, drafts: { unit1: { data, fingerprint }, unit2: { data: { ambientes: [{ id: "room", ambiente: 42 }] }, fingerprint }, unit3: { data, fingerprint: "not-a-hash" }, unit4: { data, fingerprint, sourceTableId: 12 } } })
  assert.deepEqual(restoreFinishingDrafts(raw, new Set(["unit1", "unit2", "unit3", "unit4"])), { drafts: { unit1: { data, fingerprint } }, invalid: true })
})
test("corrupt and unsupported session envelopes are rejected without content execution", () => {
  assert.throws(() => restoreFinishingDrafts("{broken", new Set()))
  assert.throws(() => restoreFinishingDrafts(JSON.stringify({ version: 2, drafts: {} }), new Set()))
  assert.throws(() => restoreFinishingDrafts(JSON.stringify({ version: 1, drafts: [] }), new Set()))
  assert.deepEqual(restoreFinishingDrafts(null, new Set()), { drafts: {}, invalid: false })
})
