import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getActiveMembership } from "@/lib/organization"
import { CompanyOnboarding } from "@/components/onboarding/company-onboarding"

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")
  const membership = await getActiveMembership()
  if (membership) redirect("/")
  return <CompanyOnboarding userName={session.user.name} />
}
