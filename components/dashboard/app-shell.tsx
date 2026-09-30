"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Topbar } from "@/components/dashboard/topbar"
import { cn } from "@/lib/utils"

export function AppShell({ title, description, actions, children }: { title: string; description: string; actions?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)
  const labels: Record<string, string> = { empreendimentos: "Empreendimentos", manuais: "Manuais", perfil: "Meu perfil", configuracoes:"Informações da construtora", equipe: "Equipe e acessos", integracao: "Integração" }
  return (
    <div className="flex min-h-svh bg-background">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6">
          <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 overflow-x-auto text-xs text-muted-foreground">
            <Link href="/" className="shrink-0 hover:text-foreground">Dashboard</Link>
            {segments.map((segment, index) => {
              const href = `/${segments.slice(0, index + 1).join("/")}`
              const label = labels[segment] ?? (segment === "[id]" ? "Empreendimento" : segment)
              return <span key={href} className="flex shrink-0 items-center gap-1"><ChevronRight className="h-3 w-3" /><Link href={href} className={cn("hover:text-foreground", index === segments.length - 1 && "text-foreground")} >{label}</Link></span>
            })}
          </nav>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div><h1 className="text-pretty text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
            {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
          </div>
          {children}
        </main>
      </div>
    </div>
  )
}

