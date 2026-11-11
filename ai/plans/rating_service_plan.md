---
name: Rating Service Plan
overview: Implement the Friend on Campus rating-service backend in Fastify, inside rating-service only. Stores the ratings couriers and requesters give each other, accepting a rating only when Order has granted it, and keeps one average per user.
todos:
  - id: scaffold
    content: Scaffold Fastify + TypeBox app, Drizzle schema and migrations, Kafka consumer and producer, health routes, Dockerfile and Helm values, mirroring credit-service
    status: completed
  - id: grants
    content: Store rating.permission.granted from foc.rating.commands as grants keyed by order and rater
    status: completed
  - id: submit
    content: Accept a 1-5 score only with a matching unused grant; update the running total and write user.rating.updated to an outbox in one transaction
    status: completed
  - id: reads
    content: GET a user's unified average, the caller's pending grants, and admin reads
    status: completed
  - id: skip
    content: Record a skipped prompt on the server so it is hidden on every device while the grant stays valid
    status: completed
  - id: deletion
    content: On UserDeleted, delete grants and ratings received, anonymise ratings given, keep a tombstone
    status: completed
  - id: dlq
    content: Kafka DLQ topic with a capped replay script, replacing any dead-letter table
    status: completed
  - id: ci-docs
    content: CI job, README, sequence diagrams, interfaces and schema docs
    status: completed
isProject: false
---

# Rating Service — author decisions and implementation plan

Owner: Ngooi Jun Sen. Scope is only [`rating-service/`](../../rating-service/),
plus its Helm values, Kafka topics and CI job. Order, Badges and User appear
only as messages this service consumes or publishes.

How this file was made: no plan file was written before implementation. The
decisions below were given by the author in Claude Code sessions between
2026-10-10 and 2026-11-09 and were compiled into this file on 2026-11-10 from
those sessions. Each decision is dated with the day the author made it.

## Already decided by author (Ngooi Jun Sen)

- 2026-10-10: async messages use the flat catalog format
  `{ eventId, eventType, schemaVersion, occurredAt, ...fields }`. Errors use
  `{ error, code }` in every service.
- 2026-10-11: one unified average and count per user, as in the API contract,
  not one per role. This overrides backlog F1.1 and UI FR12.2.1.
- 2026-10-11: Order decides who may rate whom. It publishes
  `rating.permission.granted` (rater and ratee IDs and roles) on
  `foc.rating.commands`. Rating stores the grant, and the frontend's rating
  modal POSTs the score, which is accepted only with a matching grant.
- 2026-10-11: stack mirrors credit-service (Fastify, TypeBox, Drizzle with
  postgres.js, Vitest with a 90% floor). Kafka client
  `@confluentinc/kafka-javascript`, which set the pattern for the other Node
  consumers.
- 2026-10-14: service port 8085.
- 2026-10-22 and 2026-11-04: Order reads averages over REST. Rating publishes
  `user.rating.updated` through an outbox for Badges. One grant per
  (order, rater): a repeated grant, such as the one Order sends again at
  dispute resolution, is a no-op.
- 2026-11-08: "Skip" in the prompt is stored on the server (`skipped_at`) so it
  holds on every device. The grant stays valid. A skipped grant stays hidden
  after a dispute resolution.
- 2026-11-08: a Kafka DLQ topic `foc.rating.dlq` replaces any dead-letter
  table, with 30-day retention and a capped replay.
- 2026-11-08: on `UserDeleted`, use option A: delete the user's grants and the
  ratings they received, keep the ratings they gave with the rater removed
  (so other users' averages do not change), and keep a tombstone.
- 2026-10-30: add Rating to CI.

## Implementation outline (handed to Claude Code)

1. `src/messaging/grants.ts`: grants from Order, ignoring deleted users.
2. `src/routes/rating.routes.ts` and services: submit, skip, averages,
   pending list.
3. `src/messaging/outbox.ts`: relay to `foc.user.rating` after commit, with
   purge of sent rows.
4. `src/messaging/userEvents.ts`: account deletion.
5. `src/messaging/dlq.ts`, `src/scripts/replay-dlq.ts`.
6. Tests with the 90% floor; docs under `rating-service/docs/`.

## Out of scope

Per-role averages. Withdrawing a grant after a verdict. Any change to Order.
