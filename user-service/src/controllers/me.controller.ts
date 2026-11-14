/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Generated the me controller (updateActiveView) as specified in
 *        instructions.md Stage 11.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added getProfile as specified in instructions.md Stage 12a.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added changeUsername as specified in instructions.md Stage 12b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added changeEmail as specified in instructions.md Stage 12c.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added verifyOtp and resendOtp as specified in instructions.md Stage 12d.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added changePassword and confirmPasswordChange as specified in
 *        instructions.md Stage 12e.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-09
 * Scope: Added the team-specified preferred_lang setting (ISO 639-1 subset: en, zh, hi, ta, ms, es, ar; default en), following the active-view flow.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */

import { z } from 'zod';
import { emailField } from './auth.controller.js';
import * as meService from '../services/me.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const activeViewErrorMap: z.ZodErrorMap = (issue) => {
  if (issue.code === 'invalid_enum_value') {
    return { message: "Active view must be 'requester' or 'courier'" };
  }
  if (issue.code === 'invalid_type' && issue.received === 'undefined') {
    return { message: 'Active view is required' };
  }
  return { message: 'Active view must be a string' };
};

const updateActiveViewSchema = z
  .object({ activeView: z.enum(['requester', 'courier'], { errorMap: activeViewErrorMap }) })
  .strict();

export const updateActiveView = asyncHandler(async (req, res) => {
  const { activeView } = updateActiveViewSchema.parse(req.body);
  // authenticate has run, so req.user is set. The id never comes from the body.
  const user = await meService.changeActiveView(req.user!.user_id, activeView);
  res.status(200).json(user);
});

// AI-generated (edited by <name>).
export const PREFERRED_LANGS = ['en', 'zh', 'hi', 'ta', 'ms', 'es', 'ar'] as const;

const preferredLangErrorMap: z.ZodErrorMap = (issue) => {
  if (issue.code === 'invalid_enum_value') {
    return { message: `Preferred language must be one of: ${PREFERRED_LANGS.join(', ')}` };
  }
  if (issue.code === 'invalid_type' && issue.received === 'undefined') {
    return { message: 'Preferred language is required' };
  }
  return { message: 'Preferred language must be a string' };
};

const updatePreferredLangSchema = z
  .object({ preferredLang: z.enum(PREFERRED_LANGS, { errorMap: preferredLangErrorMap }) })
  .strict();

export const updatePreferredLang = asyncHandler(async (req, res) => {
  const { preferredLang } = updatePreferredLangSchema.parse(req.body);
  const user = await meService.changePreferredLang(req.user!.user_id, preferredLang);
  res.status(200).json(user);
});

export const getProfile = asyncHandler(async (req, res) => {
  const profile = await meService.getOwnProfile(req.user!.user_id);
  res.status(200).json(profile);
});

// Lowercased only, not trimmed — same normalisation as registration's username field,
// but with this endpoint's own required/type messages.
const newUsernameField = z
  .string({
    required_error: 'New username is required',
    invalid_type_error: 'New username must be a string',
  })
  .toLowerCase();

const changeUsernameSchema = z.object({ newUsername: newUsernameField }).strict();

export const changeUsername = asyncHandler(async (req, res) => {
  const { newUsername } = changeUsernameSchema.parse(req.body);
  const profile = await meService.changeUsername(req.user!.user_id, newUsername);
  res.status(200).json(profile);
});

const changeEmailSchema = z
  .object({
    currentPassword: z.string({
      required_error: 'Current password is required',
      invalid_type_error: 'Current password must be a string',
    }),
    newEmail: emailField,
  })
  .strict();

export const changeEmail = asyncHandler(async (req, res) => {
  const { currentPassword, newEmail } = changeEmailSchema.parse(req.body);
  await meService.initiateEmailChange(req.user!.user_id, { currentPassword, newEmail });
  res
    .status(200)
    .json({ message: 'Verification code sent to your new email', code: 'OTP_SENT' });
});

// This route's own purpose set, kept separate from auth.controller.ts's — /auth/verify-otp
// and /auth/resend-otp stay public and only ever accept registration | forgot_password.
const mePurposeErrorMap: z.ZodErrorMap = (issue) => {
  if (issue.code === 'invalid_enum_value') return { message: 'Invalid purpose' };
  if (issue.code === 'invalid_type' && issue.received === 'undefined') {
    return { message: 'Purpose is required' };
  }
  return { message: 'Purpose must be a string' };
};

const meVerifyOtpSchema = z
  .object({
    otp: z.string({
      required_error: 'OTP is required',
      invalid_type_error: 'OTP must be a string',
    }),
    // Only change_email has a verify step today; change_password is checked and consumed
    // only inside confirm-password-change (Stage 12e).
    purpose: z.enum(['change_email'], { errorMap: mePurposeErrorMap }),
  })
  .strict();

export const verifyOtp = asyncHandler(async (req, res) => {
  const { otp } = meVerifyOtpSchema.parse(req.body);
  await meService.verifyEmailChangeOtp(req.user!.user_id, otp);
  res.status(200).json({ message: 'Email updated successfully', code: 'EMAIL_CHANGE_SUCCESS' });
});

const meResendOtpSchema = z
  .object({
    purpose: z.enum(['change_email', 'change_password'], { errorMap: mePurposeErrorMap }),
  })
  .strict();

export const resendOtp = asyncHandler(async (req, res) => {
  const { purpose } = meResendOtpSchema.parse(req.body);
  switch (purpose) {
    case 'change_email':
      await meService.resendChangeEmailOtp(req.user!.user_id);
      break;
    case 'change_password':
      await meService.resendChangePasswordOtp(req.user!.user_id);
      break;
  }
  res.status(200).json({
    message: 'A new verification code has been sent to your email',
    code: 'OTP_SENT',
  });
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string({
      required_error: 'Current password is required',
      invalid_type_error: 'Current password must be a string',
    }),
    newPassword: z.string({
      required_error: 'New password is required',
      invalid_type_error: 'New password must be a string',
    }),
  })
  .strict();

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  await meService.initiatePasswordChange(req.user!.user_id, { currentPassword, newPassword });
  res.status(200).json({ message: 'Verification code sent to your email', code: 'OTP_SENT' });
});

const confirmPasswordChangeSchema = z
  .object({
    otp: z.string({
      required_error: 'OTP is required',
      invalid_type_error: 'OTP must be a string',
    }),
    newPassword: z.string({
      required_error: 'New password is required',
      invalid_type_error: 'New password must be a string',
    }),
  })
  .strict();

export const confirmPasswordChange = asyncHandler(async (req, res) => {
  const { otp, newPassword } = confirmPasswordChangeSchema.parse(req.body);
  await meService.confirmPasswordChange(req.user!.user_id, { otp, newPassword });
  res.status(200).json({
    message: 'Password changed successfully. Please log in again on other devices.',
    code: 'PASSWORD_CHANGE_SUCCESS',
  });
});
