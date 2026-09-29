import Link from "next/link"
import { redirect } from "next/navigation"
import { acceptOrganizationInvitation, getInvitationPreview } from "@/app/actions/organization"

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const preview = await getInvitationPreview(token)
  if (!preview) return <main className="flex min-h-screen items-center justify-center bg-background p-6"><div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm"><h1 className="text-2xl font-semibold">Convite indisponível</h1><p className="mt-2 text-sm text-muted-foreground">Este convite expirou, foi cancelado ou já foi utilizado.</p><Link href="/sign-in" className="mt-6 block text-center text-sm text-primary hover:underline">Ir para o login</Link></div></main>
  async function accept() { "use server"; await acceptOrganizationInvitation(token); redirect("/") }
  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm"><p className="text-sm font-semibold uppercase tracking-widest text-primary">Diagnos</p><h1 className="mt-4 text-2xl font-semibold">Convite para {preview.organization.name}</h1><p className="mt-2 text-sm text-muted-foreground">Você foi convidado como <strong>{preview.role === "validator" ? "Validador" : "Editor"}</strong>.</p><div className="mt-6 rounded-lg bg-muted/50 p-4 text-sm"><p><strong>Convidado:</strong> {preview.name}</p><p className="mt-1"><strong>E-mail:</strong> {preview.email}</p><p className="mt-1"><strong>Permissões:</strong> {preview.role === "validator" ? "revisar, comentar, solicitar ajustes e aprovar" : "elaborar, salvar rascunhos, corrigir ajustes e enviar para validação"}</p></div><form action={accept} className="mt-6"><button className="h-10 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Aceitar convite</button></form><Link href={`/sign-up?invite=${token}&email=${encodeURIComponent(preview.email)}`} className="mt-4 block text-center text-sm text-primary hover:underline">Ainda não tenho uma conta</Link></div></main>
}
