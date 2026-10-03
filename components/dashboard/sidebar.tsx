"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { LayoutDashboard, Building2, BookOpen, Archive, Users, LogOut, Settings, X, ArrowLeftRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { signOut } from "@/lib/auth-client"

type Context={user:{name:string;email:string;image?:string|null};organization:{name:string;logo?:string|null;initials?:string;primaryColor?:string};canSwitchOrganization:boolean;role:"admin"|"admin_empreendimento"|"editor"|"validator"}
const roleLabels={admin:"Administrador",admin_empreendimento:"Construtor",editor:"Construtor",validator:"Validador legado"}
const primary=[{label:"Dashboard",icon:LayoutDashboard,href:"/"},{label:"Empreendimentos",icon:Building2,href:"/empreendimentos"},{label:"Databook",icon:Archive,href:"/databook"},{label:"Manuais",icon:BookOpen,href:"/manuais"}]

export function Sidebar({open=false,onClose}:{open?:boolean;onClose?:()=>void}){
  const pathname=usePathname()
  const [context,setContext]=useState<Context|null>(null)
  const [userMenu,setUserMenu]=useState(false)
  const [signingOut,setSigningOut]=useState(false)
  useEffect(()=>{const refresh=()=>{void fetch("/api/organization/context",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(setContext).catch(()=>undefined)};refresh();window.addEventListener("dg-organization-updated",refresh);return()=>window.removeEventListener("dg-organization-updated",refresh)},[])
  const initials=context?.organization.initials||context?.organization.name.split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join("").toUpperCase()||"CO"
  const nav=(item:(typeof primary)[number])=>{const Icon=item.icon;const active=item.href==="/"?pathname==="/":pathname.startsWith(item.href);return <Link key={item.href} href={item.href} onClick={onClose} className={cn("flex min-h-10 w-full items-center justify-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",active?"bg-sidebar-primary text-sidebar-primary-foreground shadow-sm":"text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}><Icon className="h-[17px] w-[17px] shrink-0"/><span>{item.label}</span></Link>}
  async function logout(){setSigningOut(true);await signOut({fetchOptions:{onSuccess:()=>{window.location.href="/sign-in"}}})}
  const settingsActive=pathname.startsWith("/configuracoes")
  return <><div className={cn(open?"fixed inset-0 z-40 bg-black/40 lg:hidden":"hidden")} onClick={onClose}/>
    <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col bg-sidebar text-sidebar-foreground shadow-xl transition-transform lg:static lg:z-auto lg:w-64 lg:translate-x-0 lg:shadow-none",open?"translate-x-0":"-translate-x-full lg:flex")}>
      <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-md p-2 lg:hidden" aria-label="Fechar menu"><X className="h-4 w-4"/></button>
      <div className="flex min-h-20 items-center gap-3 border-b border-sidebar-border px-5 pr-12">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">{context?.organization.logo?<img src={context.organization.logo} alt={"Logo "+context.organization.name} className="h-full w-full object-contain"/>:initials}</div>
        <div className="min-w-0 leading-tight"><p className="truncate font-semibold text-sidebar-accent-foreground">{context?.organization.name||"Construtora"}</p><p className="truncate text-xs text-sidebar-foreground/60">Workspace</p></div>
      </div>
      <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-4"><p className="pb-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">Principal</p>{primary.map(nav)}{context?.role==="admin"&&nav({label:"Usuários",icon:Users,href:"/usuarios"})}</nav>
      <div className="px-4 pb-3">
        {context?.canSwitchOrganization&&<Link href="/selecionar-organizacao" onClick={onClose} className="flex min-h-10 w-full items-center justify-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><ArrowLeftRight className="h-[17px] w-[17px] shrink-0"/><span>Trocar construtora</span></Link>}
        {context?.role==="admin"&&<Link href="/configuracoes" onClick={onClose} className={cn("flex min-h-10 w-full items-center justify-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",settingsActive?"bg-sidebar-primary text-sidebar-primary-foreground shadow-sm":"text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}><Settings className="h-[17px] w-[17px] shrink-0"/><span>Configurações</span></Link>}
      </div>
      <div className="relative border-t border-sidebar-border p-4">
        <button type="button" onClick={()=>setUserMenu(v=>!v)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-sidebar-accent">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">{context?.user.image?<img src={context.user.image} alt="" className="h-full w-full object-cover"/>:(context?.user.name||"U").slice(0,2).toUpperCase()}</div>
          <div className="min-w-0 flex-1 leading-tight"><p className="truncate text-sm font-medium text-sidebar-accent-foreground">{context?.user.name||"Usuário"}</p><p className="truncate text-xs text-sidebar-foreground/60">{context?roleLabels[context.role]:""}</p></div><span className="text-xs text-sidebar-foreground/50">•••</span>
        </button>
        {userMenu&&<div className="absolute bottom-20 left-4 right-4 z-10 rounded-lg border border-sidebar-border bg-sidebar p-1 shadow-xl"><p className="truncate px-3 py-2 text-xs text-sidebar-foreground/60">{context?.user.email}</p><Link href="/perfil" onClick={onClose} className="block rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent">Meu perfil</Link><button type="button" onClick={()=>void logout()} disabled={signingOut} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent disabled:opacity-60"><LogOut className="h-4 w-4"/>{signingOut?"Saindo…":"Sair"}</button></div>}
      </div>
    </aside></>
}
