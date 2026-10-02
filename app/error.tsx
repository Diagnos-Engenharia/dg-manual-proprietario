"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("app.error", error) }, [error])
  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <section className="w-full max-w-lg rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold">Não foi possível carregar esta área</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tente novamente. Se o problema continuar, a ocorrência já pode ser localizada pelos logs da aplicação.</p>
        <Button className="mt-5" onClick={reset}>Tentar novamente</Button>
      </section>
    </main>
  )
}
