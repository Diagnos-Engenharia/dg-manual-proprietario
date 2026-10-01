import test from "node:test"
import assert from "node:assert/strict"
import { developmentSignInHref, safeAuthRedirect } from "@/lib/auth-redirect"

test("development login redirects preserve the requested manual, system and content tab", () => {
  const query = {
    modulo: "elaboracao",
    aba: "textos",
    manual: "sindico",
    item: "estrutura::comum",
    secao: "sistema-estrutura",
    conteudo: "manutencao",
    filtro: ["aprovado", "aguardando_validacao"],
    omitted: undefined,
  }
  const signInUrl = new URL(developmentSignInHref("emp-123", query), "https://preview.example")
  assert.equal(signInUrl.pathname, "/sign-in")
  const destination = signInUrl.searchParams.get("next")!
  assert.equal(safeAuthRedirect(destination), destination)
  const target = new URL(destination, signInUrl.origin)
  assert.equal(target.origin, signInUrl.origin)
  assert.equal(target.pathname, "/empreendimentos/emp-123")
  for (const key of ["modulo", "aba", "manual", "item", "secao", "conteudo"] as const) assert.equal(target.searchParams.get(key), query[key])
  assert.deepEqual(target.searchParams.getAll("filtro"), query.filtro)
  assert.equal(target.searchParams.has("omitted"), false)
})

test("login destinations accept normal internal URLs and normalize internal dot segments", () => {
  for (const destination of ["/", "/empreendimentos", "/empreendimentos/emp-123?modulo=emissao&manual=proprietario#pagina-4", "/empreendimentos?filtro=a%2Bb"]) {
    assert.equal(safeAuthRedirect(destination), destination)
  }
  assert.equal(safeAuthRedirect("/profile/../empreendimentos"), "/empreendimentos")
  assert.equal(developmentSignInHref("emp-123", {}), "/sign-in?next=%2Fempreendimentos%2Femp-123")
})

test("login destinations reject external URLs, controls and encoded redirect bypasses", () => {
  const unsafe = [
    undefined, null, "", "https://evil.example", "http://evil.example", "javascript:alert(1)", "data:text/html,test", "//evil.example", "///evil.example", "\\evil.example", "/\\evil.example", "/\nevil.example", "/\tevil.example", "/\u0000evil.example", " /empreendimentos", "empreendimentos",
    "/%2Fevil.example", "/%252Fevil.example", "/%5Cevil.example", "/%255Cevil.example", "/%00evil.example", "/%250Aevil.example", "/a/..//evil.example", "/a/%2E%2E//evil.example", "/%", "/%FF", "/" + "a".repeat(8192),
  ]
  for (const destination of unsafe) assert.equal(safeAuthRedirect(destination), "/", `Rejected destination: ${String(destination)}`)
})
