// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09, 2026-10-11
// Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
// Scope: Implemented the participant Order HTTP client and error handling.
// Author review: I validated correctness and added boundary checks where needed.

import { requestJson } from "./client";

export type OrderState = "OPEN" | "ACCEPTED" | "PICKED_UP" | "DELIVERED" | "DISPUTED" | "COMPLETED" | "CANCELLED" | "EXPIRED" | "FAILED";
export type OrderRelationship = "requester" | "courier";
export type OrderAction = "accept" | "cancel" | "pickup" | "deliver" | "complete";
export const failureReasons = {
  ITEM_UNAVAILABLE: "Item unavailable",
  ITEM_DAMAGED: "Item damaged",
  UNABLE_TO_PICK_UP: "Unable to pick up",
  UNABLE_TO_DELIVER: "Unable to deliver",
  PARTICIPANT_UNREACHABLE: "Participant unreachable",
  OTHER: "Other",
} as const;
// N2F3: the problem a reporter selects; an accepted dispute fails the errand with it.
export type FailureReason = keyof typeof failureReasons;
// Legacy errands failed by an administrator before disputed errands keep ADMIN_DECISION.
export type RecordedFailureReason = FailureReason | "ADMIN_DECISION";
export const failureReasonLabel = (reason: RecordedFailureReason): string =>
  reason === "ADMIN_DECISION" ? "Decided by an administrator" : failureReasons[reason];
export const stateNames: Record<OrderState, string> = {
  OPEN: "Open", ACCEPTED: "Accepted", PICKED_UP: "Picked up", DELIVERED: "Delivered", DISPUTED: "Disputed",
  COMPLETED: "Completed", CANCELLED: "Cancelled", EXPIRED: "Expired", FAILED: "Failed",
};

export type OrderInput = {
  supplierId: string;
  itemDescription: string;
  deliveryLocation: string;
  reward: number;
  acceptanceDeadline: string;
  deliveryDeadline: string;
};

export type OrderAssessment = OrderInput & {
  orderId: string;
  pickup: {
    name: string;
    buildingArea: string;
    pickupLocationDescription: string;
    floor: string | null;
    latitude: number | null;
    longitude: number | null;
    updatedAt: string;
  };
  state: OrderState;
  createdAt: string;
};

export type OrderParticipant = OrderAssessment & {
  requesterId: string;
  courierId: string | null;
  updatedAt: string;
  acceptedAt?: string | null;
  cancelledAt?: string | null;
  expiredAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  completedAt?: string | null;
  overdueAt?: string | null;
  failedAt?: string | null;
  failedBy?: string | null;
  failureReason?: RecordedFailureReason | null;
  failureDetails?: string | null;
  // N2F3.7: participants learn that an administrator decided, never which one.
  decidedByAdministrator?: boolean;
  decisionDisputeId?: string | null;
  decidedBy?: string | null;
  // N2F3: the open dispute holding the errand and the state it returns to if not accepted.
  disputeId?: string | null;
  disputedFromState?: "ACCEPTED" | "PICKED_UP" | "DELIVERED" | null;
  disputedAt?: string | null;
};

export type OrderDetail = OrderAssessment | OrderParticipant;

export type OrderCreation = {
  operationId: string;
  stage: "VALIDATED" | "RESERVATION_UNKNOWN" | "READY_TO_FINALIZE" | "SUCCEEDED" | "ABORTING" | "ABORTED";
  statusUrl: string;
  retryCreation: boolean;
  errorCode: string | null;
  orderId: string | null;
};

export type OrderHistoryEntry = {
  sequence: number;
  previousState: OrderState | null;
  newState: OrderState;
  actorId: string | null;
  actorType: "USER" | "SYSTEM" | "ADMIN";
  occurredAt: string;
  failureReason?: RecordedFailureReason | null;
  failureDetails?: string | null;
  disputeId?: string | null;
};

export type OrderPage<T> = { items: T[]; page: number; pageSize: number; total: number };
export type OrderPageQuery = { page?: number; pageSize?: number };

function pageParams(query: OrderPageQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));
  return params;
}

export const orderService = {
  // The caller owns this key: reuse both key and unchanged body after an
  // ambiguous result or auth refresh. A 202 is not a successful Order.
  create: (input: OrderInput, idempotencyKey: string, token: string) => {
    const { supplierId, itemDescription, deliveryLocation, reward, acceptanceDeadline, deliveryDeadline } = input;
    return requestJson<OrderParticipant | OrderCreation>("/orders", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ supplierId, itemDescription, deliveryLocation, reward, acceptanceDeadline, deliveryDeadline }),
    }, token);
  },
  // Construct a fixed-origin path; never follow an upstream-supplied statusUrl
  // with the user's bearer token.
  creation: (operationId: string, token: string) =>
    requestJson<OrderCreation>(`/order-creations/${encodeURIComponent(operationId)}`, { method: "GET" }, token),
  list: (query: OrderPageQuery & { supplierId?: string }, token: string) => {
    const params = pageParams(query);
    if (query.supplierId) params.set("supplierId", query.supplierId);
    return requestJson<OrderPage<OrderAssessment>>(`/orders${params.size ? `?${params}` : ""}`, { method: "GET" }, token);
  },
  mine: (relationship: OrderRelationship, query: OrderPageQuery, token: string) => {
    const params = pageParams(query);
    params.set("relationship", relationship);
    return requestJson<OrderPage<OrderParticipant>>(`/orders/mine?${params}`, { method: "GET" }, token);
  },
  detail: (orderId: string, token: string) =>
    requestJson<OrderDetail>(`/orders/${encodeURIComponent(orderId)}`, { method: "GET" }, token),
  accept: (orderId: string, token: string) =>
    requestJson<OrderParticipant>(`/orders/${encodeURIComponent(orderId)}/accept`, { method: "POST" }, token),
  cancel: (orderId: string, token: string) =>
    requestJson<OrderParticipant>(`/orders/${encodeURIComponent(orderId)}/cancel`, { method: "POST" }, token),
  pickup: (orderId: string, token: string) =>
    requestJson<OrderParticipant>(`/orders/${encodeURIComponent(orderId)}/pickup`, { method: "POST" }, token),
  deliver: (orderId: string, token: string) =>
    requestJson<OrderParticipant>(`/orders/${encodeURIComponent(orderId)}/deliver`, { method: "POST" }, token),
  complete: (orderId: string, token: string) =>
    requestJson<OrderParticipant>(`/orders/${encodeURIComponent(orderId)}/complete`, { method: "POST" }, token),
  history: (orderId: string, query: OrderPageQuery, token: string) => {
    const params = pageParams(query);
    return requestJson<OrderPage<OrderHistoryEntry>>(`/orders/${encodeURIComponent(orderId)}/history${params.size ? `?${params}` : ""}`, { method: "GET" }, token);
  },
};

export type AdminOrderQuery = OrderPageQuery & {
  state?: OrderState[];
  orderId?: string;
  participantId?: string;
  supplierId?: string;
  createdFrom?: string;
  createdTo?: string;
  overdue?: boolean;
};
export type CountsByState = Record<OrderState, number>;
export type AnalyticsPeriod = { from: string; to: string; timeZone: "Asia/Singapore"; generatedAt: string };
export type OrderAnalytics = AnalyticsPeriod & {
  totalCreated: number;
  byState: CountsByState;
  rates: { completed: number | null; cancelled: number | null; expired: number | null; failed: number | null };
  daily: { day: string; created: number }[];
  participants: { requesters: number; couriers: number; distinctParticipants: number };
  meanCompletionMinutes: number | null;
  suppliers: { supplierId: string; supplierName: string; created: number; completed: number; meanCompletionMinutes: number | null }[];
};
export type UserOrderAnalytics = AnalyticsPeriod & {
  userId: string;
  asRequester: { total: number; byState: CountsByState };
  asCourier: { total: number; byState: CountsByState };
};

// Read-only administrator views (N2F2, N2F4); Order re-checks the current role on every call.
export const adminOrderService = {
  list: (query: AdminOrderQuery, token: string) => {
    const params = pageParams(query);
    for (const state of query.state ?? []) params.append("state", state);
    for (const key of ["orderId", "participantId", "supplierId", "createdFrom", "createdTo"] as const) {
      const value = query[key];
      if (value) params.set(key, value);
    }
    if (query.overdue !== undefined) params.set("overdue", String(query.overdue));
    return requestJson<OrderPage<OrderParticipant>>(`/admin/orders${params.size ? `?${params}` : ""}`, { method: "GET" }, token);
  },
  detail: (orderId: string, token: string) =>
    requestJson<OrderParticipant>(`/admin/orders/${encodeURIComponent(orderId)}`, { method: "GET" }, token),
  history: (orderId: string, query: OrderPageQuery, token: string) => {
    const params = pageParams(query);
    return requestJson<OrderPage<OrderHistoryEntry>>(`/admin/orders/${encodeURIComponent(orderId)}/history${params.size ? `?${params}` : ""}`, { method: "GET" }, token);
  },
  analytics: (from: string, to: string, token: string) =>
    requestJson<OrderAnalytics>(`/admin/orders/analytics?${new URLSearchParams({ from, to })}`, { method: "GET" }, token),
  userAnalytics: (userId: string, from: string, to: string, token: string) =>
    requestJson<UserOrderAnalytics>(`/admin/orders/analytics/users/${encodeURIComponent(userId)}?${new URLSearchParams({ from, to })}`, { method: "GET" }, token),
};
