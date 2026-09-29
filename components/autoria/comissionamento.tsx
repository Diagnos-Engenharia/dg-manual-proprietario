"use client"

import { useState } from "react"
import { saveDevelopmentModulePath } from "@/app/actions/developments"
import { PersistenceStatus, usePersistenceStatus } from "@/hooks/use-persistence-status"
import { Check, Droplets, ExternalLink, Save, Zap } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const services = [
  { id: "agua", title: "Água", company: "Concessionária de água", icon: Droplets, code: "3.1" },
  { id: "gas", title: "Gás", company: "Naturgy", icon: Zap, code: "3.4" },
  { id: "energia", title: "Energia", company: "Concessionária de energia", icon: Zap, code: "3.2" },
  { id: "telecom", title: "Telecomunicações", company: "Operadoras disponíveis", icon: ExternalLink, code: "3.3" },
]

export function Comissionamento({ disabled, developmentId, manual = "proprietario" }: { disabled?: boolean; developmentId?: string; manual?: "proprietario" | "sindico" }) {
  const [active, setActive] = useState("gas")
  const [saved, setSaved] = useState(false)
  const [data, setData] = useState<Record<string, { company: string; phone: string; site: string; instructions: string }>>({
    gas: { company: "Naturgy", phone: "0800 772 2348", site: "www.naturgy.com.br", instructions: "Quando aplicável, a solicitação e a ativação do fornecimento de gás deverão ser realizadas conforme os procedimentos estabelecidos pela empresa responsável pelo serviço." },
    agua: { company: "", phone: "", site: "", instructions: "" }, energia: { company: "", phone: "", site: "", instructions: "" }, telecom: { company: "", phone: "", site: "", instructions: "" },
  })
  const current = data[active]
  const save = async (value: typeof data) => {
    if (!developmentId) throw new Error("Empreendimento não identificado")
    return saveDevelopmentModulePath(developmentId, ["manuals", manual, "comissionamento"], value)
  }
  const persistence = usePersistenceStatus(data, save)
  const update = (key: keyof typeof current, value: string) => { setSaved(false); setData((all) => ({ ...all, [active]: { ...all[active], [key]: value } })) }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-4">{services.map((service) => { const Icon = service.icon; return <button key={service.id} type="button" onClick={() => { setActive(service.id); setSaved(false) }} className={`rounded-lg border p-3 text-left transition-colors ${active === service.id ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-secondary"}`}><div className="flex items-center justify-between"><Icon className="h-4 w-4 text-primary" /><Badge variant="outline" className="font-mono text-[10px]">{service.code}</Badge></div><p className="mt-3 text-sm font-semibold">{service.title}</p><p className="text-xs text-muted-foreground">{service.company}</p></button> })}</div>
      <Card className="p-5"><div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold">{services.find((s) => s.id === active)?.code}. {current.company || services.find((s) => s.id === active)?.title}</h3><p className="mt-1 text-sm text-muted-foreground">Conteúdo de solicitação e ativação do serviço público.</p></div>{saved && <Badge className="gap-1 bg-success/10 text-success"><Check className="h-3 w-3" />Salvo</Badge>}</div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Empresa responsável</Label><Input value={current.company} disabled={disabled} onChange={(e) => update("company", e.target.value)} placeholder="Nome da concessionária" /></div><div className="space-y-2"><Label>Telefone</Label><Input value={current.phone} disabled={disabled} onChange={(e) => update("phone", e.target.value)} placeholder="0800 000 0000" /></div><div className="space-y-2 sm:col-span-2"><Label>Site</Label><Input value={current.site} disabled={disabled} onChange={(e) => update("site", e.target.value)} placeholder="www.concessionaria.com.br" /></div><div className="space-y-2 sm:col-span-2"><Label>Como solicitar e ativar</Label><Textarea value={current.instructions} disabled={disabled} onChange={(e) => update("instructions", e.target.value)} rows={5} placeholder="Descreva o procedimento para o cliente solicitar a ativação..." /></div></div><div className="mt-5 flex items-center justify-end gap-3 border-t border-border pt-4"><PersistenceStatus state={persistence.state} savedAt={persistence.savedAt} error={persistence.error} onRetry={() => void persistence.persist()} /><Button disabled={disabled || persistence.isSaving} onClick={() => void persistence.persist()} className="gap-2"><Save className="h-4 w-4" />Salvar conteúdo</Button></div></Card>
    </div>
  )
}
