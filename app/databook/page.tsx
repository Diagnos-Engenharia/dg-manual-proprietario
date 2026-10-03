import { connection } from "next/server"
import { notFound, redirect } from "next/navigation"
import { AppShell } from "@/components/dashboard/app-shell"
import { Databook } from "@/components/databook/databook"
import { listDevelopments } from "@/app/actions/developments"
import { isCurrentUserPlatformManager, requireActiveMembership } from "@/lib/organization"

export default async function DatabookPage({ searchParams }: { searchParams: Promise<{ empreendimento?: string }> }) {
  await connection()
  if (await isCurrentUserPlatformManager()) redirect("/gerenciador")
  try { await requireActiveMembership() } catch (error) {
    if (error instanceof Error && /Não autenticado/.test(error.message)) redirect("/sign-in?next=%2Fdatabook")
    throw error
  }
  const projects = await listDevelopments()
  const requested = (await searchParams).empreendimento
  const selected = requested ? projects.find(project => project.id === requested) : projects[0]
  if (requested && !selected) notFound()
  return <AppShell title="Databook"><div className="space-y-5">
    <form action="/databook" method="get" className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5 text-sm"><label htmlFor="databook-development">Empreendimento</label>
        <select id="databook-development" name="empreendimento" defaultValue={selected?.id} className="min-h-10 rounded-md border border-input bg-background px-3" disabled={!projects.length}>
          {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </div>
      <button type="submit" disabled={!projects.length} className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">Abrir arquivos</button>
    </form>
    {selected ? <Databook key={selected.id} developmentId={selected.id} /> : <p className="rounded-xl border p-6 text-sm text-muted-foreground">Nenhum empreendimento disponível para seu acesso.</p>}
  </div></AppShell>
}
