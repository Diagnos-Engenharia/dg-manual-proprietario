"use client"

import { useCallback,useEffect,useRef,useState } from "react"
import { usePathname,useRouter,useSearchParams } from "next/navigation"
import { useDevelopmentStore,type DevelopmentRecord } from "@/lib/store"
import { checklistItems as officialChecklistItems } from "@/lib/mock-data"
import { ClipboardList,CalendarClock,FileEdit,FileOutput,Briefcase } from "lucide-react"
import { cn } from "@/lib/utils"
import { InitialInfoWorkspace } from "@/components/informacoes-iniciais/initial-info-workspace"
import { ScheduleManager } from "@/components/cronograma/schedule-manager"
import { AuthoringWorkspace } from "@/components/autoria/authoring-workspace"
import { Databook } from "@/components/databook/databook"
import { PdfCompiler } from "@/components/emissao/pdf-compiler"
import { Button } from "@/components/ui/button"
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle } from "@/components/ui/dialog"

const modules=[
  {id:"informacoes",label:"Informações iniciais",icon:ClipboardList},
  {id:"cronograma",label:"Cronograma",icon:CalendarClock},
  {id:"elaboracao",label:"Elaboração",icon:FileEdit},
  {id:"databook",label:"DATABOOK",icon:Briefcase},
  {id:"emissao",label:"Emitir PDF",icon:FileOutput},
] as const
type ModuleId=(typeof modules)[number]["id"]
type WorkspaceDatabookFile={id:string;folder:string;name:string;pathname:string;contentType:string|null;sizeBytes:number;createdAt:string}

export function EmpreendimentoWorkspace({role,developmentId,organizationName="",organizationLogo=null,organizationMetadata=null,developmentSnapshot,persistedData,databookFiles}:{role:"admin"|"editor"|"validator";developmentId:string;organizationName?:string;organizationLogo?:string|null;organizationMetadata?:string|null;developmentSnapshot:Omit<DevelopmentRecord,"checklist">&{checklist?:unknown[]};persistedData?:Record<string,unknown>|null;databookFiles?:WorkspaceDatabookFile[]}){
  const router=useRouter(),pathname=usePathname(),searchParams=useSearchParams()
  const raw=searchParams.get("modulo")
  const requested:ModuleId|null=raw==="identidade"?"informacoes":modules.some(m=>m.id===raw)?raw as ModuleId:null
  const [active,setActive]=useState<ModuleId>(requested??"informacoes")
  const [finishingDirty,setFinishingDirty]=useState(false)
  const [pendingModule,setPendingModule]=useState<ModuleId|null>(null)
  const discardFinishing=useRef<(()=>void)|null>(null)
  const finishingChanged=useCallback((dirty:boolean,discard?:()=>void)=>{setFinishingDirty(dirty);if(discard)discardFinishing.current=discard},[])
  useEffect(()=>{if(requested)setActive(requested)},[requested])
  const navigateModule=(module:ModuleId)=>{setActive(module);const params=new URLSearchParams(searchParams.toString());params.set("modulo",module);router.replace(pathname+"?"+params.toString(),{scroll:false})}
  const selectModule=(module:ModuleId)=>{if(finishingDirty&&module!==active){setPendingModule(module);return}navigateModule(module)}
  const hydrateDevelopment=useDevelopmentStore(s=>s.hydrateDevelopment)
  useEffect(()=>{
    const record=persistedData as {ficha?:unknown;schedule?:unknown;authoring?:unknown;identity?:unknown;brand?:unknown;manuals?:unknown;checklist?:unknown[]}|null
    const persistedChecklist=Array.isArray(record?.checklist)&&record.checklist.length>0?record.checklist:officialChecklistItems
    hydrateDevelopment({...developmentSnapshot,checklist:persistedChecklist as DevelopmentRecord["checklist"],...(record?.ficha?{ficha:record.ficha as DevelopmentRecord["ficha"]}:{}),...(record?.schedule?{schedule:record.schedule as DevelopmentRecord["schedule"]}:{}),...(record?.authoring&&typeof record.authoring==="object"?{authoring:record.authoring as Record<string,unknown>}:{}),...(record?.manuals&&typeof record.manuals==="object"?{manuals:record.manuals as Record<string,unknown>}:{}),...(record?.identity&&typeof record.identity==="object"?{identity:record.identity as Record<string,unknown>}:{}),...(record?.brand&&typeof record.brand==="object"?{identity:record.brand as Record<string,unknown>}:{})})
  },[developmentSnapshot,hydrateDevelopment,persistedData])
  const markHydrated=useDevelopmentStore(s=>s.markHydrated);useEffect(()=>{markHydrated()},[markHydrated])
  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">{modules.map(mod=>{const Icon=mod.icon,isActive=active===mod.id;return <button key={mod.id} onClick={()=>selectModule(mod.id)} className={cn("inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium",isActive?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-secondary hover:text-secondary-foreground")}><Icon className="h-4 w-4"/><span className="hidden sm:inline">{mod.label}</span></button>})}</div>
    <div>
      {active==="informacoes"&&<InitialInfoWorkspace developmentId={developmentId} role={role} organizationName={organizationName} organizationLogo={organizationLogo} organizationMetadata={organizationMetadata} persistedIdentity={(persistedData as {identity?:unknown}|null)?.identity} initialTab={raw==="identidade"?"design":"ficha"}/>}
      {active==="cronograma"&&<ScheduleManager developmentId={developmentId}/>}
      {active==="elaboracao"&&<AuthoringWorkspace role={role} developmentId={developmentId} onUnsavedChange={finishingChanged}/>}
      {active==="databook"&&<Databook developmentId={developmentId} persistedFiles={databookFiles}/>}
      {active==="emissao"&&<PdfCompiler developmentId={developmentId} role={role}/>}
    </div>
    <Dialog open={pendingModule!==null} onOpenChange={open=>{if(!open)setPendingModule(null)}}><DialogContent><DialogHeader><DialogTitle>Descartar alterações?</DialogTitle><DialogDescription>Salve as alterações nas tabelas de acabamento antes de sair, ou descarte os rascunhos para continuar.</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setPendingModule(null)}>Continuar editando</Button><Button variant="destructive" onClick={()=>{if(!pendingModule)return;const next=pendingModule;setPendingModule(null);discardFinishing.current?.();setFinishingDirty(false);navigateModule(next)}}>Descartar e sair</Button></div></DialogContent></Dialog>
  </div>
}
