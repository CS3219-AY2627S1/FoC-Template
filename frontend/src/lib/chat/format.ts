// AI-assisted (Claude Opus 5.5): display helpers for chat messages. chat-service
// stores system messages as a template key + params; the client owns the wording.
// Reviewed by authors.
import type { OrderResponse } from "../api";
import type { ChatConversation, ChatMessage } from "./types";

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Display name for a member. FoC has no public user directory, so other people are
 * shown by their role in the conversation ("Courier", "Requester").
 */
export function memberName(
  conv: ChatConversation | undefined,
  userId: string | null | undefined,
  meId: string,
): string {
  if (!userId) return "System";
  if (userId === meId) return "You";
  const label = conv?.members.find((m) => m.user_id === userId)?.label;
  return label ? capitalise(label) : "Former member";
}

export function renderSystem(
  payload: Record<string, unknown> | null,
  nameOf: (id: string) => string,
): string {
  const key = String(payload?.key ?? "system");
  const params = (payload?.params ?? {}) as Record<string, unknown>;
  const who = (field: string) => nameOf(String(params[field] ?? ""));
  switch (key) {
    // FoC order lifecycle (chat-service/app/integrations/order_events.py)
    case "order.accepted":
      return "A courier accepted this order. Say hi!";
    case "order.picked_up":
      return "The courier picked up the order";
    case "order.delivered":
      return "The courier marked the order as delivered. Please confirm it.";
    case "order.courier_withdrawn":
      return "The courier withdrew from this order";
    case "order.completed":
      return "Order completed. Thanks!";
    case "order.cancelled":
      return params.reason ? `Order cancelled: ${String(params.reason)}` : "Order cancelled";
    case "order.expired":
      return "Order expired";
    // Generic chat-service events
    case "group_created":
      return `${who("by")} created the group "${String(params.title ?? "")}"`;
    case "member_added":
      return params.label
        ? `A ${String(params.label)} joined the chat`
        : `${who("user_id")} joined the chat`;
    case "member_removed":
      return `${who("user_id")} left the chat`;
    case "member_left":
      return `${who("user_id")} left`;
    case "conversation_closed":
      return "This chat is now read-only";
    default:
      return key.replace(/[._]/g, " ");
  }
}

export function preview(
  m: ChatMessage | null | undefined,
  nameOf: (id: string) => string,
  meId: string,
): string {
  if (!m) return "No messages yet";
  if (m.deleted_at) return "Message deleted";
  if (m.kind === "system") return renderSystem(m.payload, nameOf);
  const prefix = m.sender_id === meId ? "You: " : "";
  switch (m.kind) {
    case "text":
      return prefix + (m.body ?? "");
    case "image":
      return `${prefix}Photo`;
    case "file":
      return `${prefix}${String(m.payload?.name ?? "File")}`;
    case "location":
      return `${prefix}Location: ${String(m.payload?.label ?? "shared")}`;
  }
}

/** The order an order chat belongs to (set by chat-service's order integration). */
export function orderIdOf(conv: ChatConversation): string | null {
  const id = conv.metadata?.order_id;
  return typeof id === "string" ? id : null;
}

/** An order chat is titled with the order's name once it has loaded. */
export function chatTitle(
  conv: ChatConversation,
  orders: Record<string, OrderResponse | null>,
): string {
  const orderId = orderIdOf(conv);
  return (orderId && orders[orderId]?.name) || conv.title || "Chat";
}
