import { z } from 'zod'

export const passwordSchema = z
  .string()
  .refine((value) => value.trim().length > 0, {
    message: 'Please enter your password.',
  })
  .min(8, 'Password must contain at least 8 characters.')
  .refine((value) => new TextEncoder().encode(value).length <= 72, {
    message: 'Password is too long (maximum 72 UTF-8 bytes).',
  })
