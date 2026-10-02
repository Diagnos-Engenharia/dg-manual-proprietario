"use server"

import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { organizationNotifications } from "@/lib/db/schema"
import { requireAuthenticatedUser } from "@/lib/organization"

async function currentUser() {
  return (await requireAuthenticatedUser()).id
}

export async function listNotifications() {
  const userId = await currentUser()
  return db.select().from(organizationNotifications).where(and(eq(organizationNotifications.userId, userId), isNull(organizationNotifications.readAt))).orderBy(desc(organizationNotifications.createdAt)).limit(8)
}

export async function markNotificationsRead() {
  const userId = await currentUser()
  await db.update(organizationNotifications).set({ readAt: new Date() }).where(and(eq(organizationNotifications.userId, userId), isNull(organizationNotifications.readAt)))
}

export async function markNotificationRead(id: string) {
  const userId = await currentUser()
  await db.update(organizationNotifications).set({ readAt: new Date() }).where(and(eq(organizationNotifications.id, id), eq(organizationNotifications.userId, userId)))
}
