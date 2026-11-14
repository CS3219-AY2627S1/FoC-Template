// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
// Scope: Stage 26b - AuditAction type and the backend-authoritative AUDIT_REASON_CODES preset
//        lists (one per audited action), moved out of auditLog.queries.ts so the controller can
//        import the codes without a circular dependency. The frontend keeps its own matching
//        constant (Stage 26e); the two must stay in sync - noted in the usage log.
//        No requirements, architecture, schema, or API decisions were made by the AI tool — see
//        instructions.md Stage 26's "Reasons" / "Preset codes" tables for the governing decision.
// Author review:
// 2026-11-06: Stage 26d - added AUDIT_ACTIONS (for the `action` query filter's valid-value
//   list) and ALL_REASON_CODES (the union of every action's codes, for the `reasonCode`
//   filter, which is not tied to a single action).
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-06: Per author direction in chat - emptied EMAIL_UNMASK and USER_UNLOCK's preset
//   code lists; those two actions no longer require a reason from the admin.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:

export type AuditAction =
  | "USER_PROMOTE"
  | "USER_DEMOTE"
  | "USER_SUSPEND"
  | "USER_UNSUSPEND"
  | "EMAIL_UNMASK"
  | "USER_UNLOCK";

export const AUDIT_ACTIONS: readonly AuditAction[] = [
  "USER_PROMOTE",
  "USER_DEMOTE",
  "USER_SUSPEND",
  "USER_UNSUSPEND",
  "EMAIL_UNMASK",
  "USER_UNLOCK",
];

export const AUDIT_REASON_CODES: Record<AuditAction, readonly string[]> = {
  USER_SUSPEND: [
    "FRAUD_OR_SCAM",
    "HARASSMENT",
    "REPEATED_NO_SHOW",
    "POLICY_VIOLATION",
    "SUSPECTED_COMPROMISE",
    "USER_REQUEST",
    "OTHER",
  ],
  USER_UNSUSPEND: [
    "APPEAL_ACCEPTED",
    "SUSPENSION_PERIOD_ENDED",
    "ISSUE_RESOLVED",
    "SUSPENDED_IN_ERROR",
    "USER_REQUEST",
    "OTHER",
  ],
  USER_PROMOTE: ["APPOINTED_MODERATOR", "TEAM_MEMBER_ONBOARDING", "TEMPORARY_COVERAGE", "OTHER"],
  USER_DEMOTE: [
    "ROLE_ENDED",
    "TEMPORARY_ACCESS_EXPIRED",
    "MISCONDUCT",
    "SUSPECTED_COMPROMISE",
    "LEAST_PRIVILEGE_REVIEW",
    "OTHER",
  ],
  // Per author direction (2026-11-06, see instructions.md Stage 26 "Preset codes"): unlock and
  // unmask no longer collect a reason from the admin, so these two actions have no codes left.
  EMAIL_UNMASK: [],
  USER_UNLOCK: [],
};

export const ALL_REASON_CODES: readonly string[] = [
  ...new Set(AUDIT_ACTIONS.flatMap((action) => AUDIT_REASON_CODES[action])),
];
