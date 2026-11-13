import { z } from 'zod'

const emailPattern = /^\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b$/

export const nusEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Please enter your email.')
  .regex(emailPattern, 'Please enter a valid email address.')
  .pipe(
    z
      .string()
      .refine(
        (email) => ['u.nus.edu', 'nus.edu.sg'].includes(email.split('@')[1]),
        'Please use your NUS email address.',
      ),
  )
