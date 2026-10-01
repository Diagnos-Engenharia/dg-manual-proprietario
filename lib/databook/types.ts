export const DATABOOK_MAX_BYTES = 50 * 1024 * 1024
export const DATABOOK_GENERAL_FOLDER = "Arquivos gerais"
export const DATABOOK_DEFAULT_FOLDERS = ["Projetos As Built", "ART / RRT", "Garantias", "Manuais de Fabricantes", "Certidões e Laudos", "Atas e Convenção"]

export type DatabookFolder = { id: string; name: string }
export type DatabookFile = { id: string; folder: string; name: string; pathname: string; contentType: string | null; sizeBytes: number; createdAt: string }
export type DatabookCatalog = { folders: DatabookFolder[]; files: DatabookFile[]; canEdit: boolean }

export function normalizeDatabookName(value: string) { return value.trim().replace(/\s+/g, " ").normalize("NFC") }
export function databookNameKey(value: string) { return normalizeDatabookName(value).toLocaleLowerCase("pt-BR") }

/** Restores existing folders without recreating deliberately removed defaults. */
export function resolveDatabookFolders(data: unknown, files: { folder: string }[]): DatabookFolder[] {
  const source = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>).databookFolders : undefined
  const configured = Array.isArray(source) ? source.filter((folder): folder is DatabookFolder => Boolean(folder && typeof folder === "object" && typeof folder.id === "string" && typeof folder.name === "string" && folder.id && normalizeDatabookName(folder.name))) : null
  const folders: DatabookFolder[] = []
  const add = (folder: DatabookFolder) => { if (!folders.some(item => databookNameKey(item.name) === databookNameKey(folder.name) || item.id === folder.id)) folders.push({ ...folder, name: normalizeDatabookName(folder.name) }) }
  if (configured) configured.forEach(add)
  else DATABOOK_DEFAULT_FOLDERS.forEach((name, index) => add({ id: `default-${index}`, name }))
  files.forEach(file => { const name = normalizeDatabookName(file.folder); if (name) add({ id: `legacy-${encodeURIComponent(databookNameKey(name))}`, name }) })
  return folders
}
