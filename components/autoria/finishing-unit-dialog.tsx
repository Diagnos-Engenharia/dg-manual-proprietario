"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import type { DevelopmentUnit, UnitInput } from "@/lib/finishing-types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function FinishingUnitDialog({ unit, onClose, onSave }: { unit?: DevelopmentUnit; onClose: () => void; onSave: (input: UnitInput) => Promise<void> }) {
  const [form, setForm] = useState({ tower: unit?.tower ?? "", floor: unit?.floor ?? "", number: unit?.number ?? "", typology: unit?.typology ?? "", area: unit?.area ?? "" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const area = form.area.trim().replace(",", ".")
  const validArea = !area || /^\d+(?:\.\d+)?$/.test(area) && Number(area) > 0
  const valid = Boolean(form.number.trim() && form.typology.trim() && validArea)
  async function save() {
    if (!valid || busy) return
    setBusy(true); setError(null)
    try { await onSave({ ...form, ...(unit ? { id: unit.id, expectedRevision: unit.revision } : {}) }); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar a unidade.") }
    finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
      <DialogHeader><DialogTitle>{unit ? "Editar identificação da unidade" : "Cadastrar unidade"}</DialogTitle><DialogDescription>{unit ? "Alterar a identificação coloca a tabela em rascunho e exige nova aprovação." : "Identifique a unidade real à qual a tabela de acabamentos pertence."}</DialogDescription></DialogHeader>
      <form id="finishing-unit-form" onSubmit={event => { event.preventDefault(); void save() }} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="unit-number">Número da unidade *</Label><Input id="unit-number" autoFocus required maxLength={120} value={form.number} disabled={busy} onChange={event => setForm(current => ({ ...current, number: event.target.value }))} placeholder="Ex.: 101" /></div>
        <div className="space-y-1.5"><Label htmlFor="unit-typology">Tipologia *</Label><Input id="unit-typology" required maxLength={120} value={form.typology} disabled={busy} onChange={event => setForm(current => ({ ...current, typology: event.target.value }))} placeholder="Ex.: Tipo A" /></div>
        <div className="space-y-1.5"><Label htmlFor="unit-tower">Torre ou bloco</Label><Input id="unit-tower" maxLength={120} value={form.tower} disabled={busy} onChange={event => setForm(current => ({ ...current, tower: event.target.value }))} placeholder="Ex.: Torre 1" /></div>
        <div className="space-y-1.5"><Label htmlFor="unit-floor">Pavimento</Label><Input id="unit-floor" maxLength={120} value={form.floor} disabled={busy} onChange={event => setForm(current => ({ ...current, floor: event.target.value }))} placeholder="Ex.: 1º andar" /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="unit-area">Área da unidade (m²)</Label><Input id="unit-area" inputMode="decimal" value={form.area} disabled={busy} aria-invalid={!validArea} onChange={event => setForm(current => ({ ...current, area: event.target.value }))} placeholder="Ex.: 68,40" />{!validArea && <p className="text-xs text-destructive">Informe uma área positiva, sem a unidade de medida.</p>}</div>
        {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive sm:col-span-2">{error}</p>}
      </form>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" form="finishing-unit-form" disabled={!valid || busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? "Salvando…" : unit ? "Salvar identificação" : "Cadastrar unidade"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
