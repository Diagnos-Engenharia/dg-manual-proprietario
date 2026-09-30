"use client"

import Link from "next/link"
import { useMemo,useState } from "react"
import { BookOpen,Building2,Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

type PersistedManualDevelopment={id:string;name:string;client:string;status:string;deliveryDate:string;masterProgress:number;data:unknown}
const statusLabel:Record<string,string>={em_andamento:"Em andamento",finalizado:"Finalizado",pausado:"Pausado"}

export function ManuaisPageContent({persisted=[]}:{persisted?:PersistedManualDevelopment[]}){
  const [query,setQuery]=useState("")
  const rows=useMemo(()=>persisted.filter(item=>(item.name+" "+item.client).toLowerCase().includes(query.toLowerCase())),[persisted,query])
  return <div className="space-y-4">
    <div className="relative mx-auto w-full max-w-xl"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar empreendimento..." className="pl-9"/></div>
    <div className="space-y-3">{rows.map(item=><div key={item.id} className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary"><Building2 className="h-4 w-4"/></span><div><p className="font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{item.client}</p></div></div><Badge variant="outline">{statusLabel[item.status]??item.status}</Badge></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Link href={"/empreendimentos/"+item.id+"?modulo=emissao&manual=proprietario"} className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm font-medium hover:border-primary/40 hover:bg-muted/30"><span className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary"/>Manual do Proprietário</span><span className="text-primary">Abrir</span></Link>
        <Link href={"/empreendimentos/"+item.id+"?modulo=emissao&manual=sindico"} className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm font-medium hover:border-primary/40 hover:bg-muted/30"><span className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary"/>Manual do Síndico</span><span className="text-primary">Abrir</span></Link>
      </div>
    </div>)}
    {!rows.length&&<div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Nenhum empreendimento encontrado.</div>}
  </div>
}
