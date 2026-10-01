"use client"

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react"
import { normalizeFinishingData } from "@/lib/finishing-content"
import type { FinishingTableData } from "@/lib/finishing-types"

export type FinishingDraft = { data: FinishingTableData; fingerprint: string; sourceTableId?: string }
export type FinishingDrafts = Record<string, FinishingDraft>
export function finishingDraftStorageKey(actorId: string, developmentId: string) {
  return "dg:finishing-drafts:v1:" + encodeURIComponent(actorId) + ":" + encodeURIComponent(developmentId)
}
function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value) }
export function restoreFinishingDrafts(raw: string | null, permittedUnits: ReadonlySet<string>): { drafts: FinishingDrafts; invalid: boolean } {
  if (!raw) return { drafts: {}, invalid: false }
  if (raw.length > 8_000_000) throw new Error("Rascunhos da sessão excedem o limite de leitura")
  const envelope: unknown = JSON.parse(raw)
  if (!object(envelope) || envelope.version !== 1 || !object(envelope.drafts)) throw new Error("Rascunhos da sessão inválidos")
  const drafts: FinishingDrafts = {}
  let invalid = false
  for (const [id, entry] of Object.entries(envelope.drafts)) {
    if (!permittedUnits.has(id)) continue
    try {
      if (!object(entry) || typeof entry.fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(entry.fingerprint)) throw new Error("Revisão inválida")
      if (entry.sourceTableId !== undefined && (typeof entry.sourceTableId !== "string" || !entry.sourceTableId.trim() || entry.sourceTableId.length > 200)) throw new Error("Base inválida")
      drafts[id] = { data: normalizeFinishingData(entry.data), fingerprint: entry.fingerprint.toLowerCase(), ...(typeof entry.sourceTableId === "string" ? { sourceTableId: entry.sourceTableId } : {}) }
    } catch { invalid = true }
  }
  return { drafts, invalid }
}

/** Restore only after the server has identified the actor and authorized units. */
export function useFinishingDrafts(actorId: string | undefined, developmentId: string, unitIds: string[]) {
  const key = actorId ? finishingDraftStorageKey(actorId, developmentId) : null
  const [state, setState] = useState<{ key: string | null; drafts: FinishingDrafts }>({ key: null, drafts: {} })
  const stateRef = useRef(state), keyRef = useRef(key)
  const [storageWarning, setStorageWarning] = useState<{ key: string; message: string } | null>(null)
  keyRef.current = key
  const unitIdsKey = [...unitIds].sort().join("|")
  useEffect(() => {
    if (!key || stateRef.current.key === key) return
    let drafts: FinishingDrafts = {}
    try {
      const result = restoreFinishingDrafts(window.sessionStorage.getItem(key), new Set(unitIdsKey ? unitIdsKey.split("|") : []))
      drafts = result.drafts
      if (result.invalid) setStorageWarning({ key, message: "Alguns rascunhos desta sessão não puderam ser recuperados. Os dados salvos no servidor continuam disponíveis." })
      else setStorageWarning(null)
    } catch {
      setStorageWarning({ key, message: "Não foi possível recuperar os rascunhos desta sessão. Confira os dados salvos antes de continuar." })
    }
    stateRef.current = { key, drafts }; setState(stateRef.current)
  }, [key, unitIdsKey])
  // Persist synchronously so Back, URL navigation or reload cannot race an effect.
  const setDrafts = useCallback((action: SetStateAction<FinishingDrafts>) => {
    const currentKey = keyRef.current
    if (!currentKey || stateRef.current.key !== currentKey) return
    const drafts = typeof action === "function" ? action(stateRef.current.drafts) : action
    stateRef.current = { key: currentKey, drafts }; setState(stateRef.current)
    try {
      if (Object.keys(drafts).length) window.sessionStorage.setItem(currentKey, JSON.stringify({ version: 1, drafts }))
      else window.sessionStorage.removeItem(currentKey)
      setStorageWarning(null)
    } catch {
      setStorageWarning({ key: currentKey, message: "Não foi possível proteger os rascunhos nesta sessão do navegador. Salve a tabela antes de sair ou recarregar a página." })
    }
  }, [])
  const discard = useCallback(() => { setDrafts({}) }, [setDrafts])
  return { drafts: state.key === key ? state.drafts : {}, setDrafts, discard, restored: Boolean(key && state.key === key), storageWarning: storageWarning?.key === key ? storageWarning.message : null }
}
