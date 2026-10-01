import Link from "next/link"
import { notFound,redirect } from "next/navigation"
import { headers } from "next/headers"
import { ChevronLeft } from "lucide-react"
import { AppShell } from "@/components/dashboard/app-shell"
import { EmpreendimentoWorkspace } from "@/components/empreendimentos/empreendimento-workspace"
import { statusLabels, formatDate } from "@/lib/mock-data"
import { getDevelopment, listDatabookFiles } from "@/app/actions/developments"
import { isCurrentUserPlatformManager,requireDevelopmentAccess } from "@/lib/organization"
import { auth } from "@/lib/auth"
import { developmentSignInHref,type AuthRedirectSearchParams } from "@/lib/auth-redirect"

export const dynamic = "force-dynamic"

export default async function EmpreendimentoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<AuthRedirectSearchParams>
}) {
  const { id } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect(developmentSignInHref(id, await searchParams))
  if(await isCurrentUserPlatformManager())redirect("/gerenciador")
  const context = await requireDevelopmentAccess(id).catch(error => {
    if (error instanceof Error && ["Organização não configurada", "Empreendimento não encontrado", "Acesso não autorizado a este empreendimento", "Perfil de acesso inválido"].includes(error.message)) notFound()
    throw error
  })
  const persisted = await getDevelopment(id)
  if (!persisted) notFound()
  const databookFiles = await listDatabookFiles(id)
  const dev = { id: persisted.id, name: persisted.name, client: persisted.client, status: persisted.status as "em_andamento" | "finalizado" | "pausado", deliveryDate: persisted.deliveryDate, masterProgress: persisted.masterProgress }

  return (
    <AppShell
      title={dev.name}
      description={`${dev.client} · ${statusLabels[dev.status]} · Entrega ${formatDate(dev.deliveryDate)} · Master ${dev.masterProgress}%`}
      actions={
        <Link
          href="/empreendimentos"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Empreendimentos
        </Link>
      }
    >
      <EmpreendimentoWorkspace role={(context.developmentRole === "admin_empreendimento" ? "editor" : context.developmentRole) as "admin" | "editor" | "validator"} developmentId={id} developmentSnapshot={{ ...dev, ficha: (persisted?.data as { ficha?: { towers: string; apartments: string; typologies: string; areas: string; completionDate: string } } | null)?.ficha ?? { towers: "", apartments: "", typologies: "", areas: "", completionDate: dev.deliveryDate }, schedule: ((persisted?.data as { schedule?: unknown[] } | null)?.schedule ?? []) as never[], checklist: undefined, dia0: { sistemasConstrutivos: 0, fornecedores: 0 }, phases: [], units: [], risk: "normal" }} organizationName={context?.organization.name ?? persisted?.client ?? ""} organizationLogo={context?.organization.logo ?? null} organizationMetadata={context?.organization.metadata ?? null} persistedData={(persisted?.data as Record<string, unknown> | null) ?? null} databookFiles={databookFiles.map((file) => ({ ...file, contentType: file.contentType ?? null, createdAt: new Date(file.createdAt).toISOString() }))} />
    </AppShell>
  )
}
