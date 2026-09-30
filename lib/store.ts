"use client"

import { create } from "zustand"
import { checklistItems as officialChecklistItems, type Development, type ChecklistItem, type SchedulePhase } from "@/lib/mock-data"
import type { TechnicalSheet } from "@/lib/progress"

export type DevelopmentRecord = Development & {
  ficha: TechnicalSheet
  checklist: ChecklistItem[]
  schedule: SchedulePhase[]
  risk: "normal" | "em_risco" | "atrasado"
  authoring?: Record<string, unknown>
  identity?: Record<string, unknown>
  manuals?: Record<string, unknown>
}

type Store = {
  developments: Record<string, DevelopmentRecord>
  hydrated: boolean
  markHydrated: () => void
  updateDevelopment: (id: string, patch: Partial<DevelopmentRecord>) => void
  hydrateDevelopment: (development: DevelopmentRecord) => void
  updateChecklistItem: (developmentId: string, itemId: string, patch: Partial<ChecklistItem>) => void
  createDevelopment: (input: { name: string; client: string; ficha: TechnicalSheet; schedule: SchedulePhase[] }) => string
}

const emptyChecklist = () => [] as ChecklistItem[]
const seeded: Record<string, DevelopmentRecord> = {}

export const useDevelopmentStore = create<Store>()((set) => ({
  developments: seeded,
  hydrated: false,
  markHydrated: () => set({ hydrated: true }),
  updateDevelopment: (id, patch) => set((state) => ({ developments: { ...state.developments, [id]: { ...state.developments[id], ...patch } } })),
  hydrateDevelopment: (development) => set((state) => ({ developments: { ...state.developments, [development.id]: development } })),
  updateChecklistItem: (developmentId, itemId, patch) => set((state) => {
    const development = state.developments[developmentId]
    if (!development) return state
    return { developments: { ...state.developments, [developmentId]: { ...development, checklist: development.checklist.map((item) => item.id === itemId ? { ...item, ...patch } : item) } } }
  }),
  createDevelopment: ({ name, client, ficha, schedule }) => {
    const id = `emp-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now()}`
    const development: DevelopmentRecord = { id, name, client, status: "em_andamento", deliveryDate: ficha.completionDate, masterProgress: 0, dia0: { sistemasConstrutivos: 0, fornecedores: 0 }, phases: schedule.map((stage) => ({ name: stage.name, weight: 25, progress: 0 })), units: [], ficha, checklist: emptyChecklist(), schedule, risk: "normal" }
    set((state) => ({ developments: { ...state.developments, [id]: development } }))
    return id
  },
}))

export function useHydratedDevelopmentStore() {
  const hydrated = useDevelopmentStore((state) => state.hydrated)
  return hydrated
}
