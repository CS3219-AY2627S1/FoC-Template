export type OrderEventType =
  "ORDER_CREATED" | "ORDER_ACCEPTED" | "ORDER_PICKED_UP" | "ORDER_COMPLETED" | "ORDER_CANCELLED" | "ORDER_EXPIRED";

export interface OrderEvent {
  event_id: string;
  event_type: OrderEventType | string;
  timestamp: string;
  data: {
    order_id: string;
    requester_id: string;
    courier_id: string | null;
    credit_amount: number;
    title?: string | null;
  };
}

export function parseOrderEvent(raw: unknown): OrderEvent {
  const e = raw as Partial<OrderEvent> | null;
  if (!e || typeof e.event_id !== "string" || typeof e.event_type !== "string") {
    throw new Error("Event is missing event_id or event_type");
  }
  const d = e.data;
  if (
    !d ||
    typeof d.order_id !== "string" ||
    typeof d.requester_id !== "string" ||
    typeof d.credit_amount !== "number"
  ) {
    throw new Error(`Event ${e.event_id} has invalid data`);
  }
  return e as OrderEvent;
}
