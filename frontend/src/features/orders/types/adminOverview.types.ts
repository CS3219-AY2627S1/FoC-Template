export type AdminOverviewOrderStatus =
  'REQUESTED' | 'ACCEPTED' | 'PICKED_UP' | 'DELIVERED' | 'CANCELLED'

/** Sample order summary for the Admin Overview preview. */
export type AdminOverviewOrderSummary = {
  id: number
  requester: string | null
  courier: string | null
  pickup: string
  status: AdminOverviewOrderStatus
  credits: number
}
