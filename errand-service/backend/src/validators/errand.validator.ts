// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-12
// Scope: Implemented author-defined request validation for lifecycle operations.
// Author review: Reviewed every output, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements. All design decisions remained author-authored.

// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-11
// Scope: Generated initial implementation of the Errand Service validators.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import { z } from 'zod'
import { ErrandErrors, SupplierErrandViewRequest, type CreateErrandRequest } from '@relay/contracts'
import { ErrandServiceError } from '../types/errand.types.js'

const errandLocationSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  buildingName: z.string().trim().min(1),
  floorNumber: z.number().int(),
})

const deliveryDetailsSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1)
    .max(5000, 'Description must be no more than 5000 characters'),
  instructions: z
    .string()
    .trim()
    .min(1)
    .max(5000, 'Instructions must be no more than 5000 characters')
    .optional(),
})

const createErrandSchema = z
  .object({
    supplierDetails: z.object({
      supplierId: z.string().trim().min(1),
      supplierName: z.string().trim().min(1),
      serviceType: z.number().int(),
    }),
    name: z.string().trim().min(1).max(200, 'Name must be no more than 200 characters'),
    pickupLocation: errandLocationSchema,
    targetLocation: errandLocationSchema,
    deliveryDetails: deliveryDetailsSchema,
    creditAmount: z.number().int().nonnegative(),
    startAt: z.string().datetime({ offset: true }).optional(),
    expiresAt: z
      .string()
      .datetime({ offset: true })
      .refine((value) => new Date(value).getTime() > Date.now(), 'Expiry must be in the future')
      .optional(),
  })
  .refine(
    (value) =>
      !value.startAt ||
      !value.expiresAt ||
      new Date(value.startAt).getTime() <= new Date(value.expiresAt).getTime(),
    { path: ['startAt'], message: 'Start time must be on or before the deadline' },
  )

const supplierErrandViewSchema = z.object({
  scope: z.enum(['explore', 'mine']),
  supplierId: z.string().trim().min(1),
})

export function validateCreateErrand(input: unknown): CreateErrandRequest {
  const result = createErrandSchema.safeParse(input)
  if (result.success) return result.data

  const fieldErrors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const field = issue.path.join('.') || 'request'
    fieldErrors[field] ??= issue.message
  }

  throw new ErrandServiceError(
    ErrandErrors.INVALID_ERRAND,
    'The errand request is invalid.',
    400,
    fieldErrors,
  )
}

export function validateSupplierErrandView(input: unknown): SupplierErrandViewRequest {
  const result = supplierErrandViewSchema.safeParse(input)
  if (result.success) return result.data

  const fieldErrors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const field = issue.path.join('.') || 'request'
    fieldErrors[field] ??= issue.message
  }

  throw new ErrandServiceError(
    ErrandErrors.INVALID_ERRAND,
    'The supplier errand view request is invalid.',
    400,
    fieldErrors,
  )
}
