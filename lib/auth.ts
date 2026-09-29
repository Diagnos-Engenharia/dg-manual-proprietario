import { betterAuth } from "better-auth"
import { pool } from "@/lib/db"

function toOrigin(value?: string) {
  if (!value) return null
  try {
    const url = value.startsWith("http://") || value.startsWith("https://")
      ? new URL(value)
      : new URL(`https://${value}`)
    return url.origin
  } catch {
    return null
  }
}

const productionOrigins = [
  process.env.BETTER_AUTH_URL,
  process.env.VERCEL_URL,
  process.env.VERCEL_BRANCH_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
]
  .map(toOrigin)
  .filter((value): value is string => Boolean(value))

export const auth = betterAuth({
  database: pool,
  baseURL:
    toOrigin(process.env.BETTER_AUTH_URL) ??
    toOrigin(process.env.VERCEL_BRANCH_URL) ??
    toOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    toOrigin(process.env.VERCEL_URL) ??
    toOrigin(process.env.V0_RUNTIME_URL) ??
    (process.env.NODE_ENV === "development" ? "http://localhost:3000" : undefined),
  emailAndPassword: { enabled: true, autoSignIn: true },
  trustedOrigins: [
    ...(process.env.NODE_ENV === "development"
      ? [
          "http://localhost:3000",
          ...["V0_RUNTIME_URL", "V0_DEV_APP_URL", "V0_BUILD_URL", "V0_SANDBOX_URL"]
            .map((key) => toOrigin(process.env[key]))
            .filter((value): value is string => Boolean(value)),
        ]
      : []),
    ...(process.env.NODE_ENV === "production" ? productionOrigins : []),
  ],
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  ...(process.env.NODE_ENV === "development"
    ? { advanced: { defaultCookieAttributes: { sameSite: "none" as const, secure: true } } }
    : {}),
})
