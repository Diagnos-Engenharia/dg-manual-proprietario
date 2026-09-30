"use client"

import { useEffect,useMemo,useState } from "react"
import { useDevelopmentStore } from "@/lib/store"
import { saveDevelopmentModulePath } from "@/app/actions/developments"
import {
  listSystemValidationStates,
  markSystemItemEdited,
  rejectSystemItem,
  submitSystemItemForValidation,
  validateSystemItem,
  type ContentSection,
  type ContentValidationStatus,
} from "@/app/actions/validation"
import { PersistenceStatus,usePersistenceStatus } from "@/hooks/use-persistence-status"
import {
  AlertCircle,
  BookMarked,
  Building,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FolderTree,
  Home,
  Inbox,
  Plus,
  Send,
  Wrench,
  X,
} from "lucide-react"
import {
  nbrNorms,
  getChecklistItemScopes,
  checklistItemMatchesScope,
  checklistItemContextKey,
  type ChecklistItem,
  type ChecklistScope,
  type MaintenanceItem,
} from "@/lib/mock-data"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RichTextEditor } from "@/components/autoria/rich-text-editor"
import { cn } from "@/lib/utils"

type ValidationRow={contextKey:string;section:ContentSection;status:ContentValidationStatus;comment:string|null;updatedAt:string}
type ScopedStore<T>=Record<ChecklistScope,Record<string,T>>
const scopeOrder:ChecklistScope[]=["unidade","comum"]
const scopeMeta:Record<ChecklistScope,{label:string;icon:typeof Home;manual:"proprietario"|"sindico"}>={
  unidade:{label:"Unidades privativas",icon:Home,manual:"proprietario"},
  comum:{label:"Áreas comuns",icon:Building,manual:"sindico"},
}

export function SistemasConstrutivos({
  items,developmentId,role,initialContents,initialMaintenance,
}:{
  items:ChecklistItem[]
  developmentId:string
  role:"admin"|"editor"|"validator"
  initialContents:ScopedStore<string>
  initialMaintenance:ScopedStore<MaintenanceItem[]>
}){
  const entries=useMemo(()=>scopeOrder.flatMap(scope=>items.filter(item=>checklistItemMatchesScope(item,scope)).map(item=>({item,scope,key:checklistItemContextKey(item,scope)}))),[items])
  const [openScope,setOpenScope]=useState<Record<ChecklistScope,boolean>>({unidade:true,comum:true})
  const [activeKey,setActiveKey]=useState(entries[0]?.key??"")
  const [contents,setContents]=useState<ScopedStore<string>>(()=>({unidade:initialContents.unidade??{},comum:initialContents.comum??{}}))
  const [maintenance,setMaintenance]=useState<ScopedStore<MaintenanceItem[]>>(()=>({unidade:initialMaintenance.unidade??{},comum:initialMaintenance.comum??{}}))
  const [validations,setValidations]=useState<ValidationRow[]>([])
  const [validationError,setValidationError]=useState<string|null>(null)
  const updateDevelopment=useDevelopmentStore(state=>state.updateDevelopment)
  const canEdit=role==="admin"||role==="editor"

  useEffect(()=>{if(entries.length&&!entries.some(entry=>entry.key===activeKey))setActiveKey(entries[0].key)},[entries,activeKey])
  const loadValidations=async()=>{try{setValidations(await listSystemValidationStates(developmentId));setValidationError(null)}catch(e){setValidationError(e instanceof Error?e.message:"Falha ao carregar validações")}}
  useEffect(()=>{void loadValidations()},[developmentId])

  const saveContents=(scope:ChecklistScope,manual:"proprietario"|"sindico")=>async(value:Record<string,string>)=>{
    return saveDevelopmentModulePath(developmentId,["manuals",manual,"sistemas"],value)
  }
  const saveMaintenance=(scope:ChecklistScope,manual:"proprietario"|"sindico")=>async(value:Record<string,MaintenanceItem[]>)=>{
    return saveDevelopmentModulePath(developmentId,["manuals",manual,"manutencao"],value)
  }
  const unitContentPersistence=usePersistenceStatus(contents.unidade,saveContents("unidade","proprietario"),{flushOnUnmount:true})
  const commonContentPersistence=usePersistenceStatus(contents.comum,saveContents("comum","sindico"),{flushOnUnmount:true})
  const unitMaintenancePersistence=usePersistenceStatus(maintenance.unidade,saveMaintenance("unidade","proprietario"),{flushOnUnmount:true})
  const commonMaintenancePersistence=usePersistenceStatus(maintenance.comum,saveMaintenance("comum","sindico"),{flushOnUnmount:true})

  if(!entries.length)return <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center"><Inbox className="h-7 w-7 text-muted-foreground"/><p className="font-medium">Nenhum sistema vinculado.</p></Card>

  const active=entries.find(entry=>entry.key===activeKey)??entries[0]
  const {item,scope,key}=active
  const meta=scopeMeta[scope]
  const contentPersistence=scope==="unidade"?unitContentPersistence:commonContentPersistence
  const maintenancePersistence=scope==="unidade"?unitMaintenancePersistence:commonMaintenancePersistence

  function cacheManual(section:"sistemas"|"manutencao",next:Record<string,unknown>){
    const current=useDevelopmentStore.getState().developments[developmentId]
    const manuals=current.manuals??{}
    const manual=meta.manual
    updateDevelopment(developmentId,{manuals:{...manuals,[manual]:{...(manuals[manual] as object??{}),[section]:next}}})
  }
  function markEdited(section:ContentSection){
    const current=statusFor(validations,key,section)
    if(current==="rascunho")return
    setValidations(rows=>rows.map(row=>row.contextKey===key&&row.section===section?{...row,status:"rascunho",comment:null}:row))
    void markSystemItemEdited({developmentId,contextKey:key,section}).catch(()=>void loadValidations())
  }
  function updateContent(html:string){
    markEdited("sistemas")
    const next={...contents[scope],[key]:html}
    setContents(all=>({...all,[scope]:next}))
    cacheManual("sistemas",next)
  }
  function updateMaintenance(rows:MaintenanceItem[]){
    markEdited("manutencao")
    const next={...maintenance[scope],[key]:rows}
    setMaintenance(all=>({...all,[scope]:next}))
    cacheManual("manutencao",next)
  }
  const status=(section:ContentSection)=>validations.find(row=>row.contextKey===key&&row.section===section)?.status??"rascunho"
  const comment=(section:ContentSection)=>validations.find(row=>row.contextKey===key&&row.section===section)?.comment??null

  return <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
    <Card className="h-fit p-2">
      <div className="flex items-center gap-2 px-2 py-2 text-sm font-semibold"><FolderTree className="h-4 w-4 text-primary"/>Sistemas vinculados</div>
      {scopeOrder.map(groupScope=>{
        const list=entries.filter(entry=>entry.scope===groupScope),open=openScope[groupScope],Icon=scopeMeta[groupScope].icon
        return <div key={groupScope} className="mt-1">
          <button onClick={()=>setOpenScope(current=>({...current,[groupScope]:!current[groupScope]}))} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent"><ChevronDown className={cn("h-3.5 w-3.5 transition-transform",!open&&"-rotate-90")}/><Icon className="h-3.5 w-3.5"/><span className="flex-1">{scopeMeta[groupScope].label}</span><span>{list.length}</span></button>
          {open&&<ul className="ml-4 border-l border-border pl-3">{list.map(entry=>{
            const technical=statusFor(validations,entry.key,"sistemas"),maintenanceStatus=statusFor(validations,entry.key,"manutencao")
            const done=technical==="aprovado"&&maintenanceStatus==="aprovado"
            const pending=technical==="aguardando_validacao"||maintenanceStatus==="aguardando_validacao"
            const rejected=technical==="reprovado"||maintenanceStatus==="reprovado"
            return <li key={entry.key}><button onClick={()=>setActiveKey(entry.key)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm",activeKey===entry.key?"bg-primary/10 font-medium text-foreground":"text-muted-foreground hover:bg-accent hover:text-foreground")}><span className="min-w-0 flex-1 truncate">{entry.item.item}</span>{done?<CheckCircle2 className="h-4 w-4 text-success" aria-label="Validado"/>:pending?<Clock3 className="h-4 w-4 text-warning" aria-label="Aguardando validação"/>:rejected?<AlertCircle className="h-4 w-4 text-destructive" aria-label="Reprovado"/>:null}</button></li>
          })}</ul>}
        </div>
      })}
    </Card>

    <div className="min-w-0 space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-lg font-semibold">{item.item}</h3>{item.norms.length>0&&<div className="mt-2 flex flex-wrap gap-1.5">{item.norms.map(code=><Badge key={code} variant="outline" title={nbrNorms[code]} className="gap-1 border-primary/30 bg-primary/5"><BookMarked className="h-3 w-3 text-primary"/><span className="font-mono">{code}</span></Badge>)}</div>}</div>
          <ValidationActions developmentId={developmentId} contextKey={key} section="sistemas" label={item.item} role={role} status={status("sistemas")} comment={comment("sistemas")} onDone={loadValidations}/>
        </div>
        <div><p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Descrição técnica</p><RichTextEditor key={"content-"+key} value={contents[scope][key]??contents[scope][item.id]??""} onChange={updateContent} disabled={!canEdit}/><div className="mt-2 flex justify-end"><PersistenceStatus state={contentPersistence.state} savedAt={contentPersistence.savedAt} error={contentPersistence.error} onRetry={()=>void contentPersistence.persist()}/></div></div>
      </section>

      <section className="space-y-3 border-t border-border pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><Wrench className="h-4 w-4 text-primary"/>Manutenção preventiva</h3><ValidationActions developmentId={developmentId} contextKey={key} section="manutencao" label={item.item} role={role} status={status("manutencao")} comment={comment("manutencao")} onDone={loadValidations}/></div>
        <MaintenanceTable items={maintenance[scope][key]??(item.maintenance??[]).map(row=>({...row,responsible:scope==="unidade"?"Proprietário" as const:"Síndico" as const}))} disabled={!canEdit} defaultResponsible={scope==="unidade"?"Proprietário":"Síndico"} onChange={updateMaintenance}/>
        <div className="flex justify-end"><PersistenceStatus state={maintenancePersistence.state} savedAt={maintenancePersistence.savedAt} error={maintenancePersistence.error} onRetry={()=>void maintenancePersistence.persist()}/></div>
      </section>
      {validationError&&<p className="text-sm text-destructive">{validationError}</p>}
    </div>
  </div>
}

function statusFor(rows:ValidationRow[],contextKey:string,section:ContentSection):ContentValidationStatus{return rows.find(row=>row.contextKey===contextKey&&row.section===section)?.status??"rascunho"}

function ValidationActions({developmentId,contextKey,section,label,role,status,comment,onDone}:{developmentId:string;contextKey:string;section:ContentSection;label:string;role:"admin"|"editor"|"validator";status:ContentValidationStatus;comment:string|null;onDone:()=>Promise<void>}){
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const send=async()=>{setBusy(true);setError(null);try{await submitSystemItemForValidation({developmentId,contextKey,section,label});await onDone()}catch(e){setError(e instanceof Error?e.message:"Falha ao enviar")}finally{setBusy(false)}}
  const approve=async()=>{setBusy(true);setError(null);try{await validateSystemItem({developmentId,contextKey,section,label});await onDone()}catch(e){setError(e instanceof Error?e.message:"Falha ao validar")}finally{setBusy(false)}}
  const reject=async()=>{const reason=window.prompt("Motivo da reprovação");if(!reason?.trim())return;setBusy(true);setError(null);try{await rejectSystemItem({developmentId,contextKey,section,label,comment:reason});await onDone()}catch(e){setError(e instanceof Error?e.message:"Falha ao reprovar")}finally{setBusy(false)}}
  const canSend=role==="editor"||role==="admin"
  const canDecide=role==="validator"||role==="admin"
  return <div className="flex max-w-full flex-col items-end gap-1">
    <div className="flex flex-wrap items-center justify-end gap-2">
      {status==="aprovado"&&<Badge className="gap-1 bg-success/10 text-success"><Check className="h-3 w-3"/>Validado</Badge>}
      {status==="aguardando_validacao"&&<Badge variant="outline" className="gap-1 text-warning"><Clock3 className="h-3 w-3"/>Aguardando validação</Badge>}
      {status==="reprovado"&&<Badge variant="outline" className="gap-1 text-destructive"><X className="h-3 w-3"/>Reprovado</Badge>}
      {canSend&&status!=="aguardando_validacao"&&status!=="aprovado"&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void send()}><Send className="h-3.5 w-3.5"/>Mandar para validação</Button>}
      {canDecide&&status==="aguardando_validacao"&&<><Button size="sm" disabled={busy} onClick={()=>void approve()}><Check className="h-3.5 w-3.5"/>Validar</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>void reject()}><X className="h-3.5 w-3.5"/>Reprovar</Button></>}
    </div>
    {comment&&status==="reprovado"&&<span className="max-w-md text-right text-xs text-destructive">{comment}</span>}
    {error&&<span className="text-xs text-destructive">{error}</span>}
  </div>
}

function MaintenanceTable({items:rows,disabled,onChange,defaultResponsible}:{items:MaintenanceItem[];disabled?:boolean;onChange:(rows:MaintenanceItem[])=>void;defaultResponsible:MaintenanceItem["responsible"]}){
  const addRow=()=>onChange([...rows,{task:"",frequency:"",responsible:defaultResponsible}])
  const update=(index:number,patch:Partial<MaintenanceItem>)=>onChange(rows.map((row,i)=>i===index?{...row,...patch}:row))
  return <div>
    {!disabled&&<div className="mb-2 flex justify-end"><Button variant="ghost" size="sm" onClick={addRow}><Plus className="h-3.5 w-3.5"/>Linha</Button></div>}
    <div className="overflow-hidden rounded-md border border-border"><table className="w-full text-sm"><thead><tr className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="px-3 py-2 font-medium">Atividade</th><th className="w-32 px-3 py-2 font-medium">Frequência</th><th className="w-44 px-3 py-2 font-medium">Responsável</th></tr></thead><tbody>
      {rows.map((row,index)=><tr key={index} className="border-t border-border"><td className="p-0"><input value={row.task} disabled={disabled} onChange={e=>update(index,{task:e.target.value})} placeholder="Descrição da atividade" className="w-full bg-transparent px-3 py-2 outline-none focus:bg-primary/5 disabled:opacity-70"/></td><td className="p-0"><input value={row.frequency} disabled={disabled} onChange={e=>update(index,{frequency:e.target.value})} placeholder="Ex.: Anual" className="w-full bg-transparent px-3 py-2 outline-none focus:bg-primary/5 disabled:opacity-70"/></td><td className="px-3 py-1.5"><div className="flex gap-1">{(["Proprietário","Síndico"] as const).map(responsible=><button key={responsible} disabled={disabled} onClick={()=>update(index,{responsible})} className={cn("rounded px-2 py-1 text-xs",row.responsible===responsible?"bg-primary/15 text-primary":"text-muted-foreground hover:bg-accent")}>{responsible}</button>)}</div></td></tr>)}
      {!rows.length&&<tr><td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma atividade cadastrada.</td></tr>}
    </tbody></table></div>
  </div>
}
