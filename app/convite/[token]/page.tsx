import Link from "next/link"
import { headers } from "next/headers"
import { getInvitationPreview } from "@/app/actions/organization"
import { auth } from "@/lib/auth"
import { InvitationAcceptForm } from "./invitation-accept-form"

export const dynamic = "force-dynamic"

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const preview = await getInvitationPreview(token)
  if (!preview) return <main className="flex min-h-screen items-center justify-center bg-background p-6"><div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm"><h1 className="text-2xl font-semibold">Convite indisponível</h1><p className="mt-2 text-sm text-muted-foreground">Este convite expirou, foi cancelado, está desabilitado ou já foi utilizado. Solicite um novo link à construtora.</p><Link href="/sign-in" className="mt-6 block text-center text-sm text-primary hover:underline">Ir para o login</Link></div></main>
  const session = await auth.api.getSession({ headers: await headers() })
  const administrator = preview.role === "admin"
  const client = preview.role === "client"
  const returnPath = "/convite/" + encodeURIComponent(token)
  const sameEmail = session?.user.email.toLowerCase() === preview.email.toLowerCase()
  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
    <p className="text-sm font-semibold uppercase tracking-widest text-primary">Diagnos</p>
    <h1 className="mt-4 text-2xl font-semibold">Convite para {preview.organization.name}</h1>
    <p className="mt-2 text-sm text-muted-foreground">Você foi convidado como <strong>{client ? "Cliente" : administrator ? "Administrador" : "Construtor"}</strong>.</p>
    <div className="mt-6 rounded-lg bg-muted/50 p-4 text-sm">
      <p><strong>Convidado:</strong> {preview.name}</p><p className="mt-1"><strong>E-mail:</strong> {preview.email}</p>
      {preview.clientUnit && <><p className="mt-1"><strong>Empreendimento:</strong> {preview.clientUnit.developmentName}</p><p className="mt-1"><strong>Unidade:</strong> {preview.clientUnit.unitLabel}</p></>}
      <p className="mt-1"><strong>Permissões:</strong> {client ? "consultar o Manual do Proprietário publicado e a Tabela de Acabamentos publicada da sua unidade" : administrator ? "gerenciar empreendimentos, convidar Construtores e validar conteúdos" : "elaborar os manuais nos empreendimentos atribuídos e enviar conteúdo para validação"}</p>
    </div>
    {sameEmail ? <InvitationAcceptForm token={token} destination={client ? "/meu-manual" : "/"} /> : <>
      {session?.user && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Este convite é destinado a outro e-mail. Saia da conta atual e entre com {preview.email}.</p>}
      <Link href={`/sign-in?next=${encodeURIComponent(returnPath)}`} className="mt-6 block rounded-md bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground">Entrar para aceitar o convite</Link>
    </>}
    {!session?.user && <Link href={`/sign-up?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(preview.email)}`} className="mt-4 block text-center text-sm text-primary hover:underline">Ainda não tenho uma conta</Link>}
  </div></main>
}
