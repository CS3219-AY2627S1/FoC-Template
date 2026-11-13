import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Please enter your email.'),

  password: z.string().refine((value) => value.trim().length > 0, {
    message: 'Please enter your password.',
  }),
})

export type LoginFormValues = z.infer<typeof loginSchema>
