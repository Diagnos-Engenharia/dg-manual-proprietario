import { NextResponse } from "next/server"
import { getActiveMembership } from "@/lib/organization"

export async function GET() {
  try {
    const context = await getActiveMembership()
    if (!context) return NextResponse.json({ error: "organization_required" }, { status: 404 })
    const metadata = context.organization.metadata ? JSON.parse(context.organization.metadata) as Record<string, unknown> : {}
    return NextResponse.json({ user: { name: context.user.name, email: context.user.email, image: context.user.image }, organization: { name: context.organization.name, logo: context.organization.logo, initials: metadata.initials, primaryColor: metadata.primaryColor }, role: context.member.role === "owner" ? "admin" : context.member.role })
  } catch { return NextResponse.json({ error: "Não autenticado" }, { status: 401 }) }
}
