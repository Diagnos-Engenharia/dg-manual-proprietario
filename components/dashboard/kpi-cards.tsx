import { Building2, Activity, AlertTriangle, CheckCircle2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { developments, reviewAlerts } from "@/lib/mock-data"

export function KpiCards() {
  const total = developments.length
  const active = developments.filter((d) => d.status === "em_andamento").length
  const finished = developments.filter((d) => d.status === "finalizado").length
  const critical = reviewAlerts.filter((a) => a.severity === "critical").length
  const avgProgress = Math.round(
    developments.reduce((acc, d) => acc + d.masterProgress, 0) / total,
  )

  const kpis = [
    {
      label: "Empreendimentos",
      value: String(total),
      hint: `${active} em andamento`,
      icon: Building2,
      tone: "text-primary",
    },
    {
      label: "Progresso médio",
      value: `${avgProgress}%`,
      hint: "Carteira ponderada",
      icon: Activity,
      tone: "text-primary",
    },
    {
      label: "Gargalos críticos",
      value: String(critical),
      hint: "> 14 dias em revisão",
      icon: AlertTriangle,
      tone: "text-destructive",
    },
    {
      label: "Manuais entregues",
      value: String(finished),
      hint: "Concluídos no período",
      icon: CheckCircle2,
      tone: "text-[color:var(--success)]",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {kpis.map((kpi) => {
        const Icon = kpi.icon
        return (
          <Card key={kpi.label} className="gap-0 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{kpi.label}</span>
              <Icon className={`h-4 w-4 ${kpi.tone}`} />
            </div>
            <p className="mt-3 font-mono text-3xl font-semibold tracking-tight">{kpi.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
          </Card>
        )
      })}
    </div>
  )
}
