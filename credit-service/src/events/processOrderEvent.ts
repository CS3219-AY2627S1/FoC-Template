/**
 * AI Assistance Disclosure
 * Tool: Grok 4.7, date: 2026-10-23
 * Scope: Generated skeleton code for handling order events
 * Author review: Verified and added the correct logic
 */

import {
  releaseCreditsOnceService,
  releaseCreditsService,
  transferCreditsService,
} from "../service/transactionService.ts";
import { ORDER_EVENT_TYPES, type OrderEvent } from "../types/eventTypes.ts";

export const processOrderEvent = async (event: OrderEvent): Promise<void> => {
  switch (event.event_type) {
    case ORDER_EVENT_TYPES.ORDER_COMPLETED:
      await handleOrderCompleted(event);
      return;
    case ORDER_EVENT_TYPES.ORDER_CANCELLED:
      await handleOrderCancelled(event);
      return;
    case ORDER_EVENT_TYPES.ORDER_EXPIRED:
      await handleOrderExpired(event);
      return;
    default:
      console.log(
        `[Credit Service] Ignoring unhandled event ${event.event_type} (${event.event_id})`
      );
  }
};

const handleOrderCompleted = async (event: OrderEvent): Promise<void> => {
  if (!event.data.courier_id) {
    throw new Error(`ORDER_COMPLETED ${event.event_id} is missing courier_id`);
  }

  await transferCreditsService({
    order_id: event.data.order_id,
    requester_id: event.data.requester_id,
    courier_id: event.data.courier_id,
    amount: event.data.credit_amount,
  });
};

const handleOrderCancelled = async (event: OrderEvent): Promise<void> => {
  await releaseCreditsService({
    order_id: event.data.order_id,
    requester_id: event.data.requester_id,
    amount: event.data.credit_amount,
  });
};

const handleOrderExpired = async (event: OrderEvent): Promise<void> => {
  await releaseCreditsOnceService({
    order_id: event.data.order_id,
    requester_id: event.data.requester_id,
    amount: event.data.credit_amount,
  });
};
