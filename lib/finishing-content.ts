import type { DevelopmentUnit, FinishingGroup, FinishingTableData, UnitInput } from "./finishing-types"

export const finishingGroups: FinishingGroup[] = ["ambientes", "materiais", "hidraulicas", "esquadrias", "eletricas"]
export const finishingRequiredFields: Record<FinishingGroup, string[]> = { ambientes: ["ambiente"], materiais: ["material", "aplicacao", "ambiente"], hidraulicas: ["ambiente", "loucaCuba"], esquadrias: ["ambiente"], eletricas: ["ambiente", "acabamentoEletrico"] }
export function emptyFinishingData(): FinishingTableData { return { ambientes: [], materiais: [], hidraulicas: [], esquadrias: [], eletricas: [] } }
export function normalizedUnitKey(tower: string, number: string) { return [tower, number].map(value => value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR").normalize("NFC")).join("\u0000") }
export function unitLabel(unit: Pick<DevelopmentUnit, "tower" | "number">) { return [unit.tower, "Unidade " + unit.number].filter(Boolean).join(" · ") }
type UnitIdentity = Pick<DevelopmentUnit, "tower" | "floor" | "number" | "typology" | "area">
type LegacyUnitIdentity = Pick<DevelopmentUnit, "floor" | "typology" | "area">
export function normalizeUnitInput(input: UnitInput, previous?: LegacyUnitIdentity): UnitIdentity {
  const values = Object.fromEntries(["tower", "floor", "number", "typology", "area"].map(key => {
    // Hidden legacy fields are not an empty replacement. Preserve their saved
    // values exactly when the simplified form omits them, even older formats.
    if (["floor", "typology", "area"].includes(key) && input[key as keyof UnitInput] === undefined) return [key, previous?.[key as keyof LegacyUnitIdentity] ?? ""]
    const value = input[key as keyof UnitInput] ?? (key === "tower" ? "" : undefined)
    if (typeof value !== "string" || value.length > 200) throw new Error("Identificação da unidade inválida")
    return [key, value.normalize("NFC").trim().replace(/\s+/g, " ")]
  })) as UnitIdentity
  if (!values.number) throw new Error("Informe o número da unidade")
  if (input.area !== undefined && values.area && (!/^\d+(?:[.,]\d+)?(?:\s*m²)?$/i.test(values.area) || !(Number(values.area.replace(/\s*m²$/i, "").replace(",", ".")) > 0))) throw new Error("Área da unidade inválida: informe um valor positivo")
  return values
}
export function normalizeFinishingData(value: unknown): FinishingTableData {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Tabela de acabamentos inválida")
  const result = emptyFinishingData()
  let count = 0
  for (const group of finishingGroups) {
    const rows = (value as Record<string, unknown>)[group]
    if (rows === undefined) continue
    if (!Array.isArray(rows)) throw new Error("Seção de acabamentos inválida")
    count += rows.length
    if (count > 2000) throw new Error("Tabela de acabamentos excede 2000 registros")
    const ids = new Set<string>()
    result[group] = rows.map(row => {
      if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).length > 40 || !Object.entries(row).every(([key, entry]) => key.length <= 200 && typeof entry === "string" && entry.length <= 10_000)) throw new Error("Registro de acabamentos inválido")
      const saved = { ...row } as Record<string, string> & { id: string }
      if (!saved.id || saved.id.length > 200 || ids.has(saved.id)) throw new Error("Identificação do registro inválida ou duplicada")
      ids.add(saved.id)
      return saved
    })
  }
  return result
}
export function finishingProblems(data: FinishingTableData): string[] {
  const problems: string[] = []
  if (!finishingGroups.some(group => data[group].length)) problems.push("Cadastre ao menos um item na tabela de acabamentos.")
  for (const group of finishingGroups) data[group].forEach((row, index) => {
    if (finishingRequiredFields[group].some(field => !row[field]?.trim())) problems.push("Complete os campos obrigatórios de " + group + ", registro " + (index + 1) + ".")
  })
  return problems
}
