"use client"

import { useEffect,useMemo,useState } from "react"
import { CalendarClock,CheckCircle2,Clock,Lock,Plus,Settings2,TriangleAlert,ArrowUp,ArrowDown,Trash2,ChevronDown } from "lucide-react"
import { useDevelopmentStore } from "@/lib/store"
import { phaseProgress,progressForDevelopment,stageStatus } from "@/lib/progress"
import { schedulePhaseStatusLabels,daysUntil,formatDate,type Revision,type SchedulePhase } from "@/lib/mock-data"
import { saveDevelopmentModule } from "@/app/actions/developments"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const statusStyles:Record<SchedulePhase["status"],string>={no_prazo:"bg-primary/10 text-primary border-primary/20",atrasado:"bg-destructive/10 text-destructive border-destructive/20",concluido:"bg-success/10 text-success border-success/20"}
const statusIcons:Record<SchedulePhase["status"],typeof Clock>={no_prazo:Clock,atrasado:TriangleAlert,concluido:CheckCircle2}
const native=(p:SchedulePhase)=>!p.kind||p.kind!=="custom"&&!p.id.startsWith("custom-")
function withNativeKind(p:SchedulePhase):SchedulePhase{
  if(p.kind)return p
  const key:SchedulePhase["kind"]=p.name==="Ficha Técnica do Empreendimento"||["ph-sistemas","stage-1"].includes(p.id)?"ficha":
    p.name==="Checklist Inicial"||["ph-fornecedores","stage-2"].includes(p.id)?"checklist":
    p.name==="Manual do Proprietário"||["ph-revestimentos","stage-3"].includes(p.id)?"proprietario":
    p.name==="Manual do Síndico"||["ph-areas-comuns","stage-4"].includes(p.id)?"sindico":"custom"
  return {...p,kind:key}
}

export function ScheduleManager({developmentId}:{developmentId?:string}){
  const development=useDevelopmentStore(state=>developmentId?state.developments[developmentId]:undefined)
  const updateDevelopment=useDevelopmentStore(state=>state.updateDevelopment)
  const sourcePhases=development?.schedule
  const [phases,setPhases]=useState<SchedulePhase[]>(()=> (sourcePhases??[]).map(withNativeKind))
  const [configOpen,setConfigOpen]=useState(false)
  const [historyOpen,setHistoryOpen]=useState(false)
  const [draft,setDraft]=useState<SchedulePhase[]>([])
  const [target,setTarget]=useState<SchedulePhase|null>(null)
  const [date,setDate]=useState("")
  const [reason,setReason]=useState("")
  const [error,setError]=useState<string|null>(null)
  const [saving,setSaving]=useState(false)
  const [today,setToday]=useState<string|null>(null)

  useEffect(()=>{setPhases((sourcePhases??[]).map(withNativeKind))},[sourcePhases])
  useEffect(()=>{const d=new Date();setToday([d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"))},[])
  const progress=useMemo(()=>development?progressForDevelopment(development.ficha,development.checklist,development.manuals):{ficha:0,checklist:0,proprietario:0,sindico:0,master:0},[development])
  const weight=draft.reduce((sum,p)=>sum+p.weight,0)
  const history=useMemo(()=>phases.flatMap(phase=>(phase.revisions??[]).map(revision=>({phase:phase.name,revision}))).sort((a,b)=>new Date(b.revision.date).getTime()-new Date(a.revision.date).getTime()),[phases])

  async function persist(next:SchedulePhase[]){
    if(!developmentId)return
    setSaving(true);setError(null)
    try{
      await saveDevelopmentModule(developmentId,"schedule",next)
      const current=useDevelopmentStore.getState().developments[developmentId]
      updateDevelopment(developmentId,{...current,schedule:next})
      setPhases(next)
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível salvar cronograma")}
    finally{setSaving(false)}
  }
  function updateDraft(id:string,patch:Partial<SchedulePhase>){setDraft(prev=>prev.map(p=>p.id===id?{...p,...patch}:p))}
  function move(id:string,dir:-1|1){setDraft(prev=>{const arr=[...prev],i=arr.findIndex(p=>p.id===id),j=i+dir;if(i<0||j<0||j>=arr.length)return arr;[arr[i],arr[j]]=[arr[j],arr[i]];return arr})}
  function addStage(){
    const last=draft.at(-1)
    setDraft(prev=>[...prev,{id:"custom-"+crypto.randomUUID(),name:"Nova etapa",kind:"custom",progress:0,weight:0,originalDate:last?.scheduledDate??today??"2026-01-01",scheduledDate:last?.scheduledDate??today??"2026-01-01",status:"no_prazo",revisions:[]}])
  }
  async function reprogram(){
    if(!target||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<"2000-01-01"||date>"2100-12-31"||reason.trim().length<10)return
    const next=phases.map(p=>p.id!==target.id?p:{...p,scheduledDate:date,revisions:[...(p.revisions??[]),{tag:"Rev "+String((p.revisions??[]).length+1).padStart(2,"0"),date:new Date().toISOString(),previousDate:p.scheduledDate,newDate:date,justification:reason,author:"Usuário autenticado"} as Revision]})
    await persist(next);setTarget(null);setDate("");setReason("")
  }
  async function customProgress(id:string,value:number){
    if(!Number.isFinite(value)||value<0||value>100)return
    await persist(phases.map(p=>p.id===id?{...p,progress:value}:p))
  }

  return <div className="flex flex-col gap-4">
    {error&&<p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    <Card className="overflow-hidden p-0">
      <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <span>Etapa / avanço</span><span className="hidden md:block">Data original</span><span className="hidden md:block">Data programada</span><span className="hidden md:block">Status</span><span className="w-9"/>
      </div>
      <ul className="divide-y divide-border">{phases.map(phase=>{
        const value=phaseProgress(phase,progress),status=stageStatus(phase,value),Icon=statusIcons[status],days=today?daysUntil(phase.scheduledDate,today):null,custom=phase.kind==="custom"
        return <li key={phase.id} className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium">{phase.name}</p><Badge variant="secondary" className="font-mono text-[10px]">{phase.weight.toFixed(2)}%</Badge></div>
            <div className="mt-2 max-w-[300px]"><div className="mb-1 flex justify-between text-[10px] text-muted-foreground"><span>{custom?"Avanço":phase.kind==="ficha"?"Campos preenchidos":"Itens preenchidos"}</span><span className="font-mono">{value}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:value+"%"}}/></div></div>
            {custom&&<Input aria-label={"Avanço de "+phase.name} className="mt-2 h-8 w-24" type="number" min="0" max="100" value={phase.progress??0} onChange={e=>setPhases(prev=>prev.map(p=>p.id===phase.id?{...p,progress:Number(e.target.value)}:p))} onBlur={e=>void customProgress(phase.id,Number(e.target.value))}/>}
          </div>
          <div className="hidden items-center gap-1.5 text-sm text-muted-foreground md:flex"><Lock className="h-3.5 w-3.5"/>{formatDate(phase.originalDate)}</div>
          <div className="hidden md:block"><p className="text-sm font-medium">{formatDate(phase.scheduledDate)}</p>{status!=="concluido"&&days!==null&&<p suppressHydrationWarning className={cn("text-xs",days<0?"text-destructive":"text-muted-foreground")}>{days<0?Math.abs(days)+" dias em atraso":"faltam "+days+" dias"}</p>}</div>
          <div className="hidden md:block"><Badge variant="outline" className={cn("gap-1",statusStyles[status])}><Icon className="h-3 w-3"/>{schedulePhaseStatusLabels[status]}</Badge></div>
          <div className="flex justify-end"><Button variant="ghost" size="icon" aria-label={"Reprogramar "+phase.name} onClick={()=>{setTarget(phase);setDate(phase.scheduledDate);setReason("")}}><CalendarClock className="h-4 w-4"/></Button></div>
        </li>
      })}</ul>
    </Card>

    <div className="flex w-full flex-wrap items-center justify-start gap-2">
      <Button variant="ghost" onClick={()=>setHistoryOpen(v=>!v)}><ChevronDown className={cn("h-4 w-4 transition-transform",historyOpen&&"rotate-180")}/>Histórico de reprogramações</Button>
      <Button onClick={()=>{setDraft(phases.map(withNativeKind));setConfigOpen(true)}}><Settings2 className="h-4 w-4"/>Ajustar</Button>
    </div>

    {historyOpen&&<Card className="overflow-hidden p-0">
      {history.length===0?<p className="p-4 text-sm text-muted-foreground">Nenhuma reprogramação registrada.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><th className="p-3">Etapa</th><th className="p-3">Anterior</th><th className="p-3">Nova data</th><th className="p-3">Motivo</th><th className="p-3">Responsável</th><th className="p-3">Alteração</th></tr></thead><tbody>{history.map(({phase,revision},index)=><tr key={phase+revision.date+index} className="border-b last:border-0"><td className="p-3 font-medium">{phase}</td><td className="p-3 text-muted-foreground">{formatDate(revision.previousDate)}</td><td className="p-3">{formatDate(revision.newDate)}</td><td className="p-3">{revision.justification}</td><td className="p-3 text-muted-foreground">{revision.author}</td><td className="p-3 text-muted-foreground">{new Date(revision.date).toLocaleString("pt-BR")}</td></tr>)}</tbody></table></div>}
    </Card>}

    <Dialog open={configOpen} onOpenChange={setConfigOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>Ajustar cronograma</DialogTitle><DialogDescription>Reordene etapas, altere pesos ou adicione novas etapas. A soma dos pesos deve ser 100%.</DialogDescription></DialogHeader>
        <div className="space-y-2">{draft.map((p,index)=><div key={p.id} className="grid grid-cols-[auto_1fr_90px_auto] items-center gap-2 rounded-lg border border-border p-2">
          <div className="flex flex-col"><Button variant="ghost" size="icon" disabled={index===0} aria-label="Mover para cima" onClick={()=>move(p.id,-1)}><ArrowUp className="h-3.5 w-3.5"/></Button><Button variant="ghost" size="icon" disabled={index===draft.length-1} aria-label="Mover para baixo" onClick={()=>move(p.id,1)}><ArrowDown className="h-3.5 w-3.5"/></Button></div>
          <Input aria-label={"Nome da etapa "+(index+1)} value={p.name} onChange={e=>updateDraft(p.id,{name:e.target.value})}/>
          <div><Label className="text-xs">Peso (%)</Label><Input aria-label={"Peso de "+p.name} type="number" min="0" max="100" step="0.01" value={p.weight} onChange={e=>{const w=Number(e.target.value);if(Number.isFinite(w))updateDraft(p.id,{weight:w})}}/></div>
          <Button variant="ghost" size="icon" aria-label={"Excluir "+p.name} disabled={native(p)} onClick={()=>setDraft(prev=>prev.filter(s=>s.id!==p.id))}><Trash2 className="h-4 w-4"/></Button>
        </div>)}</div>
        <div className="flex items-center justify-between"><Button variant="outline" size="sm" onClick={addStage}><Plus className="h-4 w-4"/>Adicionar etapa</Button><span className={cn("text-sm font-medium",Math.abs(weight-100)<0.001?"text-success":"text-destructive")}>{weight.toFixed(2)}% / 100%</span></div>
        <DialogFooter><Button variant="outline" onClick={()=>setConfigOpen(false)}>Cancelar</Button><Button disabled={saving||Math.abs(weight-100)>0.001||draft.some(p=>!p.name.trim()||p.weight<0||p.weight>100)} onClick={async()=>{await persist(draft);setConfigOpen(false)}}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={target!==null} onOpenChange={open=>!open&&setTarget(null)}>
      <DialogContent><DialogHeader><DialogTitle>Reprogramar data</DialogTitle><DialogDescription>A data original será preservada no histórico.</DialogDescription></DialogHeader>
        <div className="space-y-3"><div><Label>Data original</Label><Input value={target?formatDate(target.originalDate):""} disabled/></div><div><Label>Nova data</Label><Input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div><div><Label>Justificativa</Label><Textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Motivo da reprogramação"/></div></div>
        <DialogFooter><Button variant="outline" onClick={()=>setTarget(null)}>Cancelar</Button><Button disabled={saving||reason.trim().length<10||!date} onClick={()=>void reprogram()}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
