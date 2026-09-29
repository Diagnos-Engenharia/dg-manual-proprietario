import { AppShell } from "@/components/dashboard/app-shell"
import { ManuaisPageContent } from "@/components/manuais/manuais-page-content"
import { listDevelopments } from "@/app/actions/developments"

export default async function ManuaisPage() {
  const persisted = await listDevelopments().catch(() => [])
  return <AppShell title="Manuais" description="Todos os manuais dos seus empreendimentos finalizados."><ManuaisPageContent persisted={persisted} /></AppShell>
}
