"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { acceptOrganizationInvitation } from "@/app/actions/organization"

export function InvitationAcceptForm({ token, destination }: { token: string; destination: "/" | "/meu-manual" }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  function accept() {
    setError("")
    startTransition(async () => {
      try { await acceptOrganizationInvitation(token); router.replace(destination); router.refresh() }
      catch (failure) {
        const message = failure instanceof Error ? failure.message : ""
        setError(/^(Convite|Este convite|Unidade não disponível|Empreendimento não disponível|Solicite a reativação|Não autenticado|Conta inativa)/.test(message) ? message : "Não foi possível aceitar o convite. Tente novamente ou solicite um novo link à construtora.")
      }
    })
  }
  return <div className="mt-6">{error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button type="button" onClick={accept} disabled={pending} className="h-10 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{pending ? "Aceitando..." : "Aceitar convite"}</button></div>
}
