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
