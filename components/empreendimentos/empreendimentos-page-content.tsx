"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DevelopmentsGrid } from "@/components/empreendimentos/developments-grid"
import { NewManualWizard } from "@/components/empreendimentos/new-manual-wizard"

type PersistedDevelopment = { id: string; name: string; client: string; status: string; deliveryDate: string; masterProgress: number; data: unknown }

export function EmpreendimentosPageContent({ persisted = [], organizationName,canCreate=true }: { persisted?: PersistedDevelopment[]; organizationName: string;canCreate?:boolean }) {
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(searchParams.get("novo") === "1")
  useEffect(() => { if (searchParams.get("novo") === "1") setOpen(true) }, [searchParams])
  return <>
    {canCreate&&<div className="mb-5 flex items-center justify-end"><Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" />Novo Manual</Button></div>}
    <DevelopmentsGrid items={persisted.length ? persisted.map((item) => ({ id: item.id, name: item.name, client: item.client, status: (item.status === "finalizado" || item.status === "pausado" ? item.status : "em_andamento") as "finalizado" | "pausado" | "em_andamento", deliveryDate: item.deliveryDate, masterProgress: item.masterProgress, units: Array.isArray((item.data as { units?: unknown[] } | null)?.units) ? (item.data as { units: unknown[] }).units : [] })) : undefined} />
    <NewManualWizard open={open && canCreate} onOpenChange={setOpen} organizationName={organizationName} />
  </>
}
