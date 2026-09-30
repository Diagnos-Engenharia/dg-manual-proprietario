"use client"

import { useEffect,useState } from "react"
import { usePathname,useRouter } from "next/navigation"
import { listNotifications,markNotificationRead } from "@/app/actions/notifications"
import { Search,Bell,RefreshCw,Menu,ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

type NotificationItem={id:string;title:string;body:string;developmentId:string|null;reason:string|null}

export function Topbar({onMenu}:{onMenu?:()=>void}){
  const router=useRouter()
  const pathname=usePathname()
  const currentDevelopmentId=pathname.match(/^\/empreendimentos\/([^/]+)/)?.[1]??null
  const [now,setNow]=useState("")
  const [notifications,setNotifications]=useState<NotificationItem[]>([])
  const [open,setOpen]=useState(false)

  async function toggleNotifications(){
    const next=!open
    setOpen(next)
    if(next)try{setNotifications(await listNotifications())}catch{ /* Preserve the last successful notification list. */ }
  }

  async function openNotification(item:NotificationItem){
    const developmentId=item.developmentId??currentDevelopmentId
    if(!developmentId)return
    setNotifications(current=>current.filter(notification=>notification.id!==item.id))
    setOpen(false)
    void markNotificationRead(item.id).catch(()=>{})
    router.push("/empreendimentos/"+developmentId+"?modulo=elaboracao&aba=historico")
  }

  function notificationBody(item:NotificationItem){
    if(!item.reason)return item.body
    const suffix=" · "+item.reason
    return item.body.endsWith(suffix)?item.body.slice(0,-suffix.length):item.body
  }

  useEffect(()=>{void listNotifications().then(setNotifications).catch(()=>setNotifications([]))},[])
  useEffect(()=>{setNow(new Date().toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}))},[])

  return <header className="sticky top-0 z-20 grid h-16 grid-cols-[1fr_minmax(280px,560px)_1fr] items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
    <div className="flex items-center gap-2"><Button variant="ghost" size="icon" onClick={onMenu} aria-label="Abrir menu" className="lg:hidden"><Menu className="h-5 w-5"/></Button></div>
    <div className="relative hidden md:block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input type="search" placeholder="Buscar empreendimento..." className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm outline-none ring-ring/40 placeholder:text-muted-foreground focus:ring-2"/></div>
    <div className="flex items-center justify-end gap-2">
      {now&&<div className="mr-2 hidden items-center gap-2 text-xs text-muted-foreground xl:flex"><RefreshCw className="h-3.5 w-3.5"/><span>Atualizado {now}</span></div>}
      <div className="relative">
        <Button variant="outline" size="icon" aria-label="Notificações" className="relative" onClick={()=>void toggleNotifications()}><Bell className="h-4 w-4"/>{notifications.length>0&&<span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">{notifications.length}</span>}</Button>
        {open&&<div className="absolute right-0 top-12 z-50 w-[360px] rounded-lg border border-border bg-card p-3 shadow-xl">
          <p className="mb-2 text-sm font-semibold">Notificações</p>
          {notifications.length?notifications.map(item=>{
            const targetId=item.developmentId??currentDevelopmentId
            const body=notificationBody(item)
            return targetId?
              <button key={item.id} type="button" onClick={()=>void openNotification(item)} className="group flex w-full items-start gap-3 border-t border-border px-1 py-3 text-left first:border-t-0 hover:bg-accent/40">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{body}</p>
                  {item.reason&&<p className="mt-1.5 whitespace-pre-wrap text-xs text-foreground"><span className="font-medium text-destructive">Motivo:</span> {item.reason}</p>}
                  <p className="mt-2 text-[11px] font-medium text-primary">Ver no histórico</p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"/>
              </button>
              :<div key={item.id} className="border-t border-border py-3 first:border-t-0"><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{body}</p>{item.reason&&<p className="mt-1.5 whitespace-pre-wrap text-xs text-foreground"><span className="font-medium text-destructive">Motivo:</span> {item.reason}</p>}</div>
          }):<p className="py-4 text-sm text-muted-foreground">Nenhuma notificação.</p>}
        </div>}
      </div>
    </div>
  </header>
}
