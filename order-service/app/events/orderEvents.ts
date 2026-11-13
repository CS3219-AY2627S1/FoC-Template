/**
 * AI Assistance Disclosure:
 * Tool: Claude (Sonnet 5.5), date: 2026-10-19
 * Scope: Order event envelope and outbox recording
 * Author review: Reviewed and tested locally
 *
 */

import { randomUUID } from "node:crypto";
import type { Transaction } from "sequelize";
import { OutboxEvent } from "../models/index.ts";
import type { EventOrderFields, OrderEvent, OrderEventType } from "../models/types.ts";

export function buildOrderEvent(eventType: OrderEventType, order: EventOrderFields): OrderEvent {
  return {
    event_id: randomUUID(),
    event_type: eventType,
    timestamp: new Date().toISOString(),
    data: {
      order_id: order.order_id,
      requester_id: order.requester_id,
      courier_id: order.courier_id ?? null,
      credit_amount: order.credit_amount,
      title: order.title ?? null,
    },
  };
}

// Writes the event to the outbox. Pass the SAME transaction as the order
// status change so both commit or roll back together.
export async function recordOrderEvent(
  eventType: OrderEventType,
  order: EventOrderFields,
  transaction?: Transaction
): Promise<OrderEvent> {
  const event = buildOrderEvent(eventType, order);
  await OutboxEvent.create(
    { event_id: event.event_id, event_type: eventType, payload: event },
    transaction ? { transaction } : {}
  );
  return event;
}
