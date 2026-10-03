"use client"

import { useCallback, useEffect, useReducer, useRef } from "react"
import type { ManualPreview } from "@/lib/manual-document/types"
import type { FinishingUnitSummary, UnitCatalog } from "@/lib/finishing-types"
import type { EditorialAction, EditorialData } from "./section-inspector"
import type { ManualVersion } from "./version-history"

export type DocumentType = "proprietario" | "sindico" | "acabamentos"
type Compilation = { id: string; filename: string; revision: number; pages: number }
type DataState = {
  units: FinishingUnitSummary[]; unitsLoaded: boolean; preview: ManualPreview | null
  editorial: EditorialData | null; versions: ManualVersion[]; loading: boolean
  operation: "idle" | "updating" | "compiling"; error: string | null; success: Compilation | null
}
const initialState: DataState = { units: [], unitsLoaded: false, preview: null, editorial: null, versions: [], loading: false, operation: "idle", error: null, success: null }
type DataAction = { type: "patch"; value: Partial<DataState> } | { type: "scope"; developmentChanged: boolean }
function reducer(state: DataState, action: DataAction): DataState {
  if (action.type === "patch") return { ...state, ...action.value }
  return { ...initialState, ...(!action.developmentChanged ? { units: state.units, unitsLoaded: state.unitsLoaded } : {}) }
}
async function readJson<T>(response: Response): Promise<T> {
  let data: T & { error?: string }
  try { data = await response.json() as T & { error?: string } } catch { throw new Error(response.status === 401 ? "Sua sessão expirou." : "O servidor não retornou uma resposta válida.") }
  if (!response.ok) throw new Error(data.error ?? (response.status === 401 ? "Sua sessão expirou." : "Não foi possível concluir a solicitação."))
  return data
}

/** Owns server state and all mutations. Responses may update only their target. */
export function useCompilerData({ developmentId, manual, unitId, role, onCompiled }: {
  developmentId?: string; manual: DocumentType; unitId: string | null
  role: "admin" | "editor" | "validator"; onCompiled: () => void
}) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const loadController = useRef<AbortController | null>(null)
  const operationController = useRef<AbortController | null>(null)
  const mutationScope = useRef<string | null>(null)
  const loadSequence = useRef(0), operationSequence = useRef(0)
  const previousDevelopment = useRef(developmentId)
  const scope = (developmentId ?? "") + ":" + manual + (manual === "acabamentos" ? ":" + (unitId ?? "") : "")
  const currentScope = useRef(scope)
  currentScope.current = scope

  const load = useCallback(async () => {
    if (!developmentId) return
    const requestScope = developmentId + ":" + manual + (manual === "acabamentos" ? ":" + (unitId ?? "") : "")
    const sequence = ++loadSequence.current
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller
    const isCurrent = () => !controller.signal.aborted && sequence === loadSequence.current && currentScope.current === requestScope
    dispatch({ type: "patch", value: { loading: true, error: null } })
    const body = JSON.stringify({ developmentId, manualType: manual, ...(manual === "acabamentos" ? { unitId } : {}) })
    const query = "?" + new URLSearchParams({ developmentId, manualType: manual, ...(manual === "acabamentos" && unitId ? { unitId } : {}) })
    const sourceRequest = manual === "acabamentos"
      ? fetch("/api/finishing/units?" + new URLSearchParams({ developmentId }), { signal: controller.signal, cache: "no-store" }).then(response => readJson<UnitCatalog>(response))
      : fetch("/api/manuals/editorial" + query, { signal: controller.signal }).then(response => readJson<EditorialData>(response))
    if (manual === "acabamentos" && !unitId) {
      try {
        const catalog = await sourceRequest as UnitCatalog
        if (isCurrent()) dispatch({ type: "patch", value: { units: catalog.units, unitsLoaded: true } })
      } catch (cause) {
        if (isCurrent()) dispatch({ type: "patch", value: { error: cause instanceof Error ? cause.message : "Não foi possível carregar as unidades." } })
      } finally { if (isCurrent()) dispatch({ type: "patch", value: { loading: false } }) }
      return
    }
    const [documentResult, versionsResult, editorialResult] = await Promise.allSettled([
      fetch("/api/manuals/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal }).then(response => readJson<ManualPreview>(response)),
      fetch("/api/manuals/versions" + query, { signal: controller.signal }).then(response => readJson<{ versions: ManualVersion[] }>(response)), sourceRequest,
    ])
    if (!isCurrent()) return
    const value: Partial<DataState> = { loading: false }
    const failures: string[] = []
    if (documentResult.status === "fulfilled") value.preview = documentResult.value
    else failures.push(documentResult.reason instanceof Error ? documentResult.reason.message : "Não foi possível atualizar o preview.")
    if (versionsResult.status === "fulfilled") value.versions = versionsResult.value.versions ?? []
    else failures.push("Não foi possível carregar o histórico de versões.")
    if (editorialResult.status === "fulfilled") {
      if (manual === "acabamentos") {
        const catalog = editorialResult.value as UnitCatalog
        value.units = catalog.units; value.unitsLoaded = true
        value.editorial = { sections: {}, canEdit: catalog.canEdit, canValidate: catalog.canValidate }
      } else value.editorial = editorialResult.value as EditorialData
    } else failures.push(manual === "acabamentos" ? "Não foi possível carregar as unidades." : "Não foi possível carregar os textos para edição e revisão.")
    value.error = failures.length ? failures.join(" ") : null
    dispatch({ type: "patch", value })
  }, [developmentId, manual, unitId])

  useEffect(() => {
    dispatch({ type: "scope", developmentChanged: previousDevelopment.current !== developmentId })
    previousDevelopment.current = developmentId
    mutationScope.current = null
    operationController.current?.abort(); operationSequence.current++
    void load()
    return () => { loadController.current?.abort(); operationController.current?.abort() }
  }, [load, developmentId])

  async function scopedAction(url: string, body: Record<string, unknown>) {
    const actionScope = scope
    if (mutationScope.current === actionScope) throw new Error("Aguarde a conclusão da atualização em andamento.")
    mutationScope.current = actionScope
    const controller = new AbortController(), sequence = ++operationSequence.current
    operationController.current = controller
    dispatch({ type: "patch", value: { operation: "updating" } })
    try {
      await readJson(await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal }))
      if (currentScope.current === actionScope && sequence === operationSequence.current && !controller.signal.aborted) await load()
    } finally { if (currentScope.current === actionScope && sequence === operationSequence.current) { mutationScope.current = null; dispatch({ type: "patch", value: { operation: "idle" } }) } }
  }
  async function editorialAction(action: EditorialAction) { await scopedAction("/api/manuals/editorial", { ...action, developmentId, manualType: manual }) }
  async function transition(id: string, status: string) { await scopedAction("/api/manuals/versions/status", { id, status }) }
  async function compile() {
    const { preview } = state
    if (!developmentId || !preview?.readiness.ok || state.loading || state.operation !== "idle" || mutationScope.current === scope || role === "validator") return
    const actionScope = scope, controller = new AbortController(), sequence = ++operationSequence.current
    operationController.current = controller; mutationScope.current = actionScope
    const isCurrent = () => currentScope.current === actionScope && sequence === operationSequence.current && !controller.signal.aborted
    dispatch({ type: "patch", value: { operation: "compiling", error: null, success: null } })
    try {
      const result = await readJson<Compilation>(await fetch("/api/manuals/compile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ developmentId, manualType: manual, ...(manual === "acabamentos" ? { unitId } : {}), previewFingerprint: preview.fingerprint }), signal: controller.signal }))
      if (!isCurrent()) return
      dispatch({ type: "patch", value: { success: result } }); await load()
      if (isCurrent()) onCompiled()
    } catch (cause) { if (isCurrent()) dispatch({ type: "patch", value: { error: cause instanceof Error ? cause.message : "Falha ao emitir o PDF." } }) }
    finally { if (currentScope.current === actionScope && sequence === operationSequence.current) { mutationScope.current = null; dispatch({ type: "patch", value: { operation: "idle" } }) } }
  }
  const setError = (error: string | null) => { if (currentScope.current === scope) dispatch({ type: "patch", value: { error } }) }
  return { ...state, scope, loading: state.loading, compiling: state.operation === "compiling", actionBusy: state.operation === "updating", load, editorialAction, transition, compile, setError }
}
