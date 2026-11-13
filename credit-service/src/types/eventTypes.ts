export const ORDER_EVENT_TYPES = {
  ORDER_COMPLETED: "ORDER_COMPLETED",
  ORDER_CANCELLED: "ORDER_CANCELLED",
  ORDER_EXPIRED: "ORDER_EXPIRED",
} as const;

export type OrderEventType = (typeof ORDER_EVENT_TYPES)[keyof typeof ORDER_EVENT_TYPES];

export interface OrderEventData {
  order_id: string;
  requester_id: string;
  courier_id: string | null;
  credit_amount: number;
}

export interface OrderEvent {
  event_id: string;
  event_type: string;
  timestamp: string;
  data: OrderEventData;
}