"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CircleUserRound,Copy,Mail,Save,Trash2,UserPlus,Users } from "lucide-react"
import {
  createManagerAccess,
  deleteManagedOrganization,
  managerDeleteMember,
  managerSetUserAccess,
  managerUpdateMemberAccess,
  type ManagerActionResult,
} from "@/app/actions/manager"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export type DevelopmentOption={id:string;name:string}
export type ManagedMember={
  id:string
  organizationId:string
  userId:string
  role:string
  status:string
  accessStatus:string
  assignments:string[]
  lastAccessAt:string|null
  name:string
  email:string
  jobTitle:string|null
  whatsapp:string|null
}
export type ManagedCompany={id:string;name:string;logo:string|null;members:ManagedMember[];developments:DevelopmentOption[]}
type FeedbackHandler=(tone:"success"|"error"|"info",message:string)=>void
type AccessForm={name:string;email:string;role:"admin"|"editor";developmentIds:string[]}

const emptyAccess:AccessForm={name:"",email:"",role:"admin",developmentIds:[]}
const roleName=(role:string)=>role==="owner"||role==="admin"?"Administrador":role==="editor"||role==="admin_empreendimento"?"Construtor":"Legado"

export function ManagerCompanyCard({company,onFeedback}:{company:ManagedCompany;onFeedback:FeedbackHandler}){
  const router=useRouter()
  const [busy,setBusy]=useState(false)
  const [open,setOpen]=useState(false)
  const [access,setAccess]=useState<AccessForm>(emptyAccess)
  const [inviteLink,setInviteLink]=useState("")

  async function execute<T>(fn:()=>Promise<ManagerActionResult<T>>){
    setBusy(true)
    try{
      const result=await fn()
      onFeedback(result.ok?"success":"error",result.message)
      if(result.ok)router.refresh()
      return result
    }catch(error){
      const message=error instanceof Error?error.message:"Não foi possível concluir a ação"
      onFeedback("error",message)
      return {ok:false as const,message}
    }finally{setBusy(false)}
  }

  async function createAccess(){
    const result=await execute(()=>createManagerAccess({
      organizationId:company.id,
      name:access.name,
      email:access.email,
      role:access.role,
      developmentIds:access.developmentIds,
    }))
    if(!result.ok)return
    if(result.data?.mode==="invited"&&result.data.path){
      setInviteLink(window.location.origin+result.data.path)
      onFeedback("success","Convite criado. Copie o link e envie ao usuário para concluir o acesso.")
    }else{
      setOpen(false);setAccess(emptyAccess);setInviteLink("")
    }
  }

  async function removeCompany(){
    if(!window.confirm('Excluir a construtora "'+company.name+'"?'))return
    await execute(()=>deleteManagedOrganization({organizationId:company.id}))
  }

  const admins=company.members.filter(member=>member.role==="owner"||member.role==="admin")
  const constructors=company.members.filter(member=>member.role==="editor"||member.role==="admin_empreendimento"||member.role==="validator")

  return <Card className="overflow-hidden">
    <CardHeader className="border-b border-border bg-muted/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><CardTitle>{company.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{company.developments.length} empreendimento(s) · {company.members.length} acesso(s)</p></div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={()=>{setOpen(true);setInviteLink("")}}><UserPlus className="h-4 w-4"/>Adicionar usuário</Button>
          <Button size="sm" variant="outline" disabled={busy||company.members.length>0||company.developments.length>0} title={company.members.length>0?"Exclua todos os usuários antes de excluir a construtora":company.developments.length>0?"Exclua ou transfira os empreendimentos antes de excluir a construtora":undefined} onClick={()=>void removeCompany()}><Trash2 className="h-4 w-4"/>Excluir</Button>
        </div>
      </div>
    </CardHeader>
    <CardContent className="space-y-5 pt-5">
      {open&&<div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div><p className="text-sm font-semibold">Criar acesso</p><p className="mt-1 text-xs text-muted-foreground">E-mails já cadastrados são vinculados imediatamente. Novos usuários recebem um link de convite.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Nome</Label><Input value={access.name} onChange={event=>setAccess(current=>({...current,name:event.target.value}))}/></div>
          <div className="space-y-1"><Label>E-mail</Label><Input type="email" value={access.email} onChange={event=>setAccess(current=>({...current,email:event.target.value}))}/></div>
          <div className="space-y-1 sm:col-span-2"><Label>Perfil</Label><select value={access.role} onChange={event=>setAccess(current=>({...current,role:event.target.value as "admin"|"editor",developmentIds:event.target.value==="admin"?[]:current.developmentIds}))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="admin">Administrador — acesso a toda a construtora</option><option value="editor">Construtor — acesso aos empreendimentos selecionados</option></select></div>
        </div>
        {access.role==="editor"&&<DevelopmentSelector developments={company.developments} selected={access.developmentIds} onChange={developmentIds=>setAccess(current=>({...current,developmentIds}))}/>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy||!access.name.trim()||!access.email.trim()||(access.role==="editor"&&!access.developmentIds.length)} onClick={()=>void createAccess()}><CircleUserRound className="h-4 w-4"/>Criar acesso</Button>
          <Button size="sm" variant="outline" onClick={()=>{setOpen(false);setAccess(emptyAccess);setInviteLink("")}}>Cancelar</Button>
          {inviteLink&&<><Button size="sm" variant="outline" onClick={()=>void navigator.clipboard.writeText(inviteLink)}><Copy className="h-4 w-4"/>Copiar convite</Button><Button size="sm" variant="outline" onClick={()=>{const subject=encodeURIComponent("Acesso ao DG Manual");const body=encodeURIComponent("Você foi convidado para acessar o DG Manual. Use este link:\n\n"+inviteLink);window.location.href="mailto:?subject="+subject+"&body="+body}}><Mail className="h-4 w-4"/>Abrir e-mail</Button></>}
        </div>
      </div>}

      <MemberSection title="Administradores" members={admins} company={company} busy={busy} execute={execute}/>
      <MemberSection title="Construtores" members={constructors} company={company} busy={busy} execute={execute}/>
    </CardContent>
  </Card>
}

function MemberSection({title,members,company,busy,execute}:{title:string;members:ManagedMember[];company:ManagedCompany;busy:boolean;execute:<T>(fn:()=>Promise<ManagerActionResult<T>>)=>Promise<ManagerActionResult<T>>}){
  return <section><div className="mb-2 flex items-center gap-2"><Users className="h-4 w-4 text-primary"/><h3 className="text-sm font-semibold">{title}</h3><Badge variant="outline">{members.length}</Badge></div><div className="space-y-2">{members.map(member=><MemberRow key={member.id} member={member} company={company} busy={busy} execute={execute}/>)}{members.length===0&&<p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhum {title.slice(0,-1)} cadastrado.</p>}</div></section>
}

function DevelopmentSelector({developments,selected,onChange}:{developments:DevelopmentOption[];selected:string[];onChange:(ids:string[])=>void}){
  return <div className="space-y-2"><Label>Empreendimentos permitidos</Label>{developments.length===0?<p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Cadastre um empreendimento antes de criar um Construtor.</p>:<div className="grid gap-2 sm:grid-cols-2">{developments.map(development=>{const checked=selected.includes(development.id);return <label key={development.id} className={cn("flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-xs",checked?"border-primary/40 bg-primary/5":"border-border")}><input type="checkbox" checked={checked} onChange={()=>onChange(checked?selected.filter(id=>id!==development.id):[...selected,development.id])} className="h-4 w-4 accent-primary"/><span className="truncate">{development.name}</span></label>})}</div>}</div>
}

function MemberRow({member,company,busy,execute}:{member:ManagedMember;company:ManagedCompany;busy:boolean;execute:<T>(fn:()=>Promise<ManagerActionResult<T>>)=>Promise<ManagerActionResult<T>>}){
  const [role,setRole]=useState<"admin"|"editor">(member.role==="owner"||member.role==="admin"?"admin":"editor")
  const [developmentIds,setDevelopmentIds]=useState<string[]>(member.assignments)
  const accountEnabled=member.accessStatus==="active"
  const membershipActive=member.status==="active"

  async function toggleAccess(){
    const status=accountEnabled?"disabled":"active"
    if(status==="disabled"&&!window.confirm("Desabilitar a conta de "+member.name+"? Todas as sessões serão encerradas."))return
    await execute(()=>managerSetUserAccess({userId:member.userId,status}))
  }
  async function remove(){
    if(!window.confirm("Excluir o acesso de "+member.name+" desta construtora?"))return
    await execute(()=>managerDeleteMember({organizationId:company.id,memberId:member.id}))
  }

  return <div className="space-y-3 rounded-lg border border-border p-3">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium">{member.name}</p><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold",accountEnabled?"bg-emerald-500/10 text-emerald-600":"bg-red-500/10 text-red-600")}>{accountEnabled?"Conta habilitada":"Conta inativa"}</span>{!membershipActive&&<span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{member.status==="removed"?"Acesso removido":"Acesso suspenso"}</span>}</div><p className="truncate text-xs text-muted-foreground">{member.email}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{roleName(member.role)}</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" role="switch" aria-checked={accountEnabled} disabled={busy} onClick={()=>void toggleAccess()} className={cn("inline-flex h-8 items-center gap-2 rounded-full border px-2.5 text-xs font-medium",accountEnabled?"border-emerald-500/30 bg-emerald-500/10 text-emerald-700":"border-red-500/30 bg-red-500/10 text-red-700")}><span className={cn("h-3 w-3 rounded-full",accountEnabled?"bg-emerald-500":"bg-red-500")}/>{accountEnabled?"Desabilitar":"Habilitar"}</button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void remove()}><Trash2 className="h-4 w-4"/>Excluir</Button></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
      <div className="space-y-1"><Label className="text-xs">Perfil</Label><select value={role} disabled={busy} onChange={event=>{const next=event.target.value as "admin"|"editor";setRole(next);if(next==="admin")setDevelopmentIds([])}} className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"><option value="admin">Administrador</option><option value="editor">Construtor</option></select></div>
      <div>{role==="editor"?<DevelopmentSelector developments={company.developments} selected={developmentIds} onChange={setDevelopmentIds}/>:<p className="pb-2 text-xs text-muted-foreground">Acesso a todos os empreendimentos.</p>}</div>
      <Button size="sm" variant="outline" disabled={busy||(role==="editor"&&!developmentIds.length)} onClick={()=>void execute(()=>managerUpdateMemberAccess({organizationId:company.id,memberId:member.id,role,developmentIds}))}><Save className="h-4 w-4"/>Salvar acesso</Button>
    </div>
  </div>
}
