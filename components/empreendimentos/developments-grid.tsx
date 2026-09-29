"use client"

import Link from "next/link"
import { ArrowRight, Building2, CalendarDays, Users } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { statusLabels, formatDate, type ProjectStatus } from "@/lib/mock-data"

const statusStyles: Record<ProjectStatus, string> = {
  em_andamento: "bg-primary/10 text-primary",
  pausado: "bg-warning/15 text-warning",
  finalizado: "bg-success/15 text-success",
}

type DevelopmentCard = {
  id: string
  name: string
  client: string
  status: ProjectStatus
  deliveryDate: string
  masterProgress: number
  units: unknown[]
}

export function DevelopmentsGrid({ items = [] }: { items?: DevelopmentCard[] }) {
  if (!items.length) return <div className="rounded-xl border border-dashed border-border p-10 text-center"><p className="font-medium">Nenhum empreendimento cadastrado</p><p className="mt-1 text-sm text-muted-foreground">Crie o primeiro empreendimento para iniciar um manual.</p><Link href="/empreendimentos?novo=1" className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Criar primeiro empreendimento</Link></div>
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((dev) => (
        <Link key={dev.id} href={`/empreendimentos/${dev.id}`} className="group">
          <Card className="flex h-full flex-col gap-4 p-5 transition-colors hover:border-primary/50">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="leading-tight">
                  <h3 className="font-semibold tracking-tight">{dev.name}</h3>
                  <p className="text-xs text-muted-foreground">{dev.client}</p>
                </div>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusStyles[dev.status]}`}
              >
                {statusLabels[dev.status]}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Progresso Master</span>
                <span className="font-mono font-semibold">{dev.masterProgress}%</span>
              </div>
              <Progress value={dev.masterProgress} className="h-2" />
            </div>

            <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatDate(dev.deliveryDate)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {dev.units.length} {dev.units.length === 1 ? "unidade" : "unidades"}
              </span>
            </div>

            <div className="flex items-center gap-1 text-sm font-medium text-primary">
              Abrir empreendimento
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}
