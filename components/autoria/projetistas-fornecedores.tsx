"use client"

import { useRef, useState } from "react"
import { DraftingCompass, Mail, Pencil, Phone, Plus, Trash2, Truck } from "lucide-react"
import { type ContactKind, type TechnicalContact } from "@/lib/mock-data"
import { useDevelopmentStore } from "@/lib/store"
import { saveDevelopmentModulePath } from "@/app/actions/developments"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const empty = (kind:ContactKind):TechnicalContact=>({
  id:"",kind,name:"",company:"",discipline:kind==="fornecedor"?"Material":"",registration:"",
  phone:"",whatsapp:"",email:"",warranty:"",nbr:""
})
export function ProjetistasFornecedores({developmentId,disabled=false}:{developmentId:string;disabled?:boolean}){
  const development=useDevelopmentStore(state=>state.developments[developmentId])
  const updateDevelopment=useDevelopmentStore(state=>state.updateDevelopment)
  const contacts=Array.isArray(development?.authoring?.contacts)?development.authoring.contacts as TechnicalContact[]:[]
  const [draft,setDraft]=useState<TechnicalContact|null>(null)
  const [dialogOpen,setDialogOpen]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [saving,setSaving]=useState(false)
  const queue=useRef(Promise.resolve())

  function persist(next:TechnicalContact[]){
    const current=useDevelopmentStore.getState().developments[developmentId]
    updateDevelopment(developmentId,{authoring:{...current.authoring,contacts:next}})
    setSaving(true);setError(null)
    queue.current=queue.current.catch(()=>{}).then(async()=>{await saveDevelopmentModulePath(developmentId,["authoring","contacts"],next)})
      .catch(e=>setError(e instanceof Error?e.message:"Falha ao salvar contato"))
      .finally(()=>setSaving(false))
  }
  function save(){
    if(!draft || !draft.name.trim() || !draft.company.trim() || !draft.discipline.trim() || disabled)return
    persist(draft.id?contacts.map(c=>c.id===draft.id?draft:c):[...contacts,{...draft,id:crypto.randomUUID()}])
    setDialogOpen(false);setDraft(null)
  }
  return <div className="space-y-3">
    {error&&<p role="alert" className="rounded-md border border-destructive/30 p-3 text-xs text-destructive">{error}</p>}
    {saving&&<p className="text-xs text-muted-foreground">Salvando contatos…</p>}
    <div className="grid gap-5 lg:grid-cols-2">
      {(["projetista","fornecedor"] as const).map(kind=>{
        const subset=contacts.filter(c=>c.kind===kind)
        const Icon=kind==="projetista"?DraftingCompass:Truck
        return <Card key={kind} className="flex flex-col p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Icon className="h-5 w-5 text-primary"/><div><h4 className="text-sm font-semibold">{kind==="projetista"?"Projetistas":"Fornecedores"}</h4><p className="text-xs text-muted-foreground">{kind==="projetista"?"Responsáveis técnicos":"Materiais e serviços de execução"}</p></div></div>
            <Badge variant="outline">{subset.length}</Badge>
          </div>
          <ul className="mt-4 flex-1 space-y-3">{subset.map(c=><li key={c.id} className="rounded-md border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{c.company}</p></div>
              {!disabled&&<div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="Editar" onClick={()=>{setDraft({...c});setDialogOpen(true)}}><Pencil className="h-4 w-4"/></Button>
                <Button variant="ghost" size="icon" aria-label="Remover" onClick={()=>persist(contacts.filter(x=>x.id!==c.id))}><Trash2 className="h-4 w-4"/></Button>
              </div>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="secondary">{c.discipline}</Badge><span className="text-xs text-muted-foreground">{c.registration}</span></div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">{c.phone&&<a href={"tel:"+c.phone.replace(/\D/g,"")} className="flex items-center gap-1"><Phone className="h-3 w-3"/>{c.phone}</a>}{c.email&&<a href={"mailto:"+c.email} className="flex items-center gap-1"><Mail className="h-3 w-3"/>{c.email}</a>}</div>
          </li>)}</ul>
          {!subset.length&&<p className="my-6 text-center text-xs text-muted-foreground">Nenhum cadastro.</p>}
          {!disabled&&<Button variant="outline" className="mt-4" onClick={()=>{setDraft(empty(kind));setDialogOpen(true)}}><Plus className="h-4 w-4"/>Adicionar {kind}</Button>}
        </Card>
      })}
    </div>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{draft?.id?"Editar":"Adicionar"} {draft?.kind}</DialogTitle><DialogDescription>Dados de identificação e contato incluídos nos manuais.</DialogDescription></DialogHeader>
        {draft&&<div className="grid gap-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={draft.kind==="projetista"?"Nome":"Contato"}><Input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="Nome do responsável"/></Field>
            <Field label="Empresa"><Input value={draft.company} onChange={e=>setDraft({...draft,company:e.target.value})} placeholder="Razão social"/></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {draft.kind==="projetista"?
              <Field label="Disciplina"><Input value={draft.discipline} onChange={e=>setDraft({...draft,discipline:e.target.value})} placeholder="Digite a disciplina"/></Field>:
              <Field label="Ramo"><Select value={draft.discipline} onValueChange={v=>setDraft({...draft,discipline:v??"Material"})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Material">Material</SelectItem><SelectItem value="Execução">Execução</SelectItem></SelectContent></Select></Field>}
            <Field label={draft.kind==="projetista"?"CREA / CAU":"CNPJ"}><Input value={draft.registration} onChange={e=>setDraft({...draft,registration:e.target.value})} placeholder={draft.kind==="projetista"?"CREA / CAU":"00.000.000/0001-00"}/></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Telefone"><Input value={draft.phone} onChange={e=>setDraft({...draft,phone:e.target.value})} placeholder="(11) 00000-0000"/></Field>
            <Field label="E-mail"><Input type="email" value={draft.email} onChange={e=>setDraft({...draft,email:e.target.value})} placeholder="contato@empresa.com.br"/></Field>
          </div>
        </div>}
        <DialogFooter><Button variant="outline" onClick={()=>setDialogOpen(false)}>Cancelar</Button><Button disabled={!draft?.name.trim()||!draft?.company.trim()||!draft?.discipline.trim()} onClick={save}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>}
