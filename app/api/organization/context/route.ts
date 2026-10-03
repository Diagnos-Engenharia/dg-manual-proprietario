import { NextResponse } from "next/server"
import { requireActiveMembership, getOrganizationChoices } from "@/lib/organization"

export async function GET() {
  try {
    const context = await requireActiveMembership()
    const metadata = context.organization.metadata ? JSON.parse(context.organization.metadata) as Record<string, unknown> : {}
    const choices=await getOrganizationChoices()
    return NextResponse.json({ user: { name: context.user.name, email: context.user.email, image: context.user.image }, organization: { name: context.organization.name, logo: context.organization.logo, initials: metadata.initials, primaryColor: metadata.primaryColor }, canSwitchOrganization:choices.organizations.length>1, role: context.member.role === "owner" ? "admin" : context.member.role },{headers:{"Cache-Control":"private, no-store"}})
  } catch(error) {
    const status=error instanceof Error&&error.message==="Não autenticado"?401:403
    return NextResponse.json({error:status===401?"Não autenticado":"Contexto da construtora indisponível"},{status,headers:{"Cache-Control":"private, no-store"}})
  }
}
