// AI-assisted (Claude Opus 5.5): human-readable order statuses shared by badges,
// the order timeline and chat. Reviewed by authors.
import type { OrderStatus } from "./api";

export const ORDER_STATUS_INFO: Record<OrderStatus, { label: string; hint: string }> = {
  OPEN: { label: "Finding a courier", hint: "Waiting for someone to accept this errand" },
  ACCEPTED: { label: "Heading to vendor", hint: "The courier is on the way to pick up the order" },
  PICKED_UP: { label: "Out for delivery", hint: "The courier has the items and is on the way" },
  AWAITING_APPROVAL: {
    label: "Awaiting confirmation",
    hint: "Delivered. The requester needs to confirm they received it",
  },
  COMPLETED: { label: "Completed", hint: "Delivery confirmed and credits paid out" },
  CANCELLED: { label: "Cancelled", hint: "This errand was cancelled" },
  EXPIRED: { label: "Expired", hint: "No courier accepted this errand before its deadline" },
};

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_INFO[status]?.label ?? status;
}
