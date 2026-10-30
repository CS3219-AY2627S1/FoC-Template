import { z } from 'zod';

// Only NUS addresses are allowed: @nus.edu.sg (staff) or @u.nus.edu (students).
const NUS_EMAIL = /@(u\.nus\.edu|nus\.edu\.sg)$/i;

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
});

export type RegisterInput = z.infer<typeof registerSchema>;