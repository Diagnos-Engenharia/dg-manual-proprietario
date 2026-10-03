import Link from "next/link"
import { ClientPasswordResetForm } from "./reset-password-form"

export const dynamic = "force-dynamic"

export default async function ClientPasswordResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const validShape = /^[A-Za-z0-9_-]{43}$/.test(token)
  return <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10"><div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm"><p className="text-sm font-semibold uppercase tracking-widest text-primary">Diagnos</p><h1 className="mt-4 text-2xl font-semibold">Redefinir senha</h1><p className="mt-2 text-sm text-muted-foreground">O link fornecido pela construtora vale por 15 minutos e pode ser usado uma vez.</p>{validShape ? <ClientPasswordResetForm token={token} /> : <p role="alert" className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700">Link de redefinição inválido. Solicite um novo link à construtora.</p>}<Link href="/sign-in" className="mt-6 block text-center text-sm text-primary hover:underline">Voltar para o login</Link></div></main>
}
