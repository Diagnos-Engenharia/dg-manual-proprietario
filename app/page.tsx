import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { AppShell } from "@/components/dashboard/app-shell"
import { PortfolioTable } from "@/components/dashboard/portfolio-table"
import { listDevelopments } from "@/app/actions/developments"
import { getActiveMembership } from "@/lib/organization"
import { toDashboardDevelopment } from "@/lib/dashboard"
import { DashboardInsights, DashboardPrioritySummary } from "@/components/dashboard/dashboard-insights"

export default async function DashboardPage() {
  if (process.env.VERCEL_ENV === "preview" && !process.env.DATABASE_URL) {
    redirect("/pr-preview")
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")
  const membership = await getActiveMembership()
  if (!membership) redirect("/onboarding")
  const developments = await listDevelopments()
  const dashboardRows = developments.map(toDashboardDevelopment)
  return (
    <AppShell
      title="Dashboard de progresso"
      description="Visão completa da carteira de manuais do proprietário."
    >
      <div className="w-full">
        <PortfolioTable developments={dashboardRows} />
        <DashboardPrioritySummary developments={dashboardRows} />
        <DashboardInsights developments={dashboardRows} />
      </div>
    </AppShell>
  )
}
