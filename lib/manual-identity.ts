/** The persisted Design do Manual configuration, shared by the Studio and renderers. */
export type ManualIdentity = {
  inheritance: "organization" | "development"
  displayName: string
  tagline: string
  primary: string
  secondary: string
  accent: string
  surface: string
  text: string
  typography: string
  artDirection: string
  graphicStyle: string
  template: string
  chapterTemplate: string
  headerTemplate: string
  footerTemplate: string
  tableTemplate: string
  heroUrl: string | null
  developmentLogoUrl: string | null
  coBranding: "development" | "development-organization" | "organization"
  coBrandingOrder: "development-first" | "organization-first"
  coBrandingLayout: "horizontal" | "vertical"
  overlay: number
  calloutStyles: { atencoes: string; recomendacoes: string; garantias: string; avisos: string }
}

export const manualIdentityDefaults: ManualIdentity = {
  inheritance: "development", displayName: "Empreendimento", tagline: "Manual do Proprietário",
  primary: "#17324D", secondary: "#B59A70", accent: "#E8DED0", surface: "#F4F1EA", text: "#17202A",
  typography: "manrope-inter", artDirection: "signature", graphicStyle: "architectural",
  template: "Signature", chapterTemplate: "Number Focus", headerTemplate: "Brand",
  footerTemplate: "Document Control", tableTemplate: "Clean", heroUrl: null, developmentLogoUrl: null,
  coBranding: "development-organization", coBrandingOrder: "development-first", coBrandingLayout: "horizontal",
  overlay: 35, calloutStyles: { atencoes: "border", recomendacoes: "soft", garantias: "badge", avisos: "neutral" },
}

export function normalizeManualIdentity(value: unknown, displayName: string): ManualIdentity {
  const old = value && typeof value === "object" ? value as Partial<ManualIdentity> : {}
  const identity = { ...manualIdentityDefaults, ...old, displayName: old.displayName || displayName || manualIdentityDefaults.displayName, calloutStyles: { ...manualIdentityDefaults.calloutStyles, ...(old.calloutStyles ?? {}) } }
  for (const key of ["displayName", "tagline", "typography", "artDirection", "graphicStyle", "template", "chapterTemplate", "headerTemplate", "footerTemplate", "tableTemplate"] as const) {
    if(typeof identity[key] !== "string") identity[key] = manualIdentityDefaults[key]
  }
  if(!["manrope-inter","dm-sans-lora","inter-source","merriweather"].includes(identity.typography)) identity.typography = manualIdentityDefaults.typography
  for (const key of ["primary", "secondary", "accent", "surface", "text"] as const) {
    if (!/^#[\da-f]{6}$/i.test(identity[key])) identity[key] = manualIdentityDefaults[key]
  }
  identity.overlay = Math.min(100, Math.max(0, Number(identity.overlay) || 0))
  return identity
}

export function resolveManualIdentity(value: unknown, displayName: string, organizationMetadata?: string | null): ManualIdentity {
  const identity = normalizeManualIdentity(value, displayName)
  let metadata: Record<string, string> = {}
  try { const parsed = organizationMetadata ? JSON.parse(organizationMetadata) : {}; metadata = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {} } catch { /* Legacy empty metadata. */ }
  return identity.inheritance === "organization"
    ? normalizeManualIdentity({ ...identity, primary: metadata.primaryColor ?? "#2563EB", secondary: metadata.secondaryColor ?? identity.secondary, developmentLogoUrl: null }, displayName)
    : identity
}

export function manualFontUrls(typography: string) {
  switch (typography) {
    case "dm-sans-lora": return { body: "/fonts/lora-400.ttf", bold: "/fonts/lora-700.ttf", heading: "/fonts/dm-sans-700.ttf" }
    case "inter-source": return { body: "/fonts/source-sans-3-400.ttf", bold: "/fonts/source-sans-3-700.ttf", heading: "/fonts/inter-700.ttf" }
    case "merriweather": return { body: "/fonts/inter-400.ttf", bold: "/fonts/inter-700.ttf", heading: "/fonts/merriweather-700.ttf" }
    default: return { body: "/fonts/inter-400.ttf", bold: "/fonts/inter-700.ttf", heading: "/fonts/manrope-700.ttf" }
  }
}
