
//message producer for UI and Notifications

import { z } from 'zod';

export const orderStatusSchema = z.enum([
  'UNASSIGNED', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANCELLED',
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/*
TODO: Verify the order event base --order event owner to change
*/
const orderEventBaseSchema = z.object({
  eventId: z.string(),
  occurredAt: z.string(),
  orderId: z.string(),
  requesterId: z.string(),
  courierId: z.string().optional(),
  supplierId: z.string(),
  deliveryLocation: z.string(),
  instructions: z.string(),
  credits: z.number(),
  status: orderStatusSchema,
  deadline: z.string().optional(),
});

/** Fulfillment notifications published when an order is created or edited. */
export const orderCreatedSchema = orderEventBaseSchema.extend({
  type: z.literal('order.created'),
});

export const orderUpdatedSchema = orderEventBaseSchema.extend({
  type: z.literal('order.updated'),
});

/** Triggers a credit release / refund. */
export const orderCancelledSchema = orderEventBaseSchema.extend({
  type: z.literal('order.cancelled'),
  reason: z.string().optional(),
});

export const orderCreditsEditedSchema = orderEventBaseSchema.extend({
  type: z.literal('order.credits_edited'),
  previousCredits: z.number(),
});

export const orderEventSchema = z.discriminatedUnion('type', [
  orderCreatedSchema,
  orderUpdatedSchema,
  orderCancelledSchema,
  orderCreditsEditedSchema,
]);

export type OrderCreated = z.infer<typeof orderCreatedSchema>;
export type OrderUpdated = z.infer<typeof orderUpdatedSchema>;
export type OrderCancelled = z.infer<typeof orderCancelledSchema>;
export type OrderCreditsEdited = z.infer<typeof orderCreditsEditedSchema>;
export type OrderEvent = z.infer<typeof orderEventSchema>;
