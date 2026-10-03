import { connection } from "next/server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { listClientAdminData } from "@/app/actions/clients"
import { AppShell } from "@/components/dashboard/app-shell"
import { ClientUsers } from "@/components/clients/client-users"

export default async function UsersPage() {
  await connection()
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in?next=%2Fusuarios")
  let data
  try { data = await listClientAdminData() } catch { /* Keep permission/load failures distinct from an empty client list. */ }
  return <AppShell title="Usuários" description="Gerencie o acesso dos clientes aos manuais publicados.">
    {data ? <ClientUsers initialData={data} /> : <p role="alert" className="rounded-xl border border-border bg-card p-5 text-sm">Não foi possível carregar os usuários. Esta página é exclusiva do Administrador da construtora ativa.</p>}
  </AppShell>
}
