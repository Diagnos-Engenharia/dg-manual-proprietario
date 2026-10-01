import assert from "node:assert/strict"
import test from "node:test"
import { normalizeUnitInput, normalizedUnitKey } from "../lib/finishing-content"

test("new unit identity accepts number and tower without discarded registration fields", () => {
  assert.deepEqual(normalizeUnitInput({ tower: " Torre A ", number: " 101 " }), { tower: "Torre A", number: "101", floor: "", typology: "", area: "" })
  assert.deepEqual(normalizeUnitInput({ tower: "", number: "Casa 1" }), { tower: "", number: "Casa 1", floor: "", typology: "", area: "" })
  assert.throws(() => normalizeUnitInput({ tower: "Torre A", number: " " }), /número/)
})

test("simplified unit identity editing preserves omitted legacy fields exactly", () => {
  const previous = { floor: "2º pavimento", typology: "Tipo Á", area: "68,40 m²" }
  const updated = normalizeUnitInput({ tower: "Torre B", number: "102" }, previous)
  assert.deepEqual(updated, { tower: "Torre B", number: "102", ...previous })
  assert.deepEqual(previous, { floor: "2º pavimento", typology: "Tipo Á", area: "68,40 m²" })
  const historic = { floor: "  2º ", typology: "Tipo A\u0301", area: "Área antiga não numérica" }
  assert.deepEqual(normalizeUnitInput({ tower: "Torre A", number: "103" }, historic), { tower: "Torre A", number: "103", ...historic })
})

test("legacy clients can still explicitly update or clear preserved fields", () => {
  const previous = { floor: "2º", typology: "Tipo A", area: "68,40" }
  assert.deepEqual(normalizeUnitInput({ tower: "A", number: "101", typology: "", floor: "Te\u0301rreo", area: "" }, previous), { tower: "A", number: "101", floor: "Térreo", typology: "", area: "" })
  assert.throws(() => normalizeUnitInput({ tower: "A", number: "101", area: "-1" }, previous), /Área/)
  assert.equal(normalizeUnitInput({ tower: "A", number: "101", area: "70" }, previous).area, "70")
})

test("simplified unit identity retains Unicode duplicate detection by tower and number", () => {
  const first = normalizeUnitInput({ tower: "Tórre Á", number: "101" })
  const duplicate = normalizeUnitInput({ tower: " To\u0301rre A\u0301 ", number: " 101 " })
  assert.equal(normalizedUnitKey(first.tower, first.number), normalizedUnitKey(duplicate.tower, duplicate.number))
  assert.notEqual(normalizedUnitKey(first.tower, first.number), normalizedUnitKey("Tórre B", first.number))
})
