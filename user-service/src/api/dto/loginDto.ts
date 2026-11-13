// AI Assistance Disclosure:
// Tool: Claude Code (Claude Opus), date: 2026-09-28
// Scope: AI reviewed the author-written code for potential bugs; no changes.
// Author review: Author implemented the code. See user-service/ai/usage-log.md,
// entry 005.

import { z } from 'zod';

// Validates the POST /users/login body.
export const loginSchema = z.object({
  email: z.email('Invalid email address').transform((e) => e.toLowerCase()),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type email = z.infer<typeof loginSchema>['email'];
