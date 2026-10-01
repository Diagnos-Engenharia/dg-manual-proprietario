"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createOrganizationInvitation,setDevelopmentAssignment,updateMemberStatus } from "@/app/actions/organization"
import { Button } from "@/components/ui/button"
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Grant={developmentId:string;role:string}
type Member={id:string;userId:string;role:string;status:string;name:string;email:string;image:string|null;createdAt:string;lastAccessAt:string|null;assignments:Grant[]}
type Development={id:string;name:string}
const statusLabel:Record<string,string>={active:"Ativo",suspended:"Suspenso",removed:"Removido"}

export function TeamPageContent({members,developments}:{members:Member[];developments:Development[]}){
  const router=useRouter()
  const [query,setQuery]=useState("")
  const [message,setMessage]=useState("")
  const [busy,setBusy]=useState(false)
  const [inviteOpen,setInviteOpen]=useState(false)
  const [invite,setInvite]=useState({name:"",email:"",developmentId:developments[0]?.id??""})
  const [selections,setSelections]=useState<Record<string,string>>({})
  const filtered=members.filter(member=>(member.name+" "+member.email).toLowerCase().includes(query.toLowerCase()))
  const projectName=(id:string)=>developments.find(d=>d.id===id)?.name??"Empreendimento removido"

  async function perform(fn:()=>Promise<string>){
    setBusy(true);setMessage("")
    try{setMessage(await fn());router.refresh()}catch(e){setMessage(e instanceof Error?e.message:"Não foi possível concluir a ação")}finally{setBusy(false)}
  }

  async function sendInvite(){
    await perform(async()=>{
      const result=await createOrganizationInvitation(invite)
      setInviteOpen(false)
      if(!result)return "Construtor vinculado ao empreendimento."
      const link=window.location.origin+result
      try{await navigator.clipboard.writeText(link);return "Convite de Construtor criado e link copiado."}catch{return "Convite criado: "+link}
    })
  }

  return <Card><CardHeader><CardTitle>Equipe e acessos</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Hierarquia:</span> Administradores gerenciam a construtora e validam os conteúdos. Nesta tela, novos usuários são convidados somente como Construtores.
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center"><Input aria-label="Pesquisar usuário" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar nome ou e-mail" className="sm:w-64"/><Button className="sm:ml-auto" onClick={()=>setInviteOpen(v=>!v)}>Convidar Construtor</Button></div>
      {inviteOpen&&<div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-4 md:grid-cols-2">
        <div className="space-y-1"><Label>Nome</Label><Input value={invite.name} onChange={e=>setInvite(p=>({...p,name:e.target.value}))}/></div>
        <div className="space-y-1"><Label>E-mail</Label><Input type="email" value={invite.email} onChange={e=>setInvite(p=>({...p,email:e.target.value}))}/></div>
        <div className="space-y-1 md:col-span-2"><Label>Empreendimento inicial</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={invite.developmentId} onChange={e=>setInvite(p=>({...p,developmentId:e.target.value}))}><option value="">Selecione</option>{developments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
        <div className="flex gap-2 md:col-span-2"><Button disabled={busy||!invite.name.trim()||!invite.email.trim()||!invite.developmentId} onClick={()=>void sendInvite()}>{busy?"Criando…":"Criar convite"}</Button><Button variant="outline" onClick={()=>setInviteOpen(false)}>Cancelar</Button></div>
      </div>}

      {message&&<p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">{message}</p>}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[900px] text-sm">
          <thead><tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="p-3">Usuário</th><th className="p-3">Empreendimentos</th><th className="p-3">Perfil</th><th className="p-3">Status</th><th className="p-3">Último acesso</th><th className="p-3">Ações</th></tr></thead>
          <tbody>{filtered.map(member=>{
            const administrator=member.role==="owner"||member.role==="admin"
            const available=developments.filter(d=>!member.assignments.some(a=>a.developmentId===d.id))
            const choice=selections[member.id]??available[0]?.id??""
            return <tr key={member.id} className="border-b align-top last:border-0">
              <td className="p-3"><p className="font-medium">{member.name}</p><p className="text-xs text-muted-foreground">{member.email}</p></td>
              <td className="p-3">{administrator?<span className="text-xs text-muted-foreground">Todos</span>:<div className="space-y-2">{member.assignments.map(grant=><div key={grant.developmentId} className="flex items-center gap-2"><span className="max-w-56 truncate">{projectName(grant.developmentId)}</span><Button variant="ghost" size="sm" disabled={busy} onClick={()=>{if(window.confirm("Revogar acesso a "+projectName(grant.developmentId)+"?"))void perform(async()=>{await setDevelopmentAssignment(member.id,grant.developmentId,null);return "Acesso revogado."})}}>Revogar</Button></div>)}{!member.assignments.length&&<span className="text-xs text-muted-foreground">Nenhum</span>}</div>}</td>
              <td className="p-3"><Badge variant="outline">{administrator?"Administrador":"Construtor"}</Badge></td>
              <td className="p-3"><Badge variant="outline">{statusLabel[member.status]??member.status}</Badge></td>
              <td className="p-3 text-muted-foreground">{member.lastAccessAt?new Date(member.lastAccessAt).toLocaleDateString("pt-BR"):"—"}</td>
              <td className="p-3"><div className="space-y-2">
                {administrator?<span className="text-xs text-muted-foreground">Gerenciado pelo Gerenciador</span>:<>
                  {member.status==="active"&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>{if(window.confirm("Suspender este Construtor?"))void perform(async()=>{await updateMemberStatus(member.id,"suspended");return "Construtor suspenso."})}}>Suspender</Button>}
                  {member.status==="suspended"&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>void perform(async()=>{await updateMemberStatus(member.id,"active");return "Construtor reativado."})}>Reativar</Button>}
                  {member.status==="active"&&available.length>0&&<div className="flex min-w-[270px] gap-1"><select value={choice} onChange={e=>setSelections(p=>({...p,[member.id]:e.target.value}))} className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs">{available.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select><Button variant="outline" size="sm" disabled={busy||!choice} onClick={()=>void perform(async()=>{await setDevelopmentAssignment(member.id,choice,"editor");return "Empreendimento atribuído."})}>Adicionar</Button></div>}
                </>}
              </div></td>
            </tr>
          })}</tbody>
        </table>
      </div>
    </CardContent>
  </Card>
}
