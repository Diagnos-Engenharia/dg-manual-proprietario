"use client"

import { useEffect, useState } from "react"
import { History, RefreshCw } from "lucide-react"
import { listDevelopmentHistory } from "@/app/actions/developments"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

type Entry = Awaited<ReturnType<typeof listDevelopmentHistory>>[number]
const labels:Record<string,string>={ ficha:"Ficha técnica",checklist:"Checklist Inicial",schedule:"Cronograma",contacts:"Projetistas e Fornecedores",authoring:"Elaboração",manuals:"Manuais",sistemas:"Sistemas Construtivos",manutencao:"Manutenção",acabamentos:"Acabamentos",identity:"Design do Manual" }
const describe=(v:unknown)=>{
  if(v===undefined||v===null)return "Não preenchido"
  if(typeof v==="string")return v.replace(/<[^>]*>/g," ").trim().slice(0,600)||"Vazio"
  const json=JSON.stringify(v)
  return json.length>600?json.slice(0,600)+"…":json
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
  return <Card className="p-5">
    <div className="mb-4 flex items-center justify-between">
      <div><h4 className="flex items-center gap-2 font-semibold"><History className="h-4 w-4 text-primary"/>Histórico de alterações</h4><p className="mt-1 text-xs text-muted-foreground">Registros persistentes do empreendimento, sem opção de exclusão.</p></div>
      <Button variant="outline" size="sm" onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?"h-4 w-4 animate-spin":"h-4 w-4"}/>Atualizar</Button>
    </div>
    {error&&<p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
    <ol className="space-y-3">{entries.map(entry=>{
      const meta=(entry.metadata??{}) as Record<string,unknown>
      const path=Array.isArray(meta.path)?meta.path.join(" / "):String(meta.module??entry.action)
      return <li key={entry.id} className="rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{path.split(" / ").map(p=>labels[p]??p).join(" / ")}</strong><time className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString("pt-BR")}</time></div>
        <p className="mt-1 text-xs text-muted-foreground">{entry.actorName} ({entry.actorEmail})</p>
        {"before" in meta&&<p className="mt-2 break-words text-xs"><span className="text-muted-foreground">Anterior: </span>{describe(meta.before)}</p>}
        {"after" in meta&&<p className="mt-1 break-words text-xs"><span className="text-muted-foreground">Novo: </span>{describe(meta.after)}</p>}
      </li>
    })}</ol>
    {!loading&&!entries.length&&!error&&<p className="py-6 text-center text-sm text-muted-foreground">Nenhuma alteração registrada.</p>}
  </Card>
}
