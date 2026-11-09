<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
Scope: Order Service README: status, state table, API and error tables, design calls, how to run and test.
Author review: Reviewed and approved by @mattis.
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
Scope: Documented the pickup-timeout re-listing deviation, the single-publisher requirement and the typecheck script.
Author review: Reviewed and approved by @mattis.
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
Scope: Documented the Kafka integration with Credit Service (CREDIT_MODE=kafka), its settings,
       delivery guarantees, observability and tests, and session verification through User Service.
Author review of additional changes: Reviewed and approved by @phuc
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
Scope: Documented the HTTP User and Supplier adapters, their settings and response codes.
Author review: Reviewed and approved by @mattis.
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
Scope: The demo now runs against the real Credit Service.
Author review: Reviewed and approved by @mattis.
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-09
Scope: Noted that the member frontend pages now exist.
Author review: Reviewed and approved by @mattis.
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-09
Scope: N2 natural language errand creation section (endpoints, settings, errors, decisions), per the approved N2 spec.
Author review: Pending review by @mattis.
-->

# Order Service

Owns the errand lifecycle: a requester posts an errand, a courier accepts and delivers it, and the
requester confirms. It keeps each errand's history and tells Credit Service, through an outbox, when to
hold and when to settle credits.

## Status

The core is done: the database, state machine, HTTP API, deadline sweeper, outbox publisher, container and
gateway routes. Credit Service is reached over **Kafka** (see [Kafka integration](#kafka-integration)); sessions
and supplier lookups go to User Service and Supplier Service over HTTP. `AUTH_MODE`, `SUPPLIER_MODE` and
`CREDIT_MODE` pick the adapters; the stubs stay selectable and the unit tests use them:

| Neighbour | Real adapter (Compose default) | Stub |
|---|---|---|
| User Service sessions | `AUTH_MODE=http`: `GET /auth/verify` with the caller's `Authorization` header | `AUTH_MODE=stub`: believes `Bearer stub.<uuid>.MEMBER` or `.ADMINISTRATOR` |
| Supplier Service | `SUPPLIER_MODE=http`: `GET /api/v1/suppliers/:id` with the caller's `Authorization` header | `SUPPLIER_MODE=stub`: three fixed suppliers (`STUB_SUPPLIERS`) |
| Credit Service | `CREDIT_MODE=kafka` | `CREDIT_MODE=stub` (default outside Compose): in memory, replies to `ReserveRequested`, checks every message against the contract |

How Order answers when User or Supplier does not give a usable reply (no retries):

| User or Supplier reply | Order answers |
|---|---|
| User `401` | `401 UNAUTHENTICATED` |
| Supplier `401` | `401 UNAUTHENTICATED`, same body as Order's own 401 |
| Supplier `200` with `status: "ARCHIVED"` (administrator caller) | `422 SUPPLIER_ARCHIVED` |
| Supplier `404` (unknown id, or an archived supplier for a member) | `422 SUPPLIER_UNAVAILABLE` |
| `5xx`, no reply within the timeout, or unreachable | `503 SERVICE_UNAVAILABLE` |
| Supplier `400`/`403`, User 4xx other than `401`, or a `200` body Order does not expect | `500 INTERNAL_ERROR`, logged |

Not done yet: reacting to account suspensions (OS-F6), and the administrator dispute screens in the frontend. The member
pages (open errands, my errands, posting an errand, and the errand detail with its actions) are in `frontend/src/errands/`.

Message contract with Credit Service: [docs/order-credit-contract.md](docs/order-credit-contract.md).

## States and transitions

States: `PENDING_RESERVATION`, `RESERVATION_REJECTED`\*, `RESERVATION_TIMED_OUT`\*, `OPEN`, `ACCEPTED`, `PICKED_UP`,
`DELIVERED`, `DISPUTED`, `COMPLETED`\*, `CANCELLED`\*, `EXPIRED`\*, `FAILED`\* (\* = terminal).

| Action | From | To | Who | Deadline check | Credit message |
|---|---|---|---|---|---|
| (create) | none | `PENDING_RESERVATION` | member | none | `ReserveRequested` |
| `CreditReserved` reply | `PENDING_RESERVATION` | `OPEN` | Credit | none | none |
| `CreditReservationRejected` reply | `PENDING_RESERVATION` | `RESERVATION_REJECTED` | Credit | none | none |
| `reservationTimeout` | `PENDING_RESERVATION` | `RESERVATION_TIMED_OUT` | sweeper | `reservation_deadline` passed | `ReservationTimedOut` |
| `accept` | `OPEN` | `ACCEPTED` | any member except the requester | before `listing_deadline` | none |
| `withdraw` | `ACCEPTED` | `OPEN` (see [Known deviations](#known-deviations)) | the courier | none | none |
| `pickup` | `ACCEPTED` | `PICKED_UP` | the courier | before `pickup_deadline` | none |
| `deliver` | `PICKED_UP` | `DELIVERED` | the courier | before `delivery_deadline` | none |
| `confirm` | `DELIVERED` | `COMPLETED` | the requester | none | `OrderCompleted` |
| `reject` | `DELIVERED` | `DISPUTED` | the requester | before `confirm_deadline` | none |
| `cancel` | `OPEN`, `ACCEPTED` | `CANCELLED` | the requester | none | `OrderCancelled` |
| `resolve` (COURIER) | `DISPUTED` | `COMPLETED` | administrator | none | `OrderCompleted` |
| `resolve` (REQUESTER) | `DISPUTED` | `FAILED` | administrator | none | `OrderFailed` |
| `expire` | `OPEN` | `EXPIRED` | sweeper | `listing_deadline` passed | `OrderExpired` |
| `pickupTimeout` | `ACCEPTED` | `OPEN` (courier cleared; see [Known deviations](#known-deviations)) | sweeper | `pickup_deadline` passed | none |
| `deliveryTimeout` | `PICKED_UP` | `DISPUTED` | sweeper | `delivery_deadline` passed | none |
| `confirmTimeout` | `DELIVERED` | `COMPLETED` | sweeper | `confirm_deadline` passed | `OrderCompleted` |

Every transition is one database transaction that locks the errand row, checks state, party and deadline,
updates the row, appends to `errand_history` and, where a credit message is due, inserts the outbox row.
Concurrent accepts therefore have one winner.

## API

Paths are as the service sees them. The gateway maps `/api/v1/errands` to `/errands` and
`/api/v1/admin/errands` to `/admin/errands`. All routes except `/health` need `Authorization: Bearer <token>`.

| Method and path | Who | Success | Notes |
|---|---|---|---|
| `GET /health` | anyone | 200 | 503 when the database is unreachable |
| `POST /errands` | member | 202 | errand in `PENDING_RESERVATION`; body: `supplierId`, `items`, `dropoffLocation`, `notes?`, `creditAmount`, `listingDeadline`, `pickupDeadline`, `deliveryDeadline` |
| `GET /errands/open?page&size` | member | 200 | `OPEN` errands of other people, soonest listing deadline first |
| `GET /errands/mine?as=requester\|courier&state&page&size` | member | 200 | your own errands, in either role |
| `GET /errands/:id` | requester, courier, administrator, or any member while `OPEN` | 200 | includes `history`; anyone else gets 404 |
| `POST /errands/:id/accept` | member | 200 | |
| `POST /errands/:id/withdraw` | courier | 200 | |
| `POST /errands/:id/pickup` | courier | 200 | |
| `POST /errands/:id/deliver` | courier | 200 | |
| `POST /errands/:id/confirm` | requester | 200 | |
| `POST /errands/:id/reject` | requester | 200 | optional body `{ "reason" }` |
| `POST /errands/:id/cancel` | requester | 200 | |
| `POST /admin/errands/:id/resolve` | administrator | 200 | body `{ "outcome": "COURIER"\|"REQUESTER", "reason" }` |
| `GET /admin/errands?state&requesterId&courierId&page&size` | administrator | 200 | |

Errors are `{ "error": "<CODE>", "message": "<text>" }`. 409 responses also carry `currentState`; 400
responses carry `details` (one entry per bad field).

| Status | `error` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | bad body, query or JSON; unknown fields |
| 401 | `UNAUTHENTICATED` | missing or invalid token (User Service answered 401) |
| 403 | `FORBIDDEN` | wrong party for the action, or a non-administrator on `/admin` |
| 403 | `CANNOT_ACCEPT_OWN_ERRAND` | the requester tries to accept |
| 404 | `NOT_FOUND` | no such errand, or you may not see it, or no such route |
| 409 | `ERRAND_NO_LONGER_AVAILABLE` | accept on an errand that is not `OPEN` (lost the race, cancelled, expired) |
| 409 | `INVALID_STATE` | any other action from the wrong state, including repeats |
| 409 | `DEADLINE_PASSED` | the step's deadline has passed |
| 413 / 415 | `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` | body problems |
| 422 | `SUPPLIER_ARCHIVED` | an administrator chose an archived supplier |
| 422 | `SUPPLIER_UNAVAILABLE` | the supplier does not exist or is not active |
| 503 | `SERVICE_UNAVAILABLE` | the database, User Service or Supplier Service is unreachable or too slow |
| 500 | `INTERNAL_ERROR` | anything else |

The N2 extraction endpoints add `429 RATE_LIMITED`, `502 EXTRACTION_FAILED` and `503 EXTRACTION_UNAVAILABLE`; see
[N2: natural language errand creation](#n2-natural-language-errand-creation).

## Design calls (decided: accepted by the author on 2026-10-16)

1. **Database: PostgreSQL 17, own `order-db`.** Row locks and conditional updates give single-winner accepts, and the outbox row is written in the same transaction as the errand change.
2. **A state before `OPEN`.** `PENDING_RESERVATION` is hidden from couriers. It becomes `OPEN` on `CreditReserved`, or `RESERVATION_REJECTED` (terminal, reason stored) on `CreditReservationRejected`.
3. **The first outcome is final, and a reply has a time limit.** With no reply by `reservation_deadline` (`RESERVATION_TIMEOUT_SECONDS`, default 30) the sweeper moves the errand to `RESERVATION_TIMED_OUT` and sends `ReservationTimedOut`, which releases a hold if one exists. A late `CreditReserved` for a rejected errand writes an `OrderCancelled` to release the hold. Other late replies are ignored.
4. **Duplicates are caught twice.** A redelivered Kafka reply is skipped by its `event_id` (`processed_credit_results`, written in the same transaction as the reply's effect), and a repeated reply with a new `event_id` finds the errand already moved (the state guards).
5. **Supplier snapshot.** The errand copies the supplier's name, building code and location at creation. New errands need an `ACTIVE` supplier.
6. **Users are referenced by ID only.** The frontend looks up usernames.
7. **Confirmation deadline** is `delivered_at + CONFIRMATION_WINDOW_MINUTES` (default 1440).
8. **Deadlines are enforced twice.** At the moment of the action, and by the sweeper.
9. **Repeated actions return an error.** A second `confirm` is `409 INVALID_STATE` with `currentState: "COMPLETED"`; only the first produces `OrderCompleted`.
10. **Admins cannot resolve a dispute they are part of** (as requester or courier).
11. **Creation returns `202 Accepted`**, because the reservation is asynchronous.
12. **Limits.** `creditAmount` 1 to 1000. 1 to 20 items of `{ name: 1 to 100 chars, quantity: 1 to 99 }`. `dropoffLocation` 1 to 200 chars. `notes` at most 500 chars. Unknown fields are rejected.
13. **No cancel while `PENDING_RESERVATION`.** There is no hold to release yet.
14. **Port 3002, paths without a prefix**, like User Service. The gateway strips `/api/v1`.

## Known deviations

- **Re-listing after a pickup timeout does not work yet (open question for the author).** The schema enforces
  `listing_deadline <= pickup_deadline`, so an errand that `pickupTimeout` returns to `OPEN` (or that a courier
  `withdraw`s after the listing deadline) is already past its listing deadline. No other courier can accept it,
  and the sweeper expires it in the same tick, releasing the credits through `OrderExpired`. OS-F2.2.2 promises
  re-listing for another courier. The behaviour is kept for now and the author decides whether to change it.

## N2: natural language errand creation

A requester describes the errand in their own words; Order asks Claude to work out the create-errand fields; the
frontend fills the create form with them, and the requester reviews, edits and submits it as usual. Nothing is created
by these endpoints. Spec and the author's decisions:
[docs/superpowers/specs/2026-11-09-order-n2-natural-language-errand-creation.md](../docs/superpowers/specs/2026-11-09-order-n2-natural-language-errand-creation.md).

| Method and path | Who | Success | Notes |
|---|---|---|---|
| `GET /errands/extract/status` | any logged-in user | 200 | `{ available, reason }`; `reason` is `null`, `"DISABLED"` (mode `off`) or `"NOT_CONFIGURED"` (mode `anthropic`, no key) |
| `POST /errands/extract` | any logged-in user (members and administrators) | 200 | body `{ "description" }`, 1 to 1000 characters (JavaScript string length), not blank; returns the eight `POST /errands` fields, each `null` if it couldn't be worked out |

Both routes are registered before `/errands/:id`. The gateway already forwards `/api/v1/errands`.

| Status | `error` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | body not exactly `{ description }`, description missing, not a string, blank or over 1000 characters |
| 401 | `UNAUTHENTICATED` | no valid session, or Supplier Service answered `401` to the Supplier list call |
| 429 | `RATE_LIMITED` | more than 3 calls reaching the LLM in 60 s; `Retry-After` header in seconds |
| 502 | `EXTRACTION_FAILED` | the LLM call timed out, failed, was refused, was cut off (`max_tokens`) or wasn't usable JSON |
| 503 | `EXTRACTION_UNAVAILABLE` | mode `off`, or `anthropic` with no key |
| 503 | `SERVICE_UNAVAILABLE` | the Supplier list couldn't be fetched (5xx, timeout, unreachable); the LLM isn't called |
| 500 | `INTERNAL_ERROR` | Supplier Service answered the list call in a way Order doesn't expect |

**How a call runs:** session check (401), body check (400), feature check (503), rate-limit check (429), every page of
`ACTIVE` Suppliers from Supplier Service with the caller's `Authorization` (`SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS` per
page), rate-limit check and record in one step (429), one LLM call, then the reply checks.

| Decision | Detail |
|---|---|
| Model call | One call to `LLM_MODEL` (default Claude Haiku 5.5) with a structured-output JSON schema, effort `medium`, `max_tokens` 16000, SDK `maxRetries: 0`, timeout `LLM_TIMEOUT_MS`. Sent: the description (as data, never as instructions), each Supplier's id, name, building label, building code, floor, location description and categories, and the current Singapore date and time. Nothing about the requester is sent. |
| Supplier | The schema allows only the ids sent, or `null`, and Order checks the id against the list again. No clear match, or several, is `null`. |
| Deadlines | Read in Singapore time and returned as ISO 8601 with an offset. One time fills only the deadline its wording points to; vague, past or ambiguous times are `null`. |
| Reply checks | Every value must pass the `POST /errands` rule or becomes `null`: credits 1 to 1000; drop-off 1 to 200 characters; notes at most 500; deadlines in the future. More than 20 items makes `items` `null`. An item whose name isn't 1 to 100 characters is dropped (`items` is `null` if none are left); a quantity outside 1 to 99, or not stated, is `null` and the item is kept. If the deadlines left are out of order (listing, pickup, delivery), all three become `null`. |
| Rate limit | 3 calls per user per 60 s (any role), in memory in this process: a restart resets it and each replica counts on its own. Only calls that reach the LLM (stub included) count, whether they succeed or fail. The limit is checked before the Supplier fetch and checked and recorded in one synchronous step before the LLM call. `Retry-After = max(1, ceil((oldest + 60000 - now) / 1000))`. |
| Logging | One `errand_extraction` line per call: `userId`, `durationMs`, `outcome`, `filledFields`, `inputTokens`, `outputTokens` (`null` when the LLM wasn't reached, `0` for the stub). Never the description, the reply or the Supplier list. |
| Stub mode | A fixed reply whatever the text: the first listed Supplier, `[{ "Iced latte", 2 }, { "Croissant", null }]`, drop-off `"COM1 level 2 study area"`, notes `"Less ice, please"`, 15 credits, listing deadline now + 1 h rounded up to the quarter hour, pickup one hour later, delivery `null`, then the same checks. `stub:fail` in the description gives `502` at once; `stub:slow` waits `LLM_TIMEOUT_MS`, then `502`. |

`outcome` is one of `ok`, `invalid_request`, `unavailable`, `rate_limited`, `unauthenticated`, `supplier_unavailable`,
`supplier_error`, `timeout`, `llm_error`, `refused`, `truncated` or `unusable_reply`.

| Variable (service) | `.env` name (Compose) | Default outside Compose | Compose default | Meaning |
|---|---|---|---|---|
| `LLM_MODE` | `ORDER_LLM_MODE` | `stub` | `anthropic` | `anthropic`, `stub` or `off`; any other value stops startup |
| `LLM_API_KEY` | `ORDER_LLM_API_KEY` | unset | blank | Anthropic API key; never commit one. With `anthropic` and no key the feature is off (`NOT_CONFIGURED`) |
| `LLM_MODEL` | `ORDER_LLM_MODEL` | `claude-haiku-5-5` | `claude-haiku-5-5` | the Claude model |
| `LLM_TIMEOUT_MS` | `ORDER_LLM_TIMEOUT_MS` | 50000 | 50000 | time one LLM call may take (below nginx's 60 s default) |

The frontend's create page (`/errands/new`) shows the description box; see `frontend/README.md`.

## Run

From the repository root, with a `.env` made from `.env.example` (the three `ORDER_DB_*` passwords are required;
the demo also reads `ALLOWED_EMAIL_DOMAIN` and `BOOTSTRAP_ADMIN_*`):

```sh
docker compose up -d --build   # order-service waits for user-service and supplier-service to start
docker compose ps          # order-db healthy, order-migrate exited 0, order-service healthy
```

Callers log in through User Service (`POST /api/v1/auth/login`) and send its access token. Order Service
forwards the `Authorization` header to User Service's `GET /auth/verify` on every request. If User Service
can't be reached, requests get `503 SERVICE_UNAVAILABLE`, never 401. A requester also needs a credit account:
User Service creates one when an account first becomes `ACTIVE` (a `user.account-status` message).

The demo script runs against the real User, Supplier and Credit services, the compose defaults:

```sh
bash order-service/scripts/demo.sh
```

`scripts/demo.sh` (needs `curl` and `jq`) registers three fresh members, logs them and the bootstrap administrator in
through the User Service, picks the first active supplier, and walks through the whole lifecycle through the gateway at
`http://localhost:8080/api/v1` (override with `BASE`) and exits non-zero at the first unexpected status.
It doesn't show the reservation timeout, because the real Credit Service always answers.

Settings (all read in `src/config.ts`):

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | none, required | connection string for the `order_app` role |
| `PORT` | 3002 | HTTP port |
| `CONFIRMATION_WINDOW_MINUTES` | 1440 | time to confirm a delivery |
| `RESERVATION_TIMEOUT_SECONDS` | 30 | time for Credit to answer |
| `AUTH_MODE` | `stub` (Compose: `http`, from `ORDER_AUTH_MODE`) | `http` or `stub` |
| `USER_SERVICE_BASE_URL` | none, required in `http` mode | e.g. `http://user-service:3001` |
| `USER_SERVICE_VERIFY_TIMEOUT_MS` | 1000 | wait for `/auth/verify` before answering 503 (compose: `ORDER_USER_SERVICE_VERIFY_TIMEOUT_MS`) |
| `SUPPLIER_MODE` | `stub` (Compose: `http`) | `http` or `stub` |
| `SUPPLIER_SERVICE_BASE_URL` | none, required in `http` mode | e.g. `http://supplier-service:3000` |
| `SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS` | 2000 | wait for the supplier lookup before answering 503 (compose: `ORDER_SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS`) |
| `CREDIT_MODE` | `stub` (Compose: `kafka`, from `ORDER_CREDIT_MODE`) | `kafka` or `stub` |
| `KAFKA_BROKERS` | none, required with `kafka` | comma-separated `host:port` list |
| `KAFKA_CLIENT_ID` | `order-service` | Kafka client id |
| `STUB_CREDIT_LIMIT` | 100 | the stub rejects larger amounts |
| `STUB_CREDIT_DELAY_MS` | 500 | the stub's reply delay |
| `STUB_CREDIT_SILENT_AMOUNT` | 999 | an amount the stub never answers, to show the timeout |

Without Docker: `npm ci`, `npm run build`, then `DATABASE_URL=... npm run migrate` and `npm start`.

## Kafka integration

With `CREDIT_MODE=kafka`, Order Service and Credit Service talk only through Kafka, following
[docs/order-credit-contract.md](docs/order-credit-contract.md). The client is `@confluentinc/kafka-javascript`,
as in Credit and User Service.

| | Topic | Key | Order Service code |
|---|---|---|---|
| Commands out | `credit.commands` | `order_id` | `KafkaCreditPublisher` (`src/kafka/creditPublisher.ts`), fed by the outbox |
| Replies in | `credit.results` | `order_id` | consumer group `order-service` (`src/kafka/creditResultsConsumer.ts`) |
| Unusable replies | `credit.results.dlq` | original key | written by the consumer; created by `kafka/create-topics.sh` |

**Sending (outbox to `credit.commands`).**

- Every errand change, its history row and its outbox row commit in one transaction. The outbox payload is
  sent unchanged, so its `operation_id` is the same on every retry.
- The producer is idempotent with `acks=all`. A row is marked published only after Kafka acknowledges it. If
  the process dies between the acknowledgement and the marking, the row is sent again with the same
  `operation_id`, and Credit applies it once.
- Rows go out in sequential-id order (`outbox.id`), up to 100 per send, without waiting for a full batch. A
  shared advisory lock lets one replica publish at a time, so per-errand order (contract rule 5) holds with
  several replicas.
- A commit that adds a row wakes the publisher (`NOTIFY order_outbox`). The fallback poll is 200 ms. A failed
  send backs off from 400 ms up to 5 s, and wake-ups do not shorten the back-off.

**Receiving (`credit.results`).**

- Offsets are committed by hand (`autoCommit=false`), one message at a time, after the message is handled.
- Each message is checked by `parseCreditResult()`. Its key must equal `order_id`, and its `operation_id` must
  be the errand's reservation operation. It is then applied by `handleCreditResult()`. That records its
  `event_id` in `processed_credit_results` in the same transaction, so a redelivery is skipped. The state
  guards and the late-reply compensation (`OrderCancelled` for a late `CreditReserved` on a rejected errand)
  are unchanged.
- Malformed JSON, an invalid payload, a wrong key, an unknown errand or another operation's reply go to
  `credit.results.dlq` with the reason. So does a reply that fails 5 times in a row for any other reason. The
  DLQ write is acknowledged before the offset is committed.
- A database or Kafka outage is not counted as a failure. The message is redelivered, with growing pauses up
  to 5 s, until the outage ends.

**Startup and shutdown.** Kafka is never waited for. The producer connects on first send, and the consumer
connects, checks its topics and subscribes in the background, retrying. So `/health` and the API depend only
on the database. On SIGTERM the service stops taking requests, then stops the consumer, the sweeper and the
publisher with the producer, then closes the pool. It exits within 9 s. Stopping the consumer disconnects its
client at once, whether it is still connecting, subscribing or running; a running consumer first finishes the
message in progress.

**Observability.** One-line JSON logs:

| Event | Meaning |
|---|---|
| `outbox_published` | a batch sent: `count`, `durationMs` |
| `outbox_publish_failed` | sending failed: `failures`, `retryInMs` (logged at the first failure and at each 5 s back-off) |
| `credit_result_processed` | a reply handled: `type`, `orderId`, `eventId`, `outcome` (`already_processed` for a redelivery) |
| `credit_result_retry` / `credit_result_retry_outage` | a reply being retried in place / redelivered during an outage |
| `credit_result_dead_lettered` | a reply sent to the DLQ, with `reason` and `attempts` |
| `credit_results_consumer_start_failed` / `_started` | background connection attempts |
| `credit_kafka_metrics` | every 60 s: counters since start (published, failures, retries, outage retries, dead-lettered, duplicates), publish latency (commit to acknowledgement) and reply lag (Kafka timestamp to handled), last and max, plus `outboxPending` and `outboxOldestMs` |

## Test

The DB tests need a disposable PostgreSQL superuser URL:

```sh
docker run --rm -d --name order-test-pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:17.11-alpine3.24
cd order-service
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/postgres npm test
npm run typecheck   # src and test
```

The N2 tests (`test/extraction.test.ts`) need no database and never call the real Anthropic API: they use the stub
or a fake client injected in code.

The Kafka integration suite (`test/kafka.integration.test.ts`) is skipped unless `TEST_KAFKA_BROKERS` is set.
`npm run test:kafka` (`scripts/test-kafka.sh`) starts a throwaway PostgreSQL and a single-node Kafka with the
real topics, runs every test against them, and removes both containers. They use their own names and ports, so
the dev stack is not touched. It needs Docker and bash. The suite plays Credit Service against the real
publisher and consumer: reserve and rejection, completion and release, timeouts and late replies, duplicates,
the DLQ, a crash before the offset commit, concurrent publishers, a paused broker, and startup with Kafka
unreachable.
