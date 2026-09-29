"use client"

import { Home, Building } from "lucide-react"
import { manualLabels, type ManualType } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

const options: { id: ManualType; icon: typeof Home }[] = [
  { id: "proprietario", icon: Home },
  { id: "sindico", icon: Building },
]

export function ManualSwitcher({
  value,
  onChange,
}: {
  value: ManualType
  onChange: (m: ManualType) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Tipo de manual">
      {options.map((opt) => {
        const Icon = opt.icon
        const isActive = value === opt.id
        const label = manualLabels[opt.id]
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.id)}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-4 text-left transition-colors",
              isActive
                ? "border-primary bg-primary/10 ring-1 ring-primary"
                : "border-border bg-card hover:border-primary/40 hover:bg-accent",
            )}
          >
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-md",
                isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{label.title}</span>
              <span className="block text-xs text-muted-foreground text-pretty">{label.subtitle}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
