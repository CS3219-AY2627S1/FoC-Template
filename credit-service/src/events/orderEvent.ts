/**
 * AI Assistance Disclosure
 * Tool: Grok 4.7, date: 2026-10-23
 * Scope: Generated skeleton code for handling order events
 * Author review: Verified and added the correct logic
 */

import type { OrderEvent } from "../types/eventTypes.ts";


const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const parseOrderEvent = (raw: unknown): OrderEvent => {
  if (!isRecord(raw) || !isRecord(raw.data)) {
    throw new Error("Event body must be an object with a data object");
  }

  const { event_id, event_type, timestamp, data } = raw;
  if (typeof event_id !== "string" || typeof event_type !== "string") {
    throw new Error("Event is missing event_id or event_type");
  }
  if (
    typeof data.order_id !== "string" ||
    typeof data.requester_id !== "string" ||
    typeof data.credit_amount !== "number"
  ) {
    throw new Error("Event data is missing order_id, requester_id, or credit_amount");
  }

  return {
    event_id,
    event_type,
    timestamp: typeof timestamp === "string" ? timestamp : "",
    data: {
      order_id: data.order_id,
      requester_id: data.requester_id,
      courier_id: typeof data.courier_id === "string" ? data.courier_id : null,
      credit_amount: data.credit_amount,
    },
  };
};
