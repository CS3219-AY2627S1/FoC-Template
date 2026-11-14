<!--
  AI Assistance Disclosure:
  Tool: Claude Code (model: claude-opus-5), date: 2026-10-16
   2026-10-16: Week 7/8 catch-up - published API contract for Order Service to build
     against. Methods and paths are the team's (credit-service-context.md §8); items
     marked INVENTED were not covered by any requirement or team decision.
     Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
   2026-10-19: Week 9 - JWKS authentication, the two transaction-history endpoints,
     and the pagination contract.
     Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
   2026-11-04: Optional ?userId= and ?requestId= filters on the administrator
     transaction view. No new route, no new fields, no requirement behind it.
     Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
   2026-10-22 (Claude Code, model: claude-sonnet-5): Updated a doc path reference after
     user-service's docs/local-dev-setup.md was renamed to docs/user-service-instructions.md.
     No requirements, architecture, schema, or API decisions were made by the AI tool.
     Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
   2026-11-10: Documentation only - added a curl example to every endpoint, the
     "Async interface" section (queue and task names, payload, backoff schedule,
     idempotency, dead_letter_jobs), and the authentication column on each endpoint.
     All of it read off the route, middleware, worker and SQL code as it stands; no
     source code was changed, and no requirements, architecture, schema, or API
     decisions were made by the AI tool.
     Author review:
-->

# Credit Service API

Base URL in compose: `http://credit-service:3003`. Published on the host at
`${CREDIT_SERVICE_PORT:-3003}`.

All ids are **UUID**. `requestId` is sent on every credit call, and Credit Service keys
everything on it — there is no reservation handle (team decision 2026-10-16).

## Authentication

Read endpoints require a User Service access token:

```
Authorization: Bearer <token>
```

Tokens are verified **locally** against User Service's JWKS at
`{USER_SERVICE_URL}/auth/.well-known/jwks.json`, per
`user-service/docs/user-service-instructions.md` (Part 2). The key set is cached and refetched once
on an unknown `kid`; **RS256 is pinned** and the token's own `alg` header is never
trusted. The two claims used are `sub` (the user id) and `role`.

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or non-`Bearer` header, bad signature, unknown `kid`, expired token |
| 403 | `FORBIDDEN` | Authenticated, but not permitted to read this |
| 503 | `IDENTITY_PROVIDER_UNAVAILABLE` | The JWKS endpoint could not be reached |

**503 is deliberately not 401.** A User Service outage has to be distinguishable from a
bad credential, or every caller is told to log in again during an incident they cannot
fix. Only transport failures map to 503; anything else about the token is a 401.

**"Administrator" means rank >= `admin`**, using the same `ROLE_RANK`
(`user` 0, `admin` 1, `super admin` 2) as `user-service/src/middleware/authorize.ts`, so
super admin is included.

> ### ⚠️ The four write endpoints are unauthenticated
> `POST /credits/allocate`, `/reserve`, `/transfer` and `/release` take no token. They are
> called by other services, not browsers, and **service-to-service authentication is not
> specified anywhere in the backlog**. This was not a team decision — see
> "What was invented". Do not expose them outside the compose network.

## Conventions

Success responses carry a `balance` envelope, and the write endpoints also return the
log row that was written in the same transaction:

```jsonc
{
  "balance": {
    "userId": "<uuid>",
    "totalBalance": 20,
    "reservedBalance": 4,
    "unreservedBalance": 16
  },
  "transaction": {
    "transaction_id": "<uuid>",
    "transaction_type": "reservation",
    "originating_user_id": "<uuid>|null",
    "destination_user_id": "<uuid>|null",
    "amount": 4,
    "created_at": "2026-10-16T14:00:00.000Z",
    "request_id": "<uuid>|null"
  }
}
```

Errors are always:

```jsonc
{ "error": { "code": "MACHINE_READABLE_CODE", "message": "Human sentence." } }
```

Every endpoint can return `400 INVALID_REQUEST_BODY` (validation), `500
BALANCE_INVARIANT_VIOLATION` (a balance CHECK constraint fired and the write rolled
back) and `500 INTERNAL_ERROR`. These are omitted from the per-endpoint tables below.

---

## `POST /credits/allocate` — F19.1.1

Grants a new user their starting 20 credits. The amount is fixed by F19.1.1.

```jsonc
// request
{ "userId": "<uuid>" }
```

**`201`** — balance envelope, `transaction_type: "allocation"`, `request_id: null`.

| Status | Code | When |
|---|---|---|
| 409 | `ALREADY_ALLOCATED` | This user already has a balance. No credits granted, no log row written |

**Auth:** none. Service-to-service only — see the banner above.

```bash
curl -X POST http://localhost:3003/credits/allocate \
  -H 'Content-Type: application/json' \
  -d '{"userId":"3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"}'
```

---

## `POST /credits/reserve` — F19.2.1, F19.2.3

Holds the offered credits against a request. Total is unchanged; reserved rises.

```jsonc
// request
{ "userId": "<uuid>", "requestId": "<uuid>", "amount": 4 }
```

`amount` must be a positive integer.

**`201`** — balance envelope, `transaction_type: "reservation"`.

| Status | Code | When |
|---|---|---|
| 404 | `BALANCE_NOT_FOUND` | The user has no balance row |
| 409 | `RESERVATION_ALREADY_EXISTS` | This `requestId` is already reserved. Idempotent: no second hold is taken |
| 422 | `INSUFFICIENT_UNRESERVED_CREDITS` | F19.2.3 — the offer exceeds `totalBalance − reservedBalance` |

**Auth:** none. Service-to-service only.

```bash
curl -X POST http://localhost:3003/credits/reserve \
  -H 'Content-Type: application/json' \
  -d '{"userId":"3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
       "requestId":"8df55417-cff4-4764-9abe-823993a9c980",
       "amount":4}'
```

---

## `POST /credits/transfer` — F19.3.1, F19.3.2

Moves the reserved credits to the courier on completion. Requester's total **and**
reserved both fall; courier's total rises (context §5).

```jsonc
// request
{ "requestId": "<uuid>", "courierId": "<uuid>" }
```

**The amount and the requester are not sent.** They are read back from the reservation
row for that `requestId`, so a transfer can only ever move exactly what was held.

Credit Service does not look couriers up and stores no courier reference of its own
(team decision 2026-10-16).

**`201`** — balance envelope showing **the requester's** balance after the debit, and
`transaction_type: "transfer"` with both party ids set.

| Status | Code | When |
|---|---|---|
| 404 | `RESERVATION_NOT_FOUND` | No reservation exists for this `requestId` |
| 404 | `COURIER_NOT_FOUND` | The courier has no balance row. **A balance is not created here** — credits may only enter the economy via F19.1.1 |
| 404 | `BALANCE_NOT_FOUND` | The requester's balance row is missing (should not occur if a reservation exists) |
| 409 | `ALREADY_TRANSFERRED` | F19.3.2 — already transferred. Idempotent, safe to retry |
| 409 | `ALREADY_RELEASED` | **INVENTED** — the credits were already returned to the requester, so there is nothing to transfer. No requirement covers this ordering |

**Retry safety.** A failure before commit leaves no trace, so the same call can simply be
sent again.

**Auth:** none. Service-to-service only. This endpoint is also driven asynchronously —
see [Async interface](#async-interface).

```bash
curl -X POST http://localhost:3003/credits/transfer \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"8df55417-cff4-4764-9abe-823993a9c980",
       "courierId":"a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"}'
```

---

## `POST /credits/release` — F19.4.1

Returns reserved credits to the requester on cancellation **or** expiry. Reserved falls;
total is untouched (context §5).

```jsonc
// request
{ "requestId": "<uuid>" }
```

Takes only a `requestId`. Credit Service has no clock and performs no expiry detection —
the caller decides why the credits are coming back, and both reasons arrive identically
(team decision 2026-10-16).

**`201`** — balance envelope, `transaction_type: "release"`, `destination_user_id: null`.

| Status | Code | When |
|---|---|---|
| 404 | `RESERVATION_NOT_FOUND` | No reservation exists for this `requestId` |
| 404 | `BALANCE_NOT_FOUND` | The requester's balance row is missing |
| 409 | `ALREADY_RELEASED` | Already released. Idempotent, safe to retry |
| 409 | `ALREADY_TRANSFERRED` | **INVENTED** — the credits are the courier's now and are not the requester's to reclaim. No requirement covers this ordering |

**Auth:** none. Service-to-service only.

```bash
curl -X POST http://localhost:3003/credits/release \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"8df55417-cff4-4764-9abe-823993a9c980"}'
```

---

## `GET /credits/balance/:userId` — F19.5.1

```jsonc
// 200
{ "balance": { "userId": "<uuid>", "totalBalance": 20, "reservedBalance": 4, "unreservedBalance": 16 } }
```

`unreservedBalance` is always `totalBalance − reservedBalance`, computed on read and
never stored.

| Status | Code | When |
|---|---|---|
| 404 | `BALANCE_NOT_FOUND` | No balance row for this user |

**Auth: token required.** A user may read only their own balance unless they hold a role
ranked at or above `admin`. Adds `401`, `403` and `503` from the Authentication table.
Enforced by `requireBalanceAccess` = `requireAuth` + `requireSelfOrElevated`.

```bash
curl http://localhost:3003/credits/balance/3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d \
  -H "Authorization: Bearer $TOKEN"
```

---

## `GET /health`

`200 { "status": "ok" }`. Used by the compose healthcheck and the ECS target group.
**INVENTED** — not in §8, but required by the healthcheck pattern the sibling services
use.

**Auth:** none. Static response; it does not touch the database.

```bash
curl http://localhost:3003/health
```

---

## `GET /credits/transactions` — F19.5.2

The caller's own records: every row where they are the originating **or** the
destination user. Scoped to `sub` from the token — there is no user parameter, so one
user cannot ask for another's history.

```
GET /credits/transactions
GET /credits/transactions?cursor=<opaque>
```

**`200`**

```jsonc
{
  "transactions": [
    {
      "transaction_id": "<uuid>",
      "transaction_type": "allocation | reservation | transfer | release",
      "originating_user_id": "<uuid>|null",
      "destination_user_id": "<uuid>|null",
      "amount": 4,
      "created_at": "2026-10-19T14:00:00.000Z",
      "request_id": "<uuid>|null"
    }
  ],
  "nextCursor": "<opaque string>|null"
}
```

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_CURSOR` | The cursor is malformed |

**Auth: token required**, any role. The rows returned are scoped to `sub`; adds `401`
and `503` from the Authentication table.

```bash
curl http://localhost:3003/credits/transactions \
  -H "Authorization: Bearer $TOKEN"

curl 'http://localhost:3003/credits/transactions?cursor=MjAyNi0xMS0wNFQxNTowNjoxOC4zMjZafDhl' \
  -H "Authorization: Bearer $TOKEN"
```

## `GET /credits/transactions/all` — F20.2, F20.2.1

Every user's records. **Identical response shape and field set** to the endpoint above;
the only difference is row scope (team decision 2026-10-19). Requires rank >= `admin`.

Same query parameters, same `400 INVALID_CURSOR`, plus `403 FORBIDDEN` for a caller
below `admin`.

### Optional filters

```
GET /credits/transactions/all
GET /credits/transactions/all?userId=<uuid>
GET /credits/transactions/all?requestId=<uuid>
GET /credits/transactions/all?userId=<uuid>&requestId=<uuid>
GET /credits/transactions/all?userId=<uuid>&cursor=<opaque>
```

| Parameter | Matches |
|---|---|
| `userId` | rows where that user is the **originating OR the destination** party — the same predicate the own-history endpoint uses for its scope |
| `requestId` | rows for that order. Allocations carry no `request_id`, so they never match |

Both are optional and **combinable: supplying both ANDs them.** With neither, the
response is exactly what it was before — every row, unchanged.

These are filters on this endpoint, not a new route, so they inherit its authentication,
its administrator gate, its page size, its ordering and its row shape. **No new response
fields.**

**An unmatched filter is `200` with an empty array, never `404`.** Credit Service holds
no list of users or orders (context §3), so it cannot tell "no such order" from "an order
with no credit activity yet", and the second is an ordinary state. A requester who has
been allocated credits but has spent none likewise returns their allocation row only.

**Filters are re-sent with the cursor, not carried inside it.** The cursor stays an
opaque position token — base64url of `created_at|transaction_id` — with no filter baked
in, so paging a filtered set means sending `?userId=…&cursor=…` on each request. The
trade-off is that dropping the filter on a later page silently widens the result instead
of erroring; the caller owns the filter. Encoding filters into the cursor would have made
it impossible to mismatch, at the cost of a cursor that is no longer a pure position and
cannot be reused across queries.

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_REQUEST_BODY` | `userId` or `requestId` is not a UUID. Validated before any query runs |
| 400 | `INVALID_CURSOR` | The cursor is malformed |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Authenticated but ranked below `admin` — enforced with or without a filter |

> **INVENTED — no requirement covers this surface.** F19.5.2 covers a user's own
> transactions and F20.2 covers all of them; filtering the administrator view by user or
> order is neither. It exists to serve user-service's F5.3.2. See
> `credit-service-context.md` §10 item 10.

**Auth: token required, rank >= `admin`.** Enforced by `requireAuth` then
`requireElevated`, so a `user` token is `403 FORBIDDEN` with or without a filter.

```bash
# every user's rows
curl http://localhost:3003/credits/transactions/all \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# one user, one order, and both together
curl 'http://localhost:3003/credits/transactions/all?userId=3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' \
  -H "Authorization: Bearer $ADMIN_TOKEN"
curl 'http://localhost:3003/credits/transactions/all?requestId=8df55417-cff4-4764-9abe-823993a9c980' \
  -H "Authorization: Bearer $ADMIN_TOKEN"
curl 'http://localhost:3003/credits/transactions/all?userId=3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d&requestId=8df55417-cff4-4764-9abe-823993a9c980&cursor=<opaque>' \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Pagination

**20 records per page, `created_at DESC`**, tie-broken by `transaction_id`.

**Keyset, not offset.** The cursor names the last row of the page you just read, and the
next page starts strictly after it. The log is append-only and grows at the head, so with
`OFFSET` a row inserted between two requests shifts everything down and the reader sees a
duplicate; keyset is stable under concurrent writes. It also lets Postgres seek on the
existing `(user, created_at DESC)` indexes rather than counting rows it then discards.

The cursor is **opaque** — base64url of `created_at|transaction_id`. Treat it as a token;
do not construct one. `nextCursor` is `null` on the last page, which is how you know to
stop.

The trade-off: there is no page count and no jumping to page N. Neither is needed for an
infinite-scroll history, and both would require a `COUNT(*)` over the whole log.

### Counterparty names are not resolved here

Rows carry `originating_user_id` and `destination_user_id` as UUIDs only. Credit Service
stores no user display data and does not call User Service. Resolve names client-side
(team decision 2026-10-19).

---

## Async interface

Besides the HTTP surface, Credit Service consumes a BullMQ queue. Order Service publishes
a job when an order completes; the worker calls the same `transferCredits` the HTTP
endpoint calls. `src/queue/transferQueue.ts` holds the whole wire contract.

### Queue and task names

| | Value |
|---|---|
| Redis key | `queue:credit:transfer` |
| BullMQ prefix | `queue:credit` |
| BullMQ queue name | `transfer` |
| Job (task) name | `credit_transfer` |
| Broker | `order-redis` — `REDIS_HOST` / `REDIS_PORT`, TLS when `REDIS_TLS=true` |
| Worker concurrency | 1 |

The prefix and name are separate because BullMQ composes the Redis key as
`<prefix>:<name>`. A producer using the default prefix (`bull`) would write to
`bull:transfer` and the worker would never see the job.

### Job payload

```jsonc
{
  "requestId": "8df55417-cff4-4764-9abe-823993a9c980",
  "courierId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
}
```

Both fields must be present and must match a UUID pattern (`isTransferPayload`). The
amount and the requester are **not** sent — they are read from the reservation row for
that `requestId`, as on the HTTP endpoint.

### Retry and backoff

`attempts` is 5 (`MAX_ATTEMPTS`). The delays come from the **consumer**: the producer
sets `backoff: { type: 'custom' }` and the worker supplies
`settings.backoffStrategy`, which is

```
delay(attemptsMade) = 5000ms × 5^(attemptsMade − 1)
```

| Attempt | Delay before it |
|---|---|
| 1 | — |
| 2 | 5s |
| 3 | 25s |
| 4 | 125s (2m 5s) |
| 5 | 625s (10m 25s) |

So a job that never succeeds is abandoned about 13 minutes after it was first picked up.

### Classification

Each failure is sorted by `classifyTransferError`:

| Error code | Disposition | Effect |
|---|---|---|
| `ALREADY_TRANSFERRED` | **success** | The transfer already happened; the job completes |
| `RESERVATION_NOT_FOUND` | permanent | Dead-lettered immediately, no retry |
| `COURIER_NOT_FOUND` | permanent | ditto |
| `BALANCE_NOT_FOUND` | permanent | ditto |
| `ALREADY_RELEASED` | permanent | ditto |
| `INVALID_REQUEST_BODY` | permanent | ditto |
| any other `AppError` with status 4xx | permanent | ditto |
| anything else (5xx, non-`AppError`) | retry | Retried on the schedule above |

A wrong job name, or a payload that fails the UUID guard, is also permanent.

### Idempotency

Replaying a job is safe. A duplicate lands on
`transaction_log_one_transfer_per_request`, the partial unique index that allows one
`transfer` row per `request_id`; the service turns that into `ALREADY_TRANSFERRED`, which
the worker classifies as **success**. The job completes and no second transfer occurs.
Order Service uses the job id `outbox-<id>`, so a redelivery of the same outbox row is
the same BullMQ job.

### `dead_letter_jobs`

A job is written to this table when it is classified permanent, or when its last retry
fails:

| Column | |
|---|---|
| `id` | `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY` |
| `job_id` | BullMQ job id, or `unknown` |
| `task_name` | the job name as received |
| `payload` | `JSONB`, the job data verbatim |
| `error_trace` | `[CODE] ` plus the stack, for an `AppError` |
| `failed_at` | `TIMESTAMPTZ` |
| `status` | `TEXT NOT NULL DEFAULT 'UNRESOLVED'`, indexed |

`credit_app` holds `SELECT, INSERT, UPDATE` and no `DELETE` or `TRUNCATE`, so rows can be
marked resolved but never removed by the service.

**If the dead-letter write itself fails**, the worker logs `DEAD-LETTER WRITE FAILED`
with the payload, the original error and the write error, and the job stays in BullMQ's
failed set for manual replay. `removeOnComplete` is true and `removeOnFail` is unset, so
failed jobs are retained in Redis.

---

## What was invented, and what the team still owes

Everything below was written to make the service usable and is **not** backed by a
requirement or a recorded team decision. Listed so it can be ratified or replaced.

1. **All request and response body shapes.** §8 fixes only method and path.
2. **All HTTP status codes**, and the `{ error: { code, message } }` envelope.
3. **`ALREADY_RELEASED` on transfer and `ALREADY_TRANSFERRED` on release.** No
   requirement states what happens when the two orderings collide.
4. **`GET /health`.**
4a. **The `?userId=` and `?requestId=` filters on `GET /credits/transactions/all`**,
   their parameter names, that an unmatched filter is an empty `200`, and that filters
   travel beside the cursor rather than inside it. No FR covers this endpoint surface —
   see context §10 item 10.
4b. **The four write endpoints take no token.** Service-to-service authentication is
   unspecified in the backlog; leaving them open was the agent's call, not the team's.
4c. **`INVALID_CURSOR` (400)** and the opaque cursor format. Decision 5 left the cursor
   shape to the implementer.
4d. **`IDENTITY_PROVIDER_UNAVAILABLE`** as the 503 code name. Decision 3 required a
   distinct code but did not name it.
5. **Self-transfer is not rejected.** If `courierId` equals the requester, the arithmetic
   nets out to a release. No requirement forbids it, and Order Service's F3.2.1 prevents
   it upstream, so Credit Service does not second-guess the caller.
6. **The role name `credit_app`** for the least-privilege database role (NFR8.2.3). The
   team specified "a named least-privilege role" without naming it.
7. **`ELEVATED_ROLE = 'admin'`** as the rank threshold for reading another user's
   balance. The team said to mirror user-service's rank comparison; the threshold itself
   was not stated.

### Order Service integration (was a mismatch, now aligned)

`order-service/src/clients/credits.client.ts` previously declared a different contract —
`reserve({ requesterId, amount }) → { reservationId }` and `release(reservationId)`, with
no `requestId`, wired to `createStubCreditsClient()`. As of 2026-11-10 it matches this
document:

- `reserve({ userId, requestId, amount })` → `POST /credits/reserve`
- `release({ requestId })` → `POST /credits/release`
- it treats `409 RESERVATION_ALREADY_EXISTS` on reserve, and `404 RESERVATION_NOT_FOUND`
  or `409 ALREADY_RELEASED` on release, as success
- it has **no** `transfer` method: transfer is driven over the queue instead — see
  [Async interface](#async-interface)

## Design decisions

<!-- Written by the author -->
