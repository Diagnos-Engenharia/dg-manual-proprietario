"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type SaveState = "clean" | "dirty" | "saving" | "saved" | "error"

export function usePersistenceStatus<T>(value: T, save: (value: T, expectedUpdatedAt?: string) => Promise<{ updatedAt: string }>, options?: { debounceMs?: number; updatedAt?: string }) {
  const [state, setState] = useState<SaveState>("clean")
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [serverUpdatedAt, setServerUpdatedAt] = useState(options?.updatedAt)
  const latest = useRef(value)
  const saving = useRef(false)
  latest.current = value

  const persist = useCallback(async () => {
    if (saving.current) return
    saving.current = true
    setState("saving")
    setError(null)
    try {
      const result = await save(latest.current, serverUpdatedAt)
      setServerUpdatedAt(result.updatedAt)
      setSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))
      setState("saved")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar. Tente novamente.")
      setState("error")
    } finally {
      saving.current = false
    }
  }, [save, serverUpdatedAt])

  const persistRef = useRef(persist)
  const initialRender = useRef(true)
  persistRef.current = persist
  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false
      return
    }
    setState("dirty")
    const timer = window.setTimeout(() => void persistRef.current(), options?.debounceMs ?? 1000)
    return () => window.clearTimeout(timer)
  }, [value, options?.debounceMs])

  return { state, error, savedAt, persist, isSaving: state === "saving" }
}

export function PersistenceStatus({ state, savedAt, error, onRetry }: { state: SaveState; savedAt: string | null; error: string | null; onRetry: () => void }) {
  if (state === "dirty") return <span className="text-xs text-amber-600">Alterações não salvas</span>
  if (state === "saving") return <span className="text-xs text-muted-foreground">Salvando…</span>
  if (state === "error") return <span className="flex items-center gap-2 text-xs text-destructive">{error ?? "Erro ao salvar"}<button type="button" onClick={onRetry} className="font-medium underline">Tentar novamente</button></span>
  if (state === "saved" && savedAt) return <span className="text-xs text-emerald-600">Salvo às {savedAt}</span>
  return null
}
