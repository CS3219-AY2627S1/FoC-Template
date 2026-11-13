import type { Order } from '../pages/orders/models'

// HTTP contracts shared by the API client and case-review UI.
export type ResolutionAction = 'refund' | 'pay'
export type RepairAction = 'charge_reserved' | 'cover_reserved'
export type CaseAction = ResolutionAction | RepairAction
export type ReviewAction = CaseAction
export type ParticipantProfile = { user_id: string; email: string; username: string }
export type OrderReview = {
  order: Order
  diagnostics: CreditDiagnostics | null
  commands: CommandHistory[]
  audit: OrderAuditLog[]
  people: ParticipantProfile[]
  evidence_error: string | null
}
export type OrderAuditLog = {
  log_id: string
  order_id: string
  actor_id: string | null
  action: string
  reason: string | null
  created_at: string
}
export type CreditOperation = 'RESERVE' | 'RELEASE' | 'TRANSFER'
export type CreditRejectionReason = 'INSUFFICIENT_CREDITS' | 'RESERVATION_CONFLICT'
  | 'INVALID_OPERATION' | 'BALANCE_INCONSISTENT' | 'ACCOUNT_NOT_FOUND'
  | 'RESERVATION_NOT_FOUND' | 'ALREADY_TRANSFERRED' | 'ALREADY_RELEASED'
export type CreditResult = {
  request_id: string
  order_id: string
  operation: CreditOperation
} & (
  { outcome: 'SUCCEEDED'; reason: null }
  | { outcome: 'REJECTED'; reason: CreditRejectionReason }
)
type Repair = {
  action: RepairAction
  actor_id: string
  dispute_id: string
  rejected_request_id: string
  reason: string
}
export type CreditCommand = { request_id: string; order_id: string } & (
  { requester_id: string; amount: number }
  | { courier_id?: string; repair?: Repair }
)
export type CommandHistory = {
  request_id: string
  operation: CreditOperation
  command: CreditCommand
  result: CreditResult | null
  created_at: string
  published_at: string | null
  attempts: number
  last_error: string | null
}
export type CreditAccount = { user_id: string } & (
  { missing: true }
  | {
    missing: false
    available_credits: number
    reserved_credits: number
    active_reservation_total: number
    consistent: boolean
  }
)
export type FinancialAudit = {
  log_id: string
  user_id: string
  recipient_user_id: string | null
  order_id: string | null
  action: 'INITIAL_ALLOCATION' | CreditOperation | 'ADMIN_CHARGE_RESERVED' | 'ADMIN_COVER_RESERVED'
  amount: number
  created_at: string
  actor_id: string | null
  reason: string | null
  request_id: string | null
  before: Record<string, number> | null
  after: Record<string, number> | null
}
export type CreditDiagnostics = {
  order_id: string
  accounts: CreditAccount[]
  reservation: {
    order_id: string
    amount: number
    status: 'RESERVED' | 'RELEASED' | 'TRANSFERRED'
    user_id: string
    recipient_user_id: string | null
    created_at: string
    updated_at: string
  } | null
  commands: { command: CreditCommand; result: CreditResult }[]
  audit_logs: FinancialAudit[]
}
