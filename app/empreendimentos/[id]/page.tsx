import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { AppShell } from "@/components/dashboard/app-shell"
import { EmpreendimentoWorkspace } from "@/components/empreendimentos/empreendimento-workspace"
import { statusLabels, formatDate } from "@/lib/mock-data"
import { getDevelopment, listDatabookFiles } from "@/app/actions/developments"
import { requireDevelopmentAccess } from "@/lib/organization"

export const dynamic = "force-dynamic"

export default async function EmpreendimentoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const context = await requireDevelopmentAccess(id).catch(() => notFound())
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
      <EmpreendimentoWorkspace role={(context.developmentRole === "admin_empreendimento" ? "admin" : context.developmentRole) as "admin" | "editor" | "validator"} developmentId={id} developmentSnapshot={{ ...dev, ficha: (persisted?.data as { ficha?: { towers: string; apartments: string; typologies: string; areas: string; completionDate: string } } | null)?.ficha ?? { towers: "", apartments: "", typologies: "", areas: "", completionDate: dev.deliveryDate }, schedule: ((persisted?.data as { schedule?: unknown[] } | null)?.schedule ?? []) as never[], checklist: undefined, dia0: { sistemasConstrutivos: 0, fornecedores: 0 }, phases: [], units: [], risk: "normal" }} organizationName={context?.organization.name ?? persisted?.client ?? ""} organizationLogo={context?.organization.logo ?? null} organizationMetadata={context?.organization.metadata ?? null} persistedData={(persisted?.data as Record<string, unknown> | null) ?? null} databookFiles={databookFiles.map((file) => ({ ...file, contentType: file.contentType ?? null, createdAt: new Date(file.createdAt).toISOString() }))} />
    </AppShell>
  )
}
