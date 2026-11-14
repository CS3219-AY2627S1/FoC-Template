/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Created the backend-code → frontend-text map, per instructions.md Stage 16b. Every
 *        code enumerated here was found by grepping user-service for `new AppError(` plus its
 *        two middleware-level codes (UNAUTHORIZED, FORBIDDEN) and the generic VALIDATION_ERROR
 *        / INTERNAL_ERROR from its global error handler (src/app.ts). `display` is the type
 *        each code uses by default: 'field' (inline under the specific field), 'banner'
 *        (whole-form), or 'toast' (background action). A screen may still choose a different
 *        display for a given code where its own spec says so (e.g. Login shows
 *        ACCOUNT_SUSPENDED in a banner, which matches the default here, but Login diverts
 *        ACCOUNT_NOT_VERIFIED to a redirect instead of showing it at all).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Reworded OTP_RESEND_LIMIT to name the actual wait ("about an hour"), per
 *        instructions.md Stage 16d's note for the forgot-password resend limit. Checked
 *        user-service/.env.example: OTP_RESEND_WINDOW_MINUTES=60 is one shared config across
 *        every OTP purpose (registration included), not forgot-password-specific, so the
 *        corrected wording applies to this one central entry rather than a per-page override.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Added ACCOUNT_LOCKED, per instructions.md Stage 18e. Login.jsx already shows any
 *        unrecognised code's err.message in its banner (its only two special cases are
 *        INVALID_CREDENTIALS and ACCOUNT_SUSPENDED), which is the server's exact escalation
 *        wording, so it needed no change; this entry serves Account.jsx's generic banner
 *        fallback for the email/password-change forms instead.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Stage 25b of instructions.md - reworded OTP_ATTEMPTS_EXCEEDED. Old text ("Too many
 *        incorrect attempts. Request a new code.") implied the resend button could be used
 *        immediately, which Stage 25's backend fix shows is false until the Retry-After
 *        countdown ends; the new text says the code is dead and points at the button's own
 *        availability instead of promising an action that would still fail.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Added ELEVATION_REQUIRED and ALREADY_ELEVATED, per instructions.md Stage 27c's error
 *        table (text matches user-service's AppError messages exactly, as the OTP entries
 *        above already do). Neither is shown via this map's default display in practice:
 *        AdminUsers.jsx/AdminUserTransactions.jsx intercept ELEVATION_REQUIRED to open the OTP
 *        modal instead, and ElevationOtpModal shows ALREADY_ELEVATED as a toast itself; `toast`
 *        is still the closest default for an unhandled occurrence of either.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Finding F1 - reworded OTP_RESEND_LIMIT to no longer name a specific wait ("about an
 *        hour"), since callers now show err.message (the server's own wording) instead of this
 *        entry for OTP_RESEND_LIMIT. This entry remains as the generic fallback text.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Added INVALID_UNLOCK_TOKEN, per instructions.md Stage 31d's error table (text matches
 *        the server's AppError message exactly, as the other entries here do).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

export const errorMessages = {
  // --- Registration / login / tokens ------------------------------------------------------
  VALIDATION_ERROR: { message: 'Please check the highlighted fields.', display: 'field' },
  USERNAME_TAKEN: { message: 'That username is already taken.', display: 'field' },
  EMAIL_TAKEN: { message: 'That email is already registered.', display: 'field' },
  INVALID_CREDENTIALS: { message: 'Wrong username/email or password.', display: 'banner' },
  ACCOUNT_SUSPENDED: { message: 'This account has been suspended.', display: 'banner' },
  ACCOUNT_LOCKED: { message: 'Too many failed attempts. Please try again later.', display: 'banner' },
  ACCOUNT_NOT_VERIFIED: {
    message: 'This account still needs email verification.',
    display: 'banner',
  },
  INVALID_REFRESH_TOKEN: { message: 'Your session has expired. Please log in again.', display: 'toast' },
  INVALID_UNLOCK_TOKEN: { message: 'This link is invalid or has expired.', display: 'banner' },
  UNAUTHORIZED: { message: 'Please log in to continue.', display: 'toast' },
  FORBIDDEN: { message: "You don't have access to do that.", display: 'toast' },

  // --- OTP (registration, forgot password, change email/password) ------------------------
  INVALID_OTP: { message: 'That code is incorrect.', display: 'field' },
  OTP_EXPIRED: { message: 'That code has expired. Request a new one.', display: 'field' },
  OTP_ATTEMPTS_EXCEEDED: {
    message: 'That code is no longer valid. You can request a new one once the button below is available.',
    display: 'field',
  },
  OTP_RESEND_COOLDOWN: { message: 'Please wait before requesting another code.', display: 'field' },
  OTP_RESEND_LIMIT: {
    message: "You've reached the resend limit. Please try again later.",
    display: 'field',
  },
  NO_PENDING_REGISTRATION: {
    message: 'No pending registration was found for this email.',
    display: 'banner',
  },
  EMAIL_NOT_FOUND: { message: 'No account uses that email.', display: 'field' },
  NO_PENDING_EMAIL_CHANGE: { message: 'No pending email change was found.', display: 'banner' },
  NO_PENDING_PASSWORD_CHANGE: {
    message: 'No pending password change was found.',
    display: 'banner',
  },
  EMAIL_SEND_FAILED: {
    message: 'Could not send the email right now. Please try again.',
    display: 'banner',
  },

  // --- Account (username / email / password changes) --------------------------------------
  USERNAME_UNCHANGED: { message: 'That is already your username.', display: 'field' },
  EMAIL_UNCHANGED: { message: 'That is already your email.', display: 'field' },
  PASSWORD_UNCHANGED: {
    message: 'That is already your password.',
    display: 'field',
  },
  INVALID_PASSWORD: { message: 'Your current password is incorrect.', display: 'field' },

  // --- Admin user management ---------------------------------------------------------------
  USER_NOT_FOUND: { message: 'That user could not be found.', display: 'toast' },
  SUPER_ADMIN_IMMUTABLE: { message: 'A super administrator cannot be modified.', display: 'toast' },
  SELF_ROLE_CHANGE: { message: 'You cannot change your own role.', display: 'toast' },
  CANNOT_CHANGE_STATUS_PENDING_USER: {
    message: "A pending user's status cannot be changed yet.",
    display: 'toast',
  },
  CANNOT_CHANGE_ROLE_PENDING_USER: {
    message: "A pending user's role cannot be changed yet.",
    display: 'toast',
  },
  CANNOT_CHANGE_ROLE_SUSPENDED_USER: {
    message: "A suspended user's role cannot be changed.",
    display: 'toast',
  },

  // --- Admin elevation (OTP step-up) --------------------------------------------------------
  ELEVATION_REQUIRED: {
    message: 'Verify your identity to perform this action.',
    display: 'toast',
  },
  ALREADY_ELEVATED: { message: 'Admin actions are already unlocked.', display: 'toast' },

  // --- Fallback -----------------------------------------------------------------------------
  INTERNAL_ERROR: { message: 'Something went wrong. Please try again.', display: 'banner' },
}

const DEFAULT = { message: 'Something went wrong. Please try again.', display: 'banner' }

/** Looks up an ApiError's `code`. Unknown codes fall back to a generic banner message. */
export function describeError(err) {
  return errorMessages[err?.code] ?? DEFAULT
}
