import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { AppShell } from "@/components/dashboard/app-shell"
import { PortfolioTable } from "@/components/dashboard/portfolio-table"
import { listDevelopments } from "@/app/actions/developments"
import { getActiveMembership,getOrganizationChoices,isCurrentUserPlatformManager } from "@/lib/organization"
import { toDashboardDevelopment } from "@/lib/dashboard"
import { DashboardInsights, DashboardPrioritySummary } from "@/components/dashboard/dashboard-insights"

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")
  if (await isCurrentUserPlatformManager()) redirect("/gerenciador")
  const membership = await getActiveMembership()
  if (!membership) redirect("/onboarding")
  const developments = await listDevelopments()
  const dashboardRows = developments.map(toDashboardDevelopment)
  return (
    <AppShell title="Dashboard">
      <div className="w-full">
        <PortfolioTable developments={dashboardRows} />
        <DashboardPrioritySummary developments={dashboardRows} />
        <DashboardInsights developments={dashboardRows} />
      </div>
    </AppShell>
  )
}
