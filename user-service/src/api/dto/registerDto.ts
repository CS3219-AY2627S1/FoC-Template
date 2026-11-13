// AI Assistance Disclosure:
// Tool: Claude Code (Claude Opus), 2026-09-27; OpenAI Codex,
// 2026-11-02 (Asia/Singapore).
// Scope: AI generated the Zod registration schema and added the
// author-specified confirmRestore field for archived-account restoration.
// Author review: Author specified the fields and validation rules and reviewed
// and approved entries 002 and 027. See
// user-service/ai/usage-log.md.

import { z } from 'zod';

// Only NUS addresses are allowed: @nus.edu.sg (staff) or @u.nus.edu (students).
export const NUS_EMAIL = /@(u\.nus\.edu|nus\.edu\.sg)$/i; //no changes, just added in export

// Validates the POST /users/register body. 
export const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  username: z.string().trim().min(1, 'Username is required'),
  email: z
    .email('Invalid email address')
    .refine((e) => NUS_EMAIL.test(e), 'Email must be an NUS address (@nus.edu.sg or @u.nus.edu)')
    .transform((e) => e.toLowerCase()), // normalise for case-insensitive uniqueness

  // >= 8 chars, with at least 1 uppercase, 1 number, and 1 special character.
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain a special character'),

  confirmRestore: z.boolean().optional().default(false),
});

export type RegisterInput = z.infer<typeof registerSchema>;
