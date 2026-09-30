import { chromium } from "@playwright/test"

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const clientErrors = []

page.on("pageerror", (error) => clientErrors.push(error.message))

try {
  const response = await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" })
  if (!response || !response.ok()) {
    throw new Error(`Preview retornou HTTP ${response?.status() ?? "sem resposta"}`)
  }

  await page.getByRole("heading", { name: "Ambiente de teste — PR #1" }).waitFor({ state: "visible" })
  await page.getByText("Checklist Inicial", { exact: true }).first().waitFor({ state: "visible" })
  await page.getByText("Sistemas Construtivos", { exact: true }).first().waitFor({ state: "visible" })

  await page.getByText("Porta pronta da unidade", { exact: true }).waitFor({ state: "visible" })
  await page.getByText("Esquadria / Caixilho em alumínio", { exact: true }).first().waitFor({ state: "visible" })

  if (await page.getByText("Porta corta-fogo", { exact: true }).count()) {
    throw new Error("Item exclusivo de área comum apareceu no Manual do Proprietário")
  }

  await page.getByRole("button", { name: "+ Área comum" }).first().click()
  await page.getByRole("tab", { name: /Manual do Síndico/i }).click()

  await page.getByText("Porta corta-fogo", { exact: true }).first().waitFor({ state: "visible" })
  await page.getByText("Porta pronta da unidade", { exact: true }).first().waitFor({ state: "visible" })
  await page.getByText("Esquadria / Caixilho em alumínio", { exact: true }).first().waitFor({ state: "visible" })

  if (clientErrors.length > 0) {
    throw new Error(`Erros no navegador: ${clientErrors.join(" | ")}`)
  }

  console.log("PR preview browser smoke: OK")
} finally {
  await browser.close()
}
