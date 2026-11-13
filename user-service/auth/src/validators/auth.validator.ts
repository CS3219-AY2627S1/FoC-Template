/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-28
 * Scope: Generated implementation for authentication input validation
 * Author review: Verified schema correctness according to our requirements.
 */

import { z } from 'zod'
import { AuthError } from '../types/auth.types.js'
const bootstrapAdminEmail = (
  process.env.AUTH_BOOTSTRAP_ADMIN_EMAIL ??
  process.env.FLOCI_INITIAL_ADMIN_EMAIL ??
  ''
)
  .trim()
  .toLowerCase()
const nusEmailPattern = /^[^\s@]+@(u\.nus\.edu|nus\.edu\.sg)$/i
const email = z
  .string()
  .toLowerCase()
  .refine(
    (value) =>
      nusEmailPattern.test(value) ||
      (bootstrapAdminEmail.length > 0 && value === bootstrapAdminEmail),
    'Use a valid NUS email address.',
  )
const password = z.string().superRefine((value, context) => {
  if (value.length < 8) context.addIssue({ code: 'custom', message: 'At least 8 characters' })
  if (!/[a-z]/.test(value)) context.addIssue({ code: 'custom', message: 'One lowercase letter' })
  if (!/[A-Z]/.test(value)) context.addIssue({ code: 'custom', message: 'One uppercase letter' })
  if (!/[0-9]/.test(value)) context.addIssue({ code: 'custom', message: 'One number' })
  if (!/[!@#$%^&*]/.test(value))
    context.addIssue({ code: 'custom', message: 'One special character (!@#$%^&*)' })
})
export const loginSchema = z.object({ email, password: z.string().min(1) })
export const registerSchema = loginSchema.extend({ password, passwordConfirmation: z.string() })
export const resendSchema = z.object({ email })
export const verificationSchema = loginSchema.extend({ code: z.string().trim().min(1) })
export const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
  newPasswordConfirmation: z.string(),
})
export const adminSchema = z.object({ email })
export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success)
    throw new AuthError(
      'VALIDATION_FAILED',
      'The authentication request is invalid.',
      400,
      Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message])),
    )
  return result.data
}
