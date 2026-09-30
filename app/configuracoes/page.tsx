import { requireCompanyRole } from "@/lib/organization"
import { listOrganizationDevelopments, listOrganizationMembers } from "@/app/actions/organization"
import { listIntegrationStatus } from "@/app/actions/integrations"
import { AppShell } from "@/components/dashboard/app-shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OrganizationIdentity } from "@/components/settings/organization-identity"
import { IntegrationsPanel } from "@/components/settings/integrations-panel"
import { TeamPageContent } from "@/components/team/team-page-content"

export default async function SettingsPage(){
  const context=await requireCompanyRole(["admin"])
  const [members,developments,integrations]=await Promise.all([
    listOrganizationMembers(),listOrganizationDevelopments(),listIntegrationStatus()
  ])
  const metadata=context.organization.metadata?JSON.parse(context.organization.metadata) as Record<string,string>:{}
  return <AppShell title="Informações da construtora" description="Identidade, equipe, acessos, integrações e preferências da organização.">
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-6">
        <OrganizationIdentity name={context.organization.name} logo={context.organization.logo} initials={metadata.initials??""} color={metadata.primaryColor??"#2563eb"}/>
        <TeamPageContent members={members.map(m=>({...m,createdAt:m.createdAt.toISOString(),lastAccessAt:m.lastAccessAt?.toISOString()??null}))} developments={developments}/>
      </div>
      <div className="min-w-0 space-y-6">
        <IntegrationsPanel entries={integrations}/>
        <Card><CardHeader><CardTitle>Preferências e notificações</CardTitle><CardDescription>Configurações institucionais de notificação e preferências.</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">As preferências adicionais poderão ser configuradas conforme a habilitação dos módulos.</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Informações do sistema</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">Diagnos · organização {context.organization.id.slice(0,8)}</p></CardContent></Card>
      </div>
    </div>
  </AppShell>
}
