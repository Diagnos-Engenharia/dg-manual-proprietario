import { redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { AppShell } from "@/components/dashboard/app-shell"
import { ManuaisPageContent } from "@/components/manuais/manuais-page-content"
import { listDevelopments } from "@/app/actions/developments"
import { listManualUnits, listPublishedManuals } from "@/app/actions/manuals"
import { isCurrentUserPlatformManager } from "@/lib/organization"

export default async function ManuaisPage() {
  await connection()
  if(await isCurrentUserPlatformManager())redirect("/gerenciador")
  const [persisted, published, units] = await Promise.all([
    listDevelopments().catch(() => []),
    listPublishedManuals().catch(() => null),
    listManualUnits().catch(() => null),
  ])
  return <AppShell title="Manuais"><Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Carregando manuais…</p>}><ManuaisPageContent persisted={persisted} published={published ?? []} publishedError={published === null} units={units ?? []} unitsError={units === null} /></Suspense></AppShell>
}
