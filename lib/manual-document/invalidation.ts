import type { ManualType } from "@/lib/mock-data"
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Approval is invalidated by source mutations, including legacy whole-module saves. */
export function changedValidationContexts(before: unknown, after: unknown) {
  const oldData = object(before), nextData = object(after)
  const changes: { contextKey: string; section: string }[] = []
  const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b)
  for (const manual of ["proprietario", "sindico"] as ManualType[]) {
    const scope = manual === "proprietario" ? "unidade" : "comum"
    const oldManual = object(object(oldData.manuals)[manual]), nextManual = object(object(nextData.manuals)[manual])
    for (const section of ["sistemas", "manutencao"]) {
      const oldMap = object(oldManual[section]), nextMap = object(nextManual[section])
      for (const key of new Set([...Object.keys(oldMap), ...Object.keys(nextMap)])) if (changed(oldMap[key], nextMap[key])) changes.push({ contextKey: key.includes("::") ? key : `${key}::${scope}`, section })
    }
    const oldEditorial = object(oldManual.editorial), nextEditorial = object(nextManual.editorial)
    const oldSections = object(oldEditorial.sections), nextSections = object(nextEditorial.sections)
    for (const key of new Set([...Object.keys(oldSections), ...Object.keys(nextSections)])) if (changed(oldSections[key], nextSections[key])) changes.push({ contextKey: `${key}::${scope}`, section: "editorial" })
    if (changed(oldEditorial.warranties, nextEditorial.warranties)) changes.push({ contextKey: `garantias-tabela::${scope}`, section: "editorial" })
    const oldAuthoring = object(oldData.authoring), nextAuthoring = object(nextData.authoring)
    if (changed(oldAuthoring.contacts, nextAuthoring.contacts)) for (const id of ["projetistas", "fornecedores", "responsaveis-tecnicos"]) changes.push({ contextKey: `${id}::${scope}`, section: "editorial" })
    for (const id of ["agua", "gas", "energia", "telecom"]) if (changed(object(oldAuthoring.comissionamento)[id], object(nextAuthoring.comissionamento)[id]) || changed(object(oldManual.comissionamento)[id], object(nextManual.comissionamento)[id])) changes.push({ contextKey: `${id}::${scope}`, section: "editorial" })
  }
  return changes
}
