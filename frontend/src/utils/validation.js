/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Created client-side mirrors of user-service's format rules, per instructions.md
 *        Stage 16b. Regexes and messages copied verbatim from
 *        user-service/src/services/auth.service.ts (USERNAME_REGEX, EMAIL_REGEX,
 *        PASSWORD_REGEX, USERNAME_MESSAGE, PASSWORD_MESSAGE, OTP_REGEX) so the instant
 *        feedback matches what the backend will actually accept or reject; the backend still
 *        enforces all of these itself.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

export const USERNAME_REGEX = /^[A-Za-z0-9_]{3,255}$/
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
export const OTP_REGEX = /^\d{6}$/

export const USERNAME_MESSAGE =
  'Username must contain between 3 and 255 chars and have no spaces or special characters.'
export const PASSWORD_MESSAGE =
  'Password must contain at least 8 characters, with at least one uppercase, one lowercase, one digit and one special character. '
export const EMAIL_MESSAGE = 'Please enter a valid email'

export const isValidUsername = (value) => USERNAME_REGEX.test(value)
export const isValidEmail = (value) => EMAIL_REGEX.test(value)
export const isValidPassword = (value) => PASSWORD_REGEX.test(value)
export const isValidOtp = (value) => OTP_REGEX.test(value)
