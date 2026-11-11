/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-30
 * Scope: Generated TypeBox schemas for the consumed messages (admin.case.resolved added 2026-11-02).
 * Reviewed by Ngooi Jun Sen
 */

import { type Static, Type } from '@sinclair/typebox';
import { Uuid } from '../schemas/badges.js';

// Messages use the flat catalog format from the API contract:
// { eventId, eventType, schemaVersion, occurredAt, ...fields }. Extra fields are
// allowed and ignored, so publishers can add fields without breaking Badges.

export const ORDER_STATUS_CHANGED = 'order.status.changed';
export const USER_RATING_UPDATED = 'user.rating.updated';

export const OrderStatus = Type.Union(
  [
    'CREATED',
    'ACCEPTED',
    'COLLECTED',
    'DELIVERED',
    'ACKNOWLEDGED',
    'UNACKNOWLEDGED',
    'ESCALATED',
    'UNDER_REVIEW',
    'EXPIRED',
    'CANCELLED',
    'COMPLETED',
  ].map((status) => Type.Literal(status)),
);

// From foc.order.status. Order Service builds it in OrderMessageFactory.statusChanged.
export const OrderStatusChanged = Type.Object({
  eventId: Type.String(),
  eventType: Type.Literal(ORDER_STATUS_CHANGED),
  schemaVersion: Type.Literal(1),
  occurredAt: Type.String(),
  orderId: Uuid,
  requesterId: Uuid,
  courierId: Type.Union([Uuid, Type.Null()]),
  fromStatus: Type.Union([OrderStatus, Type.Null()]),
  toStatus: OrderStatus,
});
export type OrderStatusChanged = Static<typeof OrderStatusChanged>;

// From foc.user.rating. Rating Service builds it in ratingUpdatedMessage: the
// user's whole current average and count, not a delta.
export const UserRatingUpdated = Type.Object({
  eventId: Type.String(),
  eventType: Type.Literal(USER_RATING_UPDATED),
  schemaVersion: Type.Literal(1),
  occurredAt: Type.String(),
  userId: Uuid,
  newAverage: Type.Union([Type.Number({ minimum: 0, maximum: 5 }), Type.Null()]),
  totalRatings: Type.Integer({ minimum: 0 }),
});
export type UserRatingUpdated = Static<typeof UserRatingUpdated>;

export const ADMIN_CASE_RESOLVED = 'admin.case.resolved';

// From foc.admin.events. Admin Service builds it in publish_conflict_resolved;
// faultParty is its stored verdict (FaultParty in app/models/conflict_case.py).
export const AdminCaseResolved = Type.Object({
  eventId: Type.String(),
  eventType: Type.Literal(ADMIN_CASE_RESOLVED),
  schemaVersion: Type.Literal(1),
  occurredAt: Type.String(),
  orderId: Uuid,
  caseId: Type.String(),
  faultParty: Type.Union([Type.Literal('requester'), Type.Literal('courier'), Type.Literal('no-fault')]),
});
export type AdminCaseResolved = Static<typeof AdminCaseResolved>;

export const USER_DELETED = 'UserDeleted';

// From foc.user.status. User Service builds it in buildUserDeletedEnvelope, in
// its own envelope rather than the flat catalog format: the event name is in
// `type` and the fields are under `data`.
export const UserDeleted = Type.Object({
  eventId: Type.String(),
  type: Type.Literal(USER_DELETED),
  occurredAt: Type.String(),
  data: Type.Object({ userId: Uuid }),
});
export type UserDeleted = Static<typeof UserDeleted>;
