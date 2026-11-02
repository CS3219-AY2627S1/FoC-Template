# Badges Service

Awards and revokes profile badges for FoC users (Badges F1-F4, NFR1-NFR2; UI
FR12.2.2 shows them). It has its own PostgreSQL database and learns about
activity from order, rating and admin **events** only: each event updates the
user's metrics and re-checks their badges straight away. It calls no other
service.

Stack mirrors rating-service: Fastify + TypeBox, Drizzle + postgres.js, Vitest
(90% coverage floor), `@confluentinc/kafka-javascript`.

## Decisions this implementation follows

- Events only (2026-11-02). This replaces the daily 22:00 UTC poll of User,
  Order and Rating (D1 Badges F2, F2.1, F2.1.1) and the admin manual run: a poll
  needed a badge-specific endpoint in Order that copies Badges' counting rules,
  and it repaired only what events had missed. Badges therefore has no
  scheduled job; NFR1.1 still holds, as evaluation never runs inside Order's or
  Rating's request handling.
- An order counts once, the first time it reaches DELIVERED, ACKNOWLEDGED,
  UNACKNOWLEDGED or COMPLETED (2026-10-30). Same list as Order Service's
  completed deliveries.
- An order that goes to ESCALATED is uncounted until Admin's verdict, then
  counted again for whoever was not at fault (2026-11-02): requester at fault →
  the courier's delivery counts; courier at fault → the requester's order
  counts; no-fault → both. Badges reads the verdict from `admin.case.resolved`
  itself.
- `GET /api/v1/badges/{userId}`, readable by its owner only (2026-09-21, path from the contract).
- Users are keyed by user ID; badges can be revoked (2026-09-21).

## How badges change

One consumer group `badges-service` (`src/messaging`):

- `order.status.changed` (foc.order.status): on a counted status, adds a
  `counted_order` row per role (requester → completed requests, courier →
  completed deliveries) and re-checks both users. The primary key makes later
  statuses and redeliveries no-ops. On ESCALATED, records the order and its
  parties in `disputed_order`, removes its rows and takes the counts back. A
  later counted status of a disputed order is ignored; only the verdict counts it.
- `admin.case.resolved` (foc.admin.events): stores `faultParty` on the
  `disputed_order` row and counts the order again for the party not at fault
  (`src/messaging/counting.ts`). The first verdict is kept. If it arrives
  before the escalation (different topics), it is applied when that comes.
- `user.rating.updated` (foc.user.rating): stores the whole average and count.
  Ratings are never deleted, so a message with a lower or equal count is older
  and is ignored.
- A message that fails 4 times is logged and skipped (NFR3.1.1).

A new consumer group reads what the topics still retain, so activity from
before Badges was first deployed is picked up if Kafka still has it.

When the catalog changes (a new badge, or a changed threshold or wording),
startup re-checks every user Badges has metrics for, 1,000 at a time
(`src/services/recheck.service.ts`, NFR1.1.1), in the background so the health
probes keep answering.

## Known limitations

Badge state is only as complete as the events Badges has read. Nothing repairs
metrics after the fact, so these stay wrong until the user's next event (or for
good, if they have none):

- Activity Kafka no longer holds: Badges first deployed, or its database reset,
  more than 7 days (Kafka's default retention) after it happened.
- A message skipped after 4 failed attempts, e.g. the database down at that moment.
- An `admin.case.resolved` Admin failed to publish: Admin has no outbox, so a
  verdict given while Kafka was down is logged and dropped.
- A verdict for an escalation Badges never saw: it has no parties to count.

## Endpoints

Identity comes from the gateway's `x-user-id` header.

- `GET /health`, `GET /health/db`.
- `GET /api/v1/badges/{userId}`: every catalog badge with `earned`, `earnedAt`,
  the unlock `criteria` (F4.1) and `progress` `{current, target}` for unearned
  ones (F4.1.1), plus `metricsAsOf`. 404 unless `x-user-id` is `userId`.

## Badge catalog

`src/catalog/badges.json` is upserted into `badge_catalog` at startup, so a new
badge or threshold on an existing metric needs no code change. A badge on a new
metric needs it added to `MetricName` and to `user_metrics`. All conditions on
a badge must hold. Thresholds are placeholders for the demo.

## What this service needs from teammates

Nothing beyond the events it already reads. The badges KafkaUser may read
foc.order.status, foc.user.rating and foc.admin.events
(`deploy/charts/foc-kafka/values.yaml`).

## Running it

```bash
docker compose up -d postgres   # Postgres on localhost:5434
npm install
npm run db:migrate
npm run dev                     # http://localhost:8086
npm run test:coverage           # creates badges_test and migrates it
```

Set `KAFKA_BROKERS` to consume events; without it badges never change.
Schema changes: edit `src/database/schema.ts`, then `npm run db:generate`.

## AI assistance

Generated with Claude Code (Claude Opus 5 on 2026-09-21 for the original
scaffold, Claude Opus 5.5 on 2026-10-30 for this port and 2026-11-02 for
fault-aware disputes and the move to events only); each file names its scope
in a header. Reviewed by Ngooi Jun Sen.
