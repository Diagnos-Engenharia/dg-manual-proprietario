"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type SaveState = "clean" | "dirty" | "saving" | "saved" | "error"

export function usePersistenceStatus<T>(value: T, save: (value: T, expectedUpdatedAt?: string) => Promise<{ updatedAt: string }>, options?: { debounceMs?: number; updatedAt?: string; flushOnUnmount?: boolean }) {
  const [state, setState] = useState<SaveState>("clean")
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const serverUpdatedAt = useRef(options?.updatedAt)
  const latest = useRef(value)
  const inFlight = useRef<Promise<void> | null>(null)
  const saveError = useRef<Error | null>(null)
  const savedValue = useRef(value)
  latest.current = value

  const persist = useCallback(async () => {
    if (inFlight.current) return inFlight.current
    if (savedValue.current === latest.current) return
    setState("saving")
    setError(null)
    saveError.current = null
    const task = (async () => { try {
      const submitted = latest.current
      const result = await save(submitted, serverUpdatedAt.current)
      savedValue.current = submitted
      serverUpdatedAt.current = result.updatedAt
      setSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))
      setState("saved")
    } catch (cause) {
      saveError.current = cause instanceof Error ? cause : new Error("Não foi possível salvar. Tente novamente.")
      setError(saveError.current.message)
      setState("error")
    } finally {
      inFlight.current = null
      if (!saveError.current && savedValue.current !== latest.current) void persistRef.current()
    } })()
    inFlight.current = task
    return task
  }, [save])

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

  useEffect(() => () => {
    if (options?.flushOnUnmount && savedValue.current !== latest.current) void persistRef.current()
  }, [options?.flushOnUnmount])

  const flush = useCallback(async () => {
    do {
      await persistRef.current()
      if (saveError.current) throw saveError.current
    } while (savedValue.current !== latest.current || inFlight.current)
  }, [])

  return { state, error, savedAt, persist, flush, isSaving: state === "saving" }
}

export function PersistenceStatus({ state, savedAt, error, onRetry }: { state: SaveState; savedAt: string | null; error: string | null; onRetry: () => void }) {
  if (state === "dirty") return <span className="text-xs text-amber-600">Alterações não salvas</span>
  if (state === "saving") return <span className="text-xs text-muted-foreground">Salvando…</span>
  if (state === "error") return <span className="flex items-center gap-2 text-xs text-destructive">{error ?? "Erro ao salvar"}<button type="button" onClick={onRetry} className="font-medium underline">Tentar novamente</button></span>
  if (state === "saved" && savedAt) return <span className="text-xs text-emerald-600">Salvo às {savedAt}</span>
  return null
}
