"use client"

import { useEffect, useState } from "react"
import { listNotifications } from "@/app/actions/notifications"
import { Search, Bell, RefreshCw, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Topbar({ onMenu }: { onMenu?: () => void }) {
  // Calculado só no cliente para evitar divergência de fuso na hidratação.
  const [now, setNow] = useState<string>("")
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; body: string }>>([])
  const [open, setOpen] = useState(false)
  useEffect(() => { void listNotifications().then((items) => setNotifications(items)).catch(() => setNotifications([])) }, [])

  useEffect(() => {
    setNow(
      new Date().toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    )
  }, [])

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2 lg:hidden">
        <Button variant="ghost" size="icon" onClick={onMenu} aria-label="Abrir menu"><Menu className="h-5 w-5" /></Button>
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">CO</div>
        <span className="font-mono text-sm font-semibold tracking-widest">Construtora</span>
      </div>

      <div className="relative hidden max-w-md flex-1 md:block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Buscar empreendimento, construtora ou unidade..."
          className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm outline-none ring-ring/40 placeholder:text-muted-foreground focus:ring-2"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {now && (
          <div className="mr-2 hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Atualizado {now}</span>
          </div>
        )}
        <div className="relative"><Button variant="outline" size="icon" aria-label="Notificações" className="relative" onClick={() => setOpen((value) => !value)}><Bell className="h-4 w-4" />{notifications.length > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">{notifications.length}</span>}</Button>{open && <div className="absolute right-0 top-12 z-50 w-80 rounded-lg border border-border bg-card p-3 shadow-xl"><p className="mb-2 text-sm font-semibold">Notificações</p>{notifications.length ? notifications.map((item) => <div key={item.id} className="border-t border-border py-2"><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.body}</p></div>) : <p className="py-4 text-sm text-muted-foreground">Nenhuma pendência nova.</p>}</div>}</div>
      </div>
    </header>
  )
}
