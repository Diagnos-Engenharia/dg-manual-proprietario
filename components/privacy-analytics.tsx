"use client"

import { Analytics } from "@vercel/analytics/next"
import { analyticsUrlAllowed } from "@/lib/analytics-privacy"

export function PrivacyAnalytics() {
  return <Analytics beforeSend={event => analyticsUrlAllowed(event.url) ? event : null} />
}
