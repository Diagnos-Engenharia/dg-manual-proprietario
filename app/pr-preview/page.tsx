import { notFound } from "next/navigation"
import { ChecklistDualScopePreview } from "@/components/pr-preview/checklist-dual-scope-preview"

export const dynamic = "force-dynamic"

export default function PrPreviewPage() {
  if (process.env.VERCEL_ENV !== "preview") notFound()
  return <ChecklistDualScopePreview />
}
