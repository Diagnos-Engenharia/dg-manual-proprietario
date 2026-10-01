import Link from "next/link"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getActiveMembership,isCurrentUserPlatformManager } from "@/lib/organization"

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")
  if (await isCurrentUserPlatformManager()) redirect("/gerenciador")
  const membership = await getActiveMembership()
  if (membership) redirect("/")
  return <main className="flex min-h-screen items-center justify-center bg-background p-6">
    <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">DG Manual</p>
      <h1 className="mt-3 text-2xl font-semibold">Seu acesso ainda não está vinculado a uma construtora</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">No novo fluxo, Administradores são cadastrados pelo Gerenciador e Construtores são convidados pelo Administrador da construtora. Use o link recebido por e-mail para concluir o vínculo.</p>
      <div className="mt-6 rounded-lg border border-border bg-muted/30 p-4 text-sm">
        <p className="font-medium">Já recebeu um convite?</p>
        <p className="mt-1 text-muted-foreground">Abra novamente o link enviado para o seu e-mail e aceite o acesso com esta conta.</p>
      </div>
      <Link href="/sign-in" className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent">Voltar ao login</Link>
    </div>
  </main>
}
