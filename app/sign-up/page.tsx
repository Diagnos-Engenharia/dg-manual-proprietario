"use client"

import { FormEvent, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { signUp } from "@/lib/auth-client"

function formatSignUpError(error: unknown) {
  if (!error || typeof error !== "object") return "Não foi possível criar a conta."
  const message = "message" in error && typeof error.message === "string" ? error.message : ""
  const code = "code" in error && typeof error.code === "string" ? error.code : ""

  if (/already|exists|unique/i.test(message) || /USER_ALREADY_EXISTS/i.test(code)) {
    return "Este e-mail já possui uma conta."
  }
  if (/database|relation|connect|ECONN|ENOTFOUND|timeout/i.test(message)) {
    return "O serviço de acesso está temporariamente indisponível. Verifique a conexão com o banco de dados."
  }
  return message || "Não foi possível criar a conta."
}

export default function SignUpPage() {
  const router = useRouter()
  const searchParams=useSearchParams()
  const invite=searchParams.get("invite")?.trim()??""
  const invitedEmail=searchParams.get("email")?.trim().toLowerCase()??""
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")
    const form = new FormData(event.currentTarget)

    try {
      if(!invite)throw new Error("O cadastro exige um convite válido.")
      const result = await signUp.email({
        name: String(form.get("name")),
        email: String(form.get("email")).trim().toLowerCase(),
        password: String(form.get("password")),
        fetchOptions:{headers:{"x-dg-invite":invite}},
      })

      if (result.error) {
        console.error("[auth] Falha ao criar conta", result.error)
        setError(formatSignUpError(result.error))
        return
      }

      router.replace("/convite/"+encodeURIComponent(invite))
      router.refresh()
    } catch (cause) {
      console.error("[auth] Erro inesperado no cadastro", cause)
      setError(formatSignUpError(cause))
    } finally {
      setLoading(false)
    }
  }

  if(!invite)return <main className="flex min-h-screen items-center justify-center bg-background p-6"><div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"><h1 className="text-xl font-semibold">Cadastro por convite</h1><p className="text-sm leading-6 text-muted-foreground">Por segurança, novas contas do DG Manual são criadas somente por um convite emitido pelo Gerenciador ou Administrador da construtora.</p><Link href="/sign-in" className="inline-flex h-10 w-full items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent">Voltar ao login</Link></div></main>

  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"><div><h1 className="text-xl font-semibold">Criar conta</h1><p className="text-sm text-muted-foreground">Comece a gerenciar seus manuais.</p></div><input name="name" required placeholder="Nome completo" className="h-10 w-full rounded-md border border-input bg-background px-3" /><input name="email" type="email" required readOnly={Boolean(invitedEmail)} defaultValue={invitedEmail} placeholder="E-mail" className="h-10 w-full rounded-md border border-input bg-background px-3" /><input name="password" type="password" required minLength={8} placeholder="Senha (mínimo 8 caracteres)" className="h-10 w-full rounded-md border border-input bg-background px-3" />{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<button disabled={loading} className="h-10 w-full rounded-md bg-primary px-4 text-primary-foreground disabled:opacity-60">{loading ? "Criando..." : "Criar conta"}</button><p className="text-center text-sm text-muted-foreground">Já possui acesso? <Link href="/sign-in" className="text-primary hover:underline">Entrar</Link></p></form></main>
}
