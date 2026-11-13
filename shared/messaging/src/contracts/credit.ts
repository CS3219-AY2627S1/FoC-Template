// AI-Assistance Disclosure
// Tool: OpenAI Codex (GPT-6), date: 2026-11-04 (Asia/Singapore).
// Scope: Removed human-specified unused lifecycle confirmations and RESTORED reason.
// Author review: I verified that the changes removed the earlier design elements that are now irrelevant.
// Prompts/key responses: ../../../../credit-service/ai/usage-log.md, entry 049.

// Message producer: credit service
// Consumers: UI gateway, notification service

import { z } from 'zod';

const creditEventBaseSchema = z.object({
  eventId: z.string(),
  occurredAt: z.string(),
  /** UUID string. */
  userId: z.string(),
});

/**
 * Balance changed for a user. Carries the full new balance (not a delta) so the
 * UI can overwrite what it shows and ignore out-of-order events via occurredAt.
 * Credits are whole numbers, matching OrderEventBase.credits.
 */
export const creditBalanceUpdatedSchema = creditEventBaseSchema.extend({
  type: z.literal('credit.balance_updated'),
  available: z.number(),
  reserved: z.number(),
  /** What caused the change, for UI messaging and debugging. */
  reason: z.enum(['GRANTED', 'RESERVED', 'RELEASED', 'PAID']),
});

/** Payment settled for an order (reserved credits moved from requester to courier). */
export const creditPaymentCompletedSchema = creditEventBaseSchema.extend({
  type: z.literal('credit.payment_completed'),
  /** userId on the base is the payer (requester). */
  orderId: z.string(),
  payeeId: z.string(),
  amount: z.number(),
});

export const creditEventSchema = z.discriminatedUnion('type', [
  creditBalanceUpdatedSchema,
  creditPaymentCompletedSchema,
]);

export type CreditBalanceUpdated = z.infer<typeof creditBalanceUpdatedSchema>;
export type CreditPaymentCompleted = z.infer<typeof creditPaymentCompletedSchema>;
export type CreditEvent = z.infer<typeof creditEventSchema>;
