"use client"

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <section style={{ maxWidth: 520, textAlign: "center" }}>
            <h1>DG Manual indisponível nesta tela</h1>
            <p>Ocorreu uma falha inesperada. Tente recarregar esta área.</p>
            <button type="button" onClick={reset} style={{ marginTop: 16, padding: "10px 16px", cursor: "pointer" }}>Tentar novamente</button>
          </section>
        </main>
      </body>
    </html>
  )
}
