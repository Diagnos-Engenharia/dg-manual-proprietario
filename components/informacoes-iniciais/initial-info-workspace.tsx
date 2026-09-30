"use client"

import { useState } from "react"
import { FileText, Palette, Droplets } from "lucide-react"
import { cn } from "@/lib/utils"
import { FichaTecnica } from "@/components/autoria/ficha-tecnica"
import { WhiteLabelStudio } from "@/components/white-label/white-label-studio"
import { Comissionamento } from "@/components/autoria/comissionamento"

type TabId="ficha"|"design"|"comissionamento"
const tabs=[
  {id:"ficha",label:"Ficha técnica",icon:FileText},
  {id:"design",label:"Design do Manual",icon:Palette},
  {id:"comissionamento",label:"Comissionamento",icon:Droplets},
] as const

export function InitialInfoWorkspace({
  developmentId,role,organizationName="",organizationLogo=null,organizationMetadata=null,persistedIdentity,initialTab="ficha"
}:{
  developmentId:string;role:"admin"|"editor"|"validator";organizationName?:string;organizationLogo?:string|null;organizationMetadata?:string|null;persistedIdentity?:unknown;initialTab?:TabId
}){
  const [active,setActive]=useState<TabId>(initialTab)
  const canEdit=role==="admin"||role==="editor"
  return <div className="space-y-5">
    <div className="flex flex-wrap justify-center gap-1 border-b border-border">
      {tabs.map(tab=>{const Icon=tab.icon;return <button key={tab.id} onClick={()=>setActive(tab.id)} className={cn("flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium",active===tab.id?"border-primary text-foreground":"border-transparent text-muted-foreground hover:text-foreground")}><Icon className="h-4 w-4"/>{tab.label}</button>})}
    </div>
    {active==="ficha"&&<FichaTecnica developmentId={developmentId} disabled={!canEdit}/>}
    {active==="design"&&<WhiteLabelStudio developmentId={developmentId} organizationName={organizationName} organizationLogo={organizationLogo} organizationMetadata={organizationMetadata} persistedIdentity={persistedIdentity}/>}
    {active==="comissionamento"&&<Comissionamento developmentId={developmentId} disabled={!canEdit}/>}
  </div>
}
