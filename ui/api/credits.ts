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
  type: "INITIAL_GRANT" | "RESERVED" | "RESERVATION_UPDATED" | "RELEASED" | "TRANSFER_OUT" | "TRANSFER_IN"
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
  RESERVED:            "Held for a request",
  RESERVATION_UPDATED: "Request credits changed",
  RELEASED:            "Returned from a cancelled request",
  TRANSFER_OUT:        "Paid for a delivered request",
  TRANSFER_IN:         "Earned from a delivery",
}

export const creditLabel = (entry: CreditEntry) => LABELS[entry.type] ?? entry.type

// Holding and returning credits doesn't change the total, only the reserved
// part, so show that change for those
export const creditChange = (entry: CreditEntry) =>
  entry.totalAmountChange !== 0 ? entry.totalAmountChange : -entry.totalReservedChange