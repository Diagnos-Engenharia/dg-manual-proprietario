function safeSegment(value: string, fallback: string) {
  const name = value.normalize("NFC").replace(/[\\/:\x00-\x1f\x7f]/g, "-").trim().replace(/[. ]+$/g, "")
  return !name || name === "." || name === ".." ? fallback : name
}

/** ZIP entry names are allocated after sanitizing, so collisions cannot erase files. */
export function databookArchivePaths() {
  const folders = new Map<string, string>()
  const used = new Set<string>()
  const key = (name: string) => name.normalize("NFC").toLocaleLowerCase("pt-BR")
  function reserve(prefix: string, original: string, extension: boolean) {
    let candidate = prefix + original
    const dot = extension ? original.lastIndexOf(".") : -1
    const stem = dot > 0 ? original.slice(0, dot) : original
    const suffix = dot > 0 ? original.slice(dot) : ""
    for (let number = 2; used.has(key(candidate)); number++) candidate = prefix + stem + " (" + number + ")" + suffix
    used.add(key(candidate))
    return candidate
  }
  function folder(name: string) {
    const existing = folders.get(name)
    if (existing) return existing
    const result = reserve("", safeSegment(name, "Arquivos gerais"), false)
    folders.set(name, result)
    return result
  }
  return { folder, file: (folderName: string, filename: string) => reserve(folder(folderName) + "/", safeSegment(filename, "arquivo"), true) }
}
