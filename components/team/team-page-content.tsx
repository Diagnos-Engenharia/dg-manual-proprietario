"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createOrganizationInvitation, setDevelopmentAssignment, updateMemberStatus } from "@/app/actions/organization"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { DevelopmentRole } from "@/lib/organization"

type Grant={developmentId:string;role:string}
type Member={id:string;userId:string;role:string;status:string;name:string;email:string;image:string|null;createdAt:string;lastAccessAt:string|null;assignments:Grant[]}
type Development={id:string;name:string}
type ScopedRole=Exclude<DevelopmentRole,"admin">
const roles: {value:ScopedRole;label:string}[]=[
  {value:"admin_empreendimento",label:"Administrador do empreendimento"},
  {value:"editor",label:"Editor"},
  {value:"validator",label:"Validador"},
]
const roleLabel=(value:string)=>roles.find(r=>r.value===value)?.label??value
export function TeamPageContent({members,developments}:{members:Member[];developments:Development[]}){
  const router=useRouter()
  const [query,setQuery]=useState("")
  const [message,setMessage]=useState("")
  const [busy,setBusy]=useState(false)
  const [inviting,setInviting]=useState(false)
  const [invite,setInvite]=useState<{name:string;email:string;developmentId:string;role:ScopedRole}>({name:"",email:"",developmentId:developments[0]?.id??"",role:"editor"})
  const [selections,setSelections]=useState<Record<string,{developmentId:string;role:ScopedRole}>>({})
  const filtered=members.filter(m=>(m.name+" "+m.email).toLowerCase().includes(query.toLowerCase()))
  const projectName=(id:string)=>developments.find(d=>d.id===id)?.name??"Empreendimento removido"
  async function perform(fn:()=>Promise<string>){
    setBusy(true);setMessage("")
    try{setMessage(await fn());router.refresh()}
    catch(e){setMessage(e instanceof Error?e.message:"Não foi possível concluir a ação")}
    finally{setBusy(false)}
  }
  async function sendInvite(){
    await perform(async()=>{
      const result=await createOrganizationInvitation(invite)
      setInviting(false)
      if(!result)return "Usuário vinculado ao empreendimento selecionado."
      const link=window.location.origin+result
      try{await navigator.clipboard.writeText(link);return "Convite criado. Link copiado: "+link}
      catch{return "Convite criado. Compartilhe o link: "+link}
    })
  }
  return <Card id="equipe"><CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div><CardTitle>Equipe e acessos</CardTitle><CardDescription>Atribua permissões específicas a cada empreendimento. Administradores da construtora acessam toda a carteira.</CardDescription></div>
    <Button onClick={()=>setInviting(v=>!v)}>Convidar usuário</Button>
  </CardHeader><CardContent className="space-y-4">
    {inviting&&<div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2">
      <div className="space-y-1"><Label>Nome</Label><Input value={invite.name} onChange={e=>setInvite(p=>({...p,name:e.target.value}))} placeholder="Nome completo"/></div>
      <div className="space-y-1"><Label>E-mail</Label><Input value={invite.email} type="email" onChange={e=>setInvite(p=>({...p,email:e.target.value}))} placeholder="usuario@empresa.com.br"/></div>
      <div className="space-y-1"><Label>Empreendimento</Label><select aria-label="Empreendimento do convidado" value={invite.developmentId} onChange={e=>setInvite(p=>({...p,developmentId:e.target.value}))} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Selecione</option>{developments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
      <div className="space-y-1"><Label>Perfil de acesso</Label><select aria-label="Perfil do convidado" value={invite.role} onChange={e=>setInvite(p=>({...p,role:e.target.value as ScopedRole}))} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">{roles.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
      <Button className="sm:col-span-2" disabled={busy||!invite.name.trim()||!invite.email.trim()||!invite.developmentId} onClick={()=>void sendInvite()}>{busy?"Enviando…":"Criar convite"}</Button>
    </div>}
    {message&&<p role="status" className="break-all rounded-lg bg-muted p-3 text-xs">{message}</p>}
    <Input aria-label="Pesquisar usuário" placeholder="Pesquisar nome ou e-mail" value={query} onChange={e=>setQuery(e.target.value)}/>
    {filtered.map(member=>{
      const global=member.role==="owner"||member.role==="admin"
      const available=developments.filter(d=>!member.assignments.some(a=>a.developmentId===d.id))
      const choice=selections[member.id]??{developmentId:available[0]?.id??"",role:"editor" as ScopedRole}
      return <div key={member.id} className="rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><p className="text-sm font-semibold">{member.name}</p><p className="text-xs text-muted-foreground">{member.email}</p></div>
          <div className="flex gap-2"><Badge variant="outline">{global?"Administrador global":member.status==="active"?"Acesso restrito":member.status}</Badge>
            {!global&&member.status==="active"&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>{if(window.confirm("Suspender este usuário em todos os empreendimentos?"))void perform(async()=>{await updateMemberStatus(member.id,"suspended");return "Usuário suspenso."})}}>Suspender</Button>}
            {!global&&member.status==="suspended"&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>void perform(async()=>{await updateMemberStatus(member.id,"active");return "Usuário reativado."})}>Reativar</Button>}
          </div>
        </div>
        {!global&&<div className="mt-3 space-y-2">
          {member.assignments.map(grant=><div key={grant.developmentId} className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2">
            <span className="min-w-0 flex-1 text-xs font-medium">{projectName(grant.developmentId)}</span>
            <select aria-label={"Papel de "+member.name+" em "+projectName(grant.developmentId)} defaultValue={grant.role} disabled={busy} onChange={e=>void perform(async()=>{await setDevelopmentAssignment(member.id,grant.developmentId,e.target.value as ScopedRole);return "Perfil atualizado."})} className="max-w-52 rounded border border-input bg-background p-1 text-xs">{roles.map(r=><option value={r.value} key={r.value}>{r.label}</option>)}</select>
            <Button variant="ghost" size="sm" disabled={busy} onClick={()=>{if(window.confirm("Revogar o acesso a "+projectName(grant.developmentId)+"?"))void perform(async()=>{await setDevelopmentAssignment(member.id,grant.developmentId,null);return "Acesso revogado."})}}>Revogar</Button>
          </div>)}
          {member.status==="active"&&available.length>0&&<div className="flex flex-wrap items-center gap-2">
            <select aria-label={"Adicionar empreendimento a "+member.name} value={choice.developmentId} onChange={e=>setSelections(p=>({...p,[member.id]:{...choice,developmentId:e.target.value}}))} className="min-w-32 flex-1 rounded border border-input bg-background p-2 text-xs">{available.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>
            <select aria-label={"Novo perfil de "+member.name} value={choice.role} onChange={e=>setSelections(p=>({...p,[member.id]:{...choice,role:e.target.value as ScopedRole}}))} className="rounded border border-input bg-background p-2 text-xs">{roles.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select>
            <Button variant="outline" size="sm" disabled={busy||!choice.developmentId} onClick={()=>void perform(async()=>{await setDevelopmentAssignment(member.id,choice.developmentId,choice.role);return "Empreendimento atribuído."})}>Adicionar</Button>
          </div>}
          {!member.assignments.length&&<p className="text-xs text-muted-foreground">Sem empreendimento atribuído; não pode acessar dados do projeto.</p>}
        </div>}
      </div>
    })}
  </CardContent></Card>
}
