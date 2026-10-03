/** Deliberately omit messages, stack traces, queries and request/provider data. */
export function safeErrorDetails(error: unknown): { kind: string; code?: string } {
  const kind = error instanceof TypeError ? "TypeError" : error instanceof SyntaxError ? "SyntaxError" : error instanceof Error ? "Error" : "Unknown"
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : undefined
  return code ? { kind, code } : { kind }
}

export function logSafeError(event: string, error: unknown) {
  console.error(event, safeErrorDetails(error))
}
