/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Stage 26e - frontend mirror of user-service's AUDIT_REASON_CODES
 *        (src/constants/auditReasons.ts), for the reason dialog's dropdown and the audit log
 *        page's reason-code filter. The codes and their order must match the backend's list
 *        exactly; descriptions are transcribed verbatim from instructions.md Stage 26's "Preset
 *        codes" table. Flagged in the usage log that the two lists must be kept in sync.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Per author direction in chat - emptied EMAIL_UNMASK and USER_UNLOCK's preset code
 *        lists; those two actions no longer require a reason from the admin.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

// Maps the UI's action names (used by AdminUsers.jsx/AdminUserTransactions.jsx's row actions,
// and 'unmask' for the email eye icon) to the backend's AuditAction enum values.
export const ACTION_TO_AUDIT_ACTION = {
  suspend: 'USER_SUSPEND',
  unsuspend: 'USER_UNSUSPEND',
  promote: 'USER_PROMOTE',
  demote: 'USER_DEMOTE',
  unlock: 'USER_UNLOCK',
  unmask: 'EMAIL_UNMASK',
}

export const AUDIT_REASON_CODES = {
  USER_SUSPEND: [
    { code: 'FRAUD_OR_SCAM', label: 'Fraud or scam (fake errands, payment fraud, scamming other users)' },
    { code: 'HARASSMENT', label: 'Harassment (abusive messages or behaviour toward other users)' },
    { code: 'REPEATED_NO_SHOW', label: 'Repeated no-show (accepting errands and not completing them, repeatedly)' },
    { code: 'POLICY_VIOLATION', label: 'Policy violation (prohibited items or services, terms of use breach)' },
    { code: 'SUSPECTED_COMPROMISE', label: 'Suspected compromise (account appears hijacked; protective suspension)' },
    { code: 'USER_REQUEST', label: 'User request (user asked to deactivate temporarily)' },
    { code: 'OTHER', label: 'Other' },
  ],
  USER_UNSUSPEND: [
    { code: 'APPEAL_ACCEPTED', label: 'Appeal accepted (user appealed and the review found in their favour)' },
    { code: 'SUSPENSION_PERIOD_ENDED', label: 'Suspension period ended (a time-boxed suspension is complete)' },
    { code: 'ISSUE_RESOLVED', label: 'Issue resolved (e.g. a compromised account is secured, or a dispute is settled)' },
    { code: 'SUSPENDED_IN_ERROR', label: 'Suspended in error (wrong user or mistaken report)' },
    { code: 'USER_REQUEST', label: 'User request (user asked to reactivate after a self-requested suspension)' },
    { code: 'OTHER', label: 'Other' },
  ],
  USER_PROMOTE: [
    { code: 'APPOINTED_MODERATOR', label: 'Appointed moderator (approved addition to the admin or moderation team)' },
    { code: 'TEAM_MEMBER_ONBOARDING', label: 'Team member onboarding (project or ops team member needs admin access)' },
    { code: 'TEMPORARY_COVERAGE', label: 'Temporary coverage (covering for another admin; pair with a planned demote)' },
    { code: 'OTHER', label: 'Other' },
  ],
  USER_DEMOTE: [
    { code: 'ROLE_ENDED', label: 'Role ended (left the team or term finished)' },
    { code: 'TEMPORARY_ACCESS_EXPIRED', label: 'Temporary access expired (the coverage period is over)' },
    { code: 'MISCONDUCT', label: 'Misconduct (misuse of admin privileges)' },
    { code: 'SUSPECTED_COMPROMISE', label: 'Suspected compromise (admin account may be compromised)' },
    { code: 'LEAST_PRIVILEGE_REVIEW', label: "Least-privilege review (access review found admin isn't needed)" },
    { code: 'OTHER', label: 'Other' },
  ],
  // Per author direction (2026-11-06, see instructions.md Stage 26 "Reasons" amendment):
  // unlock and unmask no longer collect a reason, so these two actions have no codes left.
  EMAIL_UNMASK: [],
  USER_UNLOCK: [],
}

export const AUDIT_ACTIONS = [
  { value: 'USER_SUSPEND', label: 'Suspend' },
  { value: 'USER_UNSUSPEND', label: 'Unsuspend' },
  { value: 'USER_PROMOTE', label: 'Promote' },
  { value: 'USER_DEMOTE', label: 'Demote' },
  { value: 'EMAIL_UNMASK', label: 'Unmask email' },
  { value: 'USER_UNLOCK', label: 'Unlock' },
]

export const ACTION_LABELS = Object.fromEntries(AUDIT_ACTIONS.map((a) => [a.value, a.label]))

// The union of every action's codes, deduplicated, for the audit log page's reasonCode filter
// (which is not tied to a single action).
export const ALL_REASON_CODES = [
  ...new Map(
    Object.values(AUDIT_REASON_CODES)
      .flat()
      .map((entry) => [entry.code, entry]),
  ).values(),
]
