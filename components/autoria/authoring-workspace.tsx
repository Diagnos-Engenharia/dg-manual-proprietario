"use client"

import { useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useDevelopmentStore } from "@/lib/store"
import {
  CheckCircle2,
  Lock,
  Users,
  ClipboardCheck,
  CircleDot,
  FileText,
  Droplets,
  PencilLine,
  ListChecks,
  Contact,
  Boxes,
  HardHat,
} from "lucide-react"
import {
  tabStatusLabels,
  formatDateTime,
  manualLabels,
  computeExecucaoObra,
  linkedSystemItems,
  checklistItemMatchesScope,
  type TabStatus,
  type ApprovalLog,
  type ManualType,
  type ChecklistItem,
  type ChecklistStatus,
} from "@/lib/mock-data"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ManualSwitcher } from "@/components/autoria/manual-switcher"
import { ChecklistInicial } from "@/components/autoria/checklist-inicial"
import { ProjetistasFornecedores } from "@/components/autoria/projetistas-fornecedores"
import { SistemasConstrutivos } from "@/components/autoria/sistemas-construtivos"
import { FichaTecnica } from "@/components/autoria/ficha-tecnica"
import { Comissionamento } from "@/components/autoria/comissionamento"
import { TabelaAcabamentos } from "@/components/autoria/tabela-acabamentos"
import { cn } from "@/lib/utils"
import { canTransition, type WorkflowRole, type WorkflowState } from "@/lib/workflow"
import type { ManualContent } from "@/lib/manual-content"
import { PersistenceStatus } from "@/hooks/use-persistence-status"
import { saveDevelopmentModulePath } from "@/app/actions/developments"

type SubTabId = "ficha" | "checklist" | "sistemas" | "acabamentos" | "comissionamento" | "contatos"

const subTabs: { id: SubTabId; label: string; icon: typeof ListChecks }[] = [
  { id: "ficha", label: "Ficha técnica", icon: FileText },
  { id: "checklist", label: "Checklist Inicial", icon: ListChecks },
  { id: "sistemas", label: "Sistemas Construtivos", icon: Boxes },
  { id: "acabamentos", label: "Tabela de Acabamentos", icon: FileText },
  { id: "comissionamento", label: "Comissionamento", icon: Droplets },
  { id: "contatos", label: "Projetistas e Fornecedores", icon: Contact },
]

const initialStatuses: Record<SubTabId, TabStatus> = {
  ficha: "em_revisao",
  checklist: "em_revisao",
  sistemas: "rascunho",
  acabamentos: "rascunho",
  comissionamento: "rascunho",
  contatos: "aprovado",
}

const initialAssignees: Record<SubTabId, string[]> = {
  ficha: ["u-rafael"],
  checklist: ["u-marcos", "u-patricia"],
  sistemas: ["u-helena"],
  acabamentos: [],
  comissionamento: ["u-marcos"],
  contatos: ["u-marcos"],
}

const statusStyles: Record<TabStatus, string> = {
  rascunho: "bg-muted text-muted-foreground border-border",
  em_revisao: "bg-warning/10 text-warning-foreground border-warning/30",
  aprovado: "bg-success/10 text-success border-success/30",
}

const statusIcons: Record<TabStatus, typeof CircleDot> = {
  rascunho: PencilLine,
  em_revisao: CircleDot,
  aprovado: CheckCircle2,
}

export function AuthoringWorkspace({ role, developmentId }: { role: "admin" | "editor" | "validator"; developmentId: string }) {
  const development = useDevelopmentStore((state) => state.developments[developmentId])
  const searchParams = useSearchParams()
  const updateChecklistItem = useDevelopmentStore((state) => state.updateChecklistItem)
  const [manual, setManual] = useState<ManualType>(searchParams.get("manual") === "sindico" ? "sindico" : "proprietario")
  const workflowRole: WorkflowRole = role === "admin" ? "admin_dg" : role === "validator" ? "revisor" : "editor"
  const [activeTab, setActiveTab] = useState<SubTabId>("checklist")
  const [statusesByManual, setStatusesByManual] = useState<Record<ManualType, Record<SubTabId, TabStatus>>>(() => {
    const saved = development?.manuals as Partial<Record<ManualType, ManualContent>> | undefined
    return {
      proprietario: { ...initialStatuses, ...saved?.proprietario?.workflow?.statuses } as Record<SubTabId, TabStatus>,
      sindico: { ...initialStatuses, ...saved?.sindico?.workflow?.statuses } as Record<SubTabId, TabStatus>,
    }
  })
  const statuses = statusesByManual[manual]
  function setStatuses(update: (prev: Record<SubTabId, TabStatus>) => Record<SubTabId, TabStatus>) {
    setStatusesByManual((prev) => ({ ...prev, [manual]: update(prev[manual]) }))
  }
  const updateDevelopment = useDevelopmentStore((state) => state.updateDevelopment)
  const checklistQueue = useRef(Promise.resolve())
  const [checklistSaving, setChecklistSaving] = useState(false)
  const [checklistError, setChecklistError] = useState<string | null>(null)
  const [assignees] = useState<Record<SubTabId, string[]>>({ ficha: [], checklist: [], sistemas: [], acabamentos: [], comissionamento: [], contatos: [] })
  const [logs, setLogs] = useState<ApprovalLog[]>([])
  const checklist = development?.checklist ?? []
  const manualScope = manual === "proprietario" ? "unidade" : "comum"
  const scopedChecklist = useMemo(() => checklist.filter((item) => checklistItemMatchesScope(item, manualScope)), [checklist, manualScope])
  const persistedManual = development?.manuals?.[manual] as ManualContent | undefined
  const persistedSystemContents = persistedManual?.sistemas ?? {}

  const status = statuses[activeTab]
  const workflowStatus = status as WorkflowState
  const isApproved = status === "aprovado"
  const canEdit = workflowRole === "editor" || workflowRole === "admin_dg"
  const canReview = workflowRole === "revisor" || workflowRole === "admin_dg"
  const canApprove = canTransition(workflowRole, workflowStatus, "aprovado") && workflowRole !== "editor"
  const StatusIcon = statusIcons[status]
  const activeLabel = subTabs.find((t) => t.id === activeTab)!.label

  // Execução da obra contabilizada automaticamente pelo checklist.
  const execucao = useMemo(() => computeExecucaoObra(scopedChecklist), [scopedChecklist])
  // Itens vinculados que fluem para os Sistemas Construtivos.
  const linked = useMemo(() => linkedSystemItems(scopedChecklist), [scopedChecklist])

  function persistSharedChecklist(nextChecklist: ChecklistItem[]) {
    setChecklistSaving(true)
    setChecklistError(null)
    checklistQueue.current = checklistQueue.current.catch(() => {}).then(async () => {
      await saveDevelopmentModulePath(developmentId, ["checklist"], nextChecklist)
    }).catch((error) => setChecklistError(error instanceof Error ? error.message : "Falha ao salvar checklist"))
      .finally(() => setChecklistSaving(false))
  }

  function setStatus(id: string, s: ChecklistStatus) {
    const currentChecklist = useDevelopmentStore.getState().developments[developmentId].checklist
    const nextChecklist = currentChecklist.map((item) => item.id === id ? { ...item, status: s } : item)
    updateChecklistItem(developmentId, id, { status: s })
    persistSharedChecklist(nextChecklist)
  }

  function setScopes(id: string, scopes: ("unidade" | "comum")[]) {
    const currentChecklist = useDevelopmentStore.getState().developments[developmentId].checklist
    const target = currentChecklist.find((item) => item.id === id)
    if (!target || scopes.length === 0) return
    const nextChecklist = currentChecklist.map((item) => item.id === id ? { ...item, scopes } : item)
    updateChecklistItem(developmentId, id, { scopes })
    persistSharedChecklist(nextChecklist)
  }

  function approve() {
    if (!canApprove) return
    setStatuses((prev) => ({ ...prev, [activeTab]: "aprovado" }))
    const targetScope = activeTab === "checklist" || activeTab === "sistemas" ? manualScope : undefined
    if (targetScope) {
      checklist
        .filter((item) => item.status === "possui" && checklistItemMatchesScope(item, targetScope))
        .forEach((item) => updateChecklistItem(developmentId, item.id, {
          approvalStatusByScope: { ...item.approvalStatusByScope, [targetScope]: "aprovado" },
        }))
    }
    const nextChecklist = checklist.map((item) =>
      targetScope && item.status === "possui" && checklistItemMatchesScope(item, targetScope)
        ? { ...item, approvalStatusByScope: { ...item.approvalStatusByScope, [targetScope]: "aprovado" as const } }
        : item
    )
    const workflow = { statuses: { ...statuses, [activeTab]: "aprovado" }, assignees, logs: logs.slice(0, 10) }
    const current = useDevelopmentStore.getState().developments[developmentId]
    updateDevelopment(developmentId, { manuals: { ...current.manuals, [manual]: { ...persistedManual, workflow } } })
    persistSharedChecklist(nextChecklist)
    void saveDevelopmentModulePath(developmentId, ["manuals", manual, "workflow"], workflow)
      .catch((error) => setChecklistError(error instanceof Error ? error.message : "Falha ao salvar aprovação"))
    setLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        tabName: `${activeLabel} (${manualLabels[manual].title})`,
        user: role === "admin" ? "Administrador autenticado" : role === "validator" ? "Validador autenticado" : "Editor autenticado",
        action: "Aprovou e congelou a aba",
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ])
  }

  const manualInfo = manualLabels[manual]

  return (
    <div className="flex flex-col gap-6">
      {/* Seletor de manual duplo */}
      <div className="flex flex-wrap items-center justify-between gap-3"><ManualSwitcher value={manual} onChange={(next) => { if (next === "sindico" && activeTab === "acabamentos") setActiveTab("checklist"); setManual(next) }} /><Badge variant="outline" className="gap-2">Sessão: {role === "admin" ? "Administrador" : role === "validator" ? "Validador" : "Editor"}</Badge></div>

      {/* Barra de progresso — Execução da obra (auto pelo checklist) */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <HardHat className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold leading-tight">Execução da Obra</h3>
              <p className="text-xs text-muted-foreground text-pretty">
                Contabilizado automaticamente com base nos itens do checklist concluídos
              </p>
            </div>
          </div>
          <p className="font-mono text-2xl font-semibold tabular-nums text-primary">{execucao}%</p>
        </div>
        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${execucao}%` }}
          />
        </div>
      </Card>

      {/* Cabeçalho do manual ativo */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{manualInfo.title}</h2><Badge variant="outline" className="border-primary/30 text-primary">Escopo: {manualScope === "unidade" ? "Unidade privativa" : "Áreas comuns"}</Badge></div>
          <p className="text-sm text-muted-foreground">{manualInfo.subtitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{manual === "proprietario" ? "Uso, operação, manutenção e garantias da unidade privativa." : "Operação condominial, sistemas prediais, manutenção e emergências das áreas comuns."}</p>
        </div>
      </div>

      {/* Sub-abas */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-px">
        {subTabs.filter((tab) => manual === "proprietario" || tab.id !== "acabamentos").map((tab) => {
          const TabIcon = tab.icon
          const s = statuses[tab.id]
          const isActive = tab.id === activeTab
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <TabIcon className="h-4 w-4" />
              {tab.label}
              {tab.id === "sistemas" && (
                <Badge
                  variant="outline"
                  className="ml-0.5 border-primary/20 bg-primary/5 px-1.5 py-0 font-mono text-[10px] text-primary"
                >
                  {linked.length}
                </Badge>
              )}
              {s === "aprovado" && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
            </button>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Cabeçalho de status da aba */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">{activeLabel}</h3>
              <Badge variant="outline" className={cn("gap-1", statusStyles[status])}>
                <StatusIcon className="h-3 w-3" />
                {tabStatusLabels[status]}
              </Badge>
              {isApproved && (
                <Badge variant="outline" className="gap-1 border-border text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Edição congelada
                </Badge>
              )}
            </div>
            {!canEdit && !canReview && <p className="w-full rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">Você está visualizando esta aba em modo somente leitura.</p>}
            {isApproved ? (
              <Badge
                variant="outline"
                className="gap-1 border-success/30 bg-success/10 text-success"
              >
                <Lock className="h-3 w-3" />
                Aprovado
              </Badge>
            ) : canApprove ? (
              <Button onClick={approve} className="gap-1.5">
                <ClipboardCheck className="h-4 w-4" />
                Aprovar e congelar
              </Button>
            ) : canEdit ? (
              <Button variant="outline" onClick={() => setStatuses((prev) => ({ ...prev, [activeTab]: "em_revisao" }))} className="gap-1.5">
                <ClipboardCheck className="h-4 w-4" />
                Enviar para revisão
              </Button>
            ) : null}
          </div>

          {/* Conteúdo por aba */}
          {activeTab === "ficha" && <><Badge variant="outline" className="w-fit border-sky-500/30 text-sky-600">Conteúdo compartilhado entre os dois manuais</Badge><FichaTecnica developmentId={developmentId} disabled={isApproved || !canEdit} /></> }

          {activeTab === "checklist" && (
            <><ChecklistInicial items={checklist} scope={manualScope} onChangeStatus={setStatus} onChangeScopes={setScopes} disabled={isApproved || !canEdit} /><PersistenceStatus state={checklistError ? "error" : checklistSaving ? "saving" : "clean"} savedAt={null} error={checklistError} onRetry={() => persistSharedChecklist(checklist)} /></>
          )}

          {activeTab === "sistemas" && <SistemasConstrutivos key={manual} items={linked} scope={manualScope} disabled={isApproved || !canEdit} developmentId={developmentId} manual={manual} initialContents={persistedSystemContents} initialMaintenance={persistedManual?.manutencao} />}

          {activeTab === "acabamentos" && manual === "proprietario" && <TabelaAcabamentos developmentId={developmentId} disabled={isApproved || !canEdit} role={role} />}

          {activeTab === "comissionamento" && <Comissionamento disabled={isApproved || !canEdit} developmentId={developmentId} manual={manual} />}

          {activeTab === "contatos" && <><Badge variant="outline" className="w-fit border-sky-500/30 text-sky-600">Conteúdo compartilhado entre os dois manuais</Badge><ProjetistasFornecedores /></>}
        </div>

        {/* Painel lateral: responsáveis (RBAC) + log de validação */}
        <div className="flex flex-col gap-6">
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Responsáveis (RBAC)</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Permissão de edição/aprovação — <span className="font-medium">{activeLabel}</span>
            </p>
            <div className="mt-3 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">Os responsáveis são os usuários reais atribuídos à organização. Esta aba usa o papel da sessão atual: <span className="font-medium text-foreground">{role === "admin" ? "Administrador" : role === "validator" ? "Validador" : "Editor"}</span>.</div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Log de validação</h3>
            </div>
            <ol className="mt-3 flex flex-col gap-3">
              {logs.slice(0, 6).map((log) => (
                <li key={log.id} className="flex gap-3 text-sm">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div className="leading-tight">
                    <p>
                      <span className="font-medium">{log.user}</span> — {log.action.toLowerCase()}{" "}
                      <span className="font-medium">{log.tabName}</span>
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {formatDateTime(log.timestamp)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  )
}
