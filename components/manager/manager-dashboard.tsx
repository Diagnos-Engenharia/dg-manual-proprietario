"use client"

import { useMemo,useState } from "react"
import { useRouter } from "next/navigation"
import { Building2,LogOut,Plus,Search,Settings2 } from "lucide-react"
import { createManagedOrganization } from "@/app/actions/manager"
import { signOut } from "@/lib/auth-client"
import { ManagerCompanyCard,type ManagedCompany } from "@/components/manager/manager-company-card"
import { ManagerSettings } from "@/components/manager/manager-settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type AiIntegration={provider:string;status:string;testedAt:string|null;updatedAt:string;config:{model?:string}}|null
type Tab="companies"|"settings"
type Feedback={tone:"success"|"error"|"info";message:string}|null

export function ManagerDashboard({companies,aiIntegration,managerName,managerEmail}:{companies:ManagedCompany[];aiIntegration:AiIntegration;managerName:string;managerEmail:string}){
  const router=useRouter()
  const [tab,setTab]=useState<Tab>("companies")
  const [query,setQuery]=useState("")
  const [busy,setBusy]=useState(false)
  const [feedback,setFeedback]=useState<Feedback>(null)
  const [newCompany,setNewCompany]=useState("")

  const filtered=useMemo(()=>companies.filter(company=>{
    const haystack=[company.name,...company.members.flatMap(member=>[member.name,member.email])].join(" ").toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  }),[companies,query])

  function showFeedback(tone:"success"|"error"|"info",message:string){setFeedback({tone,message})}

  async function addCompany(){
    setBusy(true);setFeedback(null)
    try{
      const result=await createManagedOrganization({name:newCompany})
      setFeedback({tone:result.ok?"success":"error",message:result.message})
      if(result.ok){setNewCompany("");router.refresh()}
    }catch(error){setFeedback({tone:"error",message:error instanceof Error?error.message:"Não foi possível cadastrar a construtora."})}
    finally{setBusy(false)}
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
        <div><h1 className="text-2xl font-semibold">Gerenciamento da plataforma</h1><p className="mt-1 text-sm text-muted-foreground">Construtoras, acessos, segurança da conta e motor de IA.</p></div>
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1">
          <button onClick={()=>setTab("companies")} className={cn("flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium",tab==="companies"?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted")}><Building2 className="h-4 w-4"/>Construtoras</button>
          <button onClick={()=>setTab("settings")} className={cn("flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium",tab==="settings"?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted")}><Settings2 className="h-4 w-4"/>Configurações</button>
        </div>
      </div>

      {feedback&&<div role={feedback.tone==="error"?"alert":"status"} className={cn(
        "mb-4 rounded-lg border px-4 py-3 text-sm",
        feedback.tone==="success"&&"border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
        feedback.tone==="error"&&"border-destructive/30 bg-destructive/5 text-destructive",
        feedback.tone==="info"&&"border-border bg-muted/30",
      )}>{feedback.message}</div>}

      {tab==="companies"&&<div className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Pesquisar construtora, usuário ou e-mail" className="pl-9"/></div>
          <div className="flex gap-2"><Input value={newCompany} onChange={event=>setNewCompany(event.target.value)} placeholder="Nova construtora" className="min-w-64"/><Button disabled={busy||newCompany.trim().length<2} onClick={()=>void addCompany()}><Plus className="h-4 w-4"/>Cadastrar construtora</Button></div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">{filtered.map(company=><ManagerCompanyCard key={company.id} company={company} onFeedback={showFeedback}/>)}</div>
      </div>}

      {tab==="settings"&&<ManagerSettings managerName={managerName} managerEmail={managerEmail} aiIntegration={aiIntegration} onFeedback={showFeedback}/>}
    </main>
  </div>
}
