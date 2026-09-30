import { redirect } from "next/navigation"
import { isGlobalAdmin,requireActiveMembership } from "@/lib/organization"
import { listOrganizationDevelopments,listOrganizationMembers } from "@/app/actions/organization"
import { listIntegrationStatus } from "@/app/actions/integrations"
import { listPublicApiKeys } from "@/app/actions/public-api-keys"
import { AppShell } from "@/components/dashboard/app-shell"
import { SettingsWorkspace } from "@/components/settings/settings-workspace"

export default async function SettingsPage(){
  const context=await requireActiveMembership()
  if(!isGlobalAdmin(context.member.role))redirect("/")
  const [members,developments,integrations,apiKeys]=await Promise.all([listOrganizationMembers(),listOrganizationDevelopments(),listIntegrationStatus(),listPublicApiKeys()])
  const metadata=context.organization.metadata?JSON.parse(context.organization.metadata) as Record<string,string>:{}
  return <AppShell title="Informações da construtora">
    <SettingsWorkspace
      organization={{name:context.organization.name,logo:context.organization.logo,initials:metadata.initials??"",color:metadata.primaryColor??"#2563eb"}}
      members={members.map(m=>({...m,createdAt:m.createdAt.toISOString(),lastAccessAt:m.lastAccessAt?.toISOString()??null}))}
      developments={developments}
      integrations={integrations}
      apiKeys={apiKeys}
    />
  </AppShell>
}
