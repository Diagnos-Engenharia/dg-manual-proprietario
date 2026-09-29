import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getOrganizationContext, listOrganizationMembers } from "@/app/actions/organization"
import { TeamPageContent } from "@/components/team/team-page-content"
import { AppShell } from "@/components/dashboard/app-shell"

export default async function TeamPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")
  try {
    const [context, members] = await Promise.all([getOrganizationContext(), listOrganizationMembers()])
    return <AppShell title="Equipe e acessos" description="Gerencie membros, papéis e acessos da construtora."><TeamPageContent organization={context.organization} currentRole={context.member.role} members={members.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), lastAccessAt: item.lastAccessAt?.toISOString() ?? null }))} /></AppShell>
  } catch {
    redirect("/")
  }
}
