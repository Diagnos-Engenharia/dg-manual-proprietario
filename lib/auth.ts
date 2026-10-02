import { createHash } from "node:crypto"
import { betterAuth } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { and, eq, gt } from "drizzle-orm"
import { db, pool } from "@/lib/db"
import { organizationInvitations, user as userTable } from "@/lib/db/schema"

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
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "rateLimit",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 8 },
      "/sign-up/email": { window: 300, max: 5 },
      "/change-password": { window: 300, max: 5 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if(ctx.path==="/sign-up/email"){
        const email=String(ctx.body?.email??"").trim().toLowerCase()
        const token=ctx.headers?.get("x-dg-invite")?.trim()??""
        if(!email||!token)throw new APIError("FORBIDDEN",{message:"O cadastro no DG Manual exige um convite válido."})
        const tokenHash=createHash("sha256").update(token).digest("hex")
        const invite=(await db.select({id:organizationInvitations.id}).from(organizationInvitations).where(and(
          eq(organizationInvitations.tokenHash,tokenHash),
          eq(organizationInvitations.email,email),
          eq(organizationInvitations.status,"pending"),
          gt(organizationInvitations.expiresAt,new Date()),
        )).limit(1))[0]
        if(!invite)throw new APIError("FORBIDDEN",{message:"Convite inválido, expirado ou destinado a outro e-mail."})
        return
      }
      if(ctx.path==="/sign-in/email"){
        const email=String(ctx.body?.email??"").trim().toLowerCase()
        if(!email)return
        const profile=(await db.select({accessStatus:userTable.accessStatus}).from(userTable).where(eq(userTable.email,email)).limit(1))[0]
        if(profile?.accessStatus==="disabled"){
          throw new APIError("FORBIDDEN",{message:"Esta conta está inativa. Solicite a reativação ao Gerenciador."})
        }
      }
    }),
  },
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
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      secure: true,
      sameSite: process.env.NODE_ENV === "development" ? "none" as const : "lax" as const,
    },
  },
})
