"use client"

import { useMemo,useState } from "react"
import { saveDevelopmentModulePath } from "@/app/actions/developments"
import { useDevelopmentStore } from "@/lib/store"
import { PersistenceStatus,usePersistenceStatus } from "@/hooks/use-persistence-status"
import { Droplets,ExternalLink,Save,Zap } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const services=[
  {id:"agua",title:"Água",company:"Concessionária de água",icon:Droplets},
  {id:"gas",title:"Gás",company:"Naturgy",icon:Zap},
  {id:"energia",title:"Energia",company:"Concessionária de energia",icon:Zap},
  {id:"telecom",title:"Telecomunicações",company:"Operadoras disponíveis",icon:ExternalLink},
]
type ServiceData={company:string;phone:string;site:string;instructions:string}
const defaults:Record<string,ServiceData>={
  gas:{company:"Naturgy",phone:"0800 772 2348",site:"www.naturgy.com.br",instructions:""},
  agua:{company:"",phone:"",site:"",instructions:""},
  energia:{company:"",phone:"",site:"",instructions:""},
  telecom:{company:"",phone:"",site:"",instructions:""},
}
export function Comissionamento({disabled,developmentId}:{disabled?:boolean;developmentId?:string}){
  const development=useDevelopmentStore(state=>developmentId?state.developments[developmentId]:undefined)
  const initial=useMemo(()=>{
    const authoring=(development?.authoring??{}) as {comissionamento?:Record<string,ServiceData>}
    const legacy=((development?.manuals?.proprietario as {comissionamento?:Record<string,ServiceData>}|undefined)?.comissionamento)
    return {...defaults,...(legacy??{}),...(authoring.comissionamento??{})}
  },[development])
  const [active,setActive]=useState("agua")
  const [data,setData]=useState<Record<string,ServiceData>>(initial)
  const current=data[active]
  const save=async(value:typeof data)=>{if(!developmentId)throw new Error("Empreendimento não identificado");return saveDevelopmentModulePath(developmentId,["authoring","comissionamento"],value)}
  const persistence=usePersistenceStatus(data,save)
  const update=(key:keyof ServiceData,value:string)=>setData(all=>({...all,[active]:{...all[active],[key]:value}}))
  const activeService=services.find(service=>service.id===active)!
  return <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
    <Card className="h-fit p-2"><div className="flex flex-col gap-1">{services.map(service=>{const Icon=service.icon;return <button key={service.id} onClick={()=>setActive(service.id)} className={cn("flex items-center justify-center gap-2 rounded-md px-3 py-3 text-sm font-medium",active===service.id?"bg-primary/10 text-foreground":"text-muted-foreground hover:bg-muted")}><Icon className="h-4 w-4 text-primary"/>{service.title}</button>})}</div></Card>
    <Card className="p-5">
      <h3 className="mb-5 text-base font-semibold">{activeService.title}</h3>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Empresa responsável</Label><Input value={current.company} disabled={disabled} onChange={e=>update("company",e.target.value)} placeholder="Nome da concessionária"/></div><div className="space-y-2"><Label>Telefone</Label><Input value={current.phone} disabled={disabled} onChange={e=>update("phone",e.target.value)} placeholder="0800 000 0000"/></div><div className="space-y-2 sm:col-span-2"><Label>Site</Label><Input value={current.site} disabled={disabled} onChange={e=>update("site",e.target.value)} placeholder="www.concessionaria.com.br"/></div><div className="space-y-2 sm:col-span-2"><Label>Como solicitar e ativar</Label><Textarea value={current.instructions} disabled={disabled} onChange={e=>update("instructions",e.target.value)} rows={5}/></div></div>
      <div className="mt-5 flex justify-end gap-3 border-t border-border pt-4"><PersistenceStatus state={persistence.state} savedAt={persistence.savedAt} error={persistence.error} onRetry={()=>void persistence.persist()}/><Button disabled={disabled||persistence.isSaving} onClick={()=>void persistence.persist()}><Save className="h-4 w-4"/>Salvar</Button></div>
    </Card>
  </div>
}
