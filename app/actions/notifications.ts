"use server"

import { and, desc, eq, isNull } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { organizationNotifications } from "@/lib/db/schema"

async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Não autenticado")
  return session.user.id
}

export async function listNotifications() {
  const userId = await currentUser()
  return db.select().from(organizationNotifications).where(and(eq(organizationNotifications.userId, userId), isNull(organizationNotifications.readAt))).orderBy(desc(organizationNotifications.createdAt)).limit(8)
}

export async function markNotificationsRead() {
  const userId = await currentUser()
  await db.update(organizationNotifications).set({ readAt: new Date() }).where(and(eq(organizationNotifications.userId, userId), isNull(organizationNotifications.readAt)))
}
