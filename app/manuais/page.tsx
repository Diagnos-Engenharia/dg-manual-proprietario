import { redirect } from "next/navigation"
import { AppShell } from "@/components/dashboard/app-shell"
import { ManuaisPageContent } from "@/components/manuais/manuais-page-content"
import { listDevelopments } from "@/app/actions/developments"
import { listPublishedManuals } from "@/app/actions/manuals"
import { isCurrentUserPlatformManager } from "@/lib/organization"

export default async function ManuaisPage() {
  if(await isCurrentUserPlatformManager())redirect("/gerenciador")
  const [persisted, published] = await Promise.all([
    listDevelopments().catch(() => []),
    listPublishedManuals().catch(() => null),
  ])
  return <AppShell title="Manuais"><ManuaisPageContent persisted={persisted} published={published ?? []} publishedError={published === null} /></AppShell>
}
