"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarClock, CheckCircle2, Clock, History, Lock, TriangleAlert } from "lucide-react"
import { useDevelopmentStore } from "@/lib/store"
import { phaseProgress, progressForDevelopment, stageStatus } from "@/lib/progress"
import { schedulePhaseStatusLabels, sortByScheduledDate, daysUntil, formatDate, type Revision, type SchedulePhase } from "@/lib/mock-data"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { saveDevelopmentModule } from "@/app/actions/developments"

const statusStyles: Record<SchedulePhase["status"], string> = { no_prazo: "bg-primary/10 text-primary border-primary/20", atrasado: "bg-destructive/10 text-destructive border-destructive/20", concluido: "bg-success/10 text-success border-success/20" }
const statusIcons: Record<SchedulePhase["status"], typeof Clock> = { no_prazo: Clock, atrasado: TriangleAlert, concluido: CheckCircle2 }

export function ScheduleManager({ developmentId }: { developmentId?: string }) {
  const development = useDevelopmentStore((state) => developmentId ? state.developments[developmentId] : undefined)
  const progress = useMemo(() => development ? progressForDevelopment(development.ficha, development.checklist) : { ficha: 0, checklist: 0, proprietario: 0, sindico: 0, master: 0 }, [development])
  const sourcePhases = development?.schedule ?? []
  const [phases, setPhases] = useState<SchedulePhase[]>(sourcePhases)
  const [reprogramTarget, setReprogramTarget] = useState<SchedulePhase | null>(null)
  const [historyTarget, setHistoryTarget] = useState<SchedulePhase | null>(null)
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => {
    const now = new Date()
    setToday(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`)
  }, [])
  const ordered = useMemo(() => sortByScheduledDate(phases), [phases])

  function handleWeight(id: string, value: string) {
    const weight = Number(value)
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) return
    setPhases((current) => current.map((phase) => phase.id === id ? { ...phase, weight } : phase))
  }

  function saveWeights() {
    const total = phases.reduce((sum, phase) => sum + phase.weight, 0)
    if (Math.abs(total - 100) > 0.001 || !developmentId) return
    void saveDevelopmentModule(developmentId, "schedule", phases).catch((error) => console.error("[v0] Falha ao salvar pesos", error))
  }

  function handleReprogram(id: string, newDate: string, justification: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || newDate < "2000-01-01" || newDate > "2100-12-31" || justification.trim().length < 10) return
    const index = phases.findIndex((phase) => phase.id === id)
    if (index < 0 || (phases[index - 1] && newDate < phases[index - 1].scheduledDate) || (phases[index + 1] && newDate > phases[index + 1].scheduledDate)) return
    setPhases((current) => {
      const next = current.map((phase) => {
        if (phase.id !== id) return phase
        const revision: Revision = { tag: `Rev ${String(phase.revisions.length + 1).padStart(2, "0")}`, date: new Date().toISOString(), previousDate: phase.scheduledDate, newDate, justification, author: "Usuário autenticado" }
        return { ...phase, scheduledDate: newDate, revisions: [...phase.revisions, revision] }
      })
      if (developmentId) void saveDevelopmentModule(developmentId, "schedule", next).catch((error) => console.error("[v0] Falha ao salvar cronograma", error))
      return next
    })
    setReprogramTarget(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-medium">Configurar cronograma</p><p className="text-xs text-muted-foreground">Pesos, datas e status definidos para este empreendimento.</p></div>
        <Badge variant="outline" className="border-success/30 bg-success/10 font-mono text-success">{phases.reduce((sum, phase) => sum + phase.weight, 0).toFixed(2)}% distribuído</Badge>
      </div>
      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground md:grid-cols-[2fr_1fr_1fr_1fr_auto]"><span>Etapa / Avanço</span><span className="hidden md:block">Data original</span><span className="hidden md:block">Data programada</span><span className="hidden md:block">Status</span><span className="text-right">Ações</span></div>
        <ul className="divide-y divide-border">
          {ordered.map((phase) => { const phaseValue = phaseProgress(phase.name, progress); const phaseStatus = stageStatus(phase, phaseValue); const Icon = statusIcons[phaseStatus]; const displayProgress = { label: phase.name === "Ficha Técnica do Empreendimento" ? "Campos preenchidos" : "Itens aprovados", value: phaseValue }; const remaining = today ? daysUntil(phase.scheduledDate, today) : null; return <li key={phase.id} className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate font-medium">{phase.name}</p><Input aria-label={`Peso de ${phase.name}`} className="h-7 w-20 px-2 text-right font-mono text-xs" type="number" min="0" max="100" step="0.01" value={phase.weight} onChange={(event) => handleWeight(phase.id, event.target.value)} onBlur={saveWeights} /><Badge variant="secondary" className="shrink-0 font-mono text-[10px]">{phase.weight.toFixed(2)}%</Badge>{phase.revisions.length > 0 && <Badge variant="secondary" className="font-mono text-[10px]">{phase.revisions.at(-1)?.tag}</Badge>}</div><div className="mt-2 max-w-[300px]"><div className="mb-1 flex justify-between text-[10px] text-muted-foreground"><span>{displayProgress.label}</span><span className="font-mono">{displayProgress.value}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${displayProgress.value}%` }} /></div></div></div>
            <div className="hidden items-center gap-1.5 text-sm text-muted-foreground md:flex"><Lock className="h-3.5 w-3.5" />{formatDate(phase.originalDate)}</div>
            <div className="hidden md:block"><p className="text-sm font-medium">{formatDate(phase.scheduledDate)}</p><p suppressHydrationWarning className={cn("text-xs", remaining !== null && remaining < 0 ? "text-destructive" : "text-muted-foreground")}>{phaseStatus !== "concluido" && remaining !== null ? (remaining < 0 ? `${Math.abs(remaining)} dias em atraso` : `faltam ${remaining} dias`) : ""}</p></div>
            <div className="hidden md:block"><Badge variant="outline" className={cn("gap-1", statusStyles[phaseStatus])}><Icon className="h-3 w-3" />{schedulePhaseStatusLabels[phaseStatus]}</Badge></div>
            <div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" aria-label="Histórico de revisões" onClick={() => setHistoryTarget(phase)}><History className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="Reprogramar data" onClick={() => setReprogramTarget(phase)}><CalendarClock className="h-4 w-4" /></Button></div>
          </li> })}
        </ul>
      </Card>
      <ReprogramDialog phase={reprogramTarget} onClose={() => setReprogramTarget(null)} onSubmit={handleReprogram} />
      <HistoryDialog phase={historyTarget} onClose={() => setHistoryTarget(null)} />
    </div>
  )
}

function ReprogramDialog({ phase, onClose, onSubmit }: { phase: SchedulePhase | null; onClose: () => void; onSubmit: (id: string, date: string, reason: string) => void }) {
  const [date, setDate] = useState(""); const [reason, setReason] = useState("")
  return <Dialog open={phase !== null} onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>Reprogramar data</DialogTitle><DialogDescription>{phase?.name} — a data original permanece bloqueada e a alteração gera uma revisão.</DialogDescription></DialogHeader><div className="flex flex-col gap-4"><div className="grid grid-cols-2 gap-3"><div><Label>Data original</Label><Input value={phase ? formatDate(phase.originalDate) : ""} disabled /></div><div><Label htmlFor="schedule-date">Nova data</Label><Input id="schedule-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div></div><div><Label htmlFor="schedule-reason">Justificativa obrigatória</Label><Textarea id="schedule-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Descreva o motivo da reprogramação..." /></div></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={!phase || !date || reason.trim().length < 10} onClick={() => { if (phase) onSubmit(phase.id, date, reason.trim()); setDate(""); setReason("") }}>Salvar revisão</Button></DialogFooter></DialogContent></Dialog>
}

function HistoryDialog({ phase, onClose }: { phase: SchedulePhase | null; onClose: () => void }) {
  return <Dialog open={phase !== null} onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>Histórico de revisões</DialogTitle><DialogDescription>{phase?.name}</DialogDescription></DialogHeader>{phase?.revisions.length ? <ol className="flex flex-col gap-3">{phase.revisions.slice().reverse().map((revision) => <li key={revision.tag} className="rounded-lg border border-border p-3"><div className="flex gap-2"><Badge variant="secondary">{revision.tag}</Badge><span className="text-xs text-muted-foreground">{formatDate(revision.date)}</span></div><p className="mt-2 text-sm">{formatDate(revision.previousDate)} → {formatDate(revision.newDate)}</p><p className="mt-1 text-xs text-muted-foreground">{revision.justification}</p></li>)}</ol> : <p className="py-5 text-sm text-muted-foreground">Nenhuma reprogramação registrada.</p>}<DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter></DialogContent></Dialog>
}
