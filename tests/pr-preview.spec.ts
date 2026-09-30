import { test, expect } from "@playwright/test"

test("PR preview loads and dual-scope routing works", async ({ page }) => {
  const clientErrors: string[] = []
  page.on("pageerror", (error) => clientErrors.push(error.message))

  await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" })

  await expect(page.getByRole("heading", { name: "Ambiente de teste — PR #1" })).toBeVisible()
  await expect(page.getByText("Checklist Inicial", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("Sistemas Construtivos", { exact: true }).first()).toBeVisible()

  // Proprietário: item exclusivo da unidade + itens compartilhados; item exclusivo comum fica oculto.
  await expect(page.getByText("Porta pronta da unidade", { exact: true })).toBeVisible()
  await expect(page.getByText("Esquadria / Caixilho em alumínio", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("Porta corta-fogo", { exact: true })).toHaveCount(0)

  // Adiciona Área comum ao item exclusivo de unidade e verifica propagação reativa.
  await page.getByRole("button", { name: "+ Área comum" }).first().click()

  // Troca para Manual do Síndico.
  await page.getByRole("tab", { name: /Manual do Síndico/i }).click()
  await expect(page.getByText("Porta corta-fogo", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("Porta pronta da unidade", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("Esquadria / Caixilho em alumínio", { exact: true }).first()).toBeVisible()

  expect(clientErrors).toEqual([])
})
