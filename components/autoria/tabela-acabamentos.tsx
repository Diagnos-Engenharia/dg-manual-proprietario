"use client"

import { useEffect, useMemo, useState } from "react"
import { Copy, FileSpreadsheet, Plus, RotateCcw, Save, Search, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { getFinishingTable, saveFinishingTable, type FinishingGroup, type FinishingRow, type FinishingTableData } from "@/app/actions/developments"

type Props = { developmentId: string; disabled?: boolean; role: "admin" | "editor" | "validator" }
type GroupConfig = { id: FinishingGroup; label: string; columns: string[]; required: string[] }

const groups: GroupConfig[] = [
  { id: "ambientes", label: "Ambientes", columns: ["ambiente", "pisoRodapeBancada", "parede", "teto"], required: ["ambiente"] },
  { id: "materiais", label: "Materiais", columns: ["material", "aplicacao", "ambiente", "marca", "linha", "referencia", "formato", "cor", "observacoes"], required: ["material", "aplicacao", "ambiente"] },
  { id: "hidraulicas", label: "Instalações hidráulicas", columns: ["ambiente", "loucaCuba", "metais", "fabricante", "modelo", "referencia", "observacoes"], required: ["ambiente", "loucaCuba"] },
  { id: "esquadrias", label: "Esquadrias, serralheria, ferragens e vidros", columns: ["ambiente", "portas", "janelas", "esquadrias", "ferragens", "vidros", "fabricante", "modelo", "observacoes"], required: ["ambiente"] },
  { id: "eletricas", label: "Instalações elétricas", columns: ["ambiente", "acabamentoEletrico", "interruptores", "tomadas", "placas", "fabricante", "linha", "cor", "observacoes"], required: ["ambiente", "acabamentoEletrico"] },
]

const labels: Record<string, string> = { ambiente: "Ambiente", pisoRodapeBancada: "Piso, rodapé e bancada", parede: "Parede", teto: "Teto", material: "Material", aplicacao: "Aplicação", loucaCuba: "Louça ou cuba em aço inox", metais: "Metais", fabricante: "Fabricante", modelo: "Modelo", referencia: "Referência", observacoes: "Observações", portas: "Portas", janelas: "Janelas", esquadrias: "Esquadrias", ferragens: "Ferragens", vidros: "Vidros", acabamentoEletrico: "Acabamento elétrico", interruptores: "Interruptores", tomadas: "Tomadas", placas: "Placas", linha: "Linha", formato: "Formato", cor: "Cor" }

const emptyData = (): FinishingTableData => ({ ambientes: [], materiais: [], hidraulicas: [], esquadrias: [], eletricas: [] })
const emptyRow = (group: GroupConfig): FinishingRow => Object.fromEntries([["id", crypto.randomUUID()], ...group.columns.map((column) => [column, ""])]) as FinishingRow

export function TabelaAcabamentos({ developmentId, disabled = false, role }: Props) {
  const [typology, setTypology] = useState("Tipo A")
  const [tower, setTower] = useState("Torre 1")
  const [unitModel, setUnitModel] = useState("Unidade modelo")
  const [area, setArea] = useState("")
  const [data, setData] = useState<FinishingTableData>(emptyData)
  const [activeGroup, setActiveGroup] = useState<FinishingGroup>("ambientes")
  const [query, setQuery] = useState("")
  const [revision, setRevision] = useState(0)
  const [savedData, setSavedData] = useState<FinishingTableData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("Ainda não salvo")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { let alive = true; setLoading(true); void getFinishingTable(developmentId, typology).then((table) => { if (!alive) return; const next = (table?.data as FinishingTableData | undefined) ?? emptyData(); setData(next); setSavedData(next); setRevision(table?.revision ?? 0); setTower(table?.tower ?? "Torre 1"); setUnitModel(table?.unitModel ?? "Unidade modelo"); setArea(table?.area ?? ""); setMessage(table ? `Salvo às ${new Date(table.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Ainda não salvo"); setLoading(false) }).catch((cause) => { if (alive) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar a tabela"); setLoading(false) } }); return () => { alive = false } }, [developmentId, typology])

  const config = groups.find((group) => group.id === activeGroup)!
  const rows = useMemo(() => data[activeGroup].filter((row) => !query || Object.values(row).some((value) => value.toLowerCase().includes(query.toLowerCase()))), [activeGroup, data, query])
  const incomplete = useMemo(() => data[activeGroup].filter((row) => config.required.some((field) => !row[field]?.trim())).length, [activeGroup, config.required, data])
  const updateRow = (id: string, field: string, value: string) => setData((current) => ({ ...current, [activeGroup]: current[activeGroup].map((row) => row.id === id ? { ...row, [field]: value } : row) }))
  const addRow = () => setData((current) => ({ ...current, [activeGroup]: [...current[activeGroup], emptyRow(config)] }))
  const removeRow = (id: string) => { if (window.confirm("Excluir esta linha da tabela?")) setData((current) => ({ ...current, [activeGroup]: current[activeGroup].filter((row) => row.id !== id) })) }
  const undo = () => setData(savedData)
  const save = async () => { setSaving(true); setError(null); setMessage("Salvando…"); try { const result = await saveFinishingTable({ developmentId, tower, typology, unitModel, area, data, expectedRevision: revision || undefined }); setRevision(result.revision); setSavedData(data); setMessage(`Salvo às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`) } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao salvar"); setMessage("Erro ao salvar") } finally { setSaving(false) } }
  const totalRows = Object.values(data).reduce((sum, items) => sum + items.length, 0)
  const canEdit = !disabled && (role === "editor" || role === "admin")

  return <div className="flex flex-col gap-4">
    <Card className="p-4 sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary" /><h3 className="text-lg font-semibold">Tabela de Acabamentos</h3></div><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Informações de acabamento incorporadas ao Manual do Proprietário. Cadastre somente os dados aplicáveis à tipologia selecionada.</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant={error ? "destructive" : "outline"}>{error ? "Erro ao salvar" : message}</Badge><Button variant="outline" size="sm" disabled={!canEdit || loading} onClick={undo}><RotateCcw className="h-4 w-4" />Desfazer</Button><Button size="sm" disabled={!canEdit || saving || loading} onClick={() => void save()}><Save className="h-4 w-4" />{saving ? "Salvando…" : "Salvar alterações"}</Button></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs font-medium">Torre ou bloco<Input value={tower} onChange={(event) => setTower(event.target.value)} disabled={!canEdit} placeholder="Torre 1" /></label><label className="text-xs font-medium">Tipologia<Select value={typology} onValueChange={(value) => { if (value) setTypology(value) }} disabled={!canEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Tipo A">Tipo A</SelectItem><SelectItem value="Tipo B">Tipo B</SelectItem><SelectItem value="Tipo C">Tipo C</SelectItem></SelectContent></Select></label><label className="text-xs font-medium">Modelo da unidade<Input value={unitModel} onChange={(event) => setUnitModel(event.target.value)} disabled={!canEdit} /></label><label className="text-xs font-medium">Área da unidade<Input value={area} onChange={(event) => setArea(event.target.value)} disabled={!canEdit} placeholder="68,40 m²" /></label></div></Card>
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2">{groups.map((group) => <button key={group.id} type="button" onClick={() => setActiveGroup(group.id)} className={cn("rounded-md border px-3 py-2 text-sm", activeGroup === group.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent")}>{group.label}<span className="ml-2 font-mono text-xs">{data[group.id].length}</span></button>)}</div><div className="flex flex-wrap gap-2"><div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="w-full pl-8 sm:w-64" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar" /></div><Button variant="outline" disabled><FileSpreadsheet className="h-4 w-4" />Importar planilha (em desenvolvimento)</Button><Button variant="outline" disabled><Copy className="h-4 w-4" />Duplicar tipologia</Button></div></div>
    <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-border p-4"><div><h4 className="font-semibold">{config.label}</h4><p className="text-xs text-muted-foreground">{rows.length} linhas visíveis · {totalRows} registros totais{incomplete > 0 ? ` · ${incomplete} incompletas` : ""}</p></div><Button size="sm" onClick={addRow} disabled={!canEdit}><Plus className="h-4 w-4" />Adicionar linha</Button></div>{loading ? <p className="p-6 text-sm text-muted-foreground">Carregando tabela…</p> : rows.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Nenhum registro cadastrado neste grupo. Adicione uma linha para começar.</div> : <><div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-border bg-muted/30">{config.columns.map((column) => <th key={column} className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold">{labels[column]}</th>)}<th className="w-12" /></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b border-border last:border-0">{config.columns.map((column) => <td key={column} className="p-2"><Input className={cn(config.required.includes(column) && !row[column] && "border-amber-500/60")} value={row[column] ?? ""} onChange={(event) => updateRow(row.id, column, event.target.value)} disabled={!canEdit} /></td>)}<td className="p-2"><Button variant="ghost" size="icon" aria-label="Excluir linha" onClick={() => removeRow(row.id)} disabled={!canEdit}><Trash2 className="h-4 w-4 text-destructive" /></Button></td></tr>)}</tbody></table></div><div className="flex flex-col gap-3 p-3 lg:hidden">{rows.map((row, index) => <details key={row.id} className="rounded-lg border border-border p-3" open={index === 0}><summary className="cursor-pointer text-sm font-medium">{row[config.columns[0]] || `Linha ${index + 1}`}<span className="ml-2 text-xs text-muted-foreground">{config.columns.filter((field) => row[field]).length}/{config.columns.length} preenchidos</span></summary><div className="mt-3 flex flex-col gap-3">{config.columns.map((column) => <label key={column} className="text-xs font-medium">{labels[column]}<Input value={row[column] ?? ""} onChange={(event) => updateRow(row.id, column, event.target.value)} disabled={!canEdit} /></label>)}<Button variant="outline" className="text-destructive" onClick={() => removeRow(row.id)} disabled={!canEdit}><Trash2 className="h-4 w-4" />Excluir linha</Button></div></details>)}</div></>}</Card>
    {role === "validator" && <p className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-sky-700 dark:text-sky-300">Modo validador: a tabela está disponível para revisão. Solicite ajustes ou aprove a aba pelo controle de workflow da Elaboração.</p>}
  </div>
}
