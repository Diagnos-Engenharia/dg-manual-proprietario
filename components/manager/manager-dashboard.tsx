"use client"

import { useMemo,useState } from "react"
import { useRouter } from "next/navigation"
import { Building2,CheckCircle2,CircleUserRound,KeyRound,LogOut,Plus,Search,Settings2,Users } from "lucide-react"
import { createAdministratorInvitation,createManagedOrganization,managerUpdateMember } from "@/app/actions/manager"
import { removePlatformAiIntegration,savePlatformAiIntegration,testPlatformAiIntegration,type PlatformAiProvider } from "@/app/actions/platform-integrations"
import { signOut } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type ManagedMember={id:string;organizationId:string;userId:string;role:string;status:string;lastAccessAt:string|null;name:string;email:string;jobTitle:string|null;whatsapp:string|null}
type Company={id:string;name:string;logo:string|null;members:ManagedMember[];developments:number}
type AiIntegration={provider:PlatformAiProvider;status:string;testedAt:string|null;updatedAt:string;config:{model?:string}}|null
type Tab="companies"|"settings"

const roleName=(role:string)=>role==="owner"||role==="admin"?"Administrador":role==="editor"||role==="admin_empreendimento"?"Construtor":"Legado"
const statusName=(status:string)=>status==="active"?"Ativo":status==="suspended"?"Suspenso":"Removido"

export function ManagerDashboard({companies,aiIntegration,managerName}:{companies:Company[];aiIntegration:AiIntegration;managerName:string}){
  const router=useRouter()
  const [tab,setTab]=useState<Tab>("companies")
  const [query,setQuery]=useState("")
  const [busy,setBusy]=useState(false)
  const [feedback,setFeedback]=useState("")
  const [newCompany,setNewCompany]=useState("")
  const [invite,setInvite]=useState({organizationId:"",name:"",email:""})
  const [inviteLink,setInviteLink]=useState("")
  const [provider,setProvider]=useState<PlatformAiProvider>(aiIntegration?.provider??"openai")
  const [model,setModel]=useState(aiIntegration?.config.model??"gpt-5.6-luna")
  const [apiKey,setApiKey]=useState("")
  const filtered=useMemo(()=>companies.filter(company=>{
    const haystack=[company.name,...company.members.flatMap(member=>[member.name,member.email])].join(" ").toLowerCase()
    return haystack.includes(query.toLowerCase())
  }),[companies,query])

  async function run(fn:()=>Promise<void>){
    setBusy(true);setFeedback("")
    try{await fn();router.refresh()}catch(error){setFeedback(error instanceof Error?error.message:"Não foi possível concluir a ação")}finally{setBusy(false)}
  }

  async function addCompany(){
    await run(async()=>{await createManagedOrganization({name:newCompany});setNewCompany("");setFeedback("Construtora cadastrada.")})
  }

  async function inviteAdmin(){
    await run(async()=>{
      const path=await createAdministratorInvitation(invite)
      const link=path?window.location.origin+path:""
      setInviteLink(link)
      setFeedback(link?"Convite criado. Você pode copiar o link ou abrir seu cliente de e-mail.":"Administrador vinculado à construtora.")
      setInvite(current=>({...current,name:"",email:""}))
    })
  }

  function emailInvite(){
    if(!inviteLink)return
    const subject=encodeURIComponent("Acesso ao DG Manual")
    const body=encodeURIComponent("Você foi convidado para acessar o DG Manual como Administrador. Crie ou acesse sua conta pelo link:\n\n"+inviteLink)
    window.location.href=`mailto:?subject=${subject}&body=${body}`
  }

  async function logout(){await signOut({fetchOptions:{onSuccess:()=>{window.location.href="/sign-in"}}})}

  return <div className="min-h-screen bg-background">
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex min-h-16 max-w-[1500px] items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">DG</div><div><p className="font-semibold">DG Manual</p><p className="text-xs text-muted-foreground">Painel do Gerenciador</p></div></div>
        <div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-medium">{managerName}</p><p className="text-xs text-muted-foreground">Gerenciador</p></div><Button variant="outline" size="sm" onClick={()=>void logout()}><LogOut className="h-4 w-4"/>Sair</Button></div>
      </div>
    </header>

    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 md:px-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><h1 className="text-2xl font-semibold">Gerenciamento da plataforma</h1><p className="mt-1 text-sm text-muted-foreground">Construtoras, Administradores, Construtores e motor de pré-cadastro.</p></div>
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1">
          <button onClick={()=>setTab("companies")} className={cn("flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium",tab==="companies"?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted")}><Building2 className="h-4 w-4"/>Construtoras</button>
          <button onClick={()=>setTab("settings")} className={cn("flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium",tab==="settings"?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted")}><Settings2 className="h-4 w-4"/>Configurações</button>
        </div>
      </div>

      {feedback&&<p role="status" className="mb-4 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">{feedback}</p>}

      {tab==="companies"&&<div className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Pesquisar construtora, usuário ou e-mail" className="pl-9"/></div>
          <div className="flex gap-2"><Input value={newCompany} onChange={event=>setNewCompany(event.target.value)} placeholder="Nova construtora" className="min-w-64"/><Button disabled={busy||newCompany.trim().length<2} onClick={()=>void addCompany()}><Plus className="h-4 w-4"/>Cadastrar</Button></div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">{filtered.map(company=>{
          const admins=company.members.filter(member=>member.role==="owner"||member.role==="admin")
          const constructors=company.members.filter(member=>member.role==="editor"||member.role==="admin_empreendimento"||member.role==="validator")
          return <Card key={company.id} className="overflow-hidden">
            <CardHeader className="border-b border-border bg-muted/20">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{company.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{company.developments} empreendimento(s) · {company.members.length} acesso(s)</p></div><Button size="sm" onClick={()=>{setInvite({organizationId:company.id,name:"",email:""});setInviteLink("")}}><CircleUserRound className="h-4 w-4"/>Cadastrar Administrador</Button></div>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              {invite.organizationId===company.id&&<div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm font-semibold">Novo Administrador</p>
                <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>Nome</Label><Input value={invite.name} onChange={event=>setInvite(current=>({...current,name:event.target.value}))}/></div><div className="space-y-1"><Label>E-mail</Label><Input type="email" value={invite.email} onChange={event=>setInvite(current=>({...current,email:event.target.value}))}/></div></div>
                <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy||!invite.name.trim()||!invite.email.trim()} onClick={()=>void inviteAdmin()}>Criar convite</Button><Button size="sm" variant="outline" onClick={()=>{setInvite({organizationId:"",name:"",email:""});setInviteLink("")}}>Cancelar</Button>{inviteLink&&<><Button size="sm" variant="outline" onClick={()=>void navigator.clipboard.writeText(inviteLink)}>Copiar link</Button><Button size="sm" variant="outline" onClick={emailInvite}>Abrir e-mail</Button></>}</div>
              </div>}

              <section><div className="mb-2 flex items-center gap-2"><Users className="h-4 w-4 text-primary"/><h3 className="text-sm font-semibold">Administradores</h3><Badge variant="outline">{admins.length}</Badge></div><div className="space-y-2">{admins.map(member=><MemberRow key={member.id} member={member} busy={busy} onChange={(role,status)=>run(()=>managerUpdateMember({organizationId:company.id,memberId:member.id,role,status}))}/>) }{admins.length===0&&<p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhum Administrador cadastrado.</p>}</div></section>
              <section><div className="mb-2 flex items-center gap-2"><Users className="h-4 w-4 text-primary"/><h3 className="text-sm font-semibold">Construtores</h3><Badge variant="outline">{constructors.length}</Badge></div><div className="space-y-2">{constructors.map(member=><MemberRow key={member.id} member={member} busy={busy} onChange={(role,status)=>run(()=>managerUpdateMember({organizationId:company.id,memberId:member.id,role,status}))}/>) }{constructors.length===0&&<p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhum Construtor cadastrado.</p>}</div></section>
            </CardContent>
          </Card>
        })}</div>
      </div>}

      {tab==="settings"&&<div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <Card><CardHeader><CardTitle>Motor de IA do Memorial Descritivo</CardTitle></CardHeader><CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Esta credencial é global do DG Manual. As construtoras não terão acesso à chave. O motor será usado para identificar itens do checklist e extrair variáveis do Memorial; os textos técnicos virão da biblioteca padronizada.</p>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label>Provedor</Label><select value={provider} onChange={event=>setProvider(event.target.value as PlatformAiProvider)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="openai">OpenAI</option><option value="google_ai">Google AI</option></select></div><div className="space-y-1.5"><Label>Modelo</Label><Input value={model} onChange={event=>setModel(event.target.value)} placeholder="Modelo"/></div></div>
          <div className="space-y-1.5"><Label>Chave da API</Label><Input type="password" autoComplete="off" value={apiKey} onChange={event=>setApiKey(event.target.value)} placeholder={aiIntegration?"•••••••• (deixe vazio para manter)":"Insira a credencial"}/></div>
          <div className="flex flex-wrap gap-2"><Button disabled={busy||(!apiKey&&!aiIntegration)||!model.trim()} onClick={()=>void run(async()=>{await savePlatformAiIntegration({provider,apiKey,model});setApiKey("");setFeedback("Configuração do motor salva.")})}><KeyRound className="h-4 w-4"/>Salvar</Button>{aiIntegration&&<Button variant="outline" disabled={busy} onClick={()=>void run(async()=>{const result=await testPlatformAiIntegration();setFeedback(result.message)})}>Testar conexão</Button>}{aiIntegration&&<Button variant="ghost" disabled={busy} onClick={()=>void run(async()=>{await removePlatformAiIntegration();setFeedback("Configuração removida.")})}>Remover</Button>}</div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Status do motor</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="flex items-center gap-3"><div className={cn("flex h-10 w-10 items-center justify-center rounded-full",aiIntegration?.status==="verified"?"bg-success/10 text-success":"bg-muted text-muted-foreground")}><CheckCircle2 className="h-5 w-5"/></div><div><p className="font-medium">{aiIntegration?.status==="verified"?"Conexão validada":aiIntegration?"Configuração salva":"Não configurado"}</p><p className="text-xs text-muted-foreground">{aiIntegration?aiIntegration.provider+" · "+(aiIntegration.config.model??"modelo não informado"):"Cadastre a API para habilitar o processamento automático."}</p></div></div>
          <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm"><p className="font-medium">Estratégia do processamento</p><p className="mt-2 text-muted-foreground">1. Ler Memorial → 2. localizar IDs do checklist → 3. extrair evidências e variáveis → 4. aplicar biblioteca técnica → 5. Construtor revisa → 6. Administrador valida.</p></div>
        </CardContent></Card>
      </div>}
    </main>
  </div>
}

function MemberRow({member,busy,onChange}:{member:ManagedMember;busy:boolean;onChange:(role:"admin"|"editor",status:"active"|"suspended")=>Promise<void>}){
  const role: "admin"|"editor" = member.role==="owner"||member.role==="admin"?"admin":"editor"
  const status: "active"|"suspended" = member.status==="active"?"active":"suspended"
  return <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_150px_120px] sm:items-center">
    <div className="min-w-0"><p className="truncate text-sm font-medium">{member.name}</p><p className="truncate text-xs text-muted-foreground">{member.email}</p>{member.jobTitle&&<p className="mt-0.5 truncate text-xs text-muted-foreground">{member.jobTitle}</p>}</div>
    <select value={role} disabled={busy} onChange={event=>void onChange(event.target.value as "admin"|"editor",status)} className="h-9 rounded-md border border-input bg-background px-2 text-xs"><option value="admin">Administrador</option><option value="editor">Construtor</option></select>
    <select value={status} disabled={busy} onChange={event=>void onChange(role,event.target.value as "active"|"suspended")} className="h-9 rounded-md border border-input bg-background px-2 text-xs"><option value="active">{statusName("active")}</option><option value="suspended">{statusName("suspended")}</option></select>
  </div>
}
