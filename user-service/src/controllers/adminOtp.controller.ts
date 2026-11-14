// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
// Scope: Stage 27a - POST /admin/send-otp, /admin/verify-otp, /admin/resend-otp controllers.
//        Zod .strict() validation of the `purpose` (single value `admin_action`) and `otp`
//        fields per instructions.md Stage 27's endpoints table. No requirements, architecture,
//        schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-09: Stage 27b - the local elevatedTokenHeader helper moved to the shared
//   src/utils/elevatedTokenHeader.ts (also used by users.controller.ts). No behaviour change.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:

import { z } from 'zod';
import * as adminOtpService from '../services/adminOtp.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { elevatedTokenHeader } from '../utils/elevatedTokenHeader.js';

const purposeErrorMap: z.ZodErrorMap = (issue) => {
  if (issue.code === 'invalid_enum_value') return { message: 'Invalid purpose' };
  if (issue.code === 'invalid_type' && issue.received === 'undefined') {
    return { message: 'Purpose is required' };
  }
  return { message: 'Purpose must be a string' };
};

const purposeField = z.enum(['admin_action'], { errorMap: purposeErrorMap });

const sendOtpSchema = z.object({ purpose: purposeField }).strict();
const resendOtpSchema = z.object({ purpose: purposeField }).strict();
const verifyOtpSchema = z
  .object({
    otp: z.string({
      required_error: 'OTP is required',
      invalid_type_error: 'OTP must be a string',
    }),
    purpose: purposeField,
  })
  .strict();

export const sendOtp = asyncHandler(async (req, res) => {
  sendOtpSchema.parse(req.body);
  // authenticate has run, so req.user is set.
  await adminOtpService.sendAdminOtp({
    userId: req.user!.user_id,
    sid: req.user!.sid,
    elevatedToken: elevatedTokenHeader(req),
  });
  res
    .status(200)
    .json({ message: 'A verification code has been sent to your email', code: 'OTP_SENT' });
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const { otp } = verifyOtpSchema.parse(req.body);
  // authenticate has run, so req.user is set.
  const { elevationToken } = await adminOtpService.verifyAdminOtp({
    userId: req.user!.user_id,
    role: req.user!.role,
    sid: req.user!.sid,
    otp,
    elevatedToken: elevatedTokenHeader(req),
  });
  res.status(200).json({ elevationToken });
});

export const resendOtp = asyncHandler(async (req, res) => {
  resendOtpSchema.parse(req.body);
  // authenticate has run, so req.user is set.
  await adminOtpService.resendAdminOtp({
    userId: req.user!.user_id,
    sid: req.user!.sid,
    elevatedToken: elevatedTokenHeader(req),
  });
  res
    .status(200)
    .json({ message: 'A new verification code has been sent to your email', code: 'OTP_SENT' });
});
