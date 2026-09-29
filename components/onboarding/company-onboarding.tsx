"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createOrganization } from "@/app/actions/organization"

export function CompanyOnboarding({ userName }: { userName: string }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [initials, setInitials] = useState("")
  const [color, setColor] = useState("#2563eb")
  const [logo, setLogo] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { await createOrganization({ name, initials, primaryColor: color, logo }); router.replace("/"); router.refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar a construtora") } finally { setSaving(false) } }
  async function upload(file: File) { const data = new FormData(); data.set("file", file); const response = await fetch("/api/organization/logo", { method: "POST", body: data }); if (!response.ok) throw new Error("Não foi possível enviar o logotipo"); const result = await response.json() as { url: string }; setLogo(result.url) }
  const fallback = (initials || name.slice(0, 2)).toUpperCase().slice(0, 4) || "CO"
  return <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10"><form onSubmit={submit} className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Primeiro acesso</p><h1 className="mt-3 text-2xl font-semibold tracking-tight">Configure sua construtora</h1><p className="mt-2 text-sm text-muted-foreground">Olá, {userName}. Cadastre a identidade da organização para continuar.</p><div className="mt-8 grid gap-5"><label className="grid gap-2 text-sm font-medium">Nome da construtora<input required value={name} onChange={(e) => setName(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 font-normal" placeholder="Nome oficial da empresa" /></label><div className="grid gap-2"><label className="text-sm font-medium" htmlFor="logo">Logotipo</label><input id="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file).catch((cause) => setError(cause instanceof Error ? cause.message : "Falha no upload")) }} className="text-sm" /><p className="text-xs text-muted-foreground">PNG, JPG, WEBP ou SVG.</p></div><div className="grid gap-2"><label className="text-sm font-medium">Iniciais exibidas</label><div className="flex gap-3"><input value={initials} maxLength={4} onChange={(e) => setInitials(e.target.value.toUpperCase())} className="h-10 w-28 rounded-md border border-input bg-background px-3" /><span className="flex h-10 w-10 items-center justify-center rounded-md text-xs font-bold text-white" style={{ backgroundColor: color }}>{fallback}</span></div></div><label className="flex items-center justify-between rounded-lg border border-border p-3 text-sm font-medium">Cor principal<input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 cursor-pointer rounded border-0 bg-transparent" /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<button disabled={saving} className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{saving ? "Salvando…" : "Salvar e acessar o Dashboard"}</button></div></form></main>
}
