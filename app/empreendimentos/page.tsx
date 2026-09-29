import { AppShell } from "@/components/dashboard/app-shell"
import { EmpreendimentosPageContent } from "@/components/empreendimentos/empreendimentos-page-content"
import { listDevelopments } from "@/app/actions/developments"
import { requireActiveMembership } from "@/lib/organization"

export default async function EmpreendimentosPage() {
  const [persisted, context] = await Promise.all([listDevelopments().catch(() => []), requireActiveMembership()])
  return (
    <AppShell
      title="Empreendimentos"
      description="Selecione um empreendimento para gerenciar cronograma, elaboração, identidade visual e emissão."
    >
      <EmpreendimentosPageContent persisted={persisted} organizationName={context.organization.name} />
    </AppShell>
  )
}
