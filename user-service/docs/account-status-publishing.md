<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-10-18
Scope: Implementation notes for publishing account-status notifications from User Service to
       Kafka, following the contract already set in credit-service/docs/implementation-proposal.md
       §5 (topic, key, fields, outbox on the producer side). Items not yet decided are marked
       "Author decision" and left open.
Author review: Reviewed and approved by @phuc
Additional AI assistance: Codex (GPT-6), date: 2026-10-18
Scope: Revised batching, consumer duplicate protection, startup, and password hashing after review.
Author review of additional changes: Reviewed and approved by @phuc
-->

# User Service: publishing `user.account-status` to Kafka

Implementation status (2026-10-18): the outbox, batch publisher, registration/bootstrap and
suspend/restore call sites, Kafka configuration, cleanup, and Credit Service duplicate protection
are implemented. The design examples below describe the implementation approach; current APIs
live in `src/`. `insertPreparedAccount()` records the initial activation itself, and
`createAccount()` prepares before acquiring a connection and opens the transaction for registration.
Administrators receive initial activation too. Existing-user backfill remains opt-in and has not
been added as a migration. The immediate-order activation race remains a rollout limitation (§6).
The implementation extends Credit's original no-inbox decision with a narrow status-dedup table.

User Service has to tell other services when an account's status changes. Credit Service uses
these notifications to create the credit account with its initial grant, and to block, restore or
forfeit credits. Order Service is also listed as a consumer.

This document describes how to add that to User Service. The contract itself (topic, key, fields,
producer-side outbox) was already set in
[credit-service/docs/implementation-proposal.md §5](../../credit-service/docs/implementation-proposal.md).
The wire contract stays unchanged. The consumer duplicate protection proposed below is an
additional implementation requirement for safe batch replay.

Before this implementation, User Service had no Kafka client, outbox or publisher. The original
status-change call sites were:

| Where | What changes | Code |
|---|---|---|
| `POST /auth/register` | New account, status `ACTIVE` | `src/auth.ts` → `createAccount()` in `src/accounts.ts` (runs on the pool, **no transaction**) |
| First-admin bootstrap | New administrator, status `ACTIVE` | `src/bootstrap.ts` (own transaction with an audit entry) |
| Admin suspend / restore | `ACTIVE ⇄ SUSPENDED` | `changeAccountStatus()` in `src/accountStatus.ts`, inside `runAdminAction()` (transaction + admin-actions advisory lock) |
| (none yet) | `CLOSED` | Nothing sets it yet |

---

## 1. Contract (unchanged, for reference)

| Item | Value |
|---|---|
| Topic | `user.account-status` (already created by `kafka/create-topics.sh`, 1 partition) |
| Key | `account_id`, so one account's notifications stay in order |
| Value | JSON, UTF-8 |
| Consumers | `credit-service` (group `credit-service`), `order-service` (group `order-service`) |

Fields (§5.2):

```text
operation_id   uuid      unique per status change, stable across retries
account_id     uuid
new_status     ACTIVE | SUSPENDED | CLOSED
first_active   true | false   (true only on the first ACTIVE; false on restore)
occurred_at    ISO-8601 timestamp
schema_version 1
```

Examples:

```json
{ "operation_id": "5b0e8f0a-2a4b-4c7e-9a3f-0d2c1e4b5a69",
  "account_id":   "a1111111-1111-4111-8111-111111111111",
  "new_status": "ACTIVE", "first_active": true,
  "occurred_at": "2026-10-20T09:00:00.000Z", "schema_version": 1 }
```

```json
{ "operation_id": "c4d3e2f1-0a9b-4c8d-8e7f-6a5b4c3d2e1f",
  "account_id":   "a1111111-1111-4111-8111-111111111111",
  "new_status": "SUSPENDED", "first_active": false,
  "occurred_at": "2026-10-21T14:12:03.120Z", "schema_version": 1 }
```

How Credit Service handles each message (`credit-service/src/accounts.ts`), so you can see which
mistakes it catches:

| Message | Credit Service does | If User Service gets it wrong |
|---|---|---|
| `ACTIVE`, `first_active=true` | Creates the account with the initial grant. A second one for the same account is a duplicate and does nothing. | The grant is given only once, so a resend is safe. |
| `ACTIVE`, `first_active=false` | Sets the status to `ACTIVE` (restore). | Sent before the first-active message: the account doesn't exist yet, so it goes to `user.account-status.dlq`. |
| `SUSPENDED` | Sets the status. | Same as above. |
| `CLOSED` | Sets the status. Forfeits the balance now, or after the last hold is finalised. | `CLOSED` is final: anything after it goes to the DLQ. |
| `first_active=true` with a status other than `ACTIVE` | Rejected as malformed → DLQ. | — |

Credit Service has **no version check** on status changes. If an older notification arrives after
a newer one for the same account, the older status wins. So User Service must publish each
account's notifications **in the order they were committed** (§5).

---

## 2. Approach: transactional outbox

User Service must not send to Kafka from inside the request handler. If the send succeeds and
the transaction then rolls back, Credit Service sees a change that never happened. If the
transaction commits and the send fails, the change is never announced.

Instead, as already agreed in §5.3:

1. In **the same transaction** as the status change, insert one row into a new `outbox` table.
2. A background **publisher** in the same process reads unpublished rows in order, produces them
   to Kafka, waits for the broker acknowledgment (`acks=all`), and then sets `published_at`.
3. A crash after the acknowledgment but before `published_at` is set only produces a duplicate.
   Consumers must deduplicate each notification transactionally by `operation_id` (see §5).
   Credit Service currently deduplicates the initial grant by account only; its status updates
   still need this additional protection before rollout.

This gives at-least-once delivery without a distributed transaction. The same pattern already
runs in `credit-service/src/outbox.ts` and `publisher.ts` and can be adapted.

---

## 3. Database: migration `0003_account_status_outbox.sql`

User Service migrations are forward-only and checksummed. Add a new file; never edit `0001` or
`0002`.

The implemented table copies Credit Service's outbox, with two differences explained after it.

```sql
-- Never edit this file after it is merged; add a new numbered file instead.

CREATE TABLE outbox (
  id            BIGSERIAL PRIMARY KEY,           -- publish order (see §5)
  event_id      UUID  NOT NULL UNIQUE,           -- sent as operation_id
  topic         TEXT  NOT NULL,
  message_key   TEXT  NOT NULL,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);

-- The publisher reads unpublished rows in id order
CREATE INDEX outbox_unpublished_idx ON outbox (id) WHERE published_at IS NULL;
-- Cleanup deletes published rows by age without scanning the whole table
CREATE INDEX outbox_published_idx   ON outbox (published_at) WHERE published_at IS NOT NULL;

-- INSERT in the status-change transaction; UPDATE to mark published; DELETE after retention
GRANT SELECT, INSERT, UPDATE, DELETE ON outbox TO user_app;
GRANT USAGE ON SEQUENCE outbox_id_seq TO user_app;
```

The two differences from Credit Service's outbox:

- **Order by `id`, not `created_at`.** `created_at = now()` is the transaction *start* time, and
  rows with equal timestamps have no defined order. `id` is assigned at insert time and never
  ties. §5 explains why that is enough per account.
- **An index on `published_at` for cleanup.** Credit Service's cleanup scans the table because it
  only has an index on unpublished rows. Adding the index now avoids that.

The migration runner applies each file in one transaction, so `CREATE INDEX CONCURRENTLY` is not
available. The table is new and empty, so this doesn't matter here.

---

## 4. Code changes

### 4.1 New dependency and configuration

- `package.json`: add `@confluentinc/kafka-javascript`, the same client Credit Service uses. npm
  blocks its install script by default. Credit Service allows it with `allowScripts` in
  `package.json`; do the same here.
- `src/config.ts` (the only file that reads `process.env`): add `loadKafkaConfig()` returning
  `brokers` (`KAFKA_BROKERS`, required, comma-separated) and `clientId` (`KAFKA_CLIENT_ID`,
  default `user-service`), and an `OUTBOX` constant:

  ```ts
  export const OUTBOX = {
    topic: "user.account-status",
    batchSize: 100,             // maximum rows, never wait for a full batch
    idlePollMs: 200,            // fallback polling; also wake after commit, see §6
    retentionDays: 7,
    cleanupIntervalMs: 60 * 60 * 1000,
  };
  ```

- `compose.yaml`, service `user-service`: add `KAFKA_BROKERS: kafka:9092` and
  `KAFKA_CLIENT_ID: user-service`.
  Keep topic provisioning in `kafka-init`, but do not make User Service startup depend on
  `kafka-init` completing. While Kafka or its topic is unavailable, publishing retries and
  committed notifications remain in the outbox.

### 4.2 `src/kafka.ts` (new)

Copy `credit-service/src/kafka.ts`. It covers what's needed here:
`createKafka()`, `createProducer()` with `idempotent: true, acks: -1`, and `sendMessages()`, which
sends messages in order and throws `KafkaSendError` on failure.
For this single topic, send the selected rows in one
`producer.send({ topic: OUTBOX.topic, messages })` call, preserving their `id` order. Await the
whole send before marking any row published; do not await a separate send for every event.
Keep `idempotent: true` and `acks: -1`. Do not add a large linger delay: prompt account activation
matters more than filling a larger Kafka batch. Tune further only after measuring latency and throughput.

### 4.3 `src/outbox.ts` (new)

One function that every status change calls inside its transaction, plus the batch publish and
cleanup.

```ts
import { randomUUID } from "node:crypto";
import { PoolClient } from "pg";
import { OUTBOX } from "./config";

export type NotifiedStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";

/**
 * Records a user.account-status notification. Call it in the transaction that changes the
 * status, so the notification exists if and only if the change commits.
 */
export async function recordStatusChange(
  client: PoolClient,
  change: { accountId: string; newStatus: NotifiedStatus; firstActive: boolean },
): Promise<void> {
  if (change.firstActive && change.newStatus !== "ACTIVE") {
    throw new Error("first_active is only valid with ACTIVE"); // Credit would dead-letter it
  }
  const operationId = randomUUID();
  await client.query(
    `INSERT INTO outbox (event_id, topic, message_key, payload)
     VALUES ($1, $2, $3, $4)`,
    [
      operationId,
      OUTBOX.topic,
      change.accountId,
      {
        operation_id: operationId,
        account_id: change.accountId,
        new_status: change.newStatus,
        first_active: change.firstActive,
        occurred_at: new Date().toISOString(),
        schema_version: 1,
      },
    ],
  );
}
```

`publishOutboxBatch()` follows Credit Service's version, with the ordering changes from §5:

```ts
export async function publishOutboxBatch(
  pool: Pool,
  produce: (messages: { key: string; payload: unknown }[]) => Promise<void>,
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // One publisher at a time across all replicas (§5). Released at COMMIT/ROLLBACK.
    const { rows: [lock] } = await client.query("SELECT pg_try_advisory_xact_lock($1) AS ok", [OUTBOX_LOCK_ID]);
    if (!lock.ok) { await client.query("ROLLBACK"); return 0; }

    const { rows } = await client.query(
      `SELECT id, message_key, payload FROM outbox
       WHERE published_at IS NULL ORDER BY id LIMIT $1`,
      [OUTBOX.batchSize],
    );
    if (rows.length > 0) {
      await produce(rows.map((r) => ({ key: r.message_key, payload: r.payload }))); // throws → nothing marked
      await client.query("UPDATE outbox SET published_at = now() WHERE id = ANY($1::bigint[])", [rows.map((r) => r.id)]);
    }
    await client.query("COMMIT");
    return rows.length;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
```

`OUTBOX_LOCK_ID` must not be the same number as `ADMIN_ACTIONS_LOCK_ID` or `BOOTSTRAP_LOCK_ID`.

`deletePublishedOutboxEvents()` deletes in limited batches, so one run never deletes everything
in one statement:

```sql
DELETE FROM outbox WHERE id IN (
  SELECT id FROM outbox
  WHERE published_at < now() - make_interval(days => $1)
  ORDER BY published_at LIMIT 1000)
```

Repeat until it deletes fewer than 1000 rows.

### 4.4 `src/publisher.ts` (new)

Copy `credit-service/src/publisher.ts`: a loop that runs batches back to back while there is
work, sleeps `idlePollMs` when the outbox is empty, backs off on failures, and runs cleanup on an
interval. `produce` calls `sendMessages()` with
`{ topic: OUTBOX.topic, key, value: JSON.stringify(payload) }`.

To cut the delay without a shorter poll interval: after a status-change transaction
commits, call a `wakePublisher()` function that ends the current sleep early. This only helps
the instance that made the change. The other replicas still poll. Treat wake-up as a hint:
polling remains the fallback if a wake-up is missed. Publish any available rows immediately,
up to 100 at a time; never wait for the batch to fill.

### 4.5 Registration: `src/auth.ts` and `src/accounts.ts`

Registration calls `createAccount()`, which now splits account preparation
(validation and bcrypt hashing) from insertion. Prepare before acquiring a pooled connection,
then wrap only the account insert and notification in a transaction so they commit together.
`prepareAccount()` and `insertPreparedAccount()` implement these steps; the insertion helper
records the initial activation, so callers must not record it a second time:

```ts
const prepared = await prepareAccount({ ...fields, role: "MEMBER" });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const account = await insertPreparedAccount(prepared, client);
  await client.query("COMMIT");
  wakePublisher();
  res.status(201).json(account);
} catch (err) {
  await client.query("ROLLBACK");
  // existing ValidationError / ConflictError handling
} finally {
  client.release();
}
```

Keep database uniqueness constraints and existing conflict handling on insertion: preparation
cannot guarantee an email or username remains available. Only the prepared password hash is
persisted. Bcrypt runs before `pool.connect()` and `BEGIN`, so it does not occupy a database
connection while doing CPU work. Preserve `createAccount()` as a wrapper if other callers need
it, and reuse the preparation/insertion helpers for bootstrap where practical.

> **Author decision:** whether registration with `PENDING_VERIFICATION` will come back. The first
> notification must be sent on the *first transition to ACTIVE*, wherever that happens. It must
> not be sent when the row is created.

### 4.6 First-admin bootstrap: `src/bootstrap.ts`

Prepare the administrator before acquiring its connection. Inside the existing bootstrap
transaction, `insertPreparedAccount()` inserts both the administrator and its activation;
`appendAudit()` adds the audit entry before commit:

```ts
const admin = await insertPreparedAccount(prepared, client);
// appendAudit(...) and COMMIT follow in bootstrap.ts
```

Administrators receive a credit account through the same activation contract as members.

### 4.7 Suspend / restore: `src/accountStatus.ts`

Inside `changeAccountStatus()`, in the `if (t.status === rule.from)` branch, next to the audit
entry:

```ts
await recordStatusChange(client, { accountId: targetId, newStatus: rule.to as NotifiedStatus, firstActive: false });
```

A repeated request (status already `rule.to`) writes no audit entry and must write **no
notification** either. It's not wrong to send one, but it's noise.

### 4.8 Closing (future)

When closing is implemented, it must:
- take the same admin-actions lock (or `SELECT … FOR UPDATE` on the user row). §5 relies on this.
- call `recordStatusChange(client, { newStatus: "CLOSED", firstActive: false })` in the same
  transaction.
- never move an account out of `CLOSED`. Credit Service treats `CLOSED` as final.

### 4.9 `src/index.ts`

- At startup, after the database is reachable: create the producer and start the background
  publisher, then start the HTTP server without awaiting a Kafka connection. The publisher
  owns connection attempts and publishing, retrying failures with back-off. Registration must
  keep working while Kafka is down because rows queue in the outbox. Avoid concurrent connect
  attempts, and make shutdown stop retries and bound any in-flight connection/send wait.
- On shutdown: `await publisher.stop()` and `await producer.disconnect()` **before**
  `pool.end()`, all within the existing 10 s shutdown timeout.
- `/health` stays a database check only. A Kafka outage must not make User Service unready.

---

## 5. Ordering guarantees

Credit Service applies status changes in the order it reads them and has no version check. So
the order of messages on the topic must match the order of commits **for each account**. This
is why:

1. **Only one publisher at a time.** `pg_try_advisory_xact_lock` in each batch means only one
   replica publishes at a time. The others get `false` and sleep. Without it, two replicas using
   `FOR UPDATE SKIP LOCKED` could publish batches in either order, which is how Credit Service's
   issue #5 ("old status notification undoes a newer one") would happen.
2. **Rows go out in `id` order, and the next batch starts only after the previous one is
   marked.** A batch that was acknowledged but not marked (crash) is sent again *before* anything
   newer. The consumer may see `A, B, A, B, C`. Without duplicate protection, replaying A can
   undo B temporarily, even though the final status is correct. For example, replaying a restore
   after a suspension can allow a reservation from `credit.commands` during that interval.
3. **Commit order matches `id` order for each account.** Across *different* accounts, a
   transaction holding a lower `id` can commit after a higher one, so the publisher may send them
   out of `id` order. That's harmless, because consumers only care about order per account. For
   *one* account:
   - its first notification comes from the transaction that creates the row, and nothing else
     can change that account before the row exists.
   - suspend and restore run under the admin-actions advisory lock, which is held until commit.
     So their `id` order and commit order are the same.
   - closing must keep this true (§4.8).
4. **Kafka keeps the order.** Key `account_id`, one partition, idempotent producer with
   `acks=all`, and `sendMessages()` sends one batch in order.

**Required consumer change before rollout:** Credit Service must record each applied
account-status `operation_id` in a durable table with a unique constraint, in the same database
transaction as the status/grant/forfeiture effects. A duplicate must return without reapplying
the status. Rollback must undo both the marker and effects. Initial-grant deduplication by
account remains in place. Do not mark an event successfully processed when its effects fail.
Every other consumer, including Order Service when implemented, needs equivalent protection
where replay can change its behaviour. Retain deduplication records for at least the supported
Kafka replay/redelivery window, not merely the outbox cleanup period.

This protects against duplicates, not genuinely out-of-order distinct changes. If publisher
concurrency or mutation paths change, revisit per-account serialization and consider a monotonic
per-account status version checked by consumers. Adding that field requires an agreed contract
evolution. More partitions alone do not break per-account order if the same account always maps
to the same partition; repartitioning requires its own ordering plan.

---

## 6. Delay and Credit Service issue #3

Credit Service reads `user.account-status` and `credit.commands` as separate topics. A user who
places an order right after registering can have their `ReserveRequested` processed before their
activation, and gets `ACCOUNT_NOT_FOUND`. Order Service treats that first reply as final.

User Service can't remove that gap, but it decides how long it is. The gap is the time between
the registration commit and the activation reaching Kafka:

| Setting | Effect on the gap |
|---|---|
| `idlePollMs` | Up to one poll interval of waiting (200 ms in the draft above) |
| Wake on commit (§4.4) | Close to 0 on the instance that registered the user |
| Batch size / backlog | A large backlog adds delay before new rows go out |

Use a 200 ms fallback poll and wake-on-commit as the initial configuration. Each idle replica
attempts roughly five batches per second; each attempt includes transaction and advisory-lock
queries, and the lock winner also queries the outbox. Measure database overhead before reducing
the interval. Track unpublished row count, oldest unpublished event age, batch size, publish
duration and failures to tune batch size and polling from actual load.

These settings shorten the gap but do not guarantee activation is processed before a reservation:
broker acknowledgment is not consumer completion, and the two topics have no shared processing
order. Before rollout, agree on explicit Order/Credit handling of activation still in progress
(for example, bounded retry for a newly created account). Do not claim wake-on-commit fixes it.

---

## 7. Existing users (backfill)

Accounts created before this change have no credit account, and no notification will ever be
sent for them. Order Service would then reject their orders with `ACCOUNT_NOT_FOUND`.

> **Author decision:** whether existing users are backfilled (and so receive the initial grant).

If yes, add a separate migration after `0003`, for example `0004_backfill_account_status.sql`.
It queues the same rows the code would have written:

```sql
-- ACTIVE and SUSPENDED users: first activation (with grant), in creation order
INSERT INTO outbox (event_id, topic, message_key, payload)
SELECT e, 'user.account-status', u.id::text,
       jsonb_build_object('operation_id', e, 'account_id', u.id, 'new_status', 'ACTIVE',
                          'first_active', true, 'occurred_at', u.created_at, 'schema_version', 1)
FROM (SELECT id, created_at, gen_random_uuid() AS e FROM users
      WHERE status IN ('ACTIVE', 'SUSPENDED') ORDER BY created_at, id) u;

-- SUSPENDED users: then the suspension (higher ids, so published after the activation)
INSERT INTO outbox (event_id, topic, message_key, payload)
SELECT e, 'user.account-status', u.id::text,
       jsonb_build_object('operation_id', e, 'account_id', u.id, 'new_status', 'SUSPENDED',
                          'first_active', false, 'occurred_at', now(), 'schema_version', 1)
FROM (SELECT id, gen_random_uuid() AS e FROM users WHERE status = 'SUSPENDED' ORDER BY id) u;
```

`PENDING_VERIFICATION` users get nothing. `CLOSED` users don't exist yet. Because of the
`first_active` deduplication on the Credit side, running the backfill a second time can't grant
anyone twice.

---

## 8. Failure behaviour

| Failure | What happens |
|---|---|
| Kafka down | Registration, suspend and restore still succeed. Rows wait in `outbox`; the publisher retries with back-off and catches up when Kafka returns. |
| `user-db` down | The status change fails as today (503). Nothing is written, so nothing is sent. |
| Crash after the Kafka ack, before `published_at` | The batch is sent again. Transactional consumer deduplication prevents replay from reapplying old statuses (§5). |
| Crash before the Kafka ack | Nothing is marked; the batch is retried. |
| Transaction rolls back (e.g. `EMAIL_TAKEN`) | The outbox row rolls back with it. Nothing is sent. |
| Two replicas | One publishes, the other skips each batch (advisory lock). Both can write outbox rows. |
| Message dead-lettered by Credit | Appears in `user.account-status.dlq` with the reason. A bug in what User Service sends shows up there first. |

Log lines worth adding (match Credit Service's names): `outbox_published {count}`,
`outbox_publish_failed {error}` (once per outage), `outbox_publisher_recovered`,
`outbox_cleaned {deleted}`.
Export the backlog and latency measurements from §6 as metrics as well.

---

## 9. Tests

User Service now uses `node:test` via `tsx`, with `npm test` for database/lifecycle cases and
`npm run test:e2e` for the real HTTP/Kafka/Credit flow. See the README for isolated infrastructure
requirements. Database cases skip when `TEST_DATABASE_URL` is unset; the end-to-end case also
requires `KAFKA_BROKERS`.

Tests create disposable databases and apply the real migrations. Both services must be built
before the end-to-end case, which launches their compiled entry points.

Suggested cases:

**Database (outbox written correctly)**
- Registration writes one user and one outbox row with `ACTIVE`, `first_active=true`, key = user id.
- Registration that fails (`EMAIL_TAKEN`, validation) writes no outbox row.
- Password hashing finishes before a connection is acquired and before `BEGIN`.
- Suspend writes `SUSPENDED`, `first_active=false`. Repeating it writes nothing new.
- Restore writes `ACTIVE`, `first_active=false`.
- Bootstrap writes the admin's row (if §4.6 is chosen).

**Publisher**
- Publishes rows in `id` order and marks them. A `produce` that throws marks nothing.
- Two publishers started together: only one publishes a given batch, and the combined output is
  in `id` order with no gaps.
- Cleanup deletes only rows published longer ago than the retention period.
- A partial batch sends immediately in one Kafka send, and rows are marked only after acknowledgment.
- HTTP startup and registration succeed with Kafka unavailable; queued rows publish after recovery.

**End to end (with Kafka and Credit Service)**
- Register, then check that Credit's `GET` balance shows the initial grant.
- Suspend, then check that a reserve is rejected with `ACCOUNT_NOT_ACTIVE`. Restore, then check
  the reserve succeeds.
- Stop Kafka, register, start Kafka: the grant appears once Kafka is back.
- Kill User Service between ack and mark (or simulate it): the grant is still given only once.
- Replay restore A and suspension B as `A, B, A, B`; after the first B, a reservation must remain
  blocked even when duplicate A arrives. Verify markers and status effects roll back together.
- Exercise an order immediately after registration and verify the agreed activation-pending behaviour.

The Credit Service e2e stack (`credit-service/e2e/`) currently plays User Service by producing
these messages itself. Once User Service publishes them, that test can use the real service.

---

## 10. Rollout order

1. Implement and verify transactional account-status deduplication in Credit Service (§5).
   Agree on activation-pending handling for immediate orders (§6).
2. Add migration `0003` (and `0004` if backfilling).
3. Add `kafka.ts`, `outbox.ts`, `publisher.ts` and config, and start the publisher from `index.ts`.
4. Write outbox rows in registration, bootstrap and suspend/restore; prepare password hashes
   before acquiring the registration connection. Wake the publisher after successful commits.
5. `compose.yaml`: add Kafka environment, keep topic provisioning separate from HTTP startup.
6. Run the tests in §9, then check `user.account-status` with the Kafka smoke test
   (`kafka/test-topics.sh`) and Credit's balance endpoint.

User Service changes in steps 2–5 can be merged together. Deploy consumer duplicate protection
before enabling the producer or backfill.

---

## 11. Open author decisions

| # | Decision | Where |
|---|---|---|
| 5 | Where the first `ACTIVE` happens if `PENDING_VERIFICATION` returns | §4.5 |
| 7 | Backfill existing users (and give them the grant) | §7 |
| 9 | Order/Credit handling of activation still in progress | §6 |
