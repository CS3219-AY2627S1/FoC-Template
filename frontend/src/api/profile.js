/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Created the /users/me calls used by AuthContext and the account page (stage 16b of
 *        instructions.md): getProfile (GET /users/me) and setActiveView (PUT
 *        /users/me/active-view). No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Added the calls Account.jsx needs, per instructions.md Stage 16e: changeUsername,
 *        changeEmail/verifyEmailChangeOtp (POST .../verify-otp only ever takes
 *        purpose='change_email' per user-service/src/controllers/me.controller.ts), resendMeOtp
 *        (the one /users/me/resend-otp endpoint shared by change_email and change_password),
 *        and changePassword/confirmPasswordChange.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5-5): Added setPreferredLang for PUT /users/me/preferred-lang.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */

import { request } from './http'

// 200 { username, email, activeView, preferredLang }
export async function getProfile() {
  return request('/users/me')
}

// 200, the full user shape: { id, username, email, status, role, activeView, createdAt,
// updatedAt }. Callers only need activeView back; AuthContext keeps the rest of its user object.
export async function setActiveView(activeView) {
  return request('/users/me/active-view', { method: 'PUT', json: { activeView } })
}

// 200, the full user shape including preferredLang. 400 VALIDATION_ERROR for an unsupported code.
export async function setPreferredLang(preferredLang) {
  return request('/users/me/preferred-lang', { method: 'PUT', json: { preferredLang } })
}

// 200 { username, email }. 409 USERNAME_UNCHANGED / USERNAME_TAKEN.
export async function changeUsername(newUsername) {
  return request('/users/me/username', { method: 'PUT', json: { newUsername } })
}

// 200 { message, code: 'OTP_SENT' }. 401 INVALID_PASSWORD, 409 EMAIL_UNCHANGED / EMAIL_TAKEN.
export async function changeEmail({ currentPassword, newEmail }) {
  return request('/users/me/email', { method: 'PUT', json: { currentPassword, newEmail } })
}

// 200 { message, code: 'EMAIL_CHANGE_SUCCESS' }. 400 INVALID_OTP / OTP_EXPIRED, 429
// OTP_ATTEMPTS_EXCEEDED, 409 EMAIL_TAKEN (someone else took the address in the meantime).
export async function verifyEmailChangeOtp(otp) {
  return request('/users/me/verify-otp', { method: 'POST', json: { otp, purpose: 'change_email' } })
}

// 200 { message, code: 'OTP_SENT' }. 400 NO_PENDING_EMAIL_CHANGE / NO_PENDING_PASSWORD_CHANGE,
// 429 OTP_RESEND_COOLDOWN / OTP_RESEND_LIMIT (with Retry-After on cooldown).
export async function resendMeOtp(purpose) {
  return request('/users/me/resend-otp', { method: 'POST', json: { purpose } })
}

// 200 { message, code: 'OTP_SENT' }. 401 INVALID_PASSWORD, 400 PASSWORD_UNCHANGED.
export async function changePassword({ currentPassword, newPassword }) {
  return request('/users/me/password', { method: 'PUT', json: { currentPassword, newPassword } })
}

// 200 { message, code: 'PASSWORD_CHANGE_SUCCESS' }. 400 INVALID_OTP / OTP_EXPIRED /
// PASSWORD_UNCHANGED, 429 OTP_ATTEMPTS_EXCEEDED. Revokes all of the user's refresh tokens on
// success, this browser's included — the caller (Account.jsx) forces a re-login right after.
export async function confirmPasswordChange({ otp, newPassword }) {
  return request('/users/me/confirm-password-change', { method: 'POST', json: { otp, newPassword } })
}
