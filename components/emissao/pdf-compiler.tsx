"use client"

import { useEffect,useState } from "react"
import { useSearchParams } from "next/navigation"
import { AlertTriangle,Check,CheckCircle2,Download,Eye,Loader2,Paperclip,RefreshCw,Send,ShieldCheck } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type ManualType="proprietario"|"sindico"
type Validation={development:string;stages?:Array<{id:string;name:string;progress:number;pending:string[]}>;overall?:number;blocking:string[];alerts:string[];sections:number;attachments:Array<{name:string;sizeBytes:number;pathname:string}>;manualType:ManualType;finishing?:Array<{id:string;typology:string;tower:string;unitModel:string;area:string;revision:number;status:string;updatedAt:string}>}
type Version={id:string;revision:number;status:string;comment:string|null;filename:string;pathname:string;sections:number;pages:number;attachments:number;createdAt:string}
const labels:Record<ManualType,string>={proprietario:"Manual do Proprietário",sindico:"Manual do Síndico"}
const statusLabels:Record<string,string>={rascunho:"Rascunho",validacao:"Em validação",aprovado:"Aprovado",publicado:"Publicado",substituido:"Substituído"}

export function PdfCompiler({developmentId,role}:{developmentId?:string;role:"admin"|"editor"|"validator"}){
  const searchParams=useSearchParams()
  const requestedManual=searchParams.get("manual")==="sindico"?"sindico":"proprietario"
  const [manual,setManual]=useState<ManualType>(requestedManual)
  const [validation,setValidation]=useState<Validation|null>(null)
  const [versions,setVersions]=useState<Version[]>([])
  const [loading,setLoading]=useState(false)
  const [compiling,setCompiling]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [success,setSuccess]=useState<{filename:string;pathname:string;revision:number;pages:number}|null>(null)

  async function load(){
    if(!developmentId)return
    setLoading(true);setError(null)
    try{
      const [validationResponse,versionsResponse]=await Promise.all([
        fetch("/api/manuals/validate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({developmentId,manualType:manual})}),
        fetch("/api/manuals/versions?developmentId="+encodeURIComponent(developmentId)+"&manualType="+manual),
      ])
      const readJson=async<T,>(response:Response)=>{const text=await response.text();try{return JSON.parse(text) as T}catch{throw new Error(response.status===401?"Sua sessão expirou.":"O servidor não retornou uma resposta válida.")}}
      const nextValidation=await readJson<Validation&{error?:string}>(validationResponse)
      if(!validationResponse.ok)throw new Error(nextValidation.error||"Não foi possível validar o manual.")
      setValidation(nextValidation)
      const nextVersions=await readJson<{versions?:Version[]}>(versionsResponse)
      if(!versionsResponse.ok)throw new Error("Não foi possível carregar as versões.")
      setVersions(nextVersions.versions??[])
    }catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível carregar a emissão.")}
    finally{setLoading(false)}
  }
  useEffect(()=>{setManual(requestedManual)},[requestedManual])
  useEffect(()=>{void load()},[developmentId,manual])

  async function compile(){
    if(!developmentId||!validation||validation.blocking.length)return
    setCompiling(true);setError(null);setSuccess(null)
    try{
      const response=await fetch("/api/manuals/compile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({developmentId,manualType:manual})})
      const text=await response.text()
      let result:{error?:string;filename:string;pathname:string;revision:number;pages:number}
      try{result=JSON.parse(text) as typeof result}catch{throw new Error(response.status===401?"Sua sessão expirou.":"O servidor não retornou uma resposta válida.")}
      if(!response.ok)throw new Error(result.error||"Falha ao gerar o PDF.")
      setSuccess(result);await load()
    }catch(cause){setError(cause instanceof Error?cause.message:"Falha ao gerar o PDF.")}
    finally{setCompiling(false)}
  }
  const fileUrl=(pathname:string)=>"/api/manuals/file?pathname="+encodeURIComponent(pathname)
  async function transition(id:string,status:string){await fetch("/api/manuals/versions/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status})});await load()}
  const current=versions[0]
  const ready=Boolean(validation&&validation.blocking.length===0&&!validation.stages?.some(stage=>stage.progress<100))
  const overall=validation?.overall??0

  return <div className="flex flex-col gap-4">
    <div className="grid gap-2 sm:grid-cols-2">{(["proprietario","sindico"] as ManualType[]).map(type=><button key={type} type="button" onClick={()=>setManual(type)} className={cn("rounded-lg border px-4 py-3 text-left text-sm font-semibold",manual===type?"border-primary bg-primary/10":"border-border bg-card hover:border-primary/40")}>{labels[type]}</button>)}</div>

    {error&&<div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>{error}</div>}

    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">{ready?<CheckCircle2 className="h-5 w-5 text-success"/>:<AlertTriangle className="h-5 w-5 text-warning"/>}<h3 className="font-semibold">{ready?"Pronto para emitir":"Pendências"}</h3></div>
        <div className="flex items-center gap-2"><Badge variant="outline">{overall}%</Badge>{current&&<Badge variant="outline">Rev. {String(current.revision).padStart(2,"0")}</Badge>}<Button variant="ghost" size="sm" onClick={()=>void load()} disabled={loading}><RefreshCw className={cn("h-4 w-4",loading&&"animate-spin")}/>Atualizar</Button></div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{width:overall+"%"}}/></div>
      {validation?.stages&&<div className="mt-4 space-y-2">{validation.stages.map(stage=><div key={stage.id} className="rounded-md border border-border px-3 py-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{stage.name}</span><span className="text-xs text-muted-foreground">{stage.progress}%</span></div>{stage.pending.map((item,index)=><p key={index} className="mt-1 text-xs text-destructive">• {item}</p>)}{stage.pending.length>0&&developmentId&&<a className="mt-2 inline-block text-xs font-medium text-primary underline" href={"/empreendimentos/"+encodeURIComponent(developmentId)+"?modulo="+(stage.id==="cronograma"?"cronograma":"elaboracao")+"&manual="+manual}>Corrigir</a>}</div>)}</div>}
      {manual==="proprietario"&&<div className="mt-3 flex items-center gap-2 text-sm">{validation?.finishing?.length?<Check className="h-4 w-4 text-success"/>:<AlertTriangle className="h-4 w-4 text-warning"/>}<span>Tabela de Acabamentos</span></div>}
      {validation?.alerts.map(item=><p key={item} className="mt-3 text-sm text-warning">{item}</p>)}
      <div className="mt-5 flex flex-wrap items-center gap-2"><Button onClick={compile} disabled={compiling||loading||!ready}>{compiling?<><Loader2 className="h-4 w-4 animate-spin"/>Gerando…</>:<><Send className="h-4 w-4"/>Emitir PDF</>}</Button>{success&&<><a className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent" href={fileUrl(success.pathname)} target="_blank" rel="noreferrer"><Eye className="h-4 w-4"/>Visualizar</a><a className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent" href={fileUrl(success.pathname)} download={success.filename}><Download className="h-4 w-4"/>Baixar</a></>}</div>
      {success&&<p className="mt-3 text-sm text-success">{success.filename} · {success.pages} páginas</p>}
    </Card>

    <Card className="p-5"><div className="flex items-center justify-between"><h3 className="font-semibold">Anexos</h3><Badge variant="outline">{validation?.attachments.length??0}</Badge></div>{validation?.attachments.length?<div className="mt-3 grid gap-2 sm:grid-cols-2">{validation.attachments.map(file=><div key={file.pathname} className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"><span className="flex min-w-0 items-center gap-2"><Paperclip className="h-4 w-4 shrink-0 text-muted-foreground"/><span className="truncate">{file.name}</span></span><span className="text-xs text-muted-foreground">{Math.ceil(file.sizeBytes/1024)} KB</span></div>)}</div>:<p className="mt-3 text-sm text-muted-foreground">Nenhum anexo.</p>}</Card>

    <Card className="p-5"><h3 className="font-semibold">Versões</h3><div className="mt-3 flex flex-col gap-2">{versions.map((version,index)=><div key={version.id} className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Badge variant={index===0?"default":"secondary"}>Rev. {String(version.revision).padStart(2,"0")}</Badge><span className="text-sm font-medium">{statusLabels[version.status]??version.status}</span></div><p className="mt-1 text-xs text-muted-foreground">{new Date(version.createdAt).toLocaleString("pt-BR")} · {version.pages} páginas</p></div><div className="flex flex-wrap gap-2">{version.status==="rascunho"&&(role==="editor"||role==="admin")&&<Button size="sm" variant="outline" onClick={()=>void transition(version.id,"validacao")}><Send className="h-4 w-4"/>Validar</Button>}{version.status==="validacao"&&(role==="validator"||role==="admin")&&<Button size="sm" variant="outline" onClick={()=>void transition(version.id,"aprovado")}><Check className="h-4 w-4"/>Aprovar</Button>}{version.status==="aprovado"&&role==="admin"&&<Button size="sm" variant="outline" onClick={()=>void transition(version.id,"publicado")}><ShieldCheck className="h-4 w-4"/>Publicar</Button>}<a className="inline-flex h-8 items-center justify-center rounded-md border border-input px-2" href={fileUrl(version.pathname)} target="_blank" rel="noreferrer"><Eye className="h-4 w-4"/></a><a className="inline-flex h-8 items-center justify-center rounded-md border border-input px-2" href={fileUrl(version.pathname)} download={version.filename}><Download className="h-4 w-4"/></a></div></div>)}{versions.length===0&&<p className="text-sm text-muted-foreground">Nenhuma versão emitida.</p>}</div></Card>
  </div>
}
