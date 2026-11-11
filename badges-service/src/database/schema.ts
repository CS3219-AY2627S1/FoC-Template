/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-30
 * Scope: Generated the Drizzle schema (ported from the scaffold's 001_init.sql, plus the
 *        tables the event path needs: counted_order and disputed_order).
 * Reviewed by Ngooi Jun Sen
 */

import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { BadgeCondition, MetricName } from '../types.js';

export const targetRole = pgEnum('badge_target_role', ['courier', 'requester', 'any']);
export const orderRole = pgEnum('order_role', ['COURIER', 'REQUESTER']);
export const badgeState = pgEnum('badge_state', ['earned', 'revoked']);
// Admin Service's FaultParty values, hyphen included.
export const faultParty = pgEnum('fault_party', ['requester', 'courier', 'no-fault']);

// F1.1: the catalog, upserted from src/catalog/badges.json at startup.
export const badgeCatalog = pgTable('badge_catalog', {
  badgeId: text('badge_id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  targetRole: targetRole('target_role').notNull(),
  displayOrder: integer('display_order').notNull(),
  iconEarnedUrl: text('icon_earned_url').notNull(),
  iconUnearnedUrl: text('icon_unearned_url').notNull(),
  // F1.1.3: every {metric, op, value} must hold for the badge to be held.
  conditions: jsonb('conditions').$type<BadgeCondition[]>().notNull(),
  // F4.1.1: the metric shown as "7 of 10" on the profile.
  progressMetric: text('progress_metric').$type<MetricName>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// One row per order and role that counts towards a user's totals. Order events
// insert rows; the primary key makes a redelivered event a no-op (NFR2.1).
export const countedOrder = pgTable(
  'counted_order',
  {
    orderId: uuid('order_id').notNull(),
    role: orderRole('role').notNull(),
    userId: uuid('user_id').notNull(),
    countedAt: timestamp('counted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.role] }), index('counted_order_user_idx').on(t.userId)],
);

// Orders that went to ESCALATED. Uncounted until Admin's verdict, then counted
// again for whoever was not at fault (decision 2026-11-02). The two events come
// on different topics, so either half of a row may arrive first: the parties
// from order.status.changed, the verdict from admin.case.resolved.
export const disputedOrder = pgTable('disputed_order', {
  orderId: uuid('order_id').primaryKey(),
  requesterId: uuid('requester_id'),
  courierId: uuid('courier_id'),
  faultParty: faultParty('fault_party'),
  disputedAt: timestamp('disputed_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

// What badges are judged on, kept current by events only (decision 2026-11-02):
// counts from order and admin events, the rating pair from user.rating.updated.
export const userMetrics = pgTable(
  'user_metrics',
  {
    userId: uuid('user_id').primaryKey(),
    completedDeliveries: integer('completed_deliveries').notNull().default(0),
    completedOrders: integer('completed_orders').notNull().default(0),
    averageRating: doublePrecision('average_rating'),
    ratingCount: integer('rating_count').notNull().default(0),
    // Last time an order event changed the counts.
    lastOrderEventAt: timestamp('last_order_event_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('user_metrics_deliveries_nonneg', sql`${t.completedDeliveries} >= 0`),
    check('user_metrics_orders_nonneg', sql`${t.completedOrders} >= 0`),
    check('user_metrics_rating_count_nonneg', sql`${t.ratingCount} >= 0`),
  ],
);

// One row per (user, badge) so re-evaluating is idempotent (F3.1.1). State moves
// both ways because badges can be revoked (NFR2.1.2). F3.1: earn timestamps kept.
export const userBadge = pgTable(
  'user_badge',
  {
    userId: uuid('user_id').notNull(),
    badgeId: text('badge_id')
      .notNull()
      .references(() => badgeCatalog.badgeId, { onDelete: 'cascade' }),
    state: badgeState('state').notNull(),
    firstEarnedAt: timestamp('first_earned_at', { withTimezone: true }).notNull().defaultNow(),
    earnedAt: timestamp('earned_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.badgeId] })],
);

// Users whose account was deleted (UserDeleted on foc.user.status). Their other
// rows are removed; this one stays so a late or replayed event for them is
// ignored instead of bringing their badges back (User F5, decision 2026-11-09).
export const deletedUser = pgTable('deleted_user', {
  userId: uuid('user_id').primaryKey(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CatalogRow = typeof badgeCatalog.$inferSelect;
export type UserMetricsRow = typeof userMetrics.$inferSelect;
export type UserBadgeRow = typeof userBadge.$inferSelect;
export type DisputedOrderRow = typeof disputedOrder.$inferSelect;
