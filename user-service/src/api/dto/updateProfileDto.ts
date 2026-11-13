// AI Assistance Disclosure:
// Tool: Claude Code (Claude Opus), date: 2026-10-14
// Scope: AI generated the profile update schema and suggested reusing the
// register rules.
// Author review: Author specified the requirements, approved the reuse,
// reviewed the code line by line and approved. See
// user-service/ai/usage-log.md, entry 014.

import { z } from 'zod';
import { registerSchema } from './registerDto';

// Validates the PATCH /users/me body. Reuses the register rules so sign-up and
// edit can't drift apart.
export const updateProfileSchema = registerSchema
  .pick({ firstName: true, lastName: true, username: true })
  .partial()
  .extend({
    email: z.never({ error: 'Email cannot be changed' }).optional(),
    roles: z.never({ error: 'Roles cannot be changed here' }).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update');

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
