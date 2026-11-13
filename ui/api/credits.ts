// AI-assisted (Claude Opus 5.5), 2026-11-12: merge with main, keep restored-balance label and show it in history; see ui/ai-usage/usage-log.md, entry 004
// AI Assistance Disclosure: ChatGPT (Codex, GPT-6), 2026-11-12.
// Scope: UI order editing, credit-history details, confirmation wrapping, and regression checks.
// Human review pending. Exact prompts and verification: ui/ai-usage/ui-order-fix.md.
// AI-assisted (Claude), reviewed and tested by Maliha
import { api } from "./client"

export type Balance = {
  userId: string
  totalCredits: number
  reservedCredits: number   // held for my open requests
  availableCredits: number  // what I can still spend
}

export type CreditEntry = {
  id: string
  orderId: string | null
  type: "INITIAL_GRANT" | "BALANCE_RESTORED" | "RESERVED" | "RESERVATION_UPDATED" | "RELEASED" | "TRANSFER_OUT" | "TRANSFER_IN"
  totalAmountChange: number
  totalReservedChange: number
  createdAt: string
}

export const getBalance = () => api<Balance>("/credits/me/balance")

// newest first; nextPageToken is null on the last page
export const getCreditHistory = (pageSize = 10, pageToken?: string) => {
  const query = new URLSearchParams({ pageSize: String(pageSize) })
  if (pageToken) query.set("pageToken", pageToken)
  return api<{ entries: CreditEntry[]; nextPageToken: string | null }>(`/credits/me/history?${query}`)
}

const LABELS: Record<CreditEntry["type"], string> = {
  INITIAL_GRANT:       "Welcome credits",
  // re-registered after deleting the account, old balance comes back
  BALANCE_RESTORED:    "Balance restored from your old account",
  RESERVED:            "Reserved for transaction",
  RESERVATION_UPDATED: "Request credits changed",
  RELEASED:            "Returned from a cancelled request",
  TRANSFER_OUT:        "Paid a courier",
  TRANSFER_IN:         "Paid for a completed request",
}

export const creditLabel = (entry: CreditEntry) => LABELS[entry.type] ?? entry.type

// Holding and returning credits doesn't change the total, only the reserved
// part, so show that change for those
export const creditChange = (entry: CreditEntry) =>
  entry.totalAmountChange !== 0 ? entry.totalAmountChange : -entry.totalReservedChange

// Reservations and order edits stay on the order. History only records money
// that actually moved: paying a courier, or being paid for a completed request.
const VISIBLE_CREDIT_TYPES = new Set<CreditEntry["type"]>(["INITIAL_GRANT", "BALANCE_RESTORED", "TRANSFER_OUT", "TRANSFER_IN"])

export function visibleCreditHistory(entries: CreditEntry[]): CreditEntry[] {
  return entries.filter(entry => VISIBLE_CREDIT_TYPES.has(entry.type))
}

// Reservation rows can fill a raw page, so keep reading until the visible
// payments fill the list or the ledger ends.
export async function loadVisibleCreditHistory(limit = 10): Promise<CreditEntry[]> {
  const visible: CreditEntry[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 20 && visible.length < limit; page++) {
    const result = await getCreditHistory(50, pageToken)
    visible.push(...visibleCreditHistory(result.entries))
    if (!result.nextPageToken) break
    pageToken = result.nextPageToken
  }
  return visible.slice(0, limit)
}

export function creditDescription(entry: CreditEntry, orders: { id: string; description: string; pickupStore: string }[]) {
  const label = creditLabel(entry)
  if (!entry.orderId) return label
  const order = orders.find(order => order.id === entry.orderId)
  const detail = order
    ? [order.pickupStore, order.description].filter(Boolean).join(" — ")
    : ""
  return detail ? `${label} — ${detail}` : label
}
