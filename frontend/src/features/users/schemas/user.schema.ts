import { z } from 'zod'

const emailPattern = /^\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b$/

export const userSchema = z.object({
  name: z.string().trim().min(1, 'Please enter a name.').max(255),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Please enter an email address.')
    .max(320)
    .regex(emailPattern, 'Please enter a valid email address.'),
  roles: z.array(z.enum(['USER', 'ADMIN'])).min(1, 'Select at least one role.'),
  phoneNumber: z
    .string()
    .trim()
    .transform((value) => value.replace(/[ -]/g, ''))
    .refine(
      (value) => value === '' || /^\+[1-9][0-9]{1,14}$/.test(value),
      'Include a country code and 2 to 15 digits.',
    ),
  faculty: z
    .string()
    .trim()
    .max(255, 'Faculty must be 255 characters or less.'),
})

export const createUserSchema = (faculties: string[]) =>
  userSchema.superRefine((values, context) => {
    if (values.faculty && !faculties.includes(values.faculty)) {
      context.addIssue({
        code: 'custom',
        path: ['faculty'],
        message: 'Select a valid NUS faculty.',
      })
    }
  })

export type UserFormValues = z.infer<typeof userSchema>
