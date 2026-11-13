import { z } from 'zod'

import { nusEmailSchema } from '#/features/auth/schemas/nusEmail.schema'
import { passwordSchema } from '#/features/auth/schemas/password.schema'

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Please enter your name.'),

    email: nusEmailSchema,

    password: passwordSchema,

    confirmPassword: z.string().refine((value) => value.trim().length > 0, {
      message: 'Please confirm your password.',
    }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

export type RegisterFormValues = z.infer<typeof registerSchema>
