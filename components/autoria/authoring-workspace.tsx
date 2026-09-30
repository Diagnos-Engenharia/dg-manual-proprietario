"use client"

import { useMemo,useRef,useState } from "react"
import { useSearchParams } from "next/navigation"
import { Boxes,Contact,Droplets,FileText,History,ListChecks,Palette } from "lucide-react"
import { useDevelopmentStore } from "@/lib/store"
import { checklistItemMatchesScope,linkedSystemItems,type ChecklistItem,type ChecklistStatus,type ChecklistScope,type ManualType } from "@/lib/mock-data"
import { checklistProgress } from "@/lib/progress"
import { ManualSwitcher } from "@/components/autoria/manual-switcher"
import { ChecklistInicial } from "@/components/autoria/checklist-inicial"
import { ProjetistasFornecedores } from "@/components/autoria/projetistas-fornecedores"
import { SistemasConstrutivos } from "@/components/autoria/sistemas-construtivos"
import { FichaTecnica } from "@/components/autoria/ficha-tecnica"
import { Comissionamento } from "@/components/autoria/comissionamento"
import { TabelaAcabamentos } from "@/components/autoria/tabela-acabamentos"
import { DevelopmentHistory } from "@/components/autoria/development-history"
import { WhiteLabelStudio } from "@/components/white-label/white-label-studio"
import { Badge } from "@/components/ui/badge"
import { PersistenceStatus } from "@/hooks/use-persistence-status"
import { saveDevelopmentModulePath } from "@/app/actions/developments"
import { cn } from "@/lib/utils"
import type { ManualContent } from "@/lib/manual-content"

type SubTabId="ficha"|"design"|"checklist"|"sistemas"|"acabamentos"|"comissionamento"|"contatos"|"historico"
const subTabs=[
  {id:"ficha",label:"Ficha técnica",icon:FileText},
  {id:"design",label:"Design do Manual",icon:Palette},
  {id:"checklist",label:"Checklist Inicial",icon:ListChecks},
  {id:"sistemas",label:"Sistemas Construtivos",icon:Boxes},
  {id:"acabamentos",label:"Tabela de Acabamentos",icon:FileText},
  {id:"comissionamento",label:"Comissionamento",icon:Droplets},
  {id:"contatos",label:"Projetistas e Fornecedores",icon:Contact},
  {id:"historico",label:"Histórico",icon:History},
] as const

export function AuthoringWorkspace({
  role,developmentId,organizationName="",organizationLogo=null,organizationMetadata=null,persistedIdentity,initialTab
}:{
  role:"admin"|"editor"|"validator";developmentId:string;organizationName?:string;organizationLogo?:string|null;organizationMetadata?:string|null;persistedIdentity?:unknown;initialTab?:SubTabId
}){
  const development=useDevelopmentStore(state=>state.developments[developmentId])
  const updateChecklistItem=useDevelopmentStore(state=>state.updateChecklistItem)
  const searchParams=useSearchParams()
  const [manual,setManual]=useState<ManualType>(searchParams.get("manual")==="sindico"?"sindico":"proprietario")
  const [activeTab,setActiveTab]=useState<SubTabId>(initialTab??"ficha")
  const [checklistSaving,setChecklistSaving]=useState(false)
  const [checklistError,setChecklistError]=useState<string|null>(null)
  const queue=useRef(Promise.resolve())
  const canEdit=role==="admin"||role==="editor"
  const checklist=development?.checklist??[]
  const manualScope:ChecklistScope=manual==="proprietario"?"unidade":"comum"
  const scoped=useMemo(()=>checklist.filter(item=>checklistItemMatchesScope(item,manualScope)),[checklist,manualScope])
  const linked=useMemo(()=>linkedSystemItems(scoped),[scoped])
  const progress=useMemo(()=>checklistProgress(scoped),[scoped])
  const currentManual=development?.manuals?.[manual] as ManualContent|undefined

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
    if(!scopes.length)return
    const current=useDevelopmentStore.getState().developments[developmentId].checklist
    updateChecklistItem(developmentId,id,{scopes})
    persistChecklist(current.map(item=>item.id===id?{...item,scopes}:item))
  }

  return <div className="flex flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <ManualSwitcher value={manual} onChange={next=>{if(next==="sindico"&&activeTab==="acabamentos")setActiveTab("ficha");setManual(next)}}/>
      <div className="flex items-center gap-2"><Badge variant="outline">Checklist {progress}%</Badge><Badge variant="outline">{role==="admin"?"Administrador":role==="validator"?"Validador":"Editor"}</Badge></div>
    </div>

    <div className="flex flex-wrap gap-1 border-b border-border pb-px">
      {subTabs.filter(tab=>manual==="proprietario"||tab.id!=="acabamentos").map(tab=>{
        const Icon=tab.icon
        return <button key={tab.id} onClick={()=>setActiveTab(tab.id)} className={cn("flex items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors",activeTab===tab.id?"border-primary text-foreground":"border-transparent text-muted-foreground hover:text-foreground")}>
          <Icon className="h-4 w-4"/>{tab.label}{tab.id==="sistemas"&&<Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">{linked.length}</Badge>}
        </button>
      })}
    </div>

    <div className="flex min-w-0 flex-col gap-4">
      {!canEdit&&activeTab!=="historico"&&<p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">Somente leitura.</p>}
      {activeTab==="ficha"&&<FichaTecnica developmentId={developmentId} disabled={!canEdit}/>}
      {activeTab==="design"&&<WhiteLabelStudio developmentId={developmentId} organizationName={organizationName} organizationLogo={organizationLogo} organizationMetadata={organizationMetadata} persistedIdentity={persistedIdentity}/>}
      {activeTab==="checklist"&&<><ChecklistInicial items={checklist} scope={manualScope} onChangeStatus={setStatus} onChangeScopes={setScopes} disabled={!canEdit}/><PersistenceStatus state={checklistError?"error":checklistSaving?"saving":"clean"} savedAt={null} error={checklistError} onRetry={()=>persistChecklist(checklist)}/></>}
      {activeTab==="sistemas"&&<SistemasConstrutivos key={manual} items={linked} scope={manualScope} disabled={!canEdit} developmentId={developmentId} manual={manual} initialContents={currentManual?.sistemas} initialMaintenance={currentManual?.manutencao}/>}
      {activeTab==="acabamentos"&&manual==="proprietario"&&<TabelaAcabamentos developmentId={developmentId} disabled={!canEdit} role={role}/>}
      {activeTab==="comissionamento"&&<Comissionamento developmentId={developmentId} manual={manual} disabled={!canEdit}/>}
      {activeTab==="contatos"&&<ProjetistasFornecedores developmentId={developmentId} disabled={!canEdit}/>}
      {activeTab==="historico"&&<DevelopmentHistory developmentId={developmentId}/>}
    </div>
  </div>
}
