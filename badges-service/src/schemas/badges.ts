/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-30
 * Scope: Generated TypeBox request/response schemas for the badges routes.
 * Reviewed by Ngooi Jun Sen
 */

import { type Static, Type } from '@sinclair/typebox';

// Each schema is both the runtime JSON Schema and, via Static<>, the TS type.

export const Uuid = Type.String({
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
});

// Identity headers the gateway injects after User Service's authorize check.
// Optional here so a missing header is answered with the same 404 as a wrong one.
export const IdentityHeaders = Type.Object({
  'x-user-id': Type.Optional(Type.String()),
  'x-is-admin': Type.Optional(Type.String()),
});
export type IdentityHeaders = Static<typeof IdentityHeaders>;

export const UserParams = Type.Object({ userId: Uuid });
export type UserParams = Static<typeof UserParams>;

const Condition = Type.Object({
  metric: Type.String(),
  op: Type.Union([Type.Literal('gte'), Type.Literal('lte')]),
  value: Type.Number(),
});

const Progress = Type.Object({ current: Type.Number(), target: Type.Number() });

// GET /api/v1/badges/{userId} (F4): every catalog badge, earned or not.
export const UserBadgesResponse = Type.Object({
  userId: Uuid,
  metricsAsOf: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  earnedCount: Type.Integer(),
  totalCount: Type.Integer(),
  badges: Type.Array(
    Type.Object({
      badgeId: Type.String(),
      title: Type.String(),
      description: Type.String(),
      targetRole: Type.Union([Type.Literal('courier'), Type.Literal('requester'), Type.Literal('any')]),
      displayOrder: Type.Integer(),
      iconUrl: Type.String(),
      earned: Type.Boolean(),
      earnedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
      // F4.1: what unlocks it.
      criteria: Type.Array(Condition),
      // F4.1.1: how far along, for unearned badges.
      progress: Type.Union([Progress, Type.Null()]),
    }),
  ),
});
export type UserBadgesResponse = Static<typeof UserBadgesResponse>;
