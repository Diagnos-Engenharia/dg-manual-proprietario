import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/app/actions/organization"
import { AppShell } from "@/components/dashboard/app-shell"
import { ProfilePageContent } from "@/components/profile/profile-page-content"

const roleLabels:Record<string,string>={
  owner:"Administrador",
  admin:"Administrador",
  admin_empreendimento:"Administrador do empreendimento",
  editor:"Editor",
  validator:"Validador",
}

export default async function ProfilePage(){
  const session=await auth.api.getSession({headers:await headers()})
  if(!session?.user)redirect("/sign-in")

  const context=await getOrganizationContext()
  const roleLabel=roleLabels[context.member.role]??"Membro"

  return <AppShell title="Meu perfil" description="Gerencie seus dados de acesso e segurança.">
    <ProfilePageContent
      name={session.user.name}
      email={session.user.email}
      organizationName={context.organization.name}
      roleLabel={roleLabel}
    />
  </AppShell>
}
