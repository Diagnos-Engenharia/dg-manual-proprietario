"use client"

import { useState, useTransition, type FormEvent } from "react"
import { resetClientPassword } from "@/app/actions/clients"

export function ClientPasswordResetForm({ token }: { token: string }) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState("")
  const [complete, setComplete] = useState(false)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get("password") ?? "")
    if (password !== String(form.get("confirmation") ?? "")) { setMessage("As senhas não coincidem."); return }
    setMessage("")
    startTransition(async () => {
      try { const result = await resetClientPassword({ token, password }); setMessage(result.message); setComplete(result.ok) }
      catch { setMessage("Não foi possível conectar ao serviço. Tente novamente.") }
    })
  }
  if (complete) return <p role="status" className="mt-6 rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>
  return <form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-medium">Nova senha<input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={pending} className="mt-2 h-11 w-full rounded-md border bg-background px-3" /></label><label className="block text-sm font-medium">Confirmar nova senha<input name="confirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={pending} className="mt-2 h-11 w-full rounded-md border bg-background px-3" /></label>{message && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}<button disabled={pending} className="h-11 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{pending ? "Atualizando..." : "Atualizar senha"}</button></form>
}
