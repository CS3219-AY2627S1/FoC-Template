<!-- Additional AI assistance: OpenAI Codex (GPT-6), 2026-11-09. Scope: Record implemented history route for #58. Author review: Pending. -->
<!-- Additional AI assistance: Codex (GPT-6), 2026-10-18. Scope: account-status publishing implementation and verification notes. Author review: Reviewed and approved by @phuc. -->
<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-10-15
Scope: Drafted and formatted an implementation proposal from the author's chosen architecture
(PostgreSQL with three tables: credit_accounts, credit_transactions, outbox; Kafka for messaging),
the D1 Credit Service FRs/NFRs and the Order state diagram. Revised on 2026-10-15 from Redis
Streams to Kafka, and to the author's own table design. Topic names, Kafka settings, message
fields and anything else marked "Author decision" are DRAFTS. The Credit Service author must
decide them, per the AI usage policy (schemas and interfaces are not delegated to AI).
Revised on 2026-10-16 to apply decision-record.md (D1 to D8): four tables, rejections produced
directly to Kafka, no inbox table, settled Kafka settings and the rejection event.
Author review: review 
-->

# Credit Service: Implementation Proposal

> **Status: DRAFT for author review.**
> The author chose this architecture: one PostgreSQL database and Kafka for messaging between
> services. The database, rejection and idempotency decisions are recorded in
> [decision-record.md](decision-record.md) (D1 to D8) and applied here. Everything still tagged
> **Author decision** is a placeholder for the author to accept, change or replace before
> implementation. Requirement IDs and a bare "D1" refer to the D1 requirements document;
> decisions are written as "decision D1" to "decision D8".

## 1. Scope

The Credit Service owns every credit balance on the platform. It:

1. Grants 100 credits once when an account first becomes ACTIVE (CS-F1.1).
2. Reserves, captures and releases errand credits for the Order Service (CS-F2).
3. Keeps an append-only transaction history (CS-F3).
4. Forfeits the balance of a closed account (CS-F4.2).
5. Serves a read-only HTTP API for a user's own balance and history (CS-F1.2, CS-F3.1.2).

It never sells, withdraws or exchanges credits (CS-F1.3). All amounts are whole numbers (CS-F1.4).

## 2. Architecture overview

```
 ┌──────────────┐  topic: user.account-status  ┌────────────────┐
 │ User Service │ ───────────────────────────▶ │                │
 │  (+ outbox)  │                              │                │      ┌──────────────┐
 └──────────────┘                              │ Credit Service │ ───▶ │ credit-db    │
                                               │   (+ outbox)   │      │ (PostgreSQL) │
 ┌──────────────┐  topic: credit.commands      │                │      └──────────────┘
 │ Order Service│ ───────────────────────────▶ │                │
 │  (+ outbox)  │  topic: credit.results       │                │
 │              │ ◀─────────────────────────── │                │
 └──────────────┘                              └────────────────┘
                                                       ▲
               Frontend / gateway (HTTP, read-only balance + history)
```

- **User → Credit** carries Account Status Notifications (US-F9.1, US-F9.2).
- **Order → Credit** carries reservation requests and terminal events (OS-F5).
- **Credit → Order** carries the Credit Service's replies: `CreditReserved` or
  `CreditReservationRejected`.

Every producer, Credit Service included, writes events to its own `outbox` table in the same
database transaction as the change. A background publisher then sends them to Kafka. The one
exception is a reservation rejection, which changes no data and so is produced directly (§6.4).

**Topics (decided 2026-10-16):** the three names above, **1 partition each** and replication
factor 1 (single broker in Compose). They are created by
[kafka/create-topics.sh](../../kafka/create-topics.sh) through the `kafka-init` Compose service;
automatic topic creation is off. See [kafka/README.md](../../kafka/README.md). With one
partition, each topic is read in one total order, so a reservation and its terminal event always
arrive in the order they were produced. The message keys (§5.1, §6.1) still matter if the
partition count is raised later.

## 3. Mapping the Order state diagram to credit effects

| Order transition | Credit effect | Message | Req. |
|---|---|---|---|
| `[*] → OPEN` (create) | **Reserve** `amount` from requester | `ReserveRequested` → reply `CreditReserved` / `CreditReservationRejected` | CS-F2.1, CS-F2.1.1 |
| `OPEN → ACCEPTED`, `ACCEPTED → PICKED_UP`, `PICKED_UP → DELIVERED` | None. Credits stay reserved | none | CS-F2.1.2 |
| `ACCEPTED → OPEN` (courier cancels / pickup timeout / courier suspended) | None. Same reservation kept, no new reserve | none | CS-F2.1.3 |
| `PICKED_UP → DISPUTED`, `DELIVERED → DISPUTED` | None. Reservation retained | none | CS-F2.3 |
| `DELIVERED → COMPLETED` (confirm or confirmation timeout) | **Capture**: requester reserved −X; courier available +X | `OrderCompleted` | CS-F2.2, CS-F2.3.1 |
| `DISPUTED → COMPLETED` (admin for courier) | **Capture** (same effect) | `OrderCompleted` | CS-F2.3.1 |
| `OPEN → CANCELLED`, `ACCEPTED → CANCELLED` | **Release**: requester reserved −X, available +X | `OrderCancelled` | CS-F2.2.2 |
| `OPEN → EXPIRED` | **Release** | `OrderExpired` | CS-F2.2.2 |
| `DISPUTED → FAILED` (admin for requester) | **Release** | `OrderFailed` | CS-F2.2.2, CS-F2.3 |
| `PENDING_RESERVATION → RESERVATION_TIMED_OUT` (no reply in time) | **Release** if a hold exists; otherwise nothing | `ReservationTimedOut` | order-credit contract |

Only the four terminal events and `ReservationTimedOut` move credits after the hold.
`ReservationTimedOut` may arrive for an order that has no hold (the reserve was rejected); it is
then ignored, not dead-lettered. See `order-service/docs/order-credit-contract.md`. The Credit Service never sees non-terminal
transitions, which keeps the two services loosely coupled.

## 4. Database: `credit-db` (PostgreSQL 17)

Four tables (decision D1). Setup follows the existing User Service pattern: a bootstrap
superuser only for the init script, a `credit_migrator` role for migrations, and a `credit_app`
role with row access only.

### 4.1 `credit_accounts`

Stores each user's current credit balance and account status.

```sql
CREATE TABLE credit_accounts (
  user_id            UUID PRIMARY KEY,
  status             TEXT   NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  available_balance  BIGINT NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  reserved_balance   BIGINT NOT NULL DEFAULT 0 CHECK (reserved_balance  >= 0),
  forfeited_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Rules:

- Balances are whole credits in `BIGINT` (CS-F1.4) and can never be negative (CS-NFR3.1).
- Balance changes happen atomically inside database transactions (CS-NFR1).
- `status` mirrors User Service's account status, set from `user.account-status` notifications
  (decision D4). `PENDING_VERIFICATION` accounts get no credit account.
  - Reserve requires `status = 'ACTIVE'`.
  - Terminal events are processed whatever the status (CS-F4.1.1).
  - On `CLOSED`: if `reserved_balance = 0`, forfeit now. Otherwise forfeit in the same transaction
    that finalises the last reservation. `forfeited_at` marks it done, so a second forfeit is
    impossible.

The total balance shown to the user is `available_balance + reserved_balance` (CS-F1.2.3).

### 4.2 `credit_reservations`

One row per accepted reservation, holding its state (decision D2).

```sql
CREATE TABLE credit_reservations (
  reservation_id  UUID PRIMARY KEY,
  order_id        UUID   NOT NULL UNIQUE,
  requester_id    UUID   NOT NULL REFERENCES credit_accounts(user_id),
  amount          BIGINT NOT NULL CHECK (amount > 0),
  status          TEXT   NOT NULL CHECK (status IN ('HELD','CAPTURED','RELEASED')),
  courier_id      UUID,
  closed_by       TEXT CHECK (closed_by IN ('COMPLETED','CANCELLED','EXPIRED','FAILED','TIMED_OUT')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalised_at    TIMESTAMPTZ,
  CHECK ((status = 'HELD') = (finalised_at IS NULL)),
  CHECK ((status = 'HELD') = (closed_by IS NULL)),
  CHECK (status <> 'CAPTURED' OR (courier_id IS NOT NULL AND courier_id <> requester_id))
);
```

Why a table instead of deriving state from transaction rows:

- A terminal event locks and checks a single row
  (`SELECT ... FROM credit_reservations WHERE order_id = $1 FOR UPDATE`) instead of replaying
  history.
- `order_id UNIQUE` prevents two holds for one order.
- The `CHECK` constraints forbid a capture without a valid courier (CS-F2.4) and keep `status`,
  `closed_by` and `finalised_at` consistent.
- The Order terminal state is kept only in `closed_by`, so the ledger does not depend on Order's
  state machine.

### 4.3 `credit_transactions`

The append-only history of balance changes, one row per affected account (decision D3).

```sql
CREATE TABLE credit_transactions (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID   NOT NULL REFERENCES credit_accounts(user_id),
  type             TEXT   NOT NULL CHECK (type IN
                     ('INITIAL_GRANT','RESERVE','CAPTURE_DEBIT','CAPTURE_CREDIT','RELEASE','FORFEIT')),
  available_delta  BIGINT NOT NULL,
  reserved_delta   BIGINT NOT NULL,
  reservation_id   UUID REFERENCES credit_reservations(reservation_id),
  order_id         UUID,
  operation_id     UUID   NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operation_id, user_id)
);
CREATE INDEX credit_transactions_user_history_idx
  ON credit_transactions (user_id, created_at DESC, id DESC);
```

| Event | Rows written |
|---|---|
| Initial grant | `INITIAL_GRANT` (available +100) |
| Reserve | `RESERVE` (available −X, reserved +X) |
| `OrderCompleted` | `CAPTURE_DEBIT` for the requester (reserved −X), `CAPTURE_CREDIT` for the courier (available +X) |
| `OrderCancelled` / `OrderExpired` / `OrderFailed` / `ReservationTimedOut` | `RELEASE` (reserved −X, available +X) |
| Forfeit | `FORFEIT` (available −balance) |

Rules:

- `operation_id` is the `operation_id` of the message that caused the change. It is unique per
  `(operation_id, user_id)` because one capture writes two rows (CS-NFR2.1).
- Update the account and insert its transaction rows in the same database transaction.
- Each balance always equals the sum of its account's deltas. §12 checks this.
- The courier's history comes from their own `CAPTURE_CREDIT` rows (CS-F3.1).
- Preserve history; corrections create new records (CS-F3.1.1).
- A new terminal state in Order Service maps onto `RELEASE` or `CAPTURE_*` without a schema
  change.

> **Author decision:** whether to block `UPDATE`/`DELETE` on this table for `credit_app` at the
> database level (`REVOKE`, a trigger, or both) as well as in code (CS-F3.1.1).

### 4.4 `outbox`

Stores outgoing events awaiting publication to Kafka.

```sql
CREATE TABLE outbox (
  event_id      UUID PRIMARY KEY,
  event_type    TEXT  NOT NULL,
  topic         TEXT  NOT NULL,
  message_key   TEXT  NOT NULL,
  payload       JSONB NOT NULL,
  causation_id  UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);
CREATE INDEX outbox_unpublished_idx ON outbox (created_at) WHERE published_at IS NULL;
```

`causation_id` is the `operation_id` of the message being answered, for tracing. `event_id` is the
stable identifier consumers use for duplicate detection.

Rules:

- Insert the event in the same transaction as the balance and history changes.
- A background publisher sends unpublished events to Kafka.
- Mark an event published only after Kafka acknowledges it.
- Retry failed publication attempts.
- Consumers must tolerate duplicates.

Publisher loop, run as **one** database transaction per batch:

```sql
BEGIN;
SELECT event_id, topic, message_key, payload
FROM outbox
WHERE published_at IS NULL
ORDER BY created_at
LIMIT 100
FOR UPDATE SKIP LOCKED;
-- produce each row to Kafka and wait for the acknowledgment
UPDATE outbox SET published_at = now() WHERE event_id = ANY($1);  -- acknowledged rows only
COMMIT;
```

The transaction stays open through publication and marking the rows. Committing right after the
`SELECT` would release the row locks, and another instance could select and publish the same
rows. If publishing fails, the transaction rolls back and the rows are retried in the next batch.

Retention: published rows are deleted 7 days after `published_at`:

```sql
DELETE FROM outbox WHERE published_at < now() - interval '7 days';
```

### 4.5 Where idempotency lives

Account-status publishing adds a narrow exception to the original no-inbox decision D6:
`0003_account_status_dedup.sql` introduces `processed_account_status`. Its unique `operation_id`
is inserted in the **same** transaction as the notification's effects. Replayed batches can
otherwise briefly undo a suspension by reapplying an old restore. Order commands continue to
deduplicate through the existing constraints and reservation state guards. Status markers are
retained indefinitely; do not delete them with published outbox rows.

| Message | Duplicate detected by |
|---|---|
| Account ACTIVE, `first_active=true` | `INSERT INTO credit_accounts ... ON CONFLICT (user_id) DO NOTHING`; the grant row is written only if the insert happened |
| SUSPENDED / ACTIVE (restore) / CLOSED | `processed_account_status.operation_id`, atomically committed with effects; skip duplicates before applying status |
| `ReserveRequested` | `credit_transactions.operation_id` (accepted), `credit_reservations.order_id` |
| Terminal event | `credit_reservations.status <> 'HELD'`, backed by `UNIQUE (operation_id, user_id)` |

A rejected reservation stores nothing, so a redelivered `ReserveRequested` that was rejected is
evaluated again (§6.4).

Invalid messages are recorded through the DLQ topic and structured logs, not a table.

## 5. User Service → Credit Service (initial credit)

### 5.1 Topic and consumer group

| Item | Value (**Author decision**) |
|---|---|
| Topic | `user.account-status` |
| Message key | `account_id` (keeps one account's notifications in order) |
| Producer | User Service, via its own transactional outbox |
| Consumer group | `credit-service` (Order Service uses its own group, `order-service`, for OS-F6) |

### 5.2 Message fields (US-F9.3)

```text
operation_id   uuid      unique per status change, stable across retries
account_id     uuid
new_status     ACTIVE | SUSPENDED | CLOSED
first_active   true | false   (true only on the first ACTIVE, US-F9.1; false on restore)
occurred_at    ISO-8601 timestamp
schema_version 1
```

These are the statuses User Service implements (`users.status`):

| User Service status | Reached by | Notification sent? |
|---|---|---|
| `PENDING_VERIFICATION` | Column default only; registration currently skips it | No. Not active, so no credits |
| `ACTIVE` | Registration (sets `ACTIVE` directly), or admin restore from `SUSPENDED` | Yes. `first_active=true` on registration, `false` on restore |
| `SUSPENDED` | Admin suspend from `ACTIVE` | Yes |
| `CLOSED` | Nothing sets it yet | Yes, once User Service implements closing |

> **Author decision:** the serialisation format (JSON, or Avro/Protobuf with a schema registry).

### 5.3 Producer side (User Service)

1. In the same transaction that changes the account status, User Service inserts a row into
   its own `outbox` table.
2. A publisher reads unpublished rows, produces them to `user.account-status`, waits for the
   broker acknowledgment, then sets `published_at`.
3. A crash between the acknowledgment and setting `published_at` only causes a duplicate. The
   consumer deduplicates by `operation_id`.

This gives at-least-once delivery without a distributed transaction. User Service implements
the outbox and batch publisher; see `user-service/docs/account-status-publishing.md`. Deploy
the consumer deduplication migration and handler before enabling that producer.

### 5.4 Consumer handling

| Notification | Action in one DB transaction | Req. |
|---|---|---|
| `ACTIVE`, `first_active=true` | `INSERT ... ON CONFLICT (user_id) DO NOTHING` with `status='ACTIVE'`, `available_balance=100`; if inserted, insert an `INITIAL_GRANT` row | CS-F1.1, CS-F1.1.1 |
| `SUSPENDED`, or `ACTIVE` with `first_active=false` | Set `status`. No balance change | CS-F4.1 |
| `CLOSED` | Set `status='CLOSED'`. If `reserved_balance = 0`, forfeit now (`FORFEIT` row, set `forfeited_at`); otherwise forfeit when the last reservation is finalised (§6.5) | CS-F4.2 |

Terminal events for a suspended or closed user are still processed (CS-F4.1.1). Status blocks
only new reservations. User Service does not set `CLOSED` yet, so forfeiture has no trigger
until it does.

## 6. Order Service ⇄ Credit Service (reserve, capture, release)

### 6.1 Topics and groups

| Direction | Topic (**Author decision**) | Key | Producer | Consumer group |
|---|---|---|---|---|
| Order → Credit | `credit.commands` | `order_id` | Order Service (outbox) | `credit-service` |
| Credit → Order | `credit.results` | `order_id` | Credit Service (outbox; rejections produced directly) | `order-service` |

### 6.2 Messages

`ReserveRequested` (Order → Credit)

```text
type=ReserveRequested  operation_id  order_id  requester_id  amount  occurred_at  schema_version=1
```

`CreditReserved` (Credit → Order, via the outbox)

```text
event_id  type=CreditReserved  operation_id (of the request)  order_id  reservation_id  occurred_at  schema_version=1
```

`CreditReservationRejected` (Credit → Order, produced directly; decision D8)

```json
{
  "event_id": "uuid",
  "type": "CreditReservationRejected",
  "operation_id": "uuid of the ReserveRequested",
  "order_id": "uuid",
  "reason_code": "INSUFFICIENT_CREDIT",
  "occurred_at": "ISO-8601",
  "schema_version": 1
}
```

| `reason_code` | When |
|---|---|
| `INSUFFICIENT_CREDIT` | `available_balance < amount` |
| `ACCOUNT_NOT_FOUND` | No `credit_accounts` row for the requester |
| `ACCOUNT_NOT_ACTIVE` | Status is `SUSPENDED` or `CLOSED` |
| `INVALID_AMOUNT` | `amount <= 0` |

Order Service depends only on this payload and code list, never on Credit Service tables.

Terminal events, matching OS-F5.1.2 (Order → Credit)

```text
type=OrderCompleted|OrderCancelled|OrderExpired|OrderFailed
operation_id  order_id  requester_id  courier_id (Completed only)  amount  occurred_at  schema_version=1
```

Reservation timeout (Order gave up waiting for a reply to its `ReserveRequested`)

```text
type=ReservationTimedOut
operation_id  order_id  requester_id  amount  occurred_at  schema_version=1   (no courier_id)
```

> **Author decision:** whether Credit Service also publishes `CreditCaptured` /
> `CreditReleased` for terminal events. OS-NFR3.2 only needs the credits to move.

### 6.3 Errand creation flow

```
Order Service                       Kafka                         Credit Service
     │ one tx: INSERT errand (not yet visible) + outbox row          │
     │──produce credit.commands  ReserveRequested───────────────────▶│
     │                                                               │ one tx:
     │                                                               │   conditional UPDATE: available → reserved
     │                                                               │   INSERT credit_reservations (HELD)
     │                                                               │   INSERT RESERVE transaction
     │                                                               │   INSERT CreditReserved into outbox
     │                                                               │ commit, then commit consumer offset
     │◀──publisher produces credit.results  CreditReserved───────────│
     │      (or, if rejected: CreditReservationRejected, produced    │
     │       directly before the offset commit)                      │
     │ errand becomes OPEN, or creation is rejected (OS-F1.2)        │
```

> **Author decision:** the Order state diagram has no state before OPEN. Order Service needs
> some way to hide the errand until the reply arrives, such as a flag on the errand row. This
> belongs to the Order Service author and must be agreed between the two services.

### 6.4 Reserve handling (CS-F2.1)

Rejections are not stored; they are produced directly to Kafka (decision D5). A rejection
changes no data, so there is no dual write to protect.

```text
consume ReserveRequested
  1. if credit_transactions has a row with this operation_id → duplicate, skip to step 4
  2. BEGIN
     UPDATE credit_accounts
     SET available_balance = available_balance - $amt,
         reserved_balance  = reserved_balance  + $amt,
         updated_at = now()
     WHERE user_id = $req AND status = 'ACTIVE' AND available_balance >= $amt
     RETURNING user_id
  3. 1 row  → INSERT credit_reservations (HELD), INSERT RESERVE row,
              INSERT CreditReserved into outbox, COMMIT
     0 rows → ROLLBACK; read the account once (no lock) to pick the reason_code (§6.2);
              produce CreditReservationRejected to credit.results (acks=all), wait for the ack
  4. commit the consumer offset
```

`INVALID_AMOUNT` (`amount <= 0`) is rejected before step 2.

Rules:

- **Check and deduct in one statement.** The conditional `UPDATE` makes the balance check and
  the deduction atomic. A separate `SELECT` then `UPDATE` lets two concurrent orders from one
  user overdraw the account.
- **Produce before committing the offset.** A crash after producing only causes a duplicate
  rejection. A crash before producing causes redelivery and a fresh decision.
- A second operation for the same order hits `credit_reservations.order_id UNIQUE`. It is
  treated as a duplicate, not a new hold.
- If the process dies after the DB commit but before the offset commit, Kafka redelivers the
  command. Step 1 finds it, so nothing changes twice, and the reply is already in the outbox.

**Consequence for CS-NFR2.3.** A redelivered request is evaluated again against the current
balance, so a request that was rejected can be accepted on redelivery. Redelivery only happens
after a crash between producing and committing the offset. The requirement becomes:

> Order Service treats the first reply to an `operation_id` as final. If `CreditReserved`
> arrives for an errand it already rejected, Order Service sends `OrderCancelled` for that order,
> which releases the hold.

> **Needs Order Service agreement.** Agree this with the Order Service author and update
> CS-NFR2.3 in D1. If the team keeps CS-NFR2.3 as written, rejections must be stored instead: a
> table keyed by `operation_id` holding the outcome and reply, written in its own transaction.

### 6.5 Terminal event and `ReservationTimedOut` handling (CS-F2.2 to CS-F2.5)

In one transaction:

1. `SELECT ... FROM credit_reservations WHERE order_id = $1 FOR UPDATE`. No row: a terminal
   event goes to the DLQ; a `ReservationTimedOut` does nothing and the offset is committed.
2. If `status <> 'HELD'`:
   - the same `operation_id` is already in `credit_transactions` → duplicate; commit the
     offset and stop (CS-F2.5).
   - a different operation already finalised it → conflicting outcome; send to the DLQ (§7.3)
     and commit the offset (CS-F2.5).
3. Validate `requester_id`, `amount` and, for `OrderCompleted`, `courier_id` (present and
   different from `requester_id`) against the reservation (CS-F2.4, CS-F2.4.1). On a mismatch,
   send to the DLQ and commit the offset. No balance changes.
4. Lock the affected `credit_accounts` rows **in ascending `user_id` order** to avoid
   deadlocks between concurrent captures (CS-NFR3.2.1).
5. Apply the balance change and write the §4.3 rows:
   - **Capture** (`OrderCompleted`): requester `reserved -= X` (`CAPTURE_DEBIT`); courier
     `available += X` (`CAPTURE_CREDIT`).
   - **Release** (`OrderCancelled` / `OrderExpired` / `OrderFailed` / `ReservationTimedOut`): requester
     `reserved -= X`, `available += X` (`RELEASE`).
6. Set the reservation's `status` (`CAPTURED` or `RELEASED`), `closed_by` and `finalised_at`.
7. If the requester's account is `CLOSED`, `reserved_balance` is now 0 and `forfeited_at` is
   null, forfeit in the same transaction (CS-F4.2).
8. Commit, then commit the consumer offset.

The row lock on the reservation plus the `HELD` check means one reservation can never be both
captured and released (CS-NFR3.2).

## 7. Delivery reliability

### 7.1 Consumer loop

```text
consumer config: group.id=credit-service, enable.auto.commit=false,
                 auto.offset.reset=earliest, isolation.level=read_committed
loop:
  poll a batch
  for each message, in partition order:
    handle it in one DB transaction
    commit the offset of that message (offset + 1)
```

The offset is committed per message, only **after** the database transaction commits, or after
a direct rejection is acknowledged (decision D7). A crash before the offset commit causes
redelivery, never loss. Idempotency (§4.5) makes redelivery harmless.

### 7.2 Producer and broker durability

- Outbox publisher and direct rejections: `acks=all` and `enable.idempotence=true`, so a broker
  acknowledgment means the event is safely written.
- Kafka's own transactions are not used. They cover Kafka → Kafka only and cannot include the
  PostgreSQL commit, which is why the outbox is still needed for accepted operations.
- Broker: KRaft mode (no ZooKeeper), with a named volume for the log directory.
- The outboxes in each service's PostgreSQL database remain the source of truth. An event not
  yet acknowledged by Kafka stays unpublished and is retried (OS-F5.2).

> **Author decision:** topic retention, and replication. A single broker in Compose means
> replication factor 1 and `min.insync.replicas=1`. That is fine for development but cannot
> survive a broker disk loss.

### 7.3 Poison messages

After 5 failed attempts at a message, or on a validation failure, the consumer produces it to a
dead-letter topic (for example `credit.commands.dlq`) with an error reason, then commits the
offset. It is also logged as structured JSON (N3-FR1). Without this, one bad message would
block every later message in its partition.

**Decided 2026-10-16:** one DLQ per consumed topic, `user.account-status.dlq` and
`credit.commands.dlq` (1 partition each). A failing message is retried in place, 5 attempts in
total, then sent to its DLQ. Database or Kafka outages do not count as attempts.

### 7.4 Trusting the sender (CS-F2.4)

Kafka ACLs, with one SASL user per service, restrict who can write where:

| Kafka principal | May produce to | May consume from |
|---|---|---|
| `user-service` | `user.account-status` | none |
| `order-service` | `credit.commands` | `credit.results`, `user.account-status` |
| `credit-service` | `credit.results`, `*.dlq` | `credit.commands`, `user.account-status` |

> **Author decision:** whether ACLs are needed in the Compose setup, or only documented for
> production.

## 8. HTTP API (read-only)

Implementation update (2026-11-09, issue #58): the own-history route is implemented
at public `GET /api/v1/me/credit/transactions` and internal
`GET /me/credit/transactions`, with optional inclusive `from`, exclusive `to`,
zero-based `page`, and `size`. The exact implemented contract is documented in
[the service README](../README.md#transaction-history-http-api). Balance and health
HTTP routes remain unimplemented. New implementation is pending author review.

The frontend reads balance and history over HTTP. Kafka is not involved in these reads.
Requests are authenticated by calling User Service `/auth/verify`, the same way Supplier
Service does (US-F6.1).

| Method and path | Returns | Req. | Sprint |
|---|---|---|---|
| `GET /me/credit` | `{ total, reserved, available }`, read in one statement | CS-F1.2 to CS-F1.2.4 | 1 |
| `GET /me/credit/transactions` | Own transactions from `credit_transactions`, newest first by `created_at`, then `id`; paginated | CS-F3.1.2 | 3 |
| `GET /health` | Readiness: PostgreSQL and Kafka reachable | | 1 |

Credit Service takes the user ID from the verified session, never from the URL, so no route can
read another user's balance (CS-F1.2.4). No route creates, edits or deletes credits
(CS-F1.3, CS-F3.1.1).

> **Author decision:** the gateway prefix, the balance path, the pagination style (keyset
> cursor or page number) and the response shapes.

## 9. NFR coverage

| NFR | How this design meets it |
|---|---|
| CS-NFR1.1, 1.1.1, 1.2 atomicity | Each message is handled in one PostgreSQL transaction, including its outbox event; any error rolls back everything. |
| CS-NFR2.1, 2.1.1 duplicate delivery | `UNIQUE (operation_id, user_id)`, `credit_reservations.order_id UNIQUE` and the `HELD` check, all in the same transaction as the effect (§4.5). |
| CS-NFR2.2 survive restart | PostgreSQL and Kafka volumes; offset committed only after the DB commit; unpublished outbox rows retried. |
| CS-NFR2.3 missing response is not failure | First reply is final; a late `CreditReserved` is cancelled by Order Service (decision D5, §6.4). **Needs Order Service agreement.** |
| CS-NFR3.1 invariants | `CHECK` constraints on balances and reservations; balances change only together with a transaction row and equal the sum of its deltas. |
| CS-NFR3.2, 3.2.1 concurrency | Conditional `UPDATE` for reserve; `FOR UPDATE` on the reservation row; account lock order by `user_id`; one partition per order key. |

Expected load is about 20 reservations and up to 80 transitions per second, of which only the
terminal ones reach Credit Service. One broker, one partition per topic and one consumer
handle this comfortably. More consumers in the same group would need more partitions first.

## 10. Proposed Compose additions

```yaml
  kafka:
    image: apache/kafka:3.9.0        # Author decision: pin exact tag
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"
    volumes: [kafka-data:/var/lib/kafka/data]

  kafka-init:     # creates the topics and DLQ topics, then exits
  credit-db:      # same pattern as user-db: bootstrap, migrator and app roles
  credit-migrate: # runs credit-service/migrations/*.sql, then exits
  credit-service:
    environment:
      DATABASE_URL: postgres://credit_app:...@credit-db:5432/credits
      KAFKA_BROKERS: kafka:9092
      KAFKA_CLIENT_ID: credit-service
      USER_SERVICE_BASE_URL: http://user-service:3001
      INITIAL_CREDIT_GRANT: 100
```

Stack: TypeScript and `pg`, matching User Service, plus the Kafka client
`@confluentinc/kafka-javascript` (decided 2026-10-16), used through its KafkaJS-style API.

## 11. Implementation plan

| Sprint | Work | Reqs |
|---|---|---|
| 1 | Migrations for the 4 tables and roles; outbox publisher; Kafka in Compose with topic setup; account-status consumer with initial grant; balance endpoint | CS-F1.1 to F1.4, CS-NFR3.1 |
| 1 | Reserve flow and release on Cancelled/Expired/Failed | CS-F2.1, F2.1.1, F2.1.2, F2.2.2 |
| 2 | Capture, event validation, duplicates, DLQ; transaction recording; suspension handling; forfeiture | CS-F2.2 to F2.5, CS-F3.1, F3.1.1, CS-F4 |
| 3 | Transaction history endpoint with paging; NFR test suite | CS-F3.1.2, CS-NFR1 to 3 |

Dependencies on other services:

- User Service: outbox and Kafka publisher for US-F9.1 (sprint 1) and US-F9.2 (sprint 2).
- Order Service: outbox, `ReserveRequested`, terminal events and the `credit.results` consumer.

## 12. Verification plan

| Test | Checks |
|---|---|
| Deliver the same ACTIVE notification 20 times | Exactly one account, 100 credits, one INITIAL_GRANT row. |
| Deliver the same `OrderCompleted` 20 times, concurrently, including a restart after the DB commit and before the offset commit | One capture: one `CAPTURE_DEBIT` and one `CAPTURE_CREDIT` row (CS-NFR2.1.1). |
| `OrderCompleted` and `OrderCancelled` for one order at the same time | Exactly one succeeds; the other goes to the DLQ (CS-NFR3.2.1). |
| 50 concurrent captures from different orders to one courier | Courier balance rises by the exact sum. |
| Concurrent reserves from one user that together exceed the balance | Only as many succeed as the balance covers; available never goes negative. |
| Reserve more than available | `CreditReservationRejected` with `INSUFFICIENT_CREDIT`; no rows written. |
| Reserve for a suspended account, an unknown account, or with `amount <= 0` | Rejected with `ACCOUNT_NOT_ACTIVE`, `ACCOUNT_NOT_FOUND` or `INVALID_AMOUNT`. |
| Two `ReserveRequested` with different `operation_id` for one order | One hold only (`order_id UNIQUE`). |
| Wrong amount, wrong requester, or courier equal to requester | Rejected, no balance change, message in DLQ. |
| Stop Kafka, process a reserve, restart Kafka | Reply stays in the outbox, then is published once Kafka is back. |
| `UPDATE` / `DELETE` on `credit_transactions` as `credit_app` | Refused (if the §4.3 author decision is adopted). |
| Two publisher instances running at once | Each outbox event is published by only one of them. |
| CLOSED with reserved credits, then a release | One `FORFEIT` row, written only after reserved reaches 0; `forfeited_at` set. |
| After every test | Both balances `>= 0`; each account's balances equal the sum of its `available_delta` / `reserved_delta`; `reserved_balance` equals the sum of its `HELD` reservations. |

## 13. Open questions for the team

1. The serialisation format (§5.2) and topic retention (§7.2). Topic names and partition
   counts are decided (§2).
2. The CS-NFR2.3 change in §6.4: Order Service treats the first reply as final and cancels a
   late `CreditReserved`. If not agreed, rejections must be stored.
3. How Order Service hides an errand before its reservation reply (§6.3).
4. What Order Service does if no reply arrives within a time limit. Retrying with the same
   `operation_id` is safe.
5. Who owns the shared Kafka broker, its topic setup and its ACLs.

Other open items are listed in [decision-record.md §9](decision-record.md#9-still-open).
