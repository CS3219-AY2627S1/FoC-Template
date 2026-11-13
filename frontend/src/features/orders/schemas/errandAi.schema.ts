import { z } from 'zod'
import { EXPIRY_MINUTES } from './createErrand.schema'
import type { CreateErrandValues } from './createErrand.schema'

const pickupSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(500),
  address: z.string().min(1).max(2000),
})
export const errandDraftSchema = z.object({
  pickup: pickupSchema.nullable(),
  deliveryLocation: z.string().max(500).nullable(),
  description: z.string().max(2000).nullable(),
  notes: z.string().max(2000).nullable(),
  creditReward: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .nullable(),
  expiryMinutes: z
    .number()
    .refine((value) => EXPIRY_MINUTES.some((minutes) => minutes === value))
    .nullable(),
})
export const aiChatResponseSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  draft: errandDraftSchema,
  missingFields: z.array(
    z.enum([
      'pickup',
      'deliveryLocation',
      'description',
      'creditReward',
      'expiryMinutes',
    ]),
  ),
  supplierChoices: z.array(pickupSchema),
})
export const transcriptionSchema = z.object({
  text: z.string().trim().min(1).max(2000),
})
export const aiCapabilitiesSchema = z.object({
  chatEnabled: z.boolean(),
  voiceEnabled: z.boolean(),
})
export type AiCapabilities = z.infer<typeof aiCapabilitiesSchema>
export type ErrandDraft = z.infer<typeof errandDraftSchema>
export type AiChatResponse = z.infer<typeof aiChatResponseSchema>
export type AiMessage = { role: 'user' | 'assistant'; content: string }
export type AiChatRequest = {
  message: string
  history: Array<AiMessage>
  draft: ErrandDraft
  selectedSupplierId?: string
}

export function draftFromForm(values: CreateErrandValues): ErrandDraft {
  return {
    pickup: values.pickup,
    deliveryLocation: values.deliveryLocation || null,
    description: values.description || null,
    notes: values.notes,
    creditReward: errandDraftSchema.shape.creditReward.safeParse(
      values.creditReward,
    ).success
      ? values.creditReward
      : null,
    expiryMinutes: EXPIRY_MINUTES.some(
      (value) => value === values.expiryMinutes,
    )
      ? values.expiryMinutes
      : null,
  }
}

export function applyDraft(
  values: CreateErrandValues,
  draft: ErrandDraft,
): CreateErrandValues {
  return {
    pickup: draft.pickup ?? values.pickup,
    deliveryLocation: draft.deliveryLocation ?? values.deliveryLocation,
    description: draft.description ?? values.description,
    notes: draft.notes ?? values.notes,
    creditReward: draft.creditReward ?? values.creditReward,
    expiryMinutes: draft.expiryMinutes ?? values.expiryMinutes,
  }
}
