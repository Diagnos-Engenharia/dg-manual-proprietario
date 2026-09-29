import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/app/actions/organization"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AppShell } from "@/components/dashboard/app-shell"

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")
  const context = await getOrganizationContext()
  const role = context.member.role === "owner" ? "Administrador" : context.member.role === "validator" ? "Validador" : context.member.role === "editor" ? "Editor" : "Membro"
  const permissions = context.member.role === "validator" ? "Pode validar conteúdos, solicitar ajustes e consultar o histórico." : context.member.role === "editor" ? "Pode elaborar e alterar conteúdos, mas não pode aprovar ou publicar." : "Pode gerenciar a construtora, a equipe, os empreendimentos e as configurações."
  return <AppShell title="Meu perfil" description="Dados pessoais, acesso e informações da construtora."><div className="space-y-6"><header><p className="text-sm text-muted-foreground">Conta e organização</p></header><div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Informações pessoais</CardTitle><CardDescription>Dados da conta autenticada.</CardDescription></CardHeader><CardContent className="space-y-4"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Nome completo</p><p className="mt-1 font-medium">{session.user.name}</p></div><div><p className="text-xs uppercase tracking-wider text-muted-foreground">E-mail</p><p className="mt-1 font-medium">{session.user.email}</p></div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Meu acesso</CardTitle><CardDescription>Permissões dentro da construtora.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Papel atual</span><Badge>{role}</Badge></div><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Construtora</p><p className="mt-1 font-medium">{context.organization.name}</p></div><p className="rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">{permissions}</p></CardContent></Card><Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">Informações da construtora</CardTitle><CardDescription>Dados compartilhados pela organização.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Nome</p><p className="mt-1 font-medium">{context.organization.name}</p></div><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Status</p><p className="mt-1 font-medium">Ativa</p></div></CardContent></Card></div></div></AppShell>
}
