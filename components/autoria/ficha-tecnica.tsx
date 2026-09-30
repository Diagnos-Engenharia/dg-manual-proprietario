"use client"

import { useState } from "react"
import { Building2, CalendarDays, Ruler, Save } from "lucide-react"
import { useDevelopmentStore } from "@/lib/store"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { saveDevelopmentModule } from "@/app/actions/developments"
import { PersistenceStatus, usePersistenceStatus } from "@/hooks/use-persistence-status"

export function FichaTecnica({developmentId,disabled}:{developmentId?:string;disabled?:boolean}){
  const development=useDevelopmentStore(state=>developmentId?state.developments[developmentId]:undefined)
  const updateDevelopment=useDevelopmentStore(state=>state.updateDevelopment)
  const initial=development?.ficha
  const [form,setForm]=useState({
    towers:initial?.towers??initial?.torres??"",
    apartments:initial?.apartments??initial?.apartamentos??"",
    typologies:initial?.typologies??initial?.tipologias??"",
    areas:initial?.areas??"",
    completionDate:initial?.completionDate??"",
  })
  async function save(value:typeof form,expectedUpdatedAt?:string){
    if(!developmentId)throw new Error("Empreendimento não identificado")
    return saveDevelopmentModule(developmentId,"ficha",value,expectedUpdatedAt)
  }
  const persistence=usePersistenceStatus(form,save)
  function update(key:keyof typeof form,value:string){
    setForm(current=>({...current,[key]:value}))
    if(developmentId){
      const current=useDevelopmentStore.getState().developments[developmentId]
      updateDevelopment(developmentId,{ficha:{...current.ficha,[key]:value}})
    }
  }
  return <Card className="p-5">
    <div className="mb-6 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 className="h-5 w-5"/></span><h3 className="font-semibold">Ficha técnica do empreendimento</h3></div>
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-2"><Label htmlFor="towers">Quantidade de torres</Label><Input id="towers" type="number" min="1" value={form.towers} disabled={disabled} onChange={e=>update("towers",e.target.value)}/></div>
      <div className="space-y-2"><Label htmlFor="apartments">Quantidade de apartamentos</Label><Input id="apartments" type="number" min="1" value={form.apartments} disabled={disabled} onChange={e=>update("apartments",e.target.value)}/></div>
      <div className="space-y-2"><Label htmlFor="typologies">Quantidade de tipologias</Label><Input id="typologies" type="number" min="1" value={form.typologies} disabled={disabled} onChange={e=>update("typologies",e.target.value)}/></div>
    </div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="areas">M² das unidades privativas</Label><Input id="areas" value={form.areas} disabled={disabled} onChange={e=>update("areas",e.target.value)} placeholder="Ex.: 68,40; 74,20; 92,80"/><p className="text-xs text-muted-foreground">Informe as áreas por tipologia.</p></div>
      <div className="space-y-2"><Label htmlFor="completionDate">Finalização do empreendimento</Label><div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground"/><Input id="completionDate" type="date" value={form.completionDate} disabled={disabled} onChange={e=>update("completionDate",e.target.value)}/></div></div>
    </div>
    <div className="mt-6 flex items-center justify-between border-t border-border pt-4"><span /><div className="flex items-center gap-3"><PersistenceStatus state={persistence.state} savedAt={persistence.savedAt} error={persistence.error} onRetry={()=>void persistence.persist()}/><Button disabled={disabled||persistence.isSaving} onClick={()=>void persistence.persist()}><Save className="h-4 w-4"/>Salvar ficha</Button></div></div>
  </Card>
}
