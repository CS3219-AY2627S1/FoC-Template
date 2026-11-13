// AI-assisted (Claude), reviewed and tested by Maliha
// AI-assisted (Claude Opus 5.5), 2026-11-12: chat stays open for 1 h after the errand ends, then closes; see ui/ai-usage/usage-log.md, entry 003
// When a chat can be read or written, from the order's state
import type { Order } from './orders';

export const endedAt = (o: Order) => o.deliveredAt ?? o.cancelledAt;

// F10.4: chat closes (and is deleted) 1 h after the errand is delivered or cancelled
export const KEEP_MS = 60 * 60_000;

// when the chat closes, or null while the errand is still going
export function closesAt(o: Order) {
  const end = endedAt(o);
  return end ? new Date(new Date(end).getTime() + KEEP_MS).toISOString() : null;
}

// Chat opens once a courier accepts, and stays fully open until it closes
export function chatAccess(o: Order, now = Date.now()) {
  if (!o.courierId) return { canRead: false, canSend: false };
  const close = closesAt(o);
  const open = !close || now < new Date(close).getTime();
  return { canRead: open, canSend: open };
}
