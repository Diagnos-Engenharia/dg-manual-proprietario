import test from "node:test"
import assert from "node:assert/strict"
import { assertSafeRichTextPayload, assertTechnicalHtml, InputValidationError } from "../lib/security/input"

test("server parser rejects active tags, every event and entity-obfuscated URLs", () => {
  for (const html of [
    '<script>alert(1)</script>', '<iframe srcdoc="x"></iframe>', '<svg><a href="x">x</a></svg>',
    '<p onpointerenter="alert(1)">x</p>', '<p ONANIMATIONSTART="alert(1)">x</p>',
    '<a href="jav&#x61;script:alert(1)">x</a>', '<a href="java&#10;script:alert(1)">x</a>',
    '<a href="&Tab;javascript:alert(1)">x</a>', '<a href="data:text/html,x">x</a>',
    '<a href="//attacker.example">x</a>', '<math><mtext>x</mtext></math>', '<form><input></form>',
  ]) assert.throws(() => assertTechnicalHtml(html), InputValidationError, html)
})

test("server allowlist retains editor structure, table geometry and ordinary links", () => {
  const html = '<h2>Estrutura</h2><p><strong>Concreto</strong> <em>armado</em> <u>ABNT</u> &amp; uso.</p><ul><li>Inspecionar</li></ul><table><tbody><tr><th colspan="2" style="width:120px;text-align:center">Item</th><td rowspan="2" colwidth="80">Descrição</td></tr></tbody></table><p><a href="https://example.com/manual?q=1&amp;x=2" title="Manual">Manual</a><a href="mailto:engenharia@example.com">Contato</a></p>'
  const clean = assertTechnicalHtml(html)
  for (const part of ['<h2>Estrutura</h2>', '<strong>Concreto</strong>', '<u>ABNT</u>', 'colspan="2"', 'rowspan="2"', 'colwidth="80"', 'width:120px', 'text-align:center', 'https://example.com/manual?q=1&amp;x=2', 'mailto:engenharia@example.com']) assert.ok(clean.includes(part), part)
  assert.equal(assertTechnicalHtml(clean), clean, "clean content is idempotent for unchanged approved saves")
})

test("unsafe CSS, attributes and unsupported tags are removed by server normalization", () => {
  const clean = assertTechnicalHtml('<p style="background:url(javascript:alert(1));position:fixed;color:#123456;text-align:right" id="host" class="overlay"><custom>Texto</custom></p>')
  assert.equal(clean, '<p style="color:#123456;text-align:right">Texto</p>')
  assert.equal(assertTechnicalHtml('<p>&lt;script&gt;texto&lt;/script&gt;</p>'), '<p>&lt;script&gt;texto&lt;/script&gt;</p>')
})

test("nested legacy payloads are normalized without changing ordinary scalar data", () => {
  const source = { manuals: { proprietario: { sistemas: { 'item::unidade': '<p class="unknown">Seguro</p>' } } }, observation: "pressão < 10 bar", amount: 2, enabled: false, rows: ["plain", null] }
  const clean = assertSafeRichTextPayload(source)
  assert.equal(clean.manuals.proprietario.sistemas['item::unidade'], '<p>Seguro</p>')
  assert.equal(source.manuals.proprietario.sistemas['item::unidade'], '<p class="unknown">Seguro</p>', "validation does not mutate caller input")
  assert.equal(clean.observation, source.observation)
  assert.deepEqual(clean.rows, source.rows)
  assert.throws(() => assertSafeRichTextPayload({ manuals: { systems: ['<a href="jav&#97;script:x">x</a>'] } }), InputValidationError)
})
