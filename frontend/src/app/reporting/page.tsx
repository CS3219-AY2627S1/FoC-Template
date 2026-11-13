/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated or updated frontend code for the team-specified report form, order association, navigation, and completion reminder.
 * Author review: I reviewed for correctness
 */
import type { Metadata } from "next"

import { ReportingHub, type ReportingTab } from "@/components/reporting/reporting-hub"
import { validReportCategory } from "@/lib/reporting"

export const metadata: Metadata = { title: "Reporting" }

export default async function ReportingPage({ searchParams }: PageProps<"/reporting">) {
  const query = await searchParams
  const category = typeof query.category === "string" ? query.category : undefined
  const orderId = typeof query.orderId === "string" ? query.orderId : undefined
  const requestedTab = typeof query.tab === "string" ? query.tab : undefined
  const initialTab: ReportingTab = requestedTab === "submitted" || requestedTab === "against-me" ? requestedTab : "create"
  return <ReportingHub initialTab={initialTab} initialCategory={validReportCategory(category)} initialOrderId={orderId} />
}
