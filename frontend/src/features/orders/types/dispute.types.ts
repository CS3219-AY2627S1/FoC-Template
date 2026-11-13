export type DisputeStatus =
  'OPEN' | 'PROCESSING' | 'RESOLVED' | 'NEEDS_ATTENTION'
export type DisputeDecision = 'PAY_COURIER' | 'RELEASE_CREDITS' | 'DISMISS'
export type OrderDispute = {
  id: string
  orderId: string
  reporterId: string
  complaint: string
  responderId: string | null
  response: string | null
  respondedAt: string | null
  status: DisputeStatus
  decision: DisputeDecision | null
  explanation: string | null
  adminId: string | null
  createdAt: string
  decidedAt: string | null
  resolvedAt: string | null
  settlementOperationId: string | null
  settlementOutcome: string | null
}
export type DisputePage = {
  items: Array<OrderDispute>
  total: number
  page: number
  size: number
}
