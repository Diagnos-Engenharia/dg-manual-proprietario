"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Eye,EyeOff,KeyRound,Trash2 } from "lucide-react"
import { deleteIntegration,saveIntegration,testIntegration,type Provider } from "@/app/actions/integrations"
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

const services:{id:Provider;name:string;test:boolean;endpoint:boolean}[]=[
  {id:"openai",name:"OpenAI",test:true,endpoint:false},
  {id:"google_ai",name:"Google AI",test:true,endpoint:false},
  {id:"webhook",name:"Automação / Webhook",test:false,endpoint:true},
  {id:"custom",name:"Integração personalizada",test:false,endpoint:true},
]
type Entry={provider:string;configured:boolean;status:string;testedAt:string|null;config:{endpoint?:string}}

export function IntegrationsPanel({entries}:{entries:Entry[]}){
  const router=useRouter()
  const [secrets,setSecrets]=useState<Partial<Record<Provider,string>>>({})
  const [endpoints,setEndpoints]=useState<Partial<Record<Provider,string>>>({})
  const [revealed,setRevealed]=useState<Provider[]>([])
  const [busy,setBusy]=useState<Provider|null>(null)
  const [feedback,setFeedback]=useState<Partial<Record<Provider,string>>>({})
  async function run(provider:Provider,fn:()=>Promise<{ok:boolean;message?:string}>,clear=false){
    setBusy(provider);setFeedback(p=>({...p,[provider]:""}))
    try{const result=await fn();setFeedback(p=>({...p,[provider]:result.message??"Salvo."}));if(result.ok&&clear){setSecrets(p=>({...p,[provider]:""}));router.refresh()}}
    catch(e){setFeedback(p=>({...p,[provider]:e instanceof Error?e.message:"Falha na operação"}))}
    finally{setBusy(null)}
  }
  return <Card><CardHeader><CardTitle>API e integrações</CardTitle></CardHeader><CardContent>
    <div className="grid gap-4 lg:grid-cols-2">{services.map(service=>{
      const current=entries.find(e=>e.provider===service.id),configured=Boolean(current?.configured),show=revealed.includes(service.id),key=secrets[service.id]??""
      return <div key={service.id} className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{service.name}</h3><Badge variant="outline" className={current?.status==="verified"?"text-success":configured?"text-warning":""}>{current?.status==="verified"?"Verificada":configured?"Configurada":"Não configurada"}</Badge></div>
        <div className="space-y-1.5"><Label>Chave de API / token</Label><div className="flex gap-2"><Input type={show?"text":"password"} autoComplete="off" value={key} onChange={e=>setSecrets(p=>({...p,[service.id]:e.target.value}))} placeholder={configured?"••••••••":"Insira a credencial"}/><Button variant="outline" size="icon" aria-label={show?"Ocultar":"Exibir"} onClick={()=>setRevealed(p=>show?p.filter(x=>x!==service.id):[...p,service.id])}>{show?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</Button></div></div>
        {service.endpoint&&<div className="space-y-1.5"><Label>Endpoint HTTPS</Label><Input value={endpoints[service.id]??current?.config?.endpoint??""} onChange={e=>setEndpoints(p=>({...p,[service.id]:e.target.value}))} placeholder="https://..."/></div>}
        <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy!==null||(!key&&!configured)} onClick={()=>void run(service.id,()=>saveIntegration({provider:service.id,apiKey:key,endpoint:endpoints[service.id]??current?.config?.endpoint??""}).then(v=>({...v,message:"Configuração salva."})),true)}><KeyRound className="h-3.5 w-3.5"/>Salvar</Button>{configured&&service.test&&<Button variant="outline" size="sm" disabled={busy!==null} onClick={()=>void run(service.id,()=>testIntegration(service.id))}>Testar</Button>}{configured&&<Button variant="ghost" size="sm" disabled={busy!==null} onClick={()=>{if(window.confirm("Remover esta integração?"))void run(service.id,()=>deleteIntegration(service.id).then(x=>({...x,message:"Integração removida."})),true)}}><Trash2 className="h-3.5 w-3.5"/>Remover</Button>}</div>
        {feedback[service.id]&&<p role="status" className="text-xs text-muted-foreground">{feedback[service.id]}</p>}
      </div>
    })}</div>
  </CardContent></Card>
}
