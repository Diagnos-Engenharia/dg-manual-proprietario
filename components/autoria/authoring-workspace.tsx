"use client"

import { useEffect,useMemo,useRef,useState } from "react"
import { usePathname,useRouter,useSearchParams } from "next/navigation"
import { Contact,Droplets,FileText,History,ListChecks } from "lucide-react"
import { useDevelopmentStore } from "@/lib/store"
import { type ChecklistItem,type ChecklistStatus,type ChecklistScope } from "@/lib/mock-data"
import { checklistProgress } from "@/lib/progress"
import { ChecklistInicial } from "@/components/autoria/checklist-inicial"
import { ProjetistasFornecedores } from "@/components/autoria/projetistas-fornecedores"
import { Comissionamento } from "@/components/autoria/comissionamento"
import { TabelaAcabamentos } from "@/components/autoria/tabela-acabamentos"
import { DevelopmentHistory } from "@/components/autoria/development-history"
import { TextosManual } from "@/components/autoria/textos-manual"
import { Badge } from "@/components/ui/badge"
import { PersistenceStatus } from "@/hooks/use-persistence-status"
import { saveDevelopmentModulePath } from "@/app/actions/developments"
import { cn } from "@/lib/utils"

type SubTabId="checklist"|"textos"|"comissionamento"|"acabamentos"|"contatos"|"historico"
const subTabs=[
  {id:"checklist",label:"Checklist Inicial",icon:ListChecks},
  {id:"textos",label:"Textos técnicos",icon:FileText},
  {id:"comissionamento",label:"Comissionamento",icon:Droplets},
  {id:"acabamentos",label:"Tabela de Acabamentos",icon:FileText},
  {id:"contatos",label:"Projetistas e Fornecedores",icon:Contact},
  {id:"historico",label:"Histórico",icon:History},
] as const

export function AuthoringWorkspace({role,developmentId}:{role:"admin"|"editor"|"validator";developmentId:string}){
  const router=useRouter(),pathname=usePathname(),searchParams=useSearchParams()
  const requestedTab=searchParams.get("aba")
  const requested=requestedTab==="sistemas"?"textos":subTabs.some(tab=>tab.id===requestedTab)?requestedTab as SubTabId:null
  const development=useDevelopmentStore(state=>state.developments[developmentId])
  const updateChecklistItem=useDevelopmentStore(state=>state.updateChecklistItem)
  const [activeTab,setActiveTab]=useState<SubTabId>(requested??"checklist")
  const [checklistSaving,setChecklistSaving]=useState(false)
  const [checklistError,setChecklistError]=useState<string|null>(null)
  const queue=useRef(Promise.resolve())
  const checklistWriteSequence=useRef(0)
  const canEdit=role==="admin"||role==="editor"
  const checklist=development?.checklist??[]
  const progress=useMemo(()=>checklistProgress(checklist),[checklist])

  useEffect(()=>{setActiveTab(requested??"checklist")},[requested])
  useEffect(()=>{
    if(requestedTab!=="sistemas")return
    const params=new URLSearchParams(searchParams.toString())
    params.set("aba","textos")
    if(!params.has("item")&&!params.has("secao"))params.set("secao","sistemas")
    router.replace(pathname+"?"+params.toString(),{scroll:false})
  },[requestedTab,searchParams,pathname,router])
  function selectTab(tab:SubTabId){
    if(tab==="textos"&&(checklistSaving||checklistError))return
    setActiveTab(tab)
    const params=new URLSearchParams(searchParams.toString())
    params.set("modulo","elaboracao")
    params.set("aba",tab)
    router.replace(pathname+"?"+params.toString(),{scroll:false})
  }

  function persistChecklist(next:ChecklistItem[]){
    const sequence=++checklistWriteSequence.current
    setChecklistSaving(true);setChecklistError(null)
    queue.current=queue.current.catch(()=>{}).then(async()=>{await saveDevelopmentModulePath(developmentId,["checklist"],next)})
      .catch(error=>{if(sequence===checklistWriteSequence.current)setChecklistError(error instanceof Error?error.message:"Erro ao salvar checklist")})
      .finally(()=>{if(sequence===checklistWriteSequence.current)setChecklistSaving(false)})
  }
  function setStatus(id:string,status:ChecklistStatus){
    const current=useDevelopmentStore.getState().developments[developmentId].checklist
    updateChecklistItem(developmentId,id,{status})
    persistChecklist(current.map(item=>item.id===id?{...item,status}:item))
  }
  function setScopes(id:string,scopes:ChecklistScope[]){
    const current=useDevelopmentStore.getState().developments[developmentId].checklist
    updateChecklistItem(developmentId,id,{scopes})
    persistChecklist(current.map(item=>item.id===id?{...item,scopes}:item))
  }

  return <div className="flex flex-col gap-5">
    <div className="flex justify-end"><Badge variant="outline">Checklist {progress}%</Badge></div>
    <div className="flex flex-wrap justify-center gap-1 border-b border-border pb-px">
      {subTabs.map(tab=>{const Icon=tab.icon;return <button key={tab.id} onClick={()=>selectTab(tab.id)} disabled={tab.id==="textos"&&(checklistSaving||Boolean(checklistError))} title={tab.id==="textos"?(checklistSaving?"Aguarde o salvamento do checklist":checklistError?"Tente salvar o checklist novamente para atualizar os sistemas":undefined):undefined} className={cn("flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60",activeTab===tab.id?"border-primary text-foreground":"border-transparent text-muted-foreground hover:text-foreground")}><Icon className="h-4 w-4"/>{tab.label}</button>})}
    </div>
    <div className="flex min-w-0 flex-col gap-4">
      {!canEdit&&activeTab!=="historico"&&activeTab!=="textos"&&<p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">Somente leitura.</p>}
      {activeTab!=="checklist"&&(checklistSaving||checklistError)&&<PersistenceStatus state={checklistError?"error":"saving"} savedAt={null} error={checklistError} onRetry={()=>persistChecklist(checklist)}/>}
      {activeTab==="checklist"&&<><ChecklistInicial items={checklist} onChangeStatus={setStatus} onChangeScopes={setScopes} disabled={!canEdit}/><PersistenceStatus state={checklistError?"error":checklistSaving?"saving":"clean"} savedAt={null} error={checklistError} onRetry={()=>persistChecklist(checklist)}/></>}
      {activeTab==="textos"&&<TextosManual key={developmentId} developmentId={developmentId}/>}
      {activeTab==="comissionamento"&&<Comissionamento developmentId={developmentId} disabled={!canEdit}/>} 
      {activeTab==="acabamentos"&&<TabelaAcabamentos developmentId={developmentId} disabled={!canEdit} role={role}/>}
      {activeTab==="contatos"&&<ProjetistasFornecedores developmentId={developmentId} disabled={!canEdit}/>}
      {activeTab==="historico"&&<DevelopmentHistory developmentId={developmentId}/>}
    </div>
  </div>
}
