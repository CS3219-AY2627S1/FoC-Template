// Mirrors toPublicUser() in user-service/src/models/user.model.ts. Change both together.

export type Role = 'member' | 'administrator'

export type AccountState = 'PendingVerification' | 'Active' | 'Suspended'

export type PublicUser = {
  id: string
  fullName: string
  email: string
  username: string
  roles: Role[]
  state: AccountState
  // ISO date string, e.g. "2026-10-16T07:57:13.573Z"
  createdAt: string
}

// Mirrors toAccountSummary() in user-service/src/models/user.model.ts: one account inside another
// object, such as the administrator behind a state change. null in its place means it was deleted.
export type AccountSummary = {
  id: string
  fullName: string
  username: string
  state: AccountState
}

// F1.6.2: one suspension or reinstatement.
export type StateChange = {
  id: string
  from: AccountState
  to: AccountState
  reason: string
  actor: AccountSummary | null
  at: string
}

// Mirrors toAdminUser() in user-service/src/services/user.service.ts, newest change first.
export type AdminUser = PublicUser & {
  stateChanges: StateChange[]
}

export type ReportState = 'Open' | 'Dismissed' | 'Actioned'

export type ReportOutcome = 'Dismissed' | 'Actioned'

// Mirrors toAdminReport() in user-service/src/services/report.service.ts.
export type Report = {
  id: string
  reporter: AccountSummary | null
  reported: AccountSummary | null
  errandId: string
  reason: string
  state: ReportState
  filedAt: string
  decision: {
    by: AccountSummary | null
    justification: string
    decidedAt: string
  } | null
}

// Mirrors toFiledReport() in user-service/src/models/report.model.ts: what the reporter gets back.
export type FiledReport = {
  id: string
  reportedId: string
  errandId: string
  reason: string
  state: ReportState
  filedAt: string
}