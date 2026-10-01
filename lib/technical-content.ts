import type { ChecklistItem, MaintenanceItem, ManualType } from "./mock-data"

export type TechnicalSection = "sistemas" | "manutencao"
export type TechnicalAction = "save" | "submit" | "approve" | "reject"
export type TechnicalStatus = "rascunho" | "aguardando_validacao" | "aprovado" | "reprovado"
export type TechnicalSystem = {
  item: ChecklistItem
  key: string
  html: string
  maintenance: MaintenanceItem[]
  descriptionStatus: TechnicalStatus
  maintenanceStatus: TechnicalStatus
  descriptionComment: string | null
  maintenanceComment: string | null
  descriptionFingerprint: string
  maintenanceFingerprint: string
}
export type TechnicalCatalog = { systems: TechnicalSystem[]; canEdit: boolean; canValidate: boolean }
export type TechnicalSystemDraft = { html?: string; maintenance?: MaintenanceItem[] }
export type TechnicalMutation = {
  developmentId: string
  manualType: ManualType
  contextKey: string
  section: TechnicalSection
  action: TechnicalAction
  expectedFingerprint: string
  html?: string
  maintenance?: MaintenanceItem[]
  comment?: string
}
