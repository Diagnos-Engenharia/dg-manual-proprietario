"use client"

import { useEffect,useMemo,useState } from "react"
import { History,RefreshCw } from "lucide-react"
import { listDevelopmentHistory } from "@/app/actions/developments"
import { checklistItems,checklistStatusLabels,scopeLabels } from "@/lib/mock-data"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type Entry=Awaited<ReturnType<typeof listDevelopmentHistory>>[number]
type Change={field:string;before:string;after:string}
type Group={
  key:string
  title:string
  module:string
  actor:string
  createdAt:string
  changes:Change[]
  validationAction:string|null
  validationContext:string|null
}

const moduleLabels:Record<string,string>={
  ficha:"Ficha técnica",checklist:"Checklist",schedule:"Cronograma",contacts:"Projetistas e Fornecedores",
  authoring:"Elaboração",manuals:"Sistemas Construtivos",sistemas:"Descrição técnica",manutencao:"Manutenção preventiva",
  acabamentos:"Tabela de Acabamentos",identity:"Design do Manual",validacao:"Validação",databook:"DATABOOK",emissao:"Emissão",
}
const fieldLabels:Record<string,string>={
  scopes:"Aplicação",status:"Status",scheduledDate:"Data programada",weight:"Peso",name:"Nome",ordem:"Ordem",
  sistemas:"Descrição técnica",manutencao:"Manutenção preventiva",comissionamento:"Comissionamento",
}
const checklistMap=new Map(checklistItems.map(item=>[item.id,item.item]))
const validationLabels:Record<string,string>={rascunho:"Rascunho",aguardando_validacao:"Aguardando validação",aprovado:"Aprovado",reprovado:"Reprovado"}

function cleanSegment(value:string){
  const base=value.split("::")[0]
  return checklistMap.get(base)??base.replace(/^ck-(?:system-)?/,"").replace(/-/g," ").replace(/\b\w/g,letter=>letter.toUpperCase())
}

function valueLabel(value:unknown):string{
  if(value===undefined||value===null||value==="")return "Não preenchido"
  if(Array.isArray(value)){
    if(value.every(item=>item==="unidade"||item==="comum"))return value.length?value.map(item=>scopeLabels[item as "unidade"|"comum"]).join(" + "):"Sem vínculo"
    return value.map(item=>typeof item==="string"?item:"Item").join(", ")
  }
  if(typeof value==="string"){
    if(value in validationLabels)return validationLabels[value]
    if(value in checklistStatusLabels)return checklistStatusLabels[value as keyof typeof checklistStatusLabels]
    const text=value.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()
    return text.length>120?text.slice(0,117)+"…":text||"Vazio"
  }
  if(typeof value==="number"||typeof value==="boolean")return String(value)
  return "Conteúdo atualizado"
}

function normalize(entry:Entry){
  const meta=(entry.metadata??{}) as Record<string,unknown>
  const path=Array.isArray(meta.path)?meta.path.map(String):[String(meta.module??entry.action)]
  const module=moduleLabels[path[0]]??cleanSegment(path[0])
  const explicitLabel=typeof meta.label==="string"?meta.label:null
  let item=explicitLabel

  if(!item){
    const candidate=path.find((part,index)=>index>0&&(checklistMap.has(part.split("::")[0])||part.includes("::")))
    item=candidate?cleanSegment(candidate):null
  }

  const last=path.at(-1)??entry.action
  const field=fieldLabels[last]??(last.includes("::")?"Conteúdo":cleanSegment(last))
  const validationAction=
    entry.action==="content.approved"?"Aprovado":
    entry.action==="content.rejected"?"Reprovado":
    entry.action==="content.sent_for_validation"?"Em validação":null

  const scope=path.find(part=>part.includes("::"))?.split("::").at(-1)
  const scopeLabel=scope==="unidade"||scope==="comum"?scopeLabels[scope]:null
  const section=path.find(part=>part==="sistemas"||part==="manutencao")
  const validationContext=[scopeLabel,section?moduleLabels[section]:null].filter(Boolean).join(" · ")||null
  const title=item?(module+" · "+item):module

  return {
    module,
    title,
    item:item??module,
    field:validationAction?"Status":field,
    before:valueLabel(meta.before),
    after:valueLabel(meta.after),
    comment:typeof meta.comment==="string"?meta.comment:null,
    validationAction,
    validationContext,
  }
}

export function DevelopmentHistory({developmentId}:{developmentId:string}){
  const [entries,setEntries]=useState<Entry[]>([])
  const [error,setError]=useState<string|null>(null)
  const [loading,setLoading]=useState(false)

  async function load(){
    setLoading(true);setError(null)
    try{setEntries(await listDevelopmentHistory(developmentId))}
    catch(e){setError(e instanceof Error?e.message:"Falha ao consultar o histórico")}
    finally{setLoading(false)}
  }

  useEffect(()=>{void load()},[developmentId])

  const groups=useMemo(()=>{
    const map=new Map<string,Group>()

    for(const entry of entries){
      const normalized=normalize(entry)
      const minute=new Date(entry.createdAt).toISOString().slice(0,16)
      const displayTitle=normalized.validationAction?normalized.item:normalized.title
      const key=[entry.actorName,normalized.validationAction??normalized.module,displayTitle,normalized.validationContext??"",minute].join("|")

      const changes:Change[]=[]
      if(normalized.validationAction!=="Em validação"){
        changes.push({field:normalized.field,before:normalized.before,after:normalized.after})
      }
      if(normalized.comment)changes.push({field:"Motivo",before:"—",after:normalized.comment})

      const existing=map.get(key)
      if(existing){
        for(const change of changes){
          const duplicate=existing.changes.some(current=>current.field===change.field&&current.before===change.before&&current.after===change.after)
          if(!duplicate)existing.changes.push(change)
        }
      }else{
        map.set(key,{
          key,
          title:displayTitle,
          module:normalized.module,
          actor:entry.actorName,
          createdAt:entry.createdAt,
          changes,
          validationAction:normalized.validationAction,
          validationContext:normalized.validationContext,
        })
      }
    }

    return [...map.values()]
  },[entries])

  return <Card className="p-5">
    <div className="mb-5 flex items-center justify-between">
      <h3 className="flex items-center gap-2 font-semibold"><History className="h-4 w-4 text-primary"/>Histórico</h3>
      <Button variant="outline" size="sm" onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?"h-4 w-4 animate-spin":"h-4 w-4"}/>Atualizar</Button>
    </div>

    {error&&<p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}

    <div className="space-y-3">
      {groups.map(group=><article key={group.key} className="rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {group.validationAction?
                <Badge variant="outline" className={cn(
                  group.validationAction==="Aprovado"&&"border-success/30 bg-success/10 text-success",
                  group.validationAction==="Reprovado"&&"border-destructive/30 bg-destructive/5 text-destructive",
                  group.validationAction==="Em validação"&&"border-warning/40 bg-warning/10 text-warning",
                )}>{group.validationAction}</Badge>
                :<Badge variant="outline">{group.module}</Badge>}
              <strong className="text-sm">{group.validationAction?group.title:group.title.replace(group.module+" · ","")}</strong>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{[group.validationContext,group.actor].filter(Boolean).join(" · ")}</p>
          </div>
          <time className="text-xs text-muted-foreground">{new Date(group.createdAt).toLocaleString("pt-BR")}</time>
        </div>

        {group.changes.length>0&&<div className="mt-3 space-y-2">
          {group.changes.map((change,index)=>change.field==="Motivo"?
            <div key={index} className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs">
              <span className="font-semibold text-destructive">Motivo da reprovação</span>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed text-foreground">{change.after}</p>
            </div>
            :<div key={index} className="grid gap-1 rounded-md bg-muted/30 px-3 py-2 text-xs sm:grid-cols-[120px_1fr_auto_1fr] sm:items-center">
              <span className="font-medium">{change.field}</span>
              <span className="truncate text-muted-foreground">{change.before}</span>
              <span className="hidden text-muted-foreground sm:inline">→</span>
              <span className="truncate">{change.after}</span>
            </div>)}
        </div>}
      </article>)}
    </div>

    {!loading&&!groups.length&&!error&&<p className="py-8 text-center text-sm text-muted-foreground">Nenhuma alteração registrada.</p>}
  </Card>
}
