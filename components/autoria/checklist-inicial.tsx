"use client"

import { useMemo,useState } from "react"
import { Building,ChevronDown,Home } from "lucide-react"
import {
  checklistStatusLabels,
  getChecklistItemScopes,
  type ChecklistItem,
  type ChecklistStatus,
  type ChecklistScope,
} from "@/lib/mock-data"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const statusOrder:ChecklistStatus[]=["possui","em_andamento","nao_aplicado","nao_especificado"]
const statusStyles:Record<ChecklistStatus,string>={
  possui:"bg-success/10 text-success border-success/30",
  em_andamento:"bg-warning/10 text-warning-foreground border-warning/30",
  nao_aplicado:"bg-muted text-muted-foreground border-border",
  nao_especificado:"bg-muted text-muted-foreground border-border",
}
const scopes:{id:ChecklistScope;label:string;icon:typeof Home}[]=[
  {id:"unidade",label:"Unidades privativas",icon:Home},
  {id:"comum",label:"Áreas comuns",icon:Building},
]

export function ChecklistInicial({items,onChangeStatus,onChangeScopes,disabled}:{items:ChecklistItem[];onChangeStatus:(id:string,status:ChecklistStatus)=>void;onChangeScopes?:(id:string,scopes:ChecklistScope[])=>void;disabled?:boolean}){
  const [openCategory,setOpenCategory]=useState<string|null>(null)
  const grouped=useMemo(()=>{
    const map=new Map<string,ChecklistItem[]>()
    for(const item of items){const list=map.get(item.category)??[];list.push(item);map.set(item.category,list)}
    return [...map.entries()]
  },[items])

  return <div className="flex flex-col gap-3">
    {grouped.map(([category,catItems])=>{
      const open=openCategory===category
      const completed=catItems.filter(item=>item.status==="possui").length
      return <Card key={category} className="overflow-hidden p-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={"checklist-category-"+category.replace(/[^a-zA-Z0-9]+/g,"-").toLowerCase()}
          title={open?"Recolher itens":"Exibir todos os itens"}
          onClick={()=>setOpenCategory(current=>current===category?null:category)}
          className={cn(
            "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
            open?"border-b border-border bg-muted/50":"bg-muted/30 hover:bg-muted/50"
          )}
        >
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",!open&&"-rotate-90")}/>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">{category}</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{completed} de {catItems.length} com status “Possui no empreendimento”</p>
          </div>
          <Badge variant="outline" className="shrink-0 font-mono text-[10px]">{catItems.length} itens</Badge>
        </button>

        {open&&<div id={"checklist-category-"+category.replace(/[^a-zA-Z0-9]+/g,"-").toLowerCase()} className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="px-4 py-2 font-medium">Sistema / Item</th><th className="w-72 px-3 py-2 font-medium">Aplicação</th><th className="w-44 px-3 py-2 font-medium">Status</th></tr></thead>
            <tbody>{catItems.map(item=>{
              const selected=getChecklistItemScopes(item)
              const toggle=(target:ChecklistScope)=>{
                if(!onChangeScopes||disabled)return
                const next=selected.includes(target)?selected.filter(value=>value!==target):[...selected,target]
                onChangeScopes(item.id,next)
              }
              return <tr key={item.id} className="border-b border-border last:border-0 align-top">
                <td className="px-4 py-3"><div className="flex flex-col gap-1"><span className="font-medium leading-tight">{item.item}</span>{item.norms.length>0&&<span className="mt-0.5 flex flex-wrap gap-1">{item.norms.map(norm=><Badge key={norm} variant="outline" className="border-primary/20 bg-primary/5 px-1.5 py-0 font-mono text-[10px] text-primary">{norm}</Badge>)}</span>}</div></td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-1.5">{scopes.map(scope=>{const Icon=scope.icon,active=selected.includes(scope.id);return <button key={scope.id} type="button" disabled={!onChangeScopes||disabled} aria-pressed={active} onClick={event=>{event.stopPropagation();toggle(scope.id)}} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",active?"border-primary/40 bg-primary/15 text-primary":"border-border bg-muted/40 text-muted-foreground hover:bg-muted",disabled&&"cursor-default opacity-70")}><Icon className="h-3 w-3"/>{scope.label}</button>})}</div></td>
                <td className="px-3 py-3"><div className="relative"><select value={item.status} disabled={disabled} onChange={event=>onChangeStatus(item.id,event.target.value as ChecklistStatus)} className={cn("w-full cursor-pointer appearance-none rounded-md border px-2.5 py-1.5 pr-7 text-xs font-medium outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-70",statusStyles[item.status])}>{statusOrder.map(status=><option key={status} value={status} className="bg-card text-foreground">{checklistStatusLabels[status]}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-70"/></div></td>
              </tr>
            })}</tbody>
          </table>
        </div>}
      </Card>
    })}
  </div>
}
