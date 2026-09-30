import { chromium } from "@playwright/test"

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const clientErrors = []
const consoleErrors = []

page.on("pageerror", (error) => clientErrors.push(error.message))
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text())
})

async function diagnostics(label, response) {
  console.log(`--- ${label} ---`)
  console.log("status:", response?.status())
  console.log("url:", page.url())
  console.log("title:", await page.title())
  console.log("body:", (await page.locator("body").innerText()).slice(0, 4000))
  console.log("pageErrors:", clientErrors)
  console.log("consoleErrors:", consoleErrors)
}

try {
  const direct = await page.goto("http://127.0.0.1:3000/pr-preview", { waitUntil: "domcontentloaded" })
  await diagnostics("direct /pr-preview", direct)
  if (!direct || !direct.ok()) throw new Error(`/pr-preview retornou HTTP ${direct?.status() ?? "sem resposta"}`)

  await page.getByRole("heading", { name: "Ambiente de teste — PR #1" }).waitFor({ state: "visible", timeout: 10000 })
  await page.getByText("Checklist Inicial", { exact: true }).first().waitFor({ state: "visible" })
  await page.getByText("Sistemas Construtivos", { exact: true }).first().waitFor({ state: "visible" })

  await page.getByText("Porta pronta da unidade", { exact: true }).waitFor({ state: "visible" })
  if (await page.getByText("Porta corta-fogo", { exact: true }).count()) {
    throw new Error("Item exclusivo de área comum apareceu no Manual do Proprietário")
  }

  await page.getByRole("button", { name: "+ Área comum" }).first().click()
  await page.getByRole("tab", { name: /Manual do Síndico/i }).click()
  await page.getByText("Porta corta-fogo", { exact: true }).first().waitFor({ state: "visible" })
  await page.getByText("Porta pronta da unidade", { exact: true }).first().waitFor({ state: "visible" })

  if (clientErrors.length > 0) throw new Error(`Erros no navegador: ${clientErrors.join(" | ")}`)

  const root = await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" })
  await diagnostics("root /", root)
  await page.getByRole("heading", { name: "Ambiente de teste — PR #1" }).waitFor({ state: "visible", timeout: 10000 })

  console.log("PR preview browser smoke: OK")
} catch (error) {
  await diagnostics("failure", null)
  throw error
} finally {
  await browser.close()
}
