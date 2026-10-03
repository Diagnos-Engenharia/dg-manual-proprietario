"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { signIn } from "@/lib/auth-client"
import { safeAuthRedirect } from "@/lib/auth-redirect"

export default function SignInPage() {
  const router = useRouter()
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [recovery, setRecovery] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setPending(true)
    const form = new FormData(event.currentTarget)
    try {
      const result = await signIn.email({ email: String(form.get("email")), password: String(form.get("password")) })
      if (result.error) setError("Não foi possível entrar com esses dados.")
      else {
        const destination = safeAuthRedirect(new URLSearchParams(window.location.search).get("next"))
        router.push(destination)
        router.refresh()
      }
    } catch (loginError) {
      console.error("[v0] Falha no login", loginError)
      setError("Não foi possível conectar ao serviço de acesso.")
    } finally {
      setPending(false)
    }
  }
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fbfcfd] px-6 py-10 text-[#172033]">
      <div className="pointer-events-none absolute -left-24 -top-28 h-[520px] w-[520px] rounded-full bg-[#e6f3ff] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 left-[34%] h-[460px] w-[460px] rounded-full bg-[#fff5d6] blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-[28%] h-[520px] w-[520px] rounded-full bg-[#eef4ff] blur-3xl" />
      <div className="relative grid w-full max-w-5xl items-center gap-16 lg:grid-cols-[1fr_420px]">
        <section className="hidden px-8 lg:block">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1769aa] text-3xl font-black tracking-[-0.12em] text-white shadow-lg shadow-[#1769aa]/20">D</div>
            <div><p className="text-3xl font-bold tracking-[-0.04em] text-[#1769aa]">DIAGNOS</p><p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8aa3b8]">Engenharia e gestão</p></div>
          </div>
          <h2 className="max-w-md text-4xl font-semibold leading-tight tracking-[-0.04em]">Manuais claros para decisões mais seguras.</h2>
          <p className="mt-5 max-w-md text-base leading-7 text-[#718096]">Centralize seus empreendimentos, documentos e entregas em um único lugar.</p>
          <div className="mt-10 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#9aabba]"><span className="h-px w-8 bg-[#cbd9e5]" /> Plataforma Diagnos <span className="h-px w-8 bg-[#cbd9e5]" /></div>
        </section>
        <form onSubmit={submit} className="w-full space-y-5 rounded-[22px] border border-[#dce5ed] bg-white p-8 shadow-[0_24px_60px_rgba(40,65,90,0.10)] sm:p-9">
          <div className="flex items-start justify-between"><div><h1 className="text-[25px] font-semibold tracking-[-0.03em]">Bem-vindo de volta</h1><p className="mt-2 text-sm text-[#96a3b2]">Acesse sua conta para continuar.</p></div><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1769aa] text-sm font-bold text-white">i</span></div>
          <label className="block text-sm font-medium text-[#4d5d70]">Usuário ou E-mail<input name="email" type="email" required placeholder="seu@email.com" className="mt-2 h-11 w-full rounded-lg border border-[#b8c4ce] bg-white px-3 text-[#172033] outline-none transition focus:border-[#1769aa] focus:ring-2 focus:ring-[#1769aa]/15" /></label>
          <label className="block text-sm font-medium text-[#4d5d70]">Senha<input name="password" type="password" required minLength={8} placeholder="Sua senha" className="mt-2 h-11 w-full rounded-lg border border-[#b8c4ce] bg-white px-3 text-[#172033] outline-none transition focus:border-[#1769aa] focus:ring-2 focus:ring-[#1769aa]/15" /></label>
          <div className="flex justify-end text-sm"><button type="button" onClick={() => setRecovery(value => !value)} aria-expanded={recovery} className="font-medium text-[#1769aa] hover:underline">Esqueci minha senha</button></div>
          {recovery && <p role="status" className="rounded-lg bg-[#eef4ff] p-3 text-sm text-[#526577]">Solicite à construtora um link para redefinir sua senha. O link é válido por 15 minutos.</p>}
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button disabled={pending} className="h-11 w-full rounded-lg bg-[#1769aa] px-4 text-sm font-semibold text-white shadow-md shadow-[#1769aa]/20 transition hover:bg-[#12598f] disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Entrando..." : "ENTRAR NA MINHA CONTA"}</button>
          <p className="text-center text-sm text-[#96a3b2]">Ainda não possui acesso? <Link href="/sign-up" className="font-medium text-[#1769aa] hover:underline">Criar conta</Link></p>
        </form>
      </div>
    </main>
  )
}
