import { CalendarDays, CheckCircle2, CircleAlert, Clock3, ListChecks } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { DashboardDevelopment } from "@/lib/dashboard"

function daysUntil(value: string) {
  const target = new Date(`${value}T12:00:00`).getTime()
  return Math.ceil((target - Date.now()) / 86400000)
}

export function DashboardInsights({ developments }: { developments: DashboardDevelopment[] }) {
  const deadlines = developments.flatMap((development) => development.stages.map((stage) => ({ development, stage, days: daysUntil((stage.dueDate ?? development.deliveryDate)) }))).sort((a, b) => a.days - b.days).slice(0, 5)
  const stageTotals = developments.reduce((acc, development) => {
    development.stages.forEach((stage) => { acc[stage.name] = (acc[stage.name] ?? 0) + stage.progress })
    return acc
  }, {} as Record<string, number>)
  const stageAverage = Object.entries(stageTotals).map(([name, total]) => ({ name, value: developments.length ? Math.round(total / developments.length) : 0 }))
  const activities = developments.flatMap((development) => development.stages.filter((stage) => stage.progress > 0).map((stage) => ({ development: development.name, text: `${stage.name} atualizada para ${stage.progress}%`, date: (stage.dueDate ?? development.deliveryDate) }))).slice(0, 5)

  return <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_1fr_1fr]">
    <Card><CardHeader><CardTitle className="text-base">Próximas entregas</CardTitle><CardDescription>Etapas com prazo mais próximo na carteira.</CardDescription></CardHeader><CardContent className="space-y-3">{deadlines.length ? deadlines.map(({ development, stage, days }) => <div key={`${development.id}-${stage.name}`} className="flex items-start gap-3 rounded-lg border border-border/70 p-3"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{stage.name}</p><p className="truncate text-xs text-muted-foreground">{development.name} · {stage.responsible ?? "Sem responsável"}</p></div><span className={`shrink-0 text-xs font-semibold ${days < 0 ? "text-red-500" : days <= 7 ? "text-amber-500" : "text-muted-foreground"}`}>{days < 0 ? `${Math.abs(days)}d atrasada` : days === 0 ? "Hoje" : `${days}d`}</span></div>) : <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma entrega cadastrada.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Avanço por etapa</CardTitle><CardDescription>Média de conclusão por tipo de entrega.</CardDescription></CardHeader><CardContent className="space-y-4">{stageAverage.map(({ name, value }) => <div key={name}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate">{name}</span><span className="font-mono text-xs text-muted-foreground">{value}%</span></div><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${value}%` }} /></div></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Atividade recente</CardTitle><CardDescription>Últimas atualizações registradas.</CardDescription></CardHeader><CardContent className="space-y-3">{activities.length ? activities.map((activity, index) => <div key={`${activity.development}-${activity.text}-${index}`} className="flex gap-3"><div className="mt-0.5 rounded-full bg-primary/10 p-1"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /></div><div className="min-w-0"><p className="text-sm">{activity.text}</p><p className="truncate text-xs text-muted-foreground">{activity.development}</p></div></div>) : <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" />Sem atividade recente.</div>}</CardContent></Card>
  </div>
}

export function DashboardPrioritySummary({ developments }: { developments: DashboardDevelopment[] }) {
  const attention = developments.filter((development) => development.status !== "finalizado" && development.masterProgress < 75)
  return <Card className="mt-6 border-amber-500/30 bg-amber-500/5"><CardHeader className="flex-row items-center gap-3 space-y-0"><CircleAlert className="h-5 w-5 text-amber-500" /><div><CardTitle className="text-base">Ações prioritárias</CardTitle><CardDescription>{attention.length ? `${attention.length} empreendimento(s) exigem revisão nesta semana.` : "Nenhuma ação prioritária identificada."}</CardDescription></div></CardHeader><CardContent className="flex flex-wrap gap-2">{attention.slice(0, 4).map((item) => <span key={item.id} className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 px-3 py-1.5 text-xs"><ListChecks className="h-3.5 w-3.5 text-amber-500" />{item.name}</span>)}</CardContent></Card>
}
