"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { signUp } from "@/lib/auth-client"

export default function SignUpPage() {
  const router = useRouter()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")
    const form = new FormData(event.currentTarget)
    const result = await signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
    })
    if (result.error) setError("Não foi possível criar a conta.")
    else { router.push("/"); router.refresh() }
    setLoading(false)
  }

  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"><div><h1 className="text-xl font-semibold">Criar conta</h1><p className="text-sm text-muted-foreground">Comece a gerenciar seus manuais.</p></div><input name="name" required placeholder="Nome completo" className="h-10 w-full rounded-md border border-input bg-background px-3" /><input name="email" type="email" required placeholder="E-mail" className="h-10 w-full rounded-md border border-input bg-background px-3" /><input name="password" type="password" required minLength={8} placeholder="Senha (mínimo 8 caracteres)" className="h-10 w-full rounded-md border border-input bg-background px-3" />{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<button disabled={loading} className="h-10 w-full rounded-md bg-primary px-4 text-primary-foreground disabled:opacity-60">{loading ? "Criando..." : "Criar conta"}</button><p className="text-center text-sm text-muted-foreground">Já possui acesso? <Link href="/sign-in" className="text-primary hover:underline">Entrar</Link></p></form></main>
}
