"use client"

type CoverProps = {
  template: string
  primary: string
  secondary: string
  logoUrl: string | null
  initials: string
  tenantName: string
}

function Logo({
  logoUrl,
  initials,
  bg,
}: {
  logoUrl: string | null
  initials: string
  bg: string
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl || "/placeholder.svg"}
        alt="Logo"
        className="h-10 max-w-[120px] object-contain"
      />
    )
  }
  return (
    <span
      className="flex h-10 w-10 items-center justify-center rounded-md text-xs font-bold text-white"
      style={{ backgroundColor: bg }}
    >
      {initials}
    </span>
  )
}

export function CoverPreview({
  template,
  primary,
  secondary,
  logoUrl,
  initials,
  tenantName,
}: CoverProps) {
  const aspect = "aspect-[3/4]"

  if (template === "classico") {
    return (
      <div
        className={`${aspect} overflow-hidden rounded-md border border-border bg-white shadow-sm`}
      >
        <div className="flex h-1/4 items-center px-4" style={{ backgroundColor: primary }}>
          <Logo logoUrl={logoUrl} initials={initials} bg={secondary} />
        </div>
        <div className="flex h-3/4 flex-col justify-between p-4">
          <div className="mt-6">
            <p className="text-[10px] uppercase tracking-widest" style={{ color: secondary }}>
              Manual do proprietário
            </p>
            <p className="mt-2 text-sm font-bold leading-tight text-zinc-800">
              Residencial Aurora
            </p>
          </div>
          <div className="border-t pt-2" style={{ borderColor: secondary }}>
            <p className="text-[9px] text-zinc-500">{tenantName}</p>
          </div>
        </div>
      </div>
    )
  }

  if (template === "minimalista") {
    return (
      <div
        className={`${aspect} flex flex-col justify-between overflow-hidden rounded-md border border-border bg-white p-5 shadow-sm`}
      >
        <Logo logoUrl={logoUrl} initials={initials} bg={primary} />
        <div>
          <div className="h-1 w-10 rounded" style={{ backgroundColor: primary }} />
          <p className="mt-3 text-[10px] uppercase tracking-widest text-zinc-400">
            Manual do proprietário
          </p>
          <p className="mt-1 text-base font-bold leading-tight text-zinc-800">
            Residencial Aurora
          </p>
          <p className="mt-4 text-[9px] text-zinc-500">{tenantName}</p>
        </div>
      </div>
    )
  }

  // moderno (padrão)
  return (
    <div
      className={`${aspect} relative overflow-hidden rounded-md border border-border bg-white shadow-sm`}
    >
      <div
        className="absolute inset-x-0 top-0 h-2/3"
        style={{
          background: `linear-gradient(135deg, ${primary} 60%, ${secondary} 60%)`,
        }}
      />
      <div className="relative flex h-full flex-col justify-between p-4">
        <div className="flex justify-center pt-8">
          <div className="rounded-md bg-white/95 p-2 shadow-sm">
            <Logo logoUrl={logoUrl} initials={initials} bg={primary} />
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-400">
            Manual do proprietário
          </p>
          <p className="mt-1 text-sm font-bold leading-tight text-zinc-800">
            Residencial Aurora
          </p>
          <p className="mt-2 text-[9px] text-zinc-500">{tenantName}</p>
        </div>
      </div>
    </div>
  )
}
