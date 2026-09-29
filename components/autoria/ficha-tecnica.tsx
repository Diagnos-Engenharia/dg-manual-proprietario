"use client"

import { useState } from "react"
import { Building2, CalendarDays, Ruler, Save } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { saveDevelopmentModule } from "@/app/actions/developments"
import { PersistenceStatus, usePersistenceStatus } from "@/hooks/use-persistence-status"

export function FichaTecnica({ developmentId, disabled }: { developmentId?: string; disabled?: boolean }) {
  const [form, setForm] = useState({ torres: "3", apartamentos: "216", tipologias: "4", areas: "68,40; 74,20; 92,80; 118,50", completionDate: "2027-09-30" })
  const save = async (value: typeof form, expectedUpdatedAt?: string) => {
    if (!developmentId) throw new Error("Empreendimento não identificado")
    return saveDevelopmentModule(developmentId, "ficha", value, expectedUpdatedAt)
  }
  const persistence = usePersistenceStatus(form, save)
  const update = (key: keyof typeof form, value: string) => { setForm((current) => ({ ...current, [key]: value })) }
  return (
    <Card className="p-5">
      <div className="mb-6 flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></span>
        <div><h3 className="font-semibold">Ficha técnica do empreendimento</h3><p className="text-sm text-muted-foreground">Informações básicas usadas na capa, no sumário e na geração dos manuais.</p></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2"><Label htmlFor="torres">Quantidade de torres</Label><Input id="torres" type="number" min="1" value={form.torres} disabled={disabled} onChange={(e) => update("torres", e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="apartamentos">Quantidade de apartamentos</Label><Input id="apartamentos" type="number" min="1" value={form.apartamentos} disabled={disabled} onChange={(e) => update("apartamentos", e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="tipologias">Quantidade de tipologias</Label><Input id="tipologias" type="number" min="1" value={form.tipologias} disabled={disabled} onChange={(e) => update("tipologias", e.target.value)} /></div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="areas">M² das unidades privativas</Label><Input id="areas" value={form.areas} disabled={disabled} onChange={(e) => update("areas", e.target.value)} placeholder="Ex.: 68,40; 74,20; 92,80" /><p className="text-xs text-muted-foreground">Informe as áreas por tipologia, separadas por ponto e vírgula.</p></div><div className="space-y-2"><Label htmlFor="completionDate">Finalização do empreendimento</Label><div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" /><Input id="completionDate" type="date" value={form.completionDate} disabled={disabled} onChange={(e) => update("completionDate", e.target.value)} /></div><p className="text-xs text-muted-foreground">Essa data pode ser alterada durante a elaboração.</p></div></div>
      <div className="mt-6 flex items-center justify-between border-t border-border pt-4"><span className="flex items-center gap-2 text-xs text-muted-foreground"><Ruler className="h-3.5 w-3.5" /> Dados utilizados na documentação técnica</span><div className="flex items-center gap-3"><PersistenceStatus state={persistence.state} savedAt={persistence.savedAt} error={persistence.error} onRetry={() => void persistence.persist()} /><Button disabled={disabled || persistence.isSaving} onClick={() => void persistence.persist()} className="gap-2"><Save className="h-4 w-4" />Salvar ficha</Button></div></div>
    </Card>
  )
}
