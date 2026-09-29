import { Clock } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { reviewAlerts, type ReviewAlert } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

const severityDot: Record<ReviewAlert["severity"], string> = {
  ok: "bg-chart-5",
  warning: "bg-[color:var(--warning)]",
  critical: "bg-destructive",
}

const severityCell: Record<ReviewAlert["severity"], string> = {
  ok: "text-muted-foreground",
  warning:
    "bg-[color:var(--warning)]/15 text-[color:var(--warning-foreground)] dark:text-[color:var(--warning)]",
  critical: "bg-destructive/15 text-destructive",
}

export function HealthAlerts() {
  const sorted = [...reviewAlerts].sort((a, b) => b.daysWaiting - a.daysWaiting)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Indicadores de saúde</CardTitle>
        <CardDescription>
          Textos aguardando revisão. Amarelo &gt; 7 dias, vermelho &gt; 14 dias.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {sorted.map((alert) => (
          <div
            key={alert.id}
            className="flex items-center gap-3 rounded-md border border-border p-3"
          >
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", severityDot[alert.severity])} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{alert.item}</p>
              <p className="truncate text-xs text-muted-foreground">
                {alert.development} · {alert.responsible}
              </p>
            </div>
            <div
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-mono text-xs font-semibold",
                severityCell[alert.severity],
              )}
            >
              <Clock className="h-3 w-3" />
              {alert.daysWaiting}d
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
