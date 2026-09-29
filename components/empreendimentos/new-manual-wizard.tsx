"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createDevelopment as persistDevelopment } from "@/app/actions/developments"
import { ArrowLeft, ArrowRight, Building2, Check, ClipboardList, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const stages = ["Dados do empreendimento", "Configurar cronograma"]
const phaseNames = ["Ficha Técnica do Empreendimento", "Checklist Inicial", "Manual do Proprietário", "Manual do Síndico"]
const defaultWeights = [25, 25, 25, 25]
type DateRow = { name: string; start: string; end: string; weight: number }
type Props = { open: boolean; onOpenChange: (open: boolean) => void; organizationName: string }

function validIsoDate(value: string) { if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00`); return date.getFullYear() >= 2000 && date.getFullYear() <= 2100 && date.toISOString().slice(0, 10) === value }
function dateError(row: DateRow, previous?: DateRow) { if (!validIsoDate(row.start) || !validIsoDate(row.end)) return "Informe datas válidas entre 2000 e 2100."; if (row.end < row.start) return "A data final não pode ser anterior à inicial."; if (previous && row.start < previous.end) return "A etapa deve começar após o término da etapa anterior."; return "" }

export function NewManualWizard({ open, onOpenChange, organizationName }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: "", towers: "", apartments: "", typologies: "", areas: "", completionDate: "" })
  const [dates, setDates] = useState<DateRow[]>(() => phaseNames.map((name, index) => ({ name, start: "", end: "", weight: defaultWeights[index] })))
  const weightTotal = dates.reduce((sum, item) => sum + (Number.isFinite(item.weight) ? item.weight : 0), 0)
  const validFicha = Boolean(form.name && form.towers && form.apartments && form.typologies && form.areas && validIsoDate(form.completionDate))
  const dateErrors = dates.map((item, index) => dateError(item, dates[index - 1]))
  const validDates = dates.every((item, index) => item.start && item.end && !dateErrors[index]) && Math.abs(weightTotal - 100) < 0.001
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const updateDate = (index: number, key: "start" | "end" | "weight", value: string) => setDates((current) => current.map((phase, i) => i === index ? { ...phase, [key]: key === "weight" ? Number(value) : value } : phase))
  function close() { if (submitting) return; setStep(0); setError(null); onOpenChange(false) }
  async function finish() { if (submitting || !validDates) return; setSubmitting(true); setError(null); const id = `emp-${crypto.randomUUID()}`; const schedule = dates.map((item, index) => ({ id: `stage-${index + 1}`, name: item.name, weight: item.weight, originalDate: item.start, scheduledDate: item.end, status: "no_prazo" as const, revisions: [] })); try { await persistDevelopment({ id, name: form.name.trim(), client: organizationName, deliveryDate: form.completionDate, data: { ficha: { ...form, client: organizationName }, schedule, scheduleWeights: dates.map(({ name, weight }) => ({ name, weight })) } }); onOpenChange(false); router.push(`/empreendimentos/${id}?modulo=identidade`) } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o empreendimento.") } finally { setSubmitting(false) } }
  return <Dialog open={open} onOpenChange={(value) => !value && close()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Novo empreendimento</DialogTitle><DialogDescription>Cadastre os dados e configure o cronograma inicial.</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-2">{stages.map((label, index) => <div key={label} className={`flex items-center gap-2 border-b-2 pb-2 text-xs ${step === index ? "border-primary font-semibold text-primary" : index < step ? "border-success text-success" : "border-border text-muted-foreground"}`}><span className="flex h-5 w-5 items-center justify-center rounded-full border text-[10px]">{index < step ? <Check className="h-3 w-3" /> : index + 1}</span>{label}</div>)}</div>
    {step === 0 && <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="new-name">Nome do empreendimento</Label><Input id="new-name" value={form.name} onChange={(e) => update("name", e.target.value)} /></div><div className="space-y-2"><Label>Construtora</Label><div className="flex min-h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">{organizationName}</div></div>{(["towers", "apartments", "typologies"] as const).map((key) => <div className="space-y-2" key={key}><Label htmlFor={`new-${key}`}>{key === "towers" ? "Quantidade de torres" : key === "apartments" ? "Quantidade de apartamentos" : "Quantidade de tipologias"}</Label><Input id={`new-${key}`} type="number" min="1" value={form[key]} onChange={(e) => update(key, e.target.value)} /></div>)}<div className="space-y-2"><Label htmlFor="new-areas">M² das unidades privativas</Label><Input id="new-areas" value={form.areas} onChange={(e) => update("areas", e.target.value)} /></div><div className="space-y-2"><Label htmlFor="new-completion">Previsão de finalização</Label><Input id="new-completion" type="date" min="2000-01-01" max="2100-12-31" value={form.completionDate} onChange={(e) => update("completionDate", e.target.value)} /></div></div><div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground"><Building2 className="mb-1 h-4 w-4 text-primary" />Estas informações formarão a ficha técnica.</div></div>}
    {step === 1 && <div className="space-y-4"><div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm"><p className="font-medium">Configure cronograma e pesos</p><p className="mt-1 text-muted-foreground">A soma dos pesos precisa ser exatamente 100%. As etapas devem seguir uma sequência sem sobreposição.</p><p className={`mt-2 font-mono font-semibold ${Math.abs(weightTotal - 100) < 0.001 ? "text-success" : "text-destructive"}`}>Soma atual: {weightTotal.toFixed(2)}%</p></div>{dates.map((item, index) => <Card key={item.name} className="grid gap-3 p-4 sm:grid-cols-[1fr_100px_150px_150px]"><div className="flex items-center gap-2 text-sm font-medium"><ClipboardList className="h-4 w-4 text-primary" />{item.name}</div><div className="space-y-1"><Label className="text-xs">Peso (%)</Label><Input type="number" min="0" max="100" step="0.01" value={item.weight} onChange={(e) => updateDate(index, "weight", e.target.value)} /></div><div className="space-y-1"><Label className="text-xs">Início</Label><Input type="date" min="2000-01-01" max="2100-12-31" value={item.start} onChange={(e) => updateDate(index, "start", e.target.value)} /></div><div className="space-y-1"><Label className="text-xs">Fim</Label><Input type="date" min="2000-01-01" max="2100-12-31" value={item.end} onChange={(e) => updateDate(index, "end", e.target.value)} /></div>{dateErrors[index] && <p className="text-xs text-destructive sm:col-span-4">{dateErrors[index]}</p>}</Card>)}</div>}
    {error && <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error}</div>}
    <DialogFooter className="gap-2 sm:justify-between"><Button variant="outline" onClick={step === 0 ? close : () => setStep(0)}><ArrowLeft className="h-4 w-4" />{step === 0 ? "Cancelar" : "Voltar"}</Button>{step === 0 ? <Button disabled={!validFicha} onClick={() => setStep(1)}>Configurar cronograma<ArrowRight className="h-4 w-4" /></Button> : <Button onClick={finish} disabled={!validDates || submitting}>{submitting ? "Criando…" : "Criar empreendimento e cronograma"}</Button>}</DialogFooter></DialogContent></Dialog>
}
