"use client"

import { useEffect,useMemo,useRef,useState } from "react"
import { usePathname,useRouter,useSearchParams } from "next/navigation"
import { Boxes,Contact,Droplets,FileText,History,ListChecks } from "lucide-react"
import { useDevelopmentStore } from "@/lib/store"
import { linkedSystemItems,type ChecklistItem,type ChecklistStatus,type ChecklistScope } from "@/lib/mock-data"
import { checklistProgress } from "@/lib/progress"
import { ChecklistInicial } from "@/components/autoria/checklist-inicial"
import { ProjetistasFornecedores } from "@/components/autoria/projetistas-fornecedores"
import { SistemasConstrutivos } from "@/components/autoria/sistemas-construtivos"
import { Comissionamento } from "@/components/autoria/comissionamento"
import { TabelaAcabamentos } from "@/components/autoria/tabela-acabamentos"
import { DevelopmentHistory } from "@/components/autoria/development-history"
import { TextosManual } from "@/components/autoria/textos-manual"
import { Badge } from "@/components/ui/badge"
import { PersistenceStatus } from "@/hooks/use-persistence-status"
import { saveDevelopmentModulePath } from "@/app/actions/developments"
import { cn } from "@/lib/utils"
import type { ManualContent } from "@/lib/manual-content"

type SubTabId="checklist"|"textos"|"sistemas"|"comissionamento"|"acabamentos"|"contatos"|"historico"
const subTabs=[
  {id:"checklist",label:"Checklist Inicial",icon:ListChecks},
  {id:"textos",label:"Textos do manual",icon:FileText},
  {id:"sistemas",label:"Sistemas Construtivos",icon:Boxes},
  {id:"comissionamento",label:"Comissionamento",icon:Droplets},
  {id:"acabamentos",label:"Tabela de Acabamentos",icon:FileText},
  {id:"contatos",label:"Projetistas e Fornecedores",icon:Contact},
  {id:"historico",label:"Histórico",icon:History},
] as const

export function AuthoringWorkspace({role,developmentId}:{role:"admin"|"editor"|"validator";developmentId:string}){
  const router=useRouter(),pathname=usePathname(),searchParams=useSearchParams()
  const requestedTab=searchParams.get("aba")
  const requested=subTabs.some(tab=>tab.id===requestedTab)?requestedTab as SubTabId:null
  const development=useDevelopmentStore(state=>state.developments[developmentId])
  const updateChecklistItem=useDevelopmentStore(state=>state.updateChecklistItem)
  const [activeTab,setActiveTab]=useState<SubTabId>(requested??"checklist")
  const [checklistSaving,setChecklistSaving]=useState(false)
  const [checklistError,setChecklistError]=useState<string|null>(null)
  const queue=useRef(Promise.resolve())
  const canEdit=role==="admin"||role==="editor"
  const checklist=development?.checklist??[]
  const linked=useMemo(()=>linkedSystemItems(checklist),[checklist])
  const progress=useMemo(()=>checklistProgress(checklist),[checklist])
  const manuals=(development?.manuals??{}) as Record<string,ManualContent>

  useEffect(()=>{setActiveTab(requested??"checklist")},[requested])
  function selectTab(tab:SubTabId){
    setActiveTab(tab)
    const params=new URLSearchParams(searchParams.toString())
    params.set("modulo","elaboracao")
    params.set("aba",tab)
    router.replace(pathname+"?"+params.toString(),{scroll:false})
  }

  function persistChecklist(next:ChecklistItem[]){
    setChecklistSaving(true);setChecklistError(null)
    queue.current=queue.current.catch(()=>{}).then(async()=>{await saveDevelopmentModulePath(developmentId,["checklist"],next)})
      .catch(error=>setChecklistError(error instanceof Error?error.message:"Erro ao salvar checklist"))
      .finally(()=>setChecklistSaving(false))
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
      {subTabs.map(tab=>{const Icon=tab.icon;return <button key={tab.id} onClick={()=>selectTab(tab.id)} className={cn("flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium",activeTab===tab.id?"border-primary text-foreground":"border-transparent text-muted-foreground hover:text-foreground")}><Icon className="h-4 w-4"/>{tab.label}{tab.id==="sistemas"&&<Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">{linked.length}</Badge>}</button>})}
    </div>
    <div className="flex min-w-0 flex-col gap-4">
      {!canEdit&&activeTab!=="historico"&&activeTab!=="sistemas"&&activeTab!=="textos"&&<p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">Somente leitura.</p>}
      {activeTab==="checklist"&&<><ChecklistInicial items={checklist} onChangeStatus={setStatus} onChangeScopes={setScopes} disabled={!canEdit}/><PersistenceStatus state={checklistError?"error":checklistSaving?"saving":"clean"} savedAt={null} error={checklistError} onRetry={()=>persistChecklist(checklist)}/></>}
      {activeTab==="textos"&&<TextosManual key={developmentId} developmentId={developmentId}/>}
      {activeTab==="sistemas"&&<SistemasConstrutivos items={linked} developmentId={developmentId} role={role} initialContents={{unidade:manuals.proprietario?.sistemas??{},comum:manuals.sindico?.sistemas??{}}} initialMaintenance={{unidade:manuals.proprietario?.manutencao??{},comum:manuals.sindico?.manutencao??{}}}/>}
      {activeTab==="comissionamento"&&<Comissionamento developmentId={developmentId} disabled={!canEdit}/>} 
      {activeTab==="acabamentos"&&<TabelaAcabamentos developmentId={developmentId} disabled={!canEdit} role={role}/>}
      {activeTab==="contatos"&&<ProjetistasFornecedores developmentId={developmentId} disabled={!canEdit}/>}
      {activeTab==="historico"&&<DevelopmentHistory developmentId={developmentId}/>}
    </div>
  </div>
}
