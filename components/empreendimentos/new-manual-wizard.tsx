"use client"

import { ChangeEvent,useState } from "react"
import { useRouter } from "next/navigation"
import { createDevelopment as persistDevelopment } from "@/app/actions/developments"
import { ArrowLeft,ArrowRight,Building2,Check,ClipboardList,AlertCircle,FileText,Upload,BrainCircuit } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from "@/components/ui/dialog"

const stages=["Dados do empreendimento","Configurar cronograma","Pré-cadastro"]
const phaseNames=["Ficha Técnica do Empreendimento","Checklist Inicial","Manual do Proprietário","Manual do Síndico"]
const defaultWeights=[25,25,25,25]
type DateRow={name:string;start:string;end:string;weight:number}
type Props={open:boolean;onOpenChange:(open:boolean)=>void;organizationName:string}
type UploadResult={id:string;filename:string;status:string;provider:string|null;model:string|null;error?:string}

function validIsoDate(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(`${value}T00:00:00`);return date.getFullYear()>=2000&&date.getFullYear()<=2100&&date.toISOString().slice(0,10)===value}
function dateError(row:DateRow){if(!validIsoDate(row.start)||!validIsoDate(row.end))return"Informe datas válidas entre 2000 e 2100.";if(row.end<row.start)return"A data final não pode ser anterior à inicial.";return""}

export function NewManualWizard({open,onOpenChange,organizationName}:Props){
  const router=useRouter()
  const [step,setStep]=useState(0)
  const [submitting,setSubmitting]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [createdId,setCreatedId]=useState("")
  const [form,setForm]=useState({name:"",towers:"",apartments:"",typologies:"",areas:"",completionDate:""})
  const [dates,setDates]=useState<DateRow[]>(()=>phaseNames.map((name,index)=>({name,start:"",end:"",weight:defaultWeights[index]})))
  const [memorial,setMemorial]=useState<File|null>(null)
  const [uploadResult,setUploadResult]=useState<UploadResult|null>(null)
  const weightTotal=dates.reduce((sum,item)=>sum+(Number.isFinite(item.weight)?item.weight:0),0)
  const validFicha=Boolean(form.name&&form.towers&&form.apartments&&form.typologies&&form.areas&&validIsoDate(form.completionDate))
  const dateErrors=dates.map(item=>dateError(item))
  const validDates=dates.every((item,index)=>item.start&&item.end&&!dateErrors[index])&&Math.abs(weightTotal-100)<0.001

  const update=(key:keyof typeof form,value:string)=>setForm(current=>({...current,[key]:value}))
  const updateDate=(index:number,key:"start"|"end"|"weight",value:string)=>setDates(current=>current.map((phase,i)=>i===index?{...phase,[key]:key==="weight"?Number(value):value}:phase))

  function reset(){
    setStep(0);setSubmitting(false);setError(null);setCreatedId("");setMemorial(null);setUploadResult(null)
    setForm({name:"",towers:"",apartments:"",typologies:"",areas:"",completionDate:""})
    setDates(phaseNames.map((name,index)=>({name,start:"",end:"",weight:defaultWeights[index]})))
  }

  function complete(){
    if(!createdId)return
    const id=createdId
    onOpenChange(false)
    reset()
    router.push(`/empreendimentos/${id}?modulo=identidade`)
    router.refresh()
  }

  function close(){
    if(submitting)return
    if(createdId){complete();return}
    reset();onOpenChange(false)
  }

  async function createAndContinue(){
    if(submitting||!validDates)return
    setSubmitting(true);setError(null)
    const id=`emp-${crypto.randomUUID()}`
    const schedule=dates.map((item,index)=>({id:`stage-${index+1}`,name:item.name,weight:item.weight,originalDate:item.start,scheduledDate:item.end,status:"no_prazo" as const,revisions:[]}))
    try{
      await persistDevelopment({id,name:form.name.trim(),client:organizationName,deliveryDate:form.completionDate,data:{ficha:{...form,client:organizationName},schedule,scheduleWeights:dates.map(({name,weight})=>({name,weight}))}})
      setCreatedId(id)
      setStep(2)
    }catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível criar o empreendimento.")}
    finally{setSubmitting(false)}
  }

  function chooseMemorial(event:ChangeEvent<HTMLInputElement>){
    setUploadResult(null);setError(null)
    setMemorial(event.target.files?.[0]??null)
  }

  async function uploadMemorial(){
    if(!createdId||!memorial||submitting)return
    setSubmitting(true);setError(null)
    try{
      const body=new FormData()
      body.set("developmentId",createdId)
      body.set("file",memorial)
      const response=await fetch("/api/memorial/upload",{method:"POST",body})
      const result=await response.json() as UploadResult
      if(!response.ok)throw new Error(result.error||"Não foi possível enviar o Memorial")
      setUploadResult(result)
    }catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível enviar o Memorial")}
    finally{setSubmitting(false)}
  }

  return <Dialog open={open} onOpenChange={value=>!value&&close()}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader><DialogTitle>Novo empreendimento</DialogTitle><DialogDescription>Cadastre o empreendimento, configure o cronograma e escolha se deseja iniciar o pré-cadastro pelo Memorial Descritivo.</DialogDescription></DialogHeader>
      <div className="grid grid-cols-3 gap-2">{stages.map((label,index)=><div key={label} className={`flex items-center gap-2 border-b-2 pb-2 text-xs ${step===index?"border-primary font-semibold text-primary":index<step?"border-success text-success":"border-border text-muted-foreground"}`}><span className="flex h-5 w-5 items-center justify-center rounded-full border text-[10px]">{index<step?<Check className="h-3 w-3"/>:index+1}</span><span className="truncate">{label}</span></div>)}</div>

      {step===0&&<div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="new-name">Nome do empreendimento</Label><Input id="new-name" value={form.name} onChange={e=>update("name",e.target.value)}/></div><div className="space-y-2"><Label>Construtora</Label><div className="flex min-h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">{organizationName}</div></div>{(["towers","apartments","typologies"] as const).map(key=><div className="space-y-2" key={key}><Label htmlFor={`new-${key}`}>{key==="towers"?"Quantidade de torres":key==="apartments"?"Quantidade de apartamentos":"Quantidade de tipologias"}</Label><Input id={`new-${key}`} type="number" min="1" value={form[key]} onChange={e=>update(key,e.target.value)}/></div>)}<div className="space-y-2"><Label htmlFor="new-areas">M² das unidades privativas</Label><Input id="new-areas" value={form.areas} onChange={e=>update("areas",e.target.value)}/></div><div className="space-y-2"><Label htmlFor="new-completion">Previsão de finalização</Label><Input id="new-completion" type="date" min="2000-01-01" max="2100-12-31" value={form.completionDate} onChange={e=>update("completionDate",e.target.value)}/></div></div><div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground"><Building2 className="mb-1 h-4 w-4 text-primary"/>Estas informações formarão a ficha técnica.</div></div>}

      {step===1&&<div className="space-y-4"><div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm"><p className="font-medium">Configure cronograma e pesos</p><p className="mt-1 text-muted-foreground">A soma dos pesos precisa ser exatamente 100%. As datas das etapas são independentes e podem se sobrepor.</p><p className={`mt-2 font-mono font-semibold ${Math.abs(weightTotal-100)<0.001?"text-success":"text-destructive"}`}>Soma atual: {weightTotal.toFixed(2)}%</p></div>{dates.map((item,index)=><Card key={item.name} className="grid gap-3 p-4 sm:grid-cols-[1fr_100px_150px_150px]"><div className="flex items-center gap-2 text-sm font-medium"><ClipboardList className="h-4 w-4 text-primary"/>{item.name}</div><div className="space-y-1"><Label className="text-xs">Peso (%)</Label><Input type="number" min="0" max="100" step="0.01" value={item.weight} onChange={e=>updateDate(index,"weight",e.target.value)}/></div><div className="space-y-1"><Label className="text-xs">Início</Label><Input type="date" min="2000-01-01" max="2100-12-31" value={item.start} onChange={e=>updateDate(index,"start",e.target.value)}/></div><div className="space-y-1"><Label className="text-xs">Fim</Label><Input type="date" min="2000-01-01" max="2100-12-31" value={item.end} onChange={e=>updateDate(index,"end",e.target.value)}/></div>{dateErrors[index]&&<p className="text-xs text-destructive sm:col-span-4">{dateErrors[index]}</p>}</Card>)}</div>}

      {step===2&&<div className="space-y-5">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5"><div className="flex items-start gap-3"><BrainCircuit className="mt-0.5 h-5 w-5 text-primary"/><div><h3 className="font-semibold">Pré-cadastrar a partir do Memorial Descritivo?</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">O Memorial será armazenado como fonte documental do empreendimento. O motor do DG Manual usará o documento para relacionar informações aos itens existentes do checklist e, depois, aplicar os textos padronizados da biblioteca técnica.</p></div></div></div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5"><div className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary"/><h3 className="font-semibold">Importar Memorial</h3></div><p className="mt-2 text-sm text-muted-foreground">PDF ou DOCX, até 25 MB.</p><label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center hover:bg-muted/40"><Upload className="mb-2 h-6 w-6 text-muted-foreground"/><span className="text-sm font-medium">{memorial?.name??"Selecionar Memorial Descritivo"}</span><span className="mt-1 text-xs text-muted-foreground">{memorial?Math.ceil(memorial.size/1024)+" KB":"Clique para escolher o arquivo"}</span><input type="file" className="hidden" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={chooseMemorial}/></label>{!uploadResult&&<Button className="mt-4 w-full" disabled={!memorial||submitting} onClick={()=>void uploadMemorial()}>{submitting?"Enviando…":"Enviar Memorial"}</Button>}</Card>
          <Card className="p-5"><h3 className="font-semibold">O que será pré-cadastrado</h3><div className="mt-4 space-y-3 text-sm"><div className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success"/><span>Itens identificados no Checklist Inicial.</span></div><div className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success"/><span>Escopo em Unidades privativas e Áreas comuns quando houver evidência.</span></div><div className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success"/><span>Fonte documental e evidências para conferência.</span></div><div className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success"/><span>Texto-base dos Sistemas Construtivos a partir da biblioteca técnica.</span></div></div></Card>
        </div>
        {uploadResult&&<div className="rounded-lg border border-success/30 bg-success/5 p-4 text-sm"><p className="font-medium text-success">Memorial registrado com sucesso</p><p className="mt-1 text-muted-foreground">{uploadResult.status==="ready_to_process"?`Motor disponível: ${uploadResult.provider??"IA"} · ${uploadResult.model??"modelo configurado"}. O documento está preparado para o processamento estruturado.`:"O arquivo está preservado. O Gerenciador precisa configurar o motor de IA para que o processamento estruturado seja habilitado."}</p></div>}
      </div>}

      {error&&<div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4"/>{error}</div>}

      <DialogFooter className="gap-2 sm:justify-between">
        {step<2?<Button variant="outline" onClick={step===0?close:()=>setStep(0)}><ArrowLeft className="h-4 w-4"/>{step===0?"Cancelar":"Voltar"}</Button>:<Button variant="outline" onClick={complete}>Começar sem pré-cadastro</Button>}
        {step===0?<Button disabled={!validFicha} onClick={()=>setStep(1)}>Configurar cronograma<ArrowRight className="h-4 w-4"/></Button>:step===1?<Button onClick={()=>void createAndContinue()} disabled={!validDates||submitting}>{submitting?"Criando…":"Criar e continuar"}<ArrowRight className="h-4 w-4"/></Button>:<Button onClick={complete} disabled={submitting}>{uploadResult?"Abrir empreendimento":"Concluir cadastro"}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
