import { redirect } from "next/navigation"
import { AppShell } from "@/components/dashboard/app-shell"
import { ManuaisPageContent } from "@/components/manuais/manuais-page-content"
import { listDevelopments } from "@/app/actions/developments"
import { isCurrentUserPlatformManager } from "@/lib/organization"

export default async function ManuaisPage() {
  if(await isCurrentUserPlatformManager())redirect("/gerenciador")
  const persisted = await listDevelopments().catch(() => [])
  return <AppShell title="Manuais"><ManuaisPageContent persisted={persisted} /></AppShell>
}
