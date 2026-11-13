import { z } from 'zod'

export const EXPIRY_MINUTES = [30, 60, 120, 240, 480] as const
export const createErrandSchema = z.object({
  pickup: z
    .object({
      id: z.uuid('Choose a pickup location.'),
      name: z.string().min(1),
      address: z.string().min(1),
    })
    .nullable()
    .refine((value): boolean => value !== null, 'Choose a pickup location.'),
  deliveryLocation: z
    .string()
    .trim()
    .min(1, 'Enter a delivery location.')
    .max(500),
  description: z
    .string()
    .trim()
    .min(1, 'Tell your courier what to collect.')
    .max(2000),
  notes: z.string().trim().max(2000),
  creditReward: z
    .number({ error: 'Enter a positive whole number of credits.' })
    .int('Use whole credits.')
    .positive('The reward must be greater than zero.'),
  expiryMinutes: z
    .number()
    .refine(
      (value) => EXPIRY_MINUTES.some((minutes) => minutes === value),
      'Choose one of the available expiry durations.',
    ),
})
export type CreateErrandValues = z.infer<typeof createErrandSchema>
