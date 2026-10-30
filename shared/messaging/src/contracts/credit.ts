// Message producer: credit service
// Consumers: UI gateway, notification service, user service (archive/restore confirmations)

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
  reason: z.enum(['GRANTED', 'RESERVED', 'RELEASED', 'PAID', 'RESTORED']),
});

/** Payment settled for an order (reserved credits moved from requester to courier). */
export const creditPaymentCompletedSchema = creditEventBaseSchema.extend({
  type: z.literal('credit.payment_completed'),
  /** userId on the base is the payer (requester). */
  orderId: z.string(),
  payeeId: z.string(),
  amount: z.number(),
});

/** User deleted: balance snapshotted and credit history archived. Confirms user.deleted. */
export const creditUserArchivedSchema = creditEventBaseSchema.extend({
  type: z.literal('credit.user_archived'),
  archivedAt: z.string(),
  /** Remaining balance stored for restore. */
  remainingCredits: z.number(),
  /** Same as user.deleted purgeAfter. */
  purgeAfter: z.string(),
});

/** User restored within the retention window: balance and history are back. Confirms user.restored. */
export const creditUserRestoredSchema = creditEventBaseSchema.extend({
  type: z.literal('credit.user_restored'),
  restoredCredits: z.number(),
});

export const creditEventSchema = z.discriminatedUnion('type', [
  creditBalanceUpdatedSchema,
  creditPaymentCompletedSchema,
  creditUserArchivedSchema,
  creditUserRestoredSchema,
]);

export type CreditBalanceUpdated = z.infer<typeof creditBalanceUpdatedSchema>;
export type CreditPaymentCompleted = z.infer<typeof creditPaymentCompletedSchema>;
export type CreditUserArchived = z.infer<typeof creditUserArchivedSchema>;
export type CreditUserRestored = z.infer<typeof creditUserRestoredSchema>;
export type CreditEvent = z.infer<typeof creditEventSchema>;
