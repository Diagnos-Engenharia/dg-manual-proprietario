import { redirect } from "next/navigation"
import { listManagedOrganizations } from "@/app/actions/manager"
import { getPlatformAiIntegration } from "@/app/actions/platform-integrations"
import { ManagerDashboard } from "@/components/manager/manager-dashboard"
import { requirePlatformManager } from "@/lib/organization"

export const dynamic="force-dynamic"

export default async function ManagerPage(){
  const manager=await requirePlatformManager().catch(()=>null)
  if(!manager)redirect("/")
  const [companies,aiIntegration]=await Promise.all([listManagedOrganizations(),getPlatformAiIntegration()])
  return <ManagerDashboard
    managerName={manager.user.name}
    companies={companies.map(company=>({...company,members:company.members.map(member=>({...member,lastAccessAt:member.lastAccessAt?.toISOString()??null}))}))}
    aiIntegration={aiIntegration}
  />
}
