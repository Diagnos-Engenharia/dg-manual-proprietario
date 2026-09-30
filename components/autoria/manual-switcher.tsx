"use client"
import { Home,Building } from "lucide-react"
import { manualLabels,type ManualType } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
const options:{id:ManualType;icon:typeof Home}[]=[{id:"proprietario",icon:Home},{id:"sindico",icon:Building}]
export function ManualSwitcher({value,onChange}:{value:ManualType;onChange:(m:ManualType)=>void}){
  return <div className="grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Tipo de manual">{options.map(opt=>{const Icon=opt.icon,isActive=value===opt.id;return <button key={opt.id} type="button" role="tab" aria-selected={isActive} onClick={()=>onChange(opt.id)} className={cn("flex items-center gap-2 rounded-lg border px-4 py-3 text-left transition-colors",isActive?"border-primary bg-primary/10 ring-1 ring-primary":"border-border bg-card hover:border-primary/40")}><Icon className={cn("h-4 w-4",isActive?"text-primary":"text-muted-foreground")}/><span className="text-sm font-semibold">{manualLabels[opt.id].title}</span></button>})}</div>
}
