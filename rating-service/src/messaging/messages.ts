/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5)
 * Scope: Generated the message schemas consumed and published.
 * Reviewed by Ngooi Jun Sen.
 */

import { randomUUID } from 'node:crypto';
import { type Static, Type } from '@sinclair/typebox';
import { Role, Uuid } from '../schemas/rating.js';

// Messages use the flat catalog format from the API contract:
// { eventId, eventType, schemaVersion, occurredAt, ...fields }.

export const RATING_PERMISSION_GRANTED = 'rating.permission.granted';
export const USER_RATING_UPDATED = 'user.rating.updated';
export const USER_DELETED = 'UserDeleted';

// Consumed from foc.user.status. User Service builds it in buildUserDeletedEnvelope,
// in its own envelope rather than the flat catalog format: the event name is in
// `type` and the fields are under `data`.
export const UserDeleted = Type.Object({
  eventId: Type.String(),
  type: Type.Literal(USER_DELETED),
  occurredAt: Type.String(),
  data: Type.Object({ userId: Uuid }),
});
export type UserDeleted = Static<typeof UserDeleted>;

// Consumed from foc.rating.commands. Order Service builds it in
// OrderMessageFactory.ratingPermission. Extra fields are allowed and ignored.
export const RatingPermissionGranted = Type.Object({
  eventId: Uuid,
  eventType: Type.Literal(RATING_PERMISSION_GRANTED),
  schemaVersion: Type.Literal(1),
  occurredAt: Type.String(),
  orderId: Uuid,
  raterId: Uuid,
  raterRole: Role,
  rateeId: Uuid,
  rateeRole: Role,
});
export type RatingPermissionGranted = Static<typeof RatingPermissionGranted>;

// Published to foc.user.rating (F4.1): the user's new unified average and count.
// Only sent after a rating is stored, so newAverage is never null in practice.
export function ratingUpdatedMessage(
  userId: string,
  newAverage: number | null,
  totalRatings: number,
) {
  return {
    eventId: randomUUID(),
    eventType: USER_RATING_UPDATED,
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    userId,
    newAverage,
    totalRatings,
  };
}
