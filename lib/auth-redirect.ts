export type AuthRedirectSearchParams = Record<string, string | string[] | undefined>

const redirectOrigin = "https://auth-redirect.invalid"
const unsafeCharacters = /[\\\u0000-\u0020\u007f]/

/** Only return paths that remain internal under URL normalization and decoding. */
export function safeAuthRedirect(value: string | null | undefined): string {
  if (!value || value.length > 8192) return "/"
  let decoded = value
  let destination: URL | undefined
  for (let depth = 0; depth < 10; depth++) {
    if (!decoded.startsWith("/") || decoded.startsWith("//") || unsafeCharacters.test(decoded)) return "/"
    try {
      const parsed = new URL(decoded, redirectOrigin)
      if (parsed.origin !== redirectOrigin || parsed.pathname.startsWith("//")) return "/"
      destination ??= parsed
      const nextDecoded = decodeURIComponent(decoded)
      if (nextDecoded === decoded) return destination.pathname + destination.search + destination.hash
      decoded = nextDecoded
    } catch {
      return "/"
    }
  }
  return "/"
}

export function developmentSignInHref(id: string, searchParams: AuthRedirectSearchParams): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    for (const entry of typeof value === "string" ? [value] : value ?? []) query.append(key, entry)
  }
  const destination = `/empreendimentos/${encodeURIComponent(id)}${query.size ? "?" + query.toString() : ""}`
  return "/sign-in?" + new URLSearchParams({ next: destination }).toString()
}
