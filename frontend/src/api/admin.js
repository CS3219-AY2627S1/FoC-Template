/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Created sendAdminOtp/verifyAdminOtp/resendAdminOtp, the three admin-elevation OTP
 *        calls (POST /admin/send-otp, /admin/verify-otp, /admin/resend-otp) user-service added
 *        in Stage 27a, needed by the new ElevationOtpModal (Stage 27c). Each attaches
 *        Elevated-Token when a (possibly stale) token is still held, per the stage's "the three
 *        admin OTP calls send Elevated-Token when a token is held" rule, so the service can
 *        answer with 409 ALREADY_ELEVATED.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { request } from './http'
import { elevatedTokenHeader } from '../utils/elevation'

// 200 { message, code: 'OTP_SENT' }. 409 ALREADY_ELEVATED, 429 OTP_RESEND_COOLDOWN /
// OTP_RESEND_LIMIT (with Retry-After on cooldown). Admin/super admin only (403 FORBIDDEN).
export async function sendAdminOtp() {
  return request('/admin/send-otp', {
    method: 'POST',
    headers: elevatedTokenHeader(),
    json: { purpose: 'admin_action' },
  })
}

// 200 { elevationToken }. 400 VALIDATION_ERROR / INVALID_OTP / OTP_EXPIRED, 409
// ALREADY_ELEVATED, 429 OTP_ATTEMPTS_EXCEEDED.
export async function verifyAdminOtp(otp) {
  return request('/admin/verify-otp', {
    method: 'POST',
    headers: elevatedTokenHeader(),
    json: { otp, purpose: 'admin_action' },
  })
}

// 200 { message, code: 'OTP_SENT' }. 400 NO_PENDING_OTP, 409 ALREADY_ELEVATED, 429
// OTP_RESEND_COOLDOWN / OTP_RESEND_LIMIT (with Retry-After on cooldown).
export async function resendAdminOtp() {
  return request('/admin/resend-otp', {
    method: 'POST',
    headers: elevatedTokenHeader(),
    json: { purpose: 'admin_action' },
  })
}
