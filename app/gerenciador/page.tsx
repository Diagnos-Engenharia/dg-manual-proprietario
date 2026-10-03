import { redirect } from "next/navigation"
import { listManagedOrganizations } from "@/app/actions/manager"
import { getPlatformAiIntegration } from "@/app/actions/platform-integrations"
import { ManagerDashboard } from "@/components/manager/manager-dashboard"
import { requirePlatformManager } from "@/lib/organization"

export const dynamic="force-dynamic"

export default async function ManagerPage({searchParams}:{searchParams:Promise<{q?:string;page?:string}>}){
  const manager=await requirePlatformManager().catch(()=>null)
  if(!manager)redirect("/")
  const params=await searchParams
  const [result,aiIntegration]=await Promise.all([listManagedOrganizations({search:params.q,page:Number(params.page)}),getPlatformAiIntegration()])
  return <ManagerDashboard
    managerName={manager.user.name}
    managerEmail={manager.user.email}
    companies={result.companies.map(company=>({...company,members:company.members.map(member=>({...member,lastAccessAt:member.lastAccessAt?.toISOString()??null}))}))}
    pagination={result.pagination}
    aiIntegration={aiIntegration}
  />
}
