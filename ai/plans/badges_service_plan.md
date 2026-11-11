---
name: Badges Service Plan
overview: Implement the Friend on Campus badges-service backend in Fastify, inside badges-service only. Awards and revokes profile badges from order, rating, admin and user events. Owns its own PostgreSQL database and calls no other service.
todos:
  - id: scaffold
    content: Scaffold Fastify + TypeBox app, Drizzle schema and migrations, Kafka consumer, health routes, Dockerfile and Helm values, mirroring rating-service
    status: completed
  - id: counting
    content: Count an order once for requester and courier the first time it reaches a counted status; re-check badges in the same transaction
    status: completed
  - id: ratings
    content: Keep each user's average and rating count from user.rating.updated
    status: completed
  - id: disputes
    content: Uncount ESCALATED orders and count them again from admin.case.resolved by fault party
    status: completed
  - id: events-only
    content: Remove the daily poll, the admin manual run and the job_run table; re-check all known users once when the catalog changes
    status: completed
  - id: deletion
    content: Remove a deleted account's badge data on UserDeleted and ignore later events for that user
    status: completed
  - id: dlq
    content: Replace the dead-letter table with a Kafka DLQ topic and a replay script with a replay cap
    status: completed
  - id: docs
    content: README, sequence and state diagrams, interfaces and schema docs in the order-service docs style
    status: completed
isProject: false
---

# Badges Service — author decisions and implementation plan

Owner: Ngooi Jun Sen. Scope is only [`badges-service/`](../../badges-service/),
plus its Helm values and its Kafka topic and user in `deploy/`. Order, User,
Rating and Admin appear only as the events this service consumes.

How this file was made: no plan file was written before implementation. The
decisions below were given by the author in Claude Code sessions between
2026-09-21 and 2026-11-09 and were compiled into this file on 2026-11-10 from
those sessions. Each decision is dated with the day the author made it.

## Already decided by author (Ngooi Jun Sen)

- 2026-09-21 (team): Badges is a separate service with its own database.
  Badges can be revoked. Users are keyed by user ID. Badges keeps a snapshot of
  the metrics it needs. The read endpoint is `GET /api/v1/badges/{userId}`,
  readable by its owner only, with the same 404 as an unknown route for
  anyone else.
- 2026-10-14: service port 8086.
- 2026-10-30: stack mirrors rating-service (Fastify, TypeBox, Drizzle with
  postgres.js, Vitest with a 90% coverage floor,
  `@confluentinc/kafka-javascript`).
- 2026-10-30: an order counts once, the first time it reaches DELIVERED,
  ACKNOWLEDGED, UNACKNOWLEDGED or COMPLETED, the same list as Order's
  completed deliveries. Order's status enum is part of its published event
  contract, so a change to it is a contract change.
- 2026-11-02: disputes are fault-aware. ESCALATED uncounts the order until
  Admin's verdict. Requester at fault: the courier's delivery counts. Courier
  at fault: the requester's order counts. No fault: both count. Badges reads
  `admin.case.resolved` from `foc.admin.events` itself rather than asking
  Order or Admin.
- 2026-11-02: events only. The daily 22:00 UTC poll of User, Order and Rating
  and the admin manual run are dropped. Reason: polling needed a
  badge-specific Order endpoint that copied Badges' counting rules (coupling),
  offset paging did not scale, and a self re-check without polling repaired
  nothing. A database reset past Kafka's 7-day retention was judged unlikely.
  A changed catalog triggers a one-off re-check of known users at startup.
- 2026-11-03: badge names (Double digits, Marathon runner, Veteran) and one
  added badge. Friendship badges were tried and reverted.
- 2026-11-08: a Kafka DLQ topic `foc.badges.dlq` replaces the dead-letter
  table outright, with 30-day retention. Replays are capped, and messages
  that expire or are dropped are logged in full.
- 2026-11-08/09: on `UserDeleted` (User F5), delete the user's badges,
  metrics and counted orders, and keep a tombstone so late or replayed events
  are ignored, as Credit does with `deleted_at`.

## Implementation outline (handed to Claude Code)

1. `src/messaging/orderEvents.ts`: validate `order.status.changed`, count
   counted statuses through the `(order_id, role)` primary key, record
   ESCALATED parties in `disputed_order`.
2. `src/messaging/adminEvents.ts` and `counting.ts`: store the first verdict
   and make `counted_order` match it; skip deleted parties.
3. `src/messaging/ratingEvents.ts`: average and count from Rating.
4. `src/messaging/userEvents.ts`: account deletion.
5. `src/messaging/dlq.ts`, `src/scripts/replay-dlq.ts`: dead letters and
   replay.
6. `src/services/catalog.service.ts`, `recheck.service.ts`: catalog upsert
   and the re-check on change.
7. Tests for every handler and route; docs under `badges-service/docs/`.

## Out of scope

Badge-earned notifications. Repairing drift from events Kafka no longer
holds. Any change to Order, Admin or User.
