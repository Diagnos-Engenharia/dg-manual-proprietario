"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, KeyRound, PlugZap, Trash2 } from "lucide-react"
import { deleteIntegration, saveIntegration, testIntegration, type Provider } from "@/app/actions/integrations"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

const services: {id:Provider;name:string;description:string;test:boolean}[]=[
  {id:"openai",name:"OpenAI",description:"Chave de API para funcionalidades de inteligência artificial.",test:true},
  {id:"google_ai",name:"Google AI",description:"Chave de API para integração com modelos Gemini.",test:true},
  {id:"webhook",name:"Automação / Webhook",description:"Credencial de autenticação e endereço HTTPS do endpoint.",test:false},
  {id:"custom",name:"Integração personalizada",description:"Chave e endereço HTTPS para um conector específico.",test:false},
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
    try{const result=await fn();setFeedback(p=>({...p,[provider]:result.message??"Configuração salva."}));if(result.ok&&clear){setSecrets(p=>({...p,[provider]:""}));router.refresh()}}
    catch(e){setFeedback(p=>({...p,[provider]:e instanceof Error?e.message:"Falha na operação"}))}
    finally{setBusy(null)}
  }
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><PlugZap className="h-4 w-4"/>API e integrações</CardTitle><CardDescription>Credenciais protegidas no servidor. Chaves salvas não são exibidas novamente.</CardDescription></CardHeader>
    <CardContent className="space-y-5">{services.map(service=>{
      const current=entries.find(e=>e.provider===service.id)
      const configured=Boolean(current?.configured)
      const show=revealed.includes(service.id)
      const key=secrets[service.id]??""
      return <div key={service.id} className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">{service.name}</h3><p className="text-xs text-muted-foreground">{service.description}</p></div>
          <Badge variant="outline" className={current?.status==="verified"?"text-emerald-600":configured?"text-amber-600":""}>{current?.status==="verified"?"Verificada":configured?"Chave armazenada":"Não configurada"}</Badge>
        </div>
        <div className="space-y-1"><Label>Chave de API / token</Label><div className="flex gap-2"><Input type={show?"text":"password"} autoComplete="off" value={key} onChange={e=>setSecrets(p=>({...p,[service.id]:e.target.value}))} placeholder={configured?"•••••••• (chave já salva)":"Insira uma credencial"}/><Button variant="outline" size="icon" aria-label={show?"Ocultar chave digitada":"Exibir chave digitada"} onClick={()=>setRevealed(p=>show?p.filter(x=>x!==service.id):[...p,service.id])}>{show?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</Button></div></div>
        {(service.id==="webhook"||service.id==="custom")&&<div className="space-y-1"><Label>Endpoint HTTPS</Label><Input value={endpoints[service.id]??current?.config?.endpoint??""} onChange={e=>setEndpoints(p=>({...p,[service.id]:e.target.value}))} placeholder="https://..." /></div>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy!==null||(!key&&!configured)} onClick={()=>void run(service.id,()=>saveIntegration({provider:service.id,apiKey:key,endpoint:endpoints[service.id]??current?.config?.endpoint??""}).then(v=>({...v,message:"Chave armazenada com segurança."})),true)}><KeyRound className="h-3.5 w-3.5"/>Salvar</Button>
          {configured&&service.test&&<Button variant="outline" size="sm" disabled={busy!==null} onClick={()=>void run(service.id,()=>testIntegration(service.id))}>Testar conexão</Button>}
          {configured&&<Button variant="ghost" size="sm" disabled={busy!==null} onClick={()=>{if(window.confirm("Remover a chave de integração?"))void run(service.id,()=>deleteIntegration(service.id).then(x=>({...x,message:"Integração removida."})),true)}}><Trash2 className="h-3.5 w-3.5"/>Remover</Button>}
        </div>
        {configured&&!service.test&&<p className="text-xs text-muted-foreground">Chave armazenada; o conector e o teste automatizado ainda não estão habilitados.</p>}
        {feedback[service.id]&&<p role="status" className="text-xs text-muted-foreground">{feedback[service.id]}</p>}
      </div>
    })}</CardContent>
  </Card>
}
