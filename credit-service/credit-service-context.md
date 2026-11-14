<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
Scope: Updated a doc path reference after user-service's docs/local-dev-setup.md was renamed
       to docs/user-service-instructions.md. No requirements, architecture, schema, or API
       decisions were made by the AI tool. Note for the team: this file has been materially
       edited by AI tools in earlier sessions (see ai/usage-log.md) without a header being
       added at the time; this entry only covers today's edit, not that earlier history.
Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
-->

# Credit Service — Development Context

**Project:** CS3219 AY2627S1, FoC — peer-to-peer campus errand platform
**Service:** Credit Service (one of four microservices)
**Owner:** Credit Service developer
**Status:** In development, recess-week iteration

This document is the standing context for all Credit Service work. Read it before
making changes. It records requirements the team authored, decisions the team made,
and the constraints those place on implementation.

---

## 1. What FoC is

Students request items to be collected from campus food outlets; other students fulfil
and deliver them. The platform runs a **closed credit economy** — credits cannot be
bought, withdrawn, or exchanged for money, and circulate only inside the platform.
Each new user receives 20 credits at registration and earns more by completing errands.

Payment to the vendor is outside scope. Credits compensate the courier for the errand,
not for the food.

## 2. Repository layout

```
FoC-Template/                 (single repo, one folder per microservice)
├── credit-service/           ← this service
├── order-service/
├── supplier-service/
├── user-service/
├── foc-mockup/               (D1 UI prototype, React, hardcoded data)
├── compose.yaml
├── .env.example
└── AGENTS.md
```

## 3. Service boundaries

Credit Service owns credit balances and the transaction log. It reads no other
service's database.

**External identifiers stored as references (both UUID):**

| Field | Owned by |
|---|---|
| `user_id` | User Service |
| `request_id` | Order Service |

**Inbound triggers, from other services:**

| Trigger | Source | Requirement |
|---|---|---|
| User registered | User Service | F19.1.1 |
| Request created | Order Service | F19.2.1, F19.2.3 |
| Request completed | Order Service | F19.3.1 |
| Request cancelled or expired | Order Service | F19.4.1 |

**Open questions with other teams — do not assume answers:**

1. ~~How Credit Service authenticates callers.~~ **RESOLVED — User Service publishes a
   JWKS at `/auth/.well-known/jwks.json` (2026-10-17) and Credit Service verifies RS256
   tokens locally, reading `sub` and `role` from the token. `GET /auth/verify` no longer
   exists.** See `user-service/docs/user-service-instructions.md` (Part 2). No longer blocks
   F19.5.2 or F20.2.1.
2. Whether User Service calls `POST /credits/allocate` after OTP verification, or
   Credit Service subscribes to a registration event.

## 4. Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Node.js + Express | Matches the React frontend; one language across the stack |
| Database | PostgreSQL | ACID transactions, row-level locking, unique constraints |
| IDs | UUID | Team-wide convention |
| Container | Docker, via root `compose.yaml` | M7 |
| Queue client | BullMQ **6.3.13**, pinned exactly | Approved team decision, 2026-10-22 — see below |

**Why PostgreSQL specifically.** NFR8.1.1 and NFR8.1.2 are ACID transactions.
Concurrent balance updates need `SELECT ... FOR UPDATE` on the balance row. F19.3.2 is
a unique constraint on `request_id`, enforced by the database rather than by
check-then-write application logic that can itself race. Balances and transactions are
rigidly structured with fixed fields; nothing here wants schema flexibility.

**BullMQ — approved addition to this stack (team decision, 2026-10-22).** §11 requires
asking before adding a dependency, and this one was approved on 2026-10-22. Order Service
publishes credit-transfer jobs with BullMQ, so the library is fixed by the producer, not
chosen here. It is pinned to **exactly 6.3.13** with no caret, matching the version
order-service's lockfile resolves: producer and consumer must agree on the Redis key
layout BullMQ writes, and a caret would let the two drift apart on a future install.
supplier-service is on 6.3.10, so the versions in this repo are already not uniform.

**Note on Node and concurrency.** Node's single-threaded event loop does *not* protect
balances from races — multiple containers and multiple ticks can hit the same row.
Atomicity must come from Postgres, never from assumptions about the runtime.

## 5. Schema decisions (made by the team)

### Balance representation — stored, not derived

Two columns per user: `total_balance` and `reserved_balance`. Unreserved is computed as
`total_balance − reserved_balance`.

Store two and compute the third, so there is one fewer way for the figures to disagree.

Rationale: F19.2.3 needs one `SELECT ... FOR UPDATE` on a single row plus a comparison.
A derived unreserved figure would require locking the balance row *and* preventing
concurrent inserts into reservations — harder to get right and harder to justify.

Accepted risk: stored values can drift if any write path is buggy. Mitigation is a
periodic reconciliation check comparing `reserved_balance` against the sum of open
reservations.

**Every write path must update `reserved_balance` inside the same transaction as the
log write:**

| Operation | total | reserved |
|---|---|---|
| Allocation | +20 | — |
| Reservation | — | + amount |
| Transfer | − amount (requester), + amount (courier) | − amount (requester) |
| Release | — | − amount |

### Log lives in the same database, written in the same transaction

```
BEGIN
  UPDATE balance rows
  INSERT INTO transaction_log
COMMIT
```

This is what satisfies NFR8.1.2 without extra machinery — a failure rolls back the
balance change and the log entry together, so there can never be a logged transfer that
did not happen, nor a transfer with no record.

**Do not** put the log in a separate store or a message broker. That recreates the
dual-write problem the service exists to avoid.

### Append-only enforcement

`REVOKE UPDATE, DELETE` on the transaction log table for the application role. This is
how NFR8.2.3 is enforced — at the database, not in application code.

## 6. Functional requirements

> **Source of truth.** Team decision, 2026-09-26: for Credit Service, the tables below
> take precedence over `docs/FoC-ProductBacklog.md`, which is reference only. The two
> currently differ on F20.1.1 and NFR8.1.2 — see §10.

### F19 — Closed Credit Economy

| ID | Requirement | Priority | Week |
|---|---|---|---|
| F19.1 | Support initial credit allocation | | Recess |
| F19.1.1 | The system shall allocate 20 credits to each new user upon successful registration. | High | Recess |
| F19.2 | Support credit reservation | | Recess |
| F19.2.1 | The system shall reserve the offered credits from the requester's unreserved balance when a request is created. | High | Recess |
| F19.2.2 | Reserved credits shall not be available for any other transaction until they are transferred or released. | High | Recess |
| F19.2.3 | The system shall reject request creation when the credits offered exceed the requester's unreserved balance. | High | Recess |
| F19.3 | Support credit transfer | | 7 |
| F19.3.1 | The system shall transfer the reserved credits from the requester to the assigned courier when a request reaches the "completed" state. | High | 7 |
| F19.3.2 | The system shall ensure that at most one credit transfer is recorded per request. | High | 7 |
| F19.4 | Support credit release | | 8 |
| F19.4.1 | The system shall return the reserved credits to the requester when a request is cancelled or expires. | High | 8 |
| F19.5 | Support credit wallet | | 8 |
| F19.5.1 | The system shall allow a user to view their reserved balance, unreserved balance, and total balance. | High | 8 |
| F19.5.2 | The system shall allow a user to view transaction records in which they are the originating or destination user. | High | 8 |

### F20 — Transaction Logging

| ID | Requirement | Priority | Week |
|---|---|---|---|
| F20.1 | The system shall record a log entry for every credit operation. | | **Recess** (moved from 9) |
| F20.1.1 | The system shall record every credit operation with the following details: Transaction ID (unique), Transaction type (allocation, reservation, transfer, release), Originating user (not applicable for allocation), Destination user (applicable to transfer only), Amount, Timestamp, Associated request ID. | High | **Recess** (moved from 9) |
| F20.2 | The system shall provide administrators with read-only access to transaction records for all users, for audit and investigation purposes. | High | 9 |
| F20.2.1 | The system shall restrict access to the transaction log to users with the administrator role. | High | 9 |

## 7. Non-functional requirements

| ID | Requirement | Priority | Week |
|---|---|---|---|
| NFR8 | The system shall guarantee strict transaction consistency and the integrity of credit balances. | High | 7 |
| NFR8.1 | The system shall handle race conditions and interrupted transactions. | High | 7 |
| NFR8.1.1 | The system shall ensure that concurrent requests affecting a user's credit balance are processed atomically to prevent race conditions. | High | 7 |
| NFR8.1.2 | In the event of a system failure during a credit transfer, the system shall perform a complete rollback to guarantee both wallets remain in their original, consistent state. | High | **7** (moved from 8) |
| NFR8.2 | The system shall maintain immutable audit logs. | Med | 7 |
| NFR8.2.1 | The system shall not delay transactions by more than 500ms when logging each operation. | Med | 10 |
| NFR8.2.2 | The system shall retain each transaction record for at least 2 years from its timestamp. | Med | 10 |
| NFR8.2.3 | Transaction log records shall be append-only. The system shall not permit any user, including administrators, to modify or delete a logged transaction. | Med | 7 |

## 8. API surface

Contracts to build against. Other services are not yet available; all of these are
testable with synthetic UUIDs.

| Method | Path | Requirement |
|---|---|---|
| POST | `/credits/allocate` | F19.1.1 |
| POST | `/credits/reserve` | F19.2.1, F19.2.3 |
| POST | `/credits/transfer` | F19.3.1, F19.3.2 |
| POST | `/credits/release` | F19.4.1 |
| GET | `/credits/balance/:userId` | F19.5.1 |
| GET | `/credits/transactions` | F19.5.2 |
| GET | `/credits/transactions/all` | F20.2, F20.2.1 |

## 9. Presented edge case — team's agreed solution

**Scenario.** On completion of an errand, the requester's wallet is deducted
successfully, but the connection to the database is lost before the credits are added
to the courier's wallet.

**Solution.**

1. Execute both wallet updates in a single atomic transaction that rolls back entirely
   upon failure.
2. Store the pending transfer intent in a durable message queue so the system remembers
   the owed credits even after a crash.
3. Safely retry the transfer using the unique request ID to prevent double-charging, and
   flag the transaction in the admin dashboard if all retries are exhausted.

Items 2 and 3 are not yet reflected in the FR/NFR tables. Do not implement them ahead of
the team specifying them.

## 10. Known gaps — raise, do not resolve

These are unresolved in the backlog. Flag them; do not fill them in.

1. ~~**Logging is scheduled at week 9**, after allocation, reservation, transfer and
   release are all built. F20.1 requires a log entry for every credit operation, so
   either logging moves earlier or four existing write paths get retrofitted.~~
   **RESOLVED — team decision, 2026-09-26: F20.1.1 moved to the Recess iteration.**
   Logging is built into every write path from the start. See §6.
2. ~~**NFR8.1.2 (rollback) is at week 8 but transfer is at week 7.** The guarantee should
   ship with the operation it protects.~~
   **RESOLVED — team decision, 2026-09-26: NFR8.1.2 moved to week 7**, alongside F19.3
   (transfer). See §7.
3. **No FR covers the failed-transfer terminal state** referenced in §9.
4. **No FR covers admin credit adjustment**, though NFR3.2.1 in User Service requires
   OTP before "direct credit balance adjustments".
5. ~~**F19.5.2 and F20.2 do not state whether the field sets differ** between a user's
   view and an administrator's — only that the row scope differs.~~
   **RESOLVED — team decision, 2026-10-19: the field sets are identical.** The only
   difference is row scope: a user sees rows where they are the originating or
   destination user; an administrator sees all rows.
6. **"Auditors" appear in no User Service role definition** but were referenced in an
   earlier version of F20.2.1.
7. **RESOLVED on creation — team decision, 2026-10-19: pagination is 20 records per
   page, ordered `created_at DESC`.** Cursor or offset was left to the implementer;
   keyset cursors were used. Recorded here because neither F19.5.2 nor F20.2 states a
   page size or an ordering.
8. **RESOLVED on creation — team decision, 2026-10-19: "administrator" means rank >=
   `admin`**, so `super admin` is included. Mirrors `ROLE_RANK` in
   `user-service/src/middleware/authorize.ts`. Recorded here because F20.2.1 says "the
   administrator role", which reads as exclusive.
9. **RESOLVED on creation — team decision, 2026-10-19: counterparty ids are resolved by
   the frontend** against User Service. Credit Service returns UUIDs only and stores no
   user display data.
10. **No FR covers the administrator transaction filters.** `GET
   /credits/transactions/all` gained optional `?userId=` and `?requestId=` parameters on
   2026-11-04. F19.5.2 covers a user's **own** transactions and F20.2 covers **all**
   transactions; filtering the administrator view by user or by order is neither, and no
   F19 or F20 requirement describes it.

   The `userId` half is driven by a requirement belonging to **another service** —
   User Service's **F5.3.2**, *"The system shall allow administrators to view transaction
   details of individual users"* (`docs/FoC-ProductBacklog.md` line 103) — which needs a
   credit-service endpoint but does not itself specify one. The **`requestId` half has no
   requirement at all**, in this backlog or user-service's; it was requested directly.

   Recorded as a gap, not resolved. Nothing here should be read as a requirement, and the
   parameters are listed under "What was invented" in `API.md`.

## 11. Working rules

- Requirements, architecture and schema decisions belong to the team. Implement what is
  specified here; if something is missing or contradictory, say so and stop.
- Every file carries the AI attribution header required by the course policy.
- Log all AI-assisted work in `/ai/usage-log.md`.
- Do not introduce dependencies beyond the stack in §4 without asking.
