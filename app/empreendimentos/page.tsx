import { redirect } from "next/navigation"
import { AppShell } from "@/components/dashboard/app-shell"
import { EmpreendimentosPageContent } from "@/components/empreendimentos/empreendimentos-page-content"
import { listDevelopments } from "@/app/actions/developments"
import { isCurrentUserPlatformManager,isGlobalAdmin,requireActiveMembership } from "@/lib/organization"

export default async function EmpreendimentosPage() {
  if(await isCurrentUserPlatformManager())redirect("/gerenciador")
  const [persisted, context] = await Promise.all([listDevelopments().catch(() => []), requireActiveMembership()])
  return (
    <AppShell title="Empreendimentos">
      <EmpreendimentosPageContent persisted={persisted} organizationName={context.organization.name} canCreate={isGlobalAdmin(context.member.role)} />
    </AppShell>
  )
}
