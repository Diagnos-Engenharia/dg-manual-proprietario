import { connection } from "next/server"
import { redirect } from "next/navigation"
import { ClientAccessError, getClientPortalData } from "@/lib/clients"
import { ClientPortal, PortalSignOut } from "@/components/clients/client-portal"

export const dynamic = "force-dynamic"

export default async function MyManualPage() {
  await connection()
  let data, failure = "", disabled = false
  try { data = await getClientPortalData() }
  catch (error) {
    if (error instanceof ClientAccessError && error.status === 401) redirect("/sign-in?next=%2Fmeu-manual")
    disabled = error instanceof ClientAccessError && error.status === 403
    failure = error instanceof ClientAccessError ? error.message : "Não foi possível carregar seus documentos. Tente novamente em instantes."
  }
  return <div className="min-h-svh bg-background">
    <header className="border-b border-border bg-card"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6"><span className="text-sm font-semibold tracking-tight">Diagnos · Meu manual</span><PortalSignOut /></div></header>
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      {data ? <ClientPortal data={data} /> : <section className="rounded-xl border border-border bg-card p-6"><h1 className="text-xl font-semibold">{disabled ? "Acesso indisponível" : "Seus documentos"}</h1><p role="alert" className="mt-2 text-sm text-muted-foreground">{failure}</p>{!disabled && <a href="/meu-manual" className="mt-4 inline-block text-sm font-medium text-primary underline">Tentar novamente</a>}</section>}
    </main>
  </div>
}
