"use client"

import { useEffect,useMemo,useState } from "react"
import { AlertTriangle,CheckCircle2,FileSpreadsheet,Plus,RotateCcw,Save,Search,Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { getFinishingTable,saveFinishingTable,type FinishingGroup,type FinishingRow,type FinishingTableData } from "@/app/actions/developments"

type Props={developmentId:string;disabled?:boolean;role:"admin"|"editor"|"validator"}
type GroupConfig={id:FinishingGroup;label:string;description:string;columns:string[];required:string[]}
type Meta={tower:string;unitModel:string;area:string}

const groups:GroupConfig[]=[
  {id:"ambientes",label:"Ambientes",description:"Acabamentos gerais por ambiente da unidade.",columns:["ambiente","pisoRodapeBancada","parede","teto"],required:["ambiente"]},
  {id:"materiais",label:"Materiais",description:"Especificação de materiais, marcas, linhas e referências.",columns:["material","aplicacao","ambiente","marca","linha","referencia","formato","cor","observacoes"],required:["material","aplicacao","ambiente"]},
  {id:"hidraulicas",label:"Instalações hidráulicas",description:"Louças, cubas, metais e componentes hidráulicos aparentes.",columns:["ambiente","loucaCuba","metais","fabricante","modelo","referencia","observacoes"],required:["ambiente","loucaCuba"]},
  {id:"esquadrias",label:"Esquadrias e ferragens",description:"Portas, janelas, esquadrias, ferragens e vidros.",columns:["ambiente","portas","janelas","esquadrias","ferragens","vidros","fabricante","modelo","observacoes"],required:["ambiente"]},
  {id:"eletricas",label:"Instalações elétricas",description:"Acabamentos de interruptores, tomadas, placas e linhas.",columns:["ambiente","acabamentoEletrico","interruptores","tomadas","placas","fabricante","linha","cor","observacoes"],required:["ambiente","acabamentoEletrico"]},
]

const labels:Record<string,string>={
  ambiente:"Ambiente",pisoRodapeBancada:"Piso, rodapé e bancada",parede:"Parede",teto:"Teto",material:"Material",aplicacao:"Aplicação",
  loucaCuba:"Louça ou cuba em aço inox",metais:"Metais",fabricante:"Fabricante",modelo:"Modelo",referencia:"Referência",observacoes:"Observações",
  portas:"Portas",janelas:"Janelas",esquadrias:"Esquadrias",ferragens:"Ferragens",vidros:"Vidros",acabamentoEletrico:"Acabamento elétrico",
  interruptores:"Interruptores",tomadas:"Tomadas",placas:"Placas",linha:"Linha",formato:"Formato",cor:"Cor",marca:"Marca",
}

const emptyData=():FinishingTableData=>({ambientes:[],materiais:[],hidraulicas:[],esquadrias:[],eletricas:[]})
const emptyRow=(group:GroupConfig):FinishingRow=>Object.fromEntries([["id",crypto.randomUUID()],...group.columns.map(column=>[column,""])]) as FinishingRow
const defaultMeta:Meta={tower:"Torre 1",unitModel:"Unidade modelo",area:""}

export function TabelaAcabamentos({developmentId,disabled=false,role}:Props){
  const [typology,setTypology]=useState("Tipo A")
  const [tableId,setTableId]=useState<string|null>(null)
  const [tower,setTower]=useState(defaultMeta.tower)
  const [unitModel,setUnitModel]=useState(defaultMeta.unitModel)
  const [area,setArea]=useState(defaultMeta.area)
  const [data,setData]=useState<FinishingTableData>(emptyData)
  const [activeGroup,setActiveGroup]=useState<FinishingGroup>("ambientes")
  const [query,setQuery]=useState("")
  const [revision,setRevision]=useState(0)
  const [savedData,setSavedData]=useState<FinishingTableData>(emptyData)
  const [savedMeta,setSavedMeta]=useState<Meta>(defaultMeta)
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [message,setMessage]=useState("Novo cadastro")
  const [error,setError]=useState<string|null>(null)

  useEffect(()=>{
    let alive=true
    setLoading(true);setError(null)
    void getFinishingTable(developmentId,typology).then(table=>{
      if(!alive)return
      const nextData=(table?.data as FinishingTableData|undefined)??emptyData()
      const nextMeta={tower:table?.tower??defaultMeta.tower,unitModel:table?.unitModel??defaultMeta.unitModel,area:table?.area??defaultMeta.area}
      setTableId(table?.id??null)
      setData(nextData);setSavedData(nextData)
      setTower(nextMeta.tower);setUnitModel(nextMeta.unitModel);setArea(nextMeta.area);setSavedMeta(nextMeta)
      setRevision(table?.revision??0)
      setMessage(table?"Salvo às "+new Date(table.updatedAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}):"Novo cadastro")
      setLoading(false)
    }).catch(cause=>{if(alive){setError(cause instanceof Error?cause.message:"Não foi possível carregar a tabela");setLoading(false)}})
    return()=>{alive=false}
  },[developmentId,typology])

  const config=groups.find(group=>group.id===activeGroup)!
  const rows=useMemo(()=>data[activeGroup].filter(row=>!query||Object.values(row).some(value=>value.toLowerCase().includes(query.toLowerCase()))),[activeGroup,data,query])
  const isDirty=useMemo(()=>JSON.stringify(data)!==JSON.stringify(savedData)||tower!==savedMeta.tower||unitModel!==savedMeta.unitModel||area!==savedMeta.area,[data,savedData,tower,unitModel,area,savedMeta])
  const totalRows=useMemo(()=>Object.values(data).reduce((sum,items)=>sum+items.length,0),[data])
  const canEdit=!disabled&&(role==="editor"||role==="admin")

  function incompleteFor(group:GroupConfig){
    return data[group.id].filter(row=>group.required.some(field=>!row[field]?.trim())).length
  }
  const totalIncomplete=groups.reduce((sum,group)=>sum+incompleteFor(group),0)

  function updateRow(id:string,field:string,value:string){
    setData(current=>({...current,[activeGroup]:current[activeGroup].map(row=>row.id===id?{...row,[field]:value}:row)}))
  }
  function addRow(){
    setData(current=>({...current,[activeGroup]:[...current[activeGroup],emptyRow(config)]}))
  }
  function removeRow(id:string){
    if(window.confirm("Excluir este registro da tabela?"))setData(current=>({...current,[activeGroup]:current[activeGroup].filter(row=>row.id!==id)}))
  }
  function undo(){
    setData(savedData);setTower(savedMeta.tower);setUnitModel(savedMeta.unitModel);setArea(savedMeta.area);setError(null)
  }
  function changeTypology(value:string){
    if(value===typology)return
    if(isDirty&&!window.confirm("Existem alterações não salvas nesta tipologia. Deseja descartá-las e continuar?"))return
    setTypology(value)
    setQuery("")
    setActiveGroup("ambientes")
  }
  async function save(){
    setSaving(true);setError(null);setMessage("Salvando…")
    try{
      const result=await saveFinishingTable({id:tableId??undefined,developmentId,tower,typology,unitModel,area,data,expectedRevision:revision||undefined})
      const meta={tower,unitModel,area}
      setTableId(result.id);setRevision(result.revision);setSavedData(data);setSavedMeta(meta)
      setMessage("Salvo às "+new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}))
    }catch(cause){setError(cause instanceof Error?cause.message:"Erro ao salvar");setMessage("Erro ao salvar")}
    finally{setSaving(false)}
  }

  return <div className="flex flex-col gap-4">
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary"/><h3 className="text-lg font-semibold">Tabela de Acabamentos</h3></div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Organize os acabamentos por tipologia e por sistema. Os dados cadastrados aqui serão utilizados no Manual do Proprietário.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={error?"destructive":"outline"} className={cn(isDirty&&!error&&"border-amber-500/40 text-amber-600")}>{error?"Erro ao salvar":isDirty?"Alterações não salvas":message}</Badge>
          <Button variant="outline" size="sm" disabled={!canEdit||loading||!isDirty} onClick={undo}><RotateCcw className="h-4 w-4"/>Desfazer</Button>
          <Button size="sm" disabled={!canEdit||saving||loading||!isDirty} onClick={()=>void save()}><Save className="h-4 w-4"/>{saving?"Salvando…":"Salvar alterações"}</Button>
        </div>
      </div>

      <div className="border-t border-border bg-muted/15 p-5">
        <div className="mb-3"><h4 className="text-sm font-semibold">Unidade de referência</h4><p className="text-xs text-muted-foreground">Selecione a tipologia e identifique a unidade à qual a tabela se aplica.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1.5 text-xs font-medium"><span>Tipologia</span><Select value={typology} onValueChange={value=>{if(value)changeTypology(value)}} disabled={!canEdit||loading}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Tipo A">Tipo A</SelectItem><SelectItem value="Tipo B">Tipo B</SelectItem><SelectItem value="Tipo C">Tipo C</SelectItem></SelectContent></Select></label>
          <label className="space-y-1.5 text-xs font-medium"><span>Torre ou bloco</span><Input value={tower} onChange={event=>setTower(event.target.value)} disabled={!canEdit} placeholder="Ex.: Torre 1"/></label>
          <label className="space-y-1.5 text-xs font-medium"><span>Modelo da unidade</span><Input value={unitModel} onChange={event=>setUnitModel(event.target.value)} disabled={!canEdit} placeholder="Ex.: Apartamento padrão"/></label>
          <label className="space-y-1.5 text-xs font-medium"><span>Área da unidade</span><Input value={area} onChange={event=>setArea(event.target.value)} disabled={!canEdit} placeholder="Ex.: 68,40 m²"/></label>
        </div>
      </div>
    </Card>

    <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
      <Card className="h-fit overflow-hidden p-2">
        <div className="px-2 py-2"><h4 className="text-sm font-semibold">Seções da tabela</h4><p className="mt-0.5 text-xs text-muted-foreground">{totalRows} registros no total</p></div>
        <div className="space-y-1">
          {groups.map(group=>{
            const count=data[group.id].length
            const incomplete=incompleteFor(group)
            return <button key={group.id} type="button" onClick={()=>{setActiveGroup(group.id);setQuery("")}} className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors",activeGroup===group.id?"bg-primary/10 text-foreground":"text-muted-foreground hover:bg-accent hover:text-foreground")}>
              <span className="min-w-0 flex-1">{group.label}</span>
              {incomplete>0&&<span title="Registros incompletos" className="flex items-center gap-1 text-[11px] text-amber-600"><AlertTriangle className="h-3 w-3"/>{incomplete}</span>}
              <Badge variant="outline" className="min-w-7 justify-center px-1.5">{count}</Badge>
            </button>
          })}
        </div>
        <div className="mt-2 border-t border-border px-2 py-3 text-xs text-muted-foreground">
          {totalIncomplete>0?<span className="flex items-center gap-1.5 text-amber-600"><AlertTriangle className="h-3.5 w-3.5"/>{totalIncomplete} registro(s) com campo obrigatório pendente</span>:totalRows>0?<span className="flex items-center gap-1.5 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5"/>Campos obrigatórios preenchidos</span>:<span>Comece adicionando os registros de cada seção.</span>}
        </div>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        <div className="border-b border-border p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><h4 className="font-semibold">{config.label}</h4><p className="mt-1 text-xs text-muted-foreground">{config.description}</p></div>
            <Button size="sm" onClick={addRow} disabled={!canEdit||loading}><Plus className="h-4 w-4"/>Adicionar registro</Button>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-8" value={query} onChange={event=>setQuery(event.target.value)} placeholder={"Pesquisar em "+config.label.toLowerCase()}/></div>
            <p className="text-xs text-muted-foreground">{rows.length} de {data[activeGroup].length} registro(s) exibido(s)</p>
          </div>
        </div>

        {loading?<div className="p-8 text-sm text-muted-foreground">Carregando tabela…</div>
        :rows.length===0?<div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center"><FileSpreadsheet className="h-8 w-8 text-muted-foreground"/><div><p className="text-sm font-medium">{query?"Nenhum resultado encontrado":"Nenhum registro cadastrado"}</p><p className="mt-1 text-xs text-muted-foreground">{query?"Ajuste a pesquisa ou limpe o filtro.":"Adicione o primeiro registro desta seção para iniciar o preenchimento."}</p></div>{!query&&<Button size="sm" onClick={addRow} disabled={!canEdit}><Plus className="h-4 w-4"/>Adicionar primeiro registro</Button>}</div>
        :config.columns.length<=4?<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-border bg-muted/30">{config.columns.map(column=><th key={column} className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-muted-foreground">{labels[column]}{config.required.includes(column)&&<span className="ml-1 text-destructive">*</span>}</th>)}<th className="w-12"/></tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-b border-border last:border-0">{config.columns.map(column=><td key={column} className="p-2"><Input className={cn(config.required.includes(column)&&!row[column]?.trim()&&"border-amber-500/60")} value={row[column]??""} onChange={event=>updateRow(row.id,column,event.target.value)} disabled={!canEdit} placeholder={labels[column]}/></td>)}<td className="p-2"><Button variant="ghost" size="icon" aria-label="Excluir registro" onClick={()=>removeRow(row.id)} disabled={!canEdit}><Trash2 className="h-4 w-4 text-destructive"/></Button></td></tr>)}</tbody></table></div>
        :<div className="space-y-3 p-4">{rows.map((row,index)=><div key={row.id} className="rounded-lg border border-border bg-card p-4"><div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-sm font-medium">{row[config.columns[0]]?.trim()||("Registro "+(index+1))}</p><p className="text-xs text-muted-foreground">{config.columns.filter(field=>row[field]?.trim()).length} de {config.columns.length} campos preenchidos</p></div><Button variant="ghost" size="icon" aria-label="Excluir registro" onClick={()=>removeRow(row.id)} disabled={!canEdit}><Trash2 className="h-4 w-4 text-destructive"/></Button></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{config.columns.map(column=><label key={column} className={cn("space-y-1.5 text-xs font-medium",column==="observacoes"&&"md:col-span-2 xl:col-span-3")}><span>{labels[column]}{config.required.includes(column)&&<span className="ml-1 text-destructive">*</span>}</span><Input className={cn(config.required.includes(column)&&!row[column]?.trim()&&"border-amber-500/60")} value={row[column]??""} onChange={event=>updateRow(row.id,column,event.target.value)} disabled={!canEdit} placeholder={labels[column]}/></label>)}</div></div>)}</div>}
      </Card>
    </div>

    {error&&<p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
    {role==="validator"&&<p className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-sky-700 dark:text-sky-300">Modo validador: a Tabela de Acabamentos está disponível somente para revisão.</p>}
  </div>
}
