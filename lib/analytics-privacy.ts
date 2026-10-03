/** Never send bearer links or authentication destinations to telemetry. */
export function analyticsUrlAllowed(value: string): boolean {
  try {
    const url = new URL(value, "https://analytics.invalid")
    const pathname = decodeURIComponent(url.pathname)
    return !/^\/(?:convite|redefinir-senha|sign-in|sign-up)(?:\/|$)/.test(pathname)
      && !["token", "invite", "next", "email"].some(name => url.searchParams.has(name))
  } catch { return false }
}
