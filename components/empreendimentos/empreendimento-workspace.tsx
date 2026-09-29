"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useDevelopmentStore, type DevelopmentRecord } from "@/lib/store"
import { checklistItems as officialChecklistItems } from "@/lib/mock-data"
import { CalendarClock, FileEdit, Palette, FileOutput, Briefcase } from "lucide-react"
import { cn } from "@/lib/utils"
import { ScheduleManager } from "@/components/cronograma/schedule-manager"
import { AuthoringWorkspace } from "@/components/autoria/authoring-workspace"
import { WhiteLabelStudio } from "@/components/white-label/white-label-studio"
import { Databook } from "@/components/databook/databook"
import { PdfCompiler } from "@/components/emissao/pdf-compiler"

const modules = [
  { id: "cronograma", label: "Cronograma", icon: CalendarClock },
  { id: "identidade", label: "Design do Manual", icon: Palette },
  { id: "elaboracao", label: "Elaboração", icon: FileEdit },
  { id: "databook", label: "DATABOOK", icon: Briefcase },
  { id: "emissao", label: "Emissão de PDF", icon: FileOutput },
] as const

type ModuleId = (typeof modules)[number]["id"]

type WorkspaceDatabookFile = { id: string; folder: string; name: string; pathname: string; contentType: string | null; sizeBytes: number; createdAt: string }

export function EmpreendimentoWorkspace({ role, developmentId, organizationName = "", organizationLogo = null, organizationMetadata = null, developmentSnapshot, persistedData, databookFiles }: { role: "admin" | "editor" | "validator"; developmentId: string; organizationName?: string; organizationLogo?: string | null; organizationMetadata?: string | null; developmentSnapshot: Omit<DevelopmentRecord, "checklist"> & { checklist?: unknown[] }; persistedData?: Record<string, unknown> | null; databookFiles?: WorkspaceDatabookFile[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const requestedModule = searchParams.get("modulo") as ModuleId | null
  const [active, setActive] = useState<ModuleId>(requestedModule && modules.some((module) => module.id === requestedModule) ? requestedModule : "cronograma")
  useEffect(() => {
    if (requestedModule && modules.some((module) => module.id === requestedModule)) setActive(requestedModule)
  }, [requestedModule])
  const selectModule = (module: ModuleId) => {
    setActive(module)
    const params = new URLSearchParams(searchParams.toString())
    params.set("modulo", module)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }
  const hydrateDevelopment = useDevelopmentStore((state) => state.hydrateDevelopment)
  useEffect(() => {
    const record = persistedData as { ficha?: unknown; schedule?: unknown; authoring?: unknown; identity?: unknown; brand?: unknown; manuals?: unknown; checklist?: unknown[] } | null
    const persistedChecklist = Array.isArray(record?.checklist) && record.checklist.length > 0 ? record.checklist : officialChecklistItems
    hydrateDevelopment({
      ...developmentSnapshot,
      checklist: persistedChecklist as DevelopmentRecord["checklist"],
      ...(record?.ficha ? { ficha: record.ficha as DevelopmentRecord["ficha"] } : {}),
      ...(record?.schedule ? { schedule: record.schedule as DevelopmentRecord["schedule"] } : {}),
      ...(record?.authoring && typeof record.authoring === "object" ? { authoring: record.authoring as Record<string, unknown> } : {}),
      ...(record?.identity && typeof record.identity === "object" ? { identity: record.identity as Record<string, unknown> } : {}),
      ...(record?.brand && typeof record.brand === "object" ? { identity: record.brand as Record<string, unknown> } : {}),
    })
  }, [developmentSnapshot, hydrateDevelopment, persistedData])
  const markHydrated = useDevelopmentStore((state) => state.markHydrated)
  const development = useDevelopmentStore((state) => state.developments[developmentId])
  useEffect(() => { markHydrated() }, [markHydrated])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {modules.map((mod) => {
          const Icon = mod.icon
          const isActive = active === mod.id
          return (
            <button
              key={mod.id}
              type="button"
              onClick={() => selectModule(mod.id)}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground",
              )}
              aria-current={isActive ? "true" : undefined}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{mod.label}</span>
            </button>
          )
        })}
      </div>

      <div>
        {active === "cronograma" && <ScheduleManager developmentId={developmentId} />}
        {active === "elaboracao" && <AuthoringWorkspace role={role} developmentId={developmentId} />}
        {active === "identidade" && <WhiteLabelStudio developmentId={developmentId} organizationName={organizationName} organizationLogo={organizationLogo} organizationMetadata={organizationMetadata} persistedIdentity={(persistedData as { identity?: unknown } | null)?.identity} />}
        {active === "databook" && <Databook developmentId={developmentId} persistedFiles={databookFiles} />}
        {active === "emissao" && <PdfCompiler developmentId={developmentId} role={role} />}
      </div>
    </div>
  )
}
