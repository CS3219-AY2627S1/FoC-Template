<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-5), date: 2026-11-10
Scope: Writing implementation code and Refactoring and documentation improvements — integrate the Notification Service with the shared FoC structured observability contract, centralized collection, heartbeat alerting, and regression tests (ai-20261110-002).
Author review: Pending.
Details: notification-service/ai/usage-log.md; ai-20261110-002
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-04
Scope: Refactoring and documentation improvements — write the "Running tests" section covering setup, runs with and without TEST_DATABASE_URL, a throwaway PostgreSQL example, and a warning that the schema tests run alembic downgrade base (ai-20261104-001). The AI Use Summary section is a disclosure record.
Author review: Keith confirmed that all tests and manual verification were completed and approved, and confirmed rerunning the tests himself, with commands and results unspecified (ai-20261104-001).
Details: notification-service/ai/usage-log.md; ai-20261104-001
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-04
Scope: Refactoring and documentation improvements — write the "Worker" section covering required settings and failure behaviour, and update the "Running tests" skip description (ai-20261104-003).
Author review: Keith confirmed verification, with 551 tests passed on the Pytest suite (ai-20261104-003).
Details: notification-service/ai/usage-log.md; ai-20261104-003
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-05
Scope: Refactoring and documentation improvements — update the "Worker" section for retries and the dead-letter queue (ai-20261105-001).
Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261105-001).
Details: notification-service/ai/usage-log.md; ai-20261105-001
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
Scope: Refactoring and documentation improvements — document the DLQ size limit and the real-broker tests (ai-20261106-001).
Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261106-001).
Details: notification-service/ai/usage-log.md; ai-20261106-001
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
Scope: Refactoring and documentation improvements — document the worker's database timeouts and their known limitations (ai-20261106-002).
Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261106-002).
Details: notification-service/ai/usage-log.md; ai-20261106-002
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
Scope: Refactoring and documentation improvements — write the "API" section and update the "Running tests" skip description (ai-20261108-001).
Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16, 790 passed and 5 real-broker tests skipped; code read and verified; manual checks against the full Compose stack with the real User Service (ai-20261108-001).
Details: notification-service/ai/usage-log.md; ai-20261108-001
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
Scope: Refactoring and documentation improvements — write the "Live stream" part of the "API" section, including shutdown with --timeout-graceful-shutdown, and update the "Running tests" skip description (ai-20261108-002).
Author review: Keith confirmed on 2026-11-09: full pytest suite (.venv/bin/python -m pytest -rs), 918 passed and 5 skipped; manual SSE checks against the local Compose stack (ai-20261108-002).
Details: notification-service/ai/usage-log.md; ai-20261108-002
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-09
Scope: Refactoring and documentation improvements — restructure this README and write the purpose, contract assumption, planning documents, "Running it" (Compose services and configuration), end-to-end walkthrough (including the temporary Order Service CA workaround), API reference, DLQ investigation runbook, and Frontend Service handover sections, and the single full-suite test command; then, after Prompt 2, label every command block with the terminal and directory to run it from, move the walkthrough's live stream into a second terminal, and reorder "Running tests" into numbered steps (ai-20261109-001).
Author review: Keith confirmed on 2026-11-09: performed all end-to-end checks and tests included in this README, with 923 tests passed, and confirmed the validity of the whole document (ai-20261109-001).
Details: notification-service/ai/usage-log.md; ai-20261109-001
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-10
Scope: Refactoring and documentation improvements — replace the stream section's "Limitation" paragraph with the per-recipient lock explanation (ai-20261110-001). The AI Use Summary subsection is a disclosure record.
Author review: Keith confirmed on 2026-11-10: verification and testing with the full pytest suite (.venv/bin/python -m pytest -rs), 940 passed (ai-20261110-001).
Details: notification-service/ai/usage-log.md; ai-20261110-001
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-11
Scope: Refactoring and documentation improvements — state in the introduction and the "Notification relay" handover section that the Frontend Service relay is built, and that Compose sets NOTIFICATION_SERVICE_URL (ai-20261111-001).
Author review: Not confirmed (pending).
Details: frontend-service/ai/usage-log.md; notification-service/ai/usage-log.md; ai-20261111-001
-->

# Notification Service

Notification Service consumes `order.events` and turns order lifecycle events
into per-user notifications. Each user reads them through a history API and a
live Server-Sent Events (SSE) stream. The Frontend Service relays both to the
browser (see [Frontend Service handover](#frontend-service-handover)).

It has two processes on one image:

- **`notification-worker`** reads `order.events`, writes notifications to
  `notification-db`, and copies records it can't process to
  `notification-service.order-events.dlq`.
- **`notification-service`** is the HTTP API: history, read status, and the live
  stream. It resolves each caller's bearer token through User Service.

| Order event | Who is notified | `type` |
| --- | --- | --- |
| `order.opened` | requester | `order.opened` (`params.credit_amount`) |
| `order.rejected` | requester | `order.rejected` (`params.reason`, string or null) |
| `order.accepted` | requester | `order.accepted` |
| `order.picked_up` | requester | `order.picked_up` |
| `order.completed` | courier | `order.completed` (`params.credit_amount`) |
| `order.expired` | requester | `order.expired` |
| `order.cancelled` by the requester | courier, if one was assigned | `order.cancelled` (`params.cancelled_by_role` = `requester`, `params.previous_status`) |
| `order.cancelled` by anyone else (an admin) | requester, and the courier if one was assigned | `order.cancelled` (`params.cancelled_by_role` = `admin`, `params.previous_status`) |

Other `order.*` types, such as `order.created`, are recorded as processed and
create no notification.

## Contract assumption

This service depends on parts of the order event contract that
`contracts/asyncapi.yaml` doesn't describe yet. The Order Service team is adding
them:

- the `order.opened` event;
- the `order.rejected` event and its `reason` codes;
- `cancelled_by` (the user ID of whoever cancelled) on `order.cancelled`.

Order Service already publishes these. Notification Service treats `reason` as an
opaque string and passes it through in `params.reason`; it doesn't check it
against a list of codes. A cancellation is attributed to the requester when
`cancelled_by` equals `requester_id`, and to an administrator otherwise.

## Running it

### Compose services

All four services are in the root `compose.yaml` and share the
`foc-notification-service:local` image.

| Service | What it does | Port |
| --- | --- | --- |
| `notification-db` | PostgreSQL 16, database `foc_notifications`, volume `notification-db-data` | none; only on the internal `notification-private` network |
| `notification-migrate` | One-shot `alembic upgrade head`. The API and worker start only after it exits 0. | none |
| `notification-service` | The API (`uvicorn app.main:app`) | `127.0.0.1:8084` on the host, `8080` inside Compose |
| `notification-worker` | The Kafka consumer (`python -m app.worker`), restarted `unless-stopped`. Starts after `kafka-topics`. | none |

`GET /health` returns `{"status":"healthy"}` while the API process runs.
`GET /ready` returns `{"status":"ready"}` when the database answers within 3
seconds, and 503 `{"status":"not_ready"}` otherwise. The full OpenAPI schema is
at <http://127.0.0.1:8084/docs>.

The API doesn't wait for User Service at startup. Until User Service is up, every
`/notifications` request returns 503.

### Configuration

Settings the code reads:

| Variable | Used by | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | API, worker, migrations | required | `postgresql+psycopg://` URL of `notification-db`. Compose builds it from `NOTIFICATION_DB_USER`, without the password. |
| `LOG_LEVEL` | API, worker, migration | `INFO` | `CRITICAL`, `ERROR`, `WARNING`, `INFO`, or `DEBUG`. Compose reads it from `.env`. |
| `USER_SERVICE_URL` | API | required | HTTPS base URL of User Service. Compose sets `https://user-service:8080`. |
| `USER_SERVICE_CA_FILE` | API | required | CA file that verifies User Service's certificate. Compose mounts `${INTERNAL_CA_CERT_FILE:-./certs/ca.crt}` at `/run/tls/ca.crt`. |
| `SSE_HEARTBEAT_SECONDS` | API | `20` | Seconds between `: ping` comments on the stream. |
| `SSE_MAX_LIFETIME_SECONDS` | API | `600` | The server ends each stream after this many seconds, and the client reconnects. |
| `KAFKA_BOOTSTRAP_SERVERS` | worker | required | Kafka brokers. Compose sets `kafka:9092`. |
| `NOTIFICATIONS_START_AT` | worker | required | ISO-8601 time with a timezone. Events that occurred before it are recorded as processed and create no notifications. |
| `NOTIFICATION_RETRY_BACKOFF_SECONDS` | worker | `0.5,1,2,4` | Comma-separated positive delays between retries of a transient database error. Empty means a single attempt. |

`PGPASSWORD` holds the database password. The PostgreSQL driver reads it, not the
service's code, so the password never appears in `DATABASE_URL`. An empty
`LOG_LEVEL`, `SSE_*`, or unset backoff means the default. An invalid value of
any setting stops the process at startup with an error naming the variable.

Values Compose reads from the root `.env` (copy `.env.example` if you don't
have one):

| `.env` variable | Default | Purpose |
| --- | --- | --- |
| `NOTIFICATION_DB_USER` | required | Database user; also the `notification-db` superuser. |
| `NOTIFICATION_DB_PASSWORD` | required | Database password, passed as `PGPASSWORD`. |
| `NOTIFICATIONS_START_AT` | required | Passed to the worker. |
| `NOTIFICATION_RETRY_BACKOFF_SECONDS` | `0.5,1,2,4` when unset | Passed to the worker; set but empty is kept empty. |
| `SSE_HEARTBEAT_SECONDS` | `20` | Passed to the API. |
| `SSE_MAX_LIFETIME_SECONDS` | `600` | Passed to the API. |
| `LOG_LEVEL` | `INFO` | Shared by every service that reads it. |
| `INTERNAL_CA_CERT_FILE` | `./certs/ca.crt` | Host path of the internal CA mounted into the API. |

## Operational logging

The API, worker, and migration job use the shared FoC observability contract and
emit one JSON object per application event to stdout. The API includes
`http_request_completed` records with the route, status, outcome, duration, and
request/correlation IDs. The worker emits `worker_started`, periodic
`worker_heartbeat`, `worker_shutdown`, `message_processing_completed`, retry,
DLQ, and offset-commit events with the Kafka source location and safe domain
identifiers. The migration job emits migration lifecycle events.

Logs include event IDs, order IDs, correlation IDs, topic, partition, offset,
attempts, durations, failure codes, exception types, and SQLSTATE/Kafka error
codes where available. They never include bearer tokens, passwords, database
URLs, raw Kafka records, or notification contents. Use `docker compose logs
notification-service notification-worker notification-migrate` locally, or
query the centralized Loki stream described in the repository's
[observability guide](../docs/observability.md).

## Walkthrough

This walkthrough logs in as two users, Alice (requester) and Bob (courier),
creates an order through the Order Service API, and follows the resulting
notifications into the database, the history API, and the live stream.

It needs `curl`, `python3`, and `uuidgen` (macOS and most Linux distributions
have them), and bash or zsh.

**Where to run each command.** Every command block starts with a comment that
says where to run it, for example `# Run in: Terminal 1, repository root`:

| Name | What it is |
| --- | --- |
| **Repository root** | The top-level `FoC/` directory, the one that contains `compose.yaml`, `.env`, and `certs/`. Every walkthrough command runs from here, because they use the relative paths `certs/ca.crt` and `compose.yaml`. |
| **Terminal 1** | Your main terminal. Steps 1–6 and 8 run here, and most of step 7. Keep it open from start to finish: `ALICE_TOKEN`, `BOB_TOKEN`, and `ORDER_ID` are shell variables that only exist in this terminal. |
| **Terminal 2** | A second terminal, opened in step 7, that shows Alice's live stream. It needs its own `ALICE_TOKEN`, because variables don't carry over between terminals. |

Values in `<angle brackets>` are placeholders; replace them, brackets included.

### 1. Configure and start the stack (Terminal 1)

Open Terminal 1 and go to the repository root:

```sh
# Run in: Terminal 1
cd <path to your FoC checkout>
```

Create the local TLS material once, as the
[root README](../README.md#running-locally-with-docker-compose) describes
(`.\scripts\generate-dev-tls.ps1`, also from the repository root). Copy
`.env.example` to `.env` in the repository root if you don't have one, and fill
in its required credentials.

Set `NOTIFICATIONS_START_AT` in `.env` to a time before you create the test
orders, or their events are filtered out by the cutoff. The current time works;
this prints it:

```sh
# Run in: Terminal 1, repository root
date -u +%Y-%m-%dT%H:%M:%SZ
```

Then edit this line in `.env` (repository root) with any text editor:

```dotenv
NOTIFICATIONS_START_AT=<the time printed above, for example 2026-11-09T03:00:00Z>
```

On a fresh `notification-db`, a time earlier than the existing `order.events`
history creates notifications for all of those older events too. If the worker
is already running, recreate it to pick up the change:

```sh
# Run in: Terminal 1, repository root
docker compose up -d notification-worker
```

Start everything. This can take a few minutes on the first build:

```sh
# Run in: Terminal 1, repository root
docker compose up -d --build --wait --wait-timeout 300
```

An order needs a pickup supplier. Check whether Supplier Service has any; it
prints `{"items":[]` and more when it is empty:

```sh
# Run in: Terminal 1, repository root
curl -sS 'http://127.0.0.1:8081/suppliers?limit=1'
```

If it is empty, load the supplier seed data:

```sh
# Run in: Terminal 1, repository root
docker compose --profile tools run --rm supplier-seed
```

### 2. Temporary workaround: let Order Service trust the internal CA (Terminal 1)

> **Known Order Service bug.** In Compose, every authenticated Order Service
> request returns `503 {"detail":"Authentication temporarily unavailable"}`.
> Order Service calls User Service over HTTPS, but it only trusts the public CA
> bundle that ships with Python's `certifi`, and it has no setting for the
> internal CA in `certs/ca.crt`. This has been reported to the Order Service
> team. Until it is fixed, run Order Service with a CA bundle that includes the
> internal CA. Both files go in `certs/`, which git ignores, so nothing in the
> repository changes.

```sh
# Run in: Terminal 1, repository root
docker run --rm --entrypoint cat foc-order-service:local \
  /usr/local/lib/python3.12/site-packages/certifi/cacert.pem > certs/order-ca-bundle.pem
cat certs/ca.crt >> certs/order-ca-bundle.pem

cat > certs/compose.order-ca.yaml <<'EOF'
# Local workaround: lets Order Service verify User Service's certificate.
services:
  order-service:
    volumes:
      - ./certs/order-ca-bundle.pem:/usr/local/lib/python3.12/site-packages/certifi/cacert.pem:ro
EOF

docker compose -f compose.yaml -f certs/compose.order-ca.yaml up -d --wait order-service
```

A plain `docker compose up` recreates `order-service` without the override, so
run the last command again after one. Once Order Service is fixed, delete both
files and run `docker compose up -d order-service` from the repository root.

### 3. Get session tokens for Alice and Bob (Terminal 1)

Skip this registration step if you already have two users. Each command creates
one user; use a throwaway password for local test accounts. A student number is
`A` or `U`, seven digits, and a letter, for example `A1234567X`.

```sh
# Run in: Terminal 1, repository root
curl -sS --cacert certs/ca.crt -X POST https://127.0.0.1:8080/users \
  -H 'Content-Type: application/json' \
  -d '{"nus_student_number": "<Alice student number>", "email": "<alice email>", "display_name": "Alice", "password": "<Alice password>"}'
curl -sS --cacert certs/ca.crt -X POST https://127.0.0.1:8080/users \
  -H 'Content-Type: application/json' \
  -d '{"nus_student_number": "<Bob student number>", "email": "<bob email>", "display_name": "Bob", "password": "<Bob password>"}'
```

User Service's `POST /login` returns a session token in `access_token`. This is
the same value the Frontend Service keeps in the `foc_session` cookie. The
`login` helper below prompts for the credentials without echoing the password,
and keeps the token in a shell variable rather than printing it. Paste the whole
block; it asks for Alice's details, then Bob's:

```sh
# Run in: Terminal 1, repository root
login() {
  printf '%s student number: ' "$1" >&2; read -r sn
  printf '%s password: ' "$1" >&2; read -rs pw; echo >&2
  SN="$sn" PW="$pw" python3 -c 'import json, os; print(json.dumps({"nus_student_number": os.environ["SN"], "password": os.environ["PW"]}))' \
    | curl -sS --fail --cacert certs/ca.crt -H 'Content-Type: application/json' \
        --data @- https://127.0.0.1:8080/login \
    | python3 -c 'import json, sys; print(json.load(sys.stdin)["access_token"])'
}
ALICE_TOKEN=$(login Alice)
BOB_TOKEN=$(login Bob)
```

Check that Notification Service accepts the token. This prints `{"count":0}` for
a new user:

```sh
# Run in: Terminal 1, repository root
curl -sS http://127.0.0.1:8084/notifications/unread-count \
  -H "Authorization: Bearer $ALICE_TOKEN"
```

### 4. Alice creates an order (Terminal 1)

```sh
# Run in: Terminal 1, repository root
SUPPLIER_ID=$(curl -sS 'http://127.0.0.1:8081/suppliers?limit=1' \
  | python3 -c 'import json, sys; print(json.load(sys.stdin)["items"][0]["id"])')

ORDER_ID=$(curl -sS --fail -X POST http://127.0.0.1:8082/orders \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H 'Content-Type: application/json' \
  -d "{\"pickup_supplier_id\": \"$SUPPLIER_ID\", \"item_description\": \"Iced milo\", \"credit_amount\": 5,
       \"delivery\": {\"label\": \"COM1 Level 2\", \"latitude\": 1.2949, \"longitude\": 103.7737, \"details\": \"Outside the lift\"}}" \
  | python3 -c 'import json, sys; print(json.load(sys.stdin)["id"])')
echo "$ORDER_ID"
```

The order starts as `PENDING_CREDIT`. Credit Service reserves Alice's credits
(a new user starts with 100), and Order Service moves the order to `OPEN` and
publishes `order.opened`. This takes a few seconds; repeat until it prints
`OPEN`:

```sh
# Run in: Terminal 1, repository root
curl -sS "http://127.0.0.1:8082/orders/$ORDER_ID" -H "Authorization: Bearer $ALICE_TOKEN" \
  | python3 -c 'import json, sys; print(json.load(sys.stdin)["status"])'
```

### 5. See the notification in the database (Terminal 1)

```sh
# Run in: Terminal 1, repository root
docker compose exec notification-db sh -c \
  "psql -U \"\$POSTGRES_USER\" -d foc_notifications -c \"SELECT id, type, recipient_role, title, read_at FROM notifications WHERE order_id = '$ORDER_ID' ORDER BY id\""
```

```text
 id |     type     | recipient_role |     title     | read_at
----+--------------+----------------+---------------+---------
  8 | order.opened | requester      | Order is live |
(1 row)
```

Your ids will differ. The worker logs each event of the order. `order.created`
creates no notification, so it is `ignored`:

```sh
# Run in: Terminal 1, repository root
docker compose logs notification-worker | grep "$ORDER_ID"
```

```text
notification-worker  | ... {"event":"notification_event_ignored","event_id":"...","event_type":"order.created","order_id":"...","notifications":0,"topic":"order.events","partition":0,"offset":...}
notification-worker  | ... {"event":"notification_event_stored","event_id":"...","event_type":"order.opened","order_id":"...","notifications":1,"topic":"order.events","partition":0,"offset":...}
```

### 6. See it through the history API (Terminal 1)

```sh
# Run in: Terminal 1, repository root
curl -sS 'http://127.0.0.1:8084/notifications?limit=5' -H "Authorization: Bearer $ALICE_TOKEN"
```

```json
{"items":[{"id":8,"recipient_role":"requester","title":"Order is live","body":"Your order is live. 5 credits are on hold.","order_id":"...","occurred_at":"2026-11-09T03:36:29.900008Z","created_at":"2026-11-09T03:36:29.917807Z","read_at":null,"type":"order.opened","params":{"credit_amount":5}}],"next_cursor":null}
```

### 7. Receive the next one live on the stream (Terminals 2 and 1)

**Terminal 2: open Alice's stream.** Open a second terminal, go to the repository
root, and log in as Alice again. Paste the same `login` helper as in step 3,
because Terminal 2 doesn't have it:

```sh
# Run in: Terminal 2
cd <path to your FoC checkout>
```

```sh
# Run in: Terminal 2, repository root
login() {
  printf '%s student number: ' "$1" >&2; read -r sn
  printf '%s password: ' "$1" >&2; read -rs pw; echo >&2
  SN="$sn" PW="$pw" python3 -c 'import json, os; print(json.dumps({"nus_student_number": os.environ["SN"], "password": os.environ["PW"]}))' \
    | curl -sS --fail --cacert certs/ca.crt -H 'Content-Type: application/json' \
        --data @- https://127.0.0.1:8080/login \
    | python3 -c 'import json, sys; print(json.load(sys.stdin)["access_token"])'
}
ALICE_TOKEN=$(login Alice)
```

Then open the stream. It keeps running and holds the terminal; leave it
running. `curl -N` turns off curl's output buffer; without it, events are held
back and appear late or in bursts. `-i` shows the response headers.

```sh
# Run in: Terminal 2, repository root
curl -sS -N -i -H "Authorization: Bearer $ALICE_TOKEN" http://127.0.0.1:8084/notifications/stream
```

Terminal 2 shows the headers straight away, then nothing else yet:

```text
HTTP/1.1 200 OK
content-type: text/event-stream
cache-control: no-cache, no-transform
x-accel-buffering: no
transfer-encoding: chunked

```

**Terminal 1: Bob accepts the order.** Go back to Terminal 1, where `BOB_TOKEN`
and `ORDER_ID` are set:

```sh
# Run in: Terminal 1, repository root
curl -sS -o /dev/null -w 'accept: %{http_code}\n' -X POST \
  "http://127.0.0.1:8082/orders/$ORDER_ID/accept" -H "Authorization: Bearer $BOB_TOKEN"
```

Terminal 1 prints `accept: 200`. Within a second or two, the `order.accepted`
event appears in **Terminal 2**, without any further command:

```text
id: 9
data: {"id":9,"recipient_role":"requester","title":"Order accepted","body":"A courier accepted your order.",...,"type":"order.accepted","params":{}}

```

While no events arrive, Terminal 2 shows a `: ping` line every
`SSE_HEARTBEAT_SECONDS` (20 by default). The server closes every stream after
`SSE_MAX_LIFETIME_SECONDS` (600 by default), and curl then exits. A browser
`EventSource` reconnects on its own and sends `Last-Event-ID`; with curl, run
the stream command in Terminal 2 again.

**Terminal 1: finish the order.** Bob picks it up and Alice completes it.
Terminal 2 shows `order.picked_up`, and Bob gets an `order.completed`
notification:

```sh
# Run in: Terminal 1, repository root
curl -sS -o /dev/null -w 'pickup: %{http_code}\n' -X POST \
  "http://127.0.0.1:8082/orders/$ORDER_ID/pickup" -H "Authorization: Bearer $BOB_TOKEN"
curl -sS -o /dev/null -w 'complete: %{http_code}\n' -X POST \
  "http://127.0.0.1:8082/orders/$ORDER_ID/complete" -H "Authorization: Bearer $ALICE_TOKEN"
```

A second or two later, Bob's history starts with the `order.completed`
notification (`"recipient_role":"courier"`):

```sh
# Run in: Terminal 1, repository root
curl -sS 'http://127.0.0.1:8084/notifications?limit=5' -H "Authorization: Bearer $BOB_TOKEN"
```

**Terminal 2: close the stream** with Ctrl+C. You can then close Terminal 2.

### 8. Read status and resuming (Terminal 1)

```sh
# Run in: Terminal 1, repository root
curl -sS http://127.0.0.1:8084/notifications/unread-count -H "Authorization: Bearer $ALICE_TOKEN"
curl -sS -X POST "http://127.0.0.1:8084/notifications/<notification id>/read" -H "Authorization: Bearer $ALICE_TOKEN"
curl -sS -X POST http://127.0.0.1:8084/notifications/read-all -H "Authorization: Bearer $ALICE_TOKEN"
```

Resume a stream after a notification id. Every later notification of Alice's is
sent first, then new ones arrive live. `--max-time 5` ends curl after 5 seconds,
so this one doesn't need a second terminal:

```sh
# Run in: Terminal 1, repository root
curl -sS -N --max-time 5 -H "Authorization: Bearer $ALICE_TOKEN" -H "Last-Event-ID: <notification id>" \
  http://127.0.0.1:8084/notifications/stream
```

curl then exits with `curl: (28) Operation timed out after 5000 milliseconds ...`; that
is expected.

## API reference

Every `/notifications` endpoint needs `Authorization: Bearer <token>`, where the
token is a User Service session token; the scheme name is case-insensitive. Each
endpoint only sees the caller's own notifications, and no endpoint accepts a
user ID. <http://127.0.0.1:8084/docs> has the full schemas, including one
notification schema per `type` with its `params`.

| Endpoint | Result |
| --- | --- |
| `GET /notifications?cursor=&limit=` | `{"items": [...], "next_cursor": int \| null}`, newest first. `cursor` returns ids below it; pass the previous page's `next_cursor`. `limit` is 1–100, default 20. |
| `GET /notifications/unread-count` | `{"count": int}` |
| `POST /notifications/{id}/read` | Sets `read_at` if it is null and returns the notification. Repeating keeps the first `read_at`. |
| `POST /notifications/read-all` | `{"updated": int}`, the number of notifications it marked read. |
| `GET /notifications/stream` | Server-Sent Events: the caller's new notifications, live. |
| `GET /health`, `GET /ready` | No authentication; see [Compose services](#compose-services). |

### Notification DTO

Every item of `GET /notifications`, every stream event's `data`, and the result
of `POST /notifications/{id}/read` is the same object:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | integer | Notification id; increases with creation order. |
| `type` | string | One of the seven types in the [table above](#notification-service); selects the shape of `params`. |
| `recipient_role` | `"requester"` or `"courier"` | The caller's role on the order. |
| `params` | object | Per-type values (see below). |
| `title`, `body` | string | Fallback English text. |
| `order_id` | UUID | The order. |
| `occurred_at` | UTC timestamp | When the order event happened. |
| `created_at` | UTC timestamp | When the notification was stored. |
| `read_at` | UTC timestamp or null | null while unread. |

| `type` | `params` |
| --- | --- |
| `order.opened` | `{"credit_amount": int}` |
| `order.rejected` | `{"reason": string \| null}` |
| `order.accepted`, `order.picked_up`, `order.expired` | `{}` |
| `order.completed` | `{"credit_amount": int}` |
| `order.cancelled` | `{"cancelled_by_role": "requester" \| "admin", "previous_status": string}` |

### Errors

| Status | When |
| --- | --- |
| 401 | Missing or malformed `Authorization` header, a token User Service rejects, or an inactive user. Has `WWW-Authenticate: Bearer`. Checked before 422. |
| 404 | `POST /notifications/{id}/read` for an id that doesn't exist, belongs to someone else, or is outside the `bigint` range. |
| 422 | A non-integer `cursor`, `limit`, or `{id}`, or a `limit` outside 1–100. |
| 503 | User Service timed out, was unreachable, or gave an unusable answer. |

Error bodies are JSON: `{"detail": "..."}`. A cursor above the newest id returns
the newest page, and 0 or below returns an empty page.

Two requests that mark the same notification read both get 200 and the same
`read_at`. The update keeps an existing `read_at` with `COALESCE`, and the second
request waits for the first one's row lock.

### Live stream

`GET /notifications/stream` sends the caller's new notifications as
Server-Sent Events. The token is resolved when the stream opens, so a bad token
gets 401 and a User Service outage gets 503, as JSON, before any stream starts.
The token isn't checked again while the stream is open; the maximum lifetime
limits how long a revoked session keeps receiving.

The response has `Content-Type: text/event-stream`,
`Cache-Control: no-cache, no-transform`, and `X-Accel-Buffering: no`. Each
notification is one event:

```text
id: 1042
data: {"id":1042,"type":"order.accepted", ...}

```

`data` is the same JSON object as one item of `GET /notifications`. Between
events the server sends `: ping` comments every `SSE_HEARTBEAT_SECONDS`, and it
ends the stream after `SSE_MAX_LIFETIME_SECONDS`.

| `Last-Event-ID` header | What the stream sends first |
| --- | --- |
| Absent, or not a non-negative integer (`abc`, `-1`, `1.5`, empty) | Nothing: only notifications created after the stream opens. |
| A non-negative integer | Every notification of the caller's with a higher id, in id order. `0` sends the whole history. |
| Higher than the caller's newest id | Treated as the caller's newest id, so later notifications are still sent. |

After that, notifications arrive live, in id order, each exactly once.

How it works:

- Each API process holds one dedicated database connection that runs
  `LISTEN notifications`, whatever the number of streams. The worker runs
  `NOTIFY notifications, '<recipient_id>'` in the transaction that stores the
  rows. The listener wakes only that recipient's open streams. A recipient with
  no open stream is ignored.
- A woken stream queries `recipient_id = caller AND id > last_sent_id ORDER BY
  id`, 100 rows at a time, and sends each row. Several wake-ups at once just
  cause another query that finds nothing new, so nothing is sent twice. An open
  stream holds no database connection between queries.
- A stream subscribes before it chooses its starting point, and both happen
  before the response headers are sent. So any notification committed after the
  client sees the response start is delivered.
- If the `LISTEN` connection drops, the listener reconnects every second until it
  succeeds, then wakes every open stream to run its catch-up query, so nothing
  committed in between is missed.
- When the client disconnects, its stream is removed at once and is no longer
  woken.
- If a stream's query fails after the headers are sent, the error is logged and
  the stream ends; the client reconnects with `Last-Event-ID`.

Commit order: `id > last_sent_id` relies on each recipient's rows committing in
id order. The worker takes a per-recipient advisory lock
(`pg_advisory_xact_lock`) before inserting a recipient's rows and holds it until
the transaction ends, so each recipient's rows commit in id order and several
workers are safe.

Shutdown: an open stream only closes at its maximum lifetime, so the image runs
uvicorn with `--timeout-graceful-shutdown 5`. On SIGTERM, uvicorn waits up to 5
seconds for connections to close, then cancels the open streams and runs the
app's shutdown, which closes the `LISTEN` connection and the database pool. This
fits inside Docker's 10-second stop timeout. Clients see the stream cut off and
reconnect with `Last-Event-ID`, so nothing is lost. uvicorn logs
`Exception in ASGI application` with a `CancelledError` for each stream it
cancels.

## Worker

`python -m app.worker` consumes `order.events` as the consumer group
`notification-service-order`. Its settings are in
[Configuration](#configuration).

A failed record is retried or copied to `notification-service.order-events.dlq`,
so later records in its partition can continue. The exception is a DLQ write
that keeps failing, described below:

| Failure | Handling | `x-notification-failure-code` |
| --- | --- | --- |
| The record fails validation | No retry | `MALFORMED_MESSAGE` |
| Transient database error (`OperationalError`, `InterfaceError`, `DisconnectionError`, SQLAlchemy `TimeoutError`, or a `DBAPIError` with `connection_invalidated`) | Roll back and retry after each delay | `TRANSIENT_RETRIES_EXHAUSTED` once the delays run out |
| Anything else, such as text PostgreSQL can't store in `params` | Roll back, no retry | `UNEXPECTED_PROCESSING_ERROR` |

A duplicate `event_id` is not a failure: the event counts as already processed
and its offset is committed.

The DLQ record has the source key, value, and headers, plus the
`x-notification-*` headers described in the
[runbook](#dlq-investigation-runbook). The source offset is committed only after
Kafka confirms the DLQ write.

The worker stops with exit code 1 and leaves the offset uncommitted if the DLQ
write or the offset commit fails, or on a fatal Kafka error. The record is then
processed again after a restart, so a failed offset commit can put a second copy
in the DLQ. On SIGTERM the worker exits with code 0, also without committing a
record it has not finished, including during a backoff sleep.

The DLQ producer's `message.max.bytes` and the DLQ topic's `max.message.bytes` are
both 1,100,000 bytes, above the broker's default limit, so any uncompressed record
`order.events` accepts fits with the diagnostic headers. A record compressed at
source can still be too large, because the broker only checked its compressed
size. The DLQ write then fails, the worker logs
a structured `message_dlq_publish_failed` event with
`kafka_error=MSG_SIZE_TOO_LARGE`, and it restarts
in a cycle with later records waiting until someone removes the record or moves
the group's offset past it. No service here produces such a record.

The worker's database connections turn a database that stops responding into a
normal error, which then follows the retry and DLQ path above. TCP keepalives and
`tcp_user_timeout` (10 seconds) detect a lost network, and `lock_timeout` (5
seconds) and `statement_timeout` (10 seconds) limit lock waits and slow queries.
The API's connections do not have these settings.

Known limitations:

- **A long lock wait or database stall can send a record to the DLQ.** It can use
  up the retries and send the record to the DLQ as `TRANSIENT_RETRIES_EXHAUSTED`,
  where it needs a manual replay.
- **A frozen database server can still hang the worker**, for example under
  `docker pause`. The OS still answers TCP and the server can't enforce its own
  timeouts. No data is lost, because the offset stays uncommitted and the record is
  redelivered after a restart. Under Compose, Docker kills a worker that ignores
  SIGTERM once its stop timeout runs out.
- **An `event_type` that doesn't fit `processed_events` goes to the DLQ if it is
  before the cutoff.** A type over 64 characters can't be stored, so the record goes
  to the DLQ as `UNEXPECTED_PROCESSING_ERROR`. No notification is lost, because a
  record before the cutoff never creates one. At or after the cutoff, an unknown type
  is skipped.

Keep the total retry time well under Kafka's `max.poll.interval.ms` (5 minutes by
default). Past that, the broker reassigns the partition and the offset commit
fails.

## DLQ investigation runbook

`notification-service.order-events.dlq` has one partition and keeps records for
the broker default of seven days. Records in it are quarantine and diagnostic
evidence. **They are never replayed automatically**, and nothing in this service
reads the DLQ.

Run every command in one terminal, from the repository root (the top-level
`FoC/` directory, which contains `compose.yaml`). The Compose stack must be
running.

1. **Read the DLQ** with a Kafka tool in the broker container. Without
   `--group`, the console consumer uses a throwaway consumer group, so it
   doesn't affect any service:

   ```sh
   # Run in: repository root
   docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
     --bootstrap-server kafka:9092 --topic notification-service.order-events.dlq \
     --from-beginning --timeout-ms 10000 \
     --property print.offset=true --property print.key=true --property print.headers=true
   ```

   It exits after 10 seconds without a new record, and then prints a
   `TimeoutException`; that is expected. Each record prints as offset, headers,
   key, and value, separated by tabs:

   ```text
   Offset:0	event_type:order.rejected,event_id:778f980e-...,x-notification-failure-code:UNEXPECTED_PROCESSING_ERROR,x-notification-failed-at:2026-11-09T03:38:00.664681Z,x-notification-failed-attempts:1,x-notification-source-topic:order.events,x-notification-source-partition:0,x-notification-source-offset:6	8dba8fbb-...	{"event_id":"778f980e-...","event_type":"order.rejected",...}
   ```

   The key and value are the source record's, byte for byte. `event_type` and
   `event_id` are the source record's own headers, if it had them.

2. **Record the diagnostic headers.** The worker adds:

   | Header | Meaning |
   | --- | --- |
   | `x-notification-failure-code` | Why the record failed; see the table below. |
   | `x-notification-failed-at` | When the worker gave up, UTC ISO-8601 (`...Z`). |
   | `x-notification-failed-attempts` | How many times it tried. Always 1 for `MALFORMED_MESSAGE` and `UNEXPECTED_PROCESSING_ERROR`. |
   | `x-notification-source-topic` | Always `order.events`. |
   | `x-notification-source-partition` | Partition of the source record. |
   | `x-notification-source-offset` | Offset of the source record in that partition. |

   | Failure code | Meaning |
   | --- | --- |
   | `MALFORMED_MESSAGE` | The record breaks the event contract: the value isn't a UTF-8 JSON object, an envelope field is missing or invalid, `schema_version` isn't 1, the `event_type` or `event_id` header is missing or doesn't match the envelope, the key doesn't match `payload.order_id`, or a field the notification needs is missing or invalid. The worker log line gives the exact check that failed. |
   | `TRANSIENT_RETRIES_EXHAUSTED` | A transient database error (lost connection, timeout, lock or statement timeout) lasted through every retry in `NOTIFICATION_RETRY_BACKOFF_SECONDS`. The record itself may be fine. |
   | `UNEXPECTED_PROCESSING_ERROR` | Any other error, with no retry. This includes text PostgreSQL can't store, such as a `\u0000` (NUL) in `reason` or `previous_status`, which fails with `DataError` and SQL state `22P05`, and an `event_type` over 64 characters before the cutoff. |

   Also record, from the value: `event_type`, `event_id`, `correlation_id`,
   `payload.order_id`, and `payload.requester_id` / `payload.courier_id` where
   present.

3. **Find the source event** in `order.events`, using the source partition and
   offset (here, partition 0 and offset 6):

   ```sh
   # Run in: repository root
   docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
     --bootstrap-server kafka:9092 --topic order.events \
     --partition <source partition> --offset <source offset> --max-messages 1 \
     --property print.offset=true --property print.key=true --property print.headers=true
   ```

   `order.events` is kept forever, so the source record is still there after the
   DLQ copy expires. Compare it with the DLQ copy; they should be identical.

4. **Find the worker log lines.** Every failure line names the source topic,
   partition, and offset:

   ```sh
   # Run in: repository root
   docker compose logs notification-worker | grep '"offset":<source offset>'
   ```

   ```text
   ... {"level":"ERROR","event":"notification_event_failed","failure_code":"UNEXPECTED_PROCESSING_ERROR","attempts":1,"exception_type":"DataError","sqlstate":"22P05","event_id":"778f980e-...","event_type":"order.rejected","order_id":"8dba8fbb-...","correlation_id":"0964eb46-...","topic":"order.events","partition":0,"offset":6}
   ... {"level":"ERROR","event":"message_sent_to_dlq","failure_code":"UNEXPECTED_PROCESSING_ERROR","attempts":1,"source_topic":"order.events","source_partition":0,"source_offset":6}
   ```

   - `notification_event_failed` has the exception type and SQL state, but never
     the exception message, because database errors can quote record contents.
   - For `MALFORMED_MESSAGE`, the structured `reason` field gives the failed
     check (for example `header.event_id: does not match envelope`) and no raw
     event fields are logged.
   - `notification_event_retrying` records show each retry of a transient error;
     `message_retry_exhausted` identifies the final exhausted attempt.
   - Search by `event_id`, `order_id`, or `correlation_id` too; the
     `correlation_id` also appears in Order Service and Credit Service logs for
     the same request.
   - `docker compose logs` only has the current container's logs. Copy them
     before the container is removed.

5. **Check what the service stored.** A failed event leaves no trace in the
   database (its transaction was rolled back), so this returns 0:

   ```sh
   # Run in: repository root
   docker compose exec notification-db sh -c \
     "psql -U \"\$POSTGRES_USER\" -d foc_notifications -c \"SELECT count(*) FROM processed_events WHERE event_id = '<event_id>'\""
   ```

6. **Resolve the cause before any replay.** Fix the producer, the data, or the
   infrastructure first. A replay is a manual, explicitly authorized action, for
   example producing the corrected record to `order.events` again. A record that
   breaks the contract (`MALFORMED_MESSAGE`) or can't be stored
   (`UNEXPECTED_PROCESSING_ERROR`) fails the same way if it is replayed unchanged.
   A replayed `event_id` that was already processed counts as a duplicate and
   creates nothing.

7. **Record the outcome:** corrected and replayed, accepted as lost (the
   notification is not sent), or kept and escalated to the Order Service team.

## Frontend Service handover


### Notification relay

**The relay is built** in `frontend-service/app/api/notifications/` and
`frontend-service/lib/notification-relay.ts`; see the
[Frontend Service README](../frontend-service/README.md#notification-service).
This section is the contract it follows. The browser must never call
Notification Service directly: Notification Service is published only on the
host's loopback interface, and the session token stays in the
httpOnly `foc_session` cookie, which browser code can't read. Every browser
request goes to the Next.js route handlers, and they call Notification Service on
the server side.

**Routes.** Each relay route forwards to one Notification Service endpoint:

| Relay route (Next.js) | Notification Service endpoint | Forward |
| --- | --- | --- |
| `GET /api/notifications` | `GET /notifications` | the `cursor` and `limit` query parameters |
| `GET /api/notifications/unread-count` | `GET /notifications/unread-count` | — |
| `POST /api/notifications/[id]/read` | `POST /notifications/{id}/read` | `[id]` as is, even if it isn't numeric |
| `POST /api/notifications/read-all` | `POST /notifications/read-all` | — |
| `GET /api/notifications/stream` | `GET /notifications/stream` | the `Last-Event-ID` request header |

**Base URL.** Read it from `NOTIFICATION_SERVICE_URL`:

| Where Next.js runs | `NOTIFICATION_SERVICE_URL` |
| --- | --- |
| In the `frontend-service` container | `http://notification-service:8080` |
| On the host with `next dev` | `http://127.0.0.1:8084` |

The API is plain HTTP on both. Compose sets it on `frontend-service`.

**Authentication.** Read the `foc_session` cookie on the server and send its value
as `Authorization: Bearer <token>`. Notification Service resolves it through
User Service. Pass the upstream status and JSON body back unchanged:

| Endpoint | 200 | 401 | 404 | 422 | 503 |
| --- | --- | --- | --- | --- | --- |
| `GET /notifications` | page | yes | — | bad `cursor` or `limit` | yes |
| `GET /notifications/unread-count` | `{"count"}` | yes | — | — | yes |
| `POST /notifications/{id}/read` | the notification | yes | not the caller's, or no such id | non-integer `id` | yes |
| `POST /notifications/read-all` | `{"updated"}` | yes | — | — | yes |
| `GET /notifications/stream` | SSE stream | yes | — | — | yes |

- **401:** no `Authorization` header, a malformed one, an expired or revoked
  session, or an inactive user. Comes with `WWW-Authenticate: Bearer`, and takes
  precedence over 422.
- **404:** only from mark-read.
- **422:** only from a query parameter or path segment that isn't a valid
  integer, or a `limit` outside 1–100.
- **503:** User Service timed out, was unreachable, or gave an unusable answer.
  If Notification Service itself can't be reached, the relay returns its own 503.

**Stream relay.** For `GET /api/notifications/stream`:

- Forward the browser's `Last-Event-ID` header. `EventSource` sends it on every
  reconnect, and that is how missed notifications are caught up.
- Set `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`,
  and `X-Accel-Buffering: no` on the response, the same values Notification
  Service sends.
- Pass the upstream body through as it arrives, without buffering or parsing it,
  so each event reaches the browser when it happens. This includes the
  `: ping` comments every `SSE_HEARTBEAT_SECONDS` (20 by default).
- Abort the upstream request when the browser disconnects (`request.signal`),
  so Notification Service frees the stream.
- A 401 or 503 arrives as a normal JSON response, `{"detail": "..."}`, before
  any SSE bytes. Check the upstream status before treating the body as a stream,
  and pass a non-200 through as JSON.
- Notification Service ends every stream after `SSE_MAX_LIFETIME_SECONDS` (600
  by default). The relay passes the end through, and `EventSource` reconnects.
  Don't put a shorter timeout on the upstream request.

To test against real data before the frontend can create orders, follow the
[walkthrough](#walkthrough).

## Running tests

The test commands run in one terminal, but from two directories. Every command
block starts with a comment that says which:

- **Repository root**: the top-level `FoC/` directory, which contains
  `compose.yaml` and `event-broker/`.
- **`notification-service/`**: this service's directory, which contains
  `pytest.ini`, `tests/`, and the `.venv/` created below.

None of these commands need the Compose stack. The tests use their own throwaway
PostgreSQL and Kafka containers, on host ports 55432 and 59092.

### Full suite, one command

**1. Install the development dependencies (once).** Use Python 3.12; if
`python3 --version` shows another version, use `python3.12` instead:

```sh
# Run in: notification-service/
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
```

**2. Start a throwaway PostgreSQL 16 database and Kafka broker.** The Compose
broker publishes no port, so this starts a separate broker that advertises a
host address, then creates the topics with `event-broker/create-topics.sh`. The
`until` loop repeats until the broker is up, which takes a few seconds:

```sh
# Run in: repository root
docker run -d --rm --name notification-test-db \
  -e POSTGRES_PASSWORD=test -e POSTGRES_DB=notification_test \
  -p 127.0.0.1:55432:5432 postgres:16-alpine

docker run -d --rm --name notification-test-kafka \
  -e KAFKA_NODE_ID=1 -e KAFKA_PROCESS_ROLES=broker,controller \
  -e KAFKA_LISTENERS=PLAINTEXT://:59092,CONTROLLER://:9093 \
  -e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://127.0.0.1:59092 \
  -e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER \
  -e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT \
  -e KAFKA_CONTROLLER_QUORUM_VOTERS=1@localhost:9093 \
  -e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 \
  -e KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1 \
  -e KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=1 \
  -e KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS=0 \
  -e KAFKA_AUTO_CREATE_TOPICS_ENABLE=false \
  -p 127.0.0.1:59092:59092 apache/kafka:4.1.2

until docker exec -i -e KAFKA_BOOTSTRAP_SERVERS=127.0.0.1:59092 \
    notification-test-kafka bash < event-broker/create-topics.sh > /dev/null 2>&1; do
  sleep 2
done
```

**3. Run the full suite:**

```sh
# Run in: notification-service/
TEST_DATABASE_URL=postgresql+psycopg://postgres:test@127.0.0.1:55432/notification_test \
TEST_KAFKA_BOOTSTRAP_SERVERS=127.0.0.1:59092 \
  .venv/bin/python -m pytest -rs
```

It takes about a minute and a half. Every test runs and none is skipped; the
last line is `<N> passed, 1 warning`. The warning is a deprecation warning from
Starlette.

**4. Stop the throwaway containers.** `--rm` deletes them, and their data, when
they stop:

```sh
# Run in: any directory
docker stop notification-test-db notification-test-kafka
```

### Partial runs

The same command with fewer variables skips the tests that need what's missing;
`-rs` lists the skips. Run them from `notification-service/` too.

- **No variables** (`.venv/bin/python -m pytest -rs`): no containers needed. The
  API, configuration, event, API authentication and validation, stream (with
  in-memory queries), and Kafka-double worker tests run.
- **`TEST_DATABASE_URL` only**: also runs the PostgreSQL tests in
  `tests/test_schema.py`, `tests/test_worker_postgres.py`,
  `tests/test_notifications_postgres.py`, and `tests/test_stream_postgres.py`.
  Only the `notification-test-db` container is needed.
- **Both variables**: also runs `tests/test_worker_kafka.py` against the broker.
  One file on its own:

  ```sh
  # Run in: notification-service/
  TEST_KAFKA_BOOTSTRAP_SERVERS=127.0.0.1:59092 \
    .venv/bin/python -m pytest tests/test_worker_kafka.py
  ```

### Test database and broker requirements

`TEST_DATABASE_URL` must be an empty, disposable PostgreSQL 16 database using the
`postgresql+psycopg://` scheme.

> **Warning:** the schema tests run `alembic downgrade base` and
> `alembic upgrade head` against `TEST_DATABASE_URL`. They also delete every
> row in `notifications` and `processed_events`, and briefly change the
> database's default `timezone` setting. Never point `TEST_DATABASE_URL` at
> `notification-db` or any database whose data you need. As a safeguard, the
> tests refuse to start if the database contains tables other than
> `notifications`, `processed_events`, and `alembic_version`.
>
> `tests/test_stream_postgres.py` starts the API in a real uvicorn server on a
> free local port. It also ends the API's `LISTEN` connection with
> `pg_terminate_backend`, so the test role must be allowed to do that (the
> `postgres` superuser in the example above is).

The broker must have the topics from `event-broker/create-topics.sh`. Each Kafka
test creates its own source topic and consumer group, and writes to the DLQ
topic, so use a disposable broker.

## AI Use Summary (Notification Service)

Claude Code (model: claude-opus-5-5) provided **Boilerplate generation**,
**Writing implementation code**, and **Debugging assistance** for the service
skeleton: the FastAPI app (`app/main.py`, `app/config.py`, `app/db.py`),
the idle worker (`app/worker.py`), Alembic layout, Dockerfile and dependency
files, tests under `tests/`, and Notification-related changes to root
`compose.yaml` and `.env.example`. Work followed the user's specification, with
credit-service used as the conventions-only reference. A readiness hang against
a frozen database was found during live testing and fixed with a
deadline-bounded probe; the original version was not retained.

Observed verification (agent only): 19 tests passed; `docker compose config`
succeeded with existing services unchanged; the live stack met the startup,
`/health`, `/ready` (reachable, stopped, paused, recovered), and
configuration-failure checks. Keith confirmed review of all affected changes; no human
test rerun is claimed.

See the [usage record](ai/usage-log.md#ai-20261103-001). Original per-message
timestamps are unavailable; no redactions. Header exception:
`alembic/versions/.gitkeep` (zero-byte directory placeholder).

### Database schema (ai-20261104-001)

Claude Code (model: claude-sonnet-5-5 for the first prompt, then
claude-opus-5-5 for two review follow-ups) provided **Writing implementation
code**, **Boilerplate generation**, **Debugging assistance**, and **Refactoring
and documentation improvements** for the database schema. The work
followed the user-specified schema: the Alembic revision
(`alembic/versions/20261104_0001_notification_schema.py`), the models
(`app/models.py`), the PostgreSQL schema tests (`tests/test_schema.py`), the
UTC session time zone in `app/db.py` and `alembic/env.py`, and this README's
"Running tests" section. All changes were retained. Keith's review raised six
issues, and all were adopted: split the varchar(64) tests and catch
`DataError`, build the CHECK from `RECIPIENT_ROLES`, document test runs, pin
the session time zone to UTC, catch role drift that autogenerate misses, and
apply the time zone to migrations. Two test bugs the agent found while running
the tests were fixed.

Observed verification (agent): the final run had 53 tests passing against a
disposable PostgreSQL 16 container, and 19 passing with 34 skipped without
`TEST_DATABASE_URL`. `alembic upgrade`, `downgrade base`, `upgrade`, and
`alembic check` succeeded. Mutation checks confirmed that the naive-datetime,
UTC-pin, and role-drift tests fail when their safeguard is removed. A
temporary probe showed migrations run in UTC. Author review: Keith confirmed that
all tests and manual verification were completed and approved, and confirmed
rerunning the tests himself, with commands and results unspecified.

See the [usage record](ai/usage-log.md#ai-20261104-001). Original per-message
timestamps are unavailable; no redactions; no header exceptions.

### Event validation and translation (ai-20261104-002)

Claude Code (model: claude-opus-5-5) provided **Writing implementation code**,
**Debugging assistance**, and **Refactoring and documentation improvements**: 
pure functions in `app/events.py` that classify a raw Kafka record as
Malformed, Ignore, or Event with notification drafts, and unit tests in
`tests/test_events.py`. The work followed the user's specification. Three gaps
were put to the user first, and the recommended option was selected for each:
singular "1 credit is on hold" wording, a non-string `reason` being Malformed
with an explicit null treated as null, and comparing the `event_id` header as a
UUID. All changes were retained, including a later requested rename of
`parse_record` to `process_record`. A test helper bug the agent found on the
first run was fixed.

Observed verification (agent only): 416 tests passed in `tests/test_events.py`;
the full suite without `TEST_DATABASE_URL` had 435 passed, 34 skipped, and 1
warning, before and after the rename. The tests caught all 21 mutations applied
before the rename. Author review: Keith confirmed review and confirmed
running `.venv/bin/python -m pytest tests/test_events.py`, with 416 passed.

See the [usage record](ai/usage-log.md#ai-20261104-002). Original per-message
timestamps are unavailable; no redactions; no header exceptions.

### Kafka consumer, happy path (ai-20261104-003)

Claude Code (model: claude-opus-5-5) provided **Writing implementation code**,
**Boilerplate generation**, **Debugging assistance**, and **Refactoring and
documentation improvements**: the `start_at` cutoff in `app/events.py`,
worker settings in `app/config.py`, the consumer in `app/worker.py`, the
confluent-kafka pin, Notification-related settings in root `compose.yaml` and
`.env.example`, tests under `tests/`, and the Worker section of this README. The
work followed the user's specification, with `credit-service/app/worker.py` as
the conventions reference. All changes were retained. A test was strengthened
after a mutation survived.

Observed verification (agent only): with PostgreSQL 16 the full suite had 551
passed and 1 warning; without `TEST_DATABASE_URL` it had 494 passed, 57 skipped,
and 1 warning. Of 21 mutations, the tests caught 20, and caught the last after
the test was strengthened. A live run of an isolated Compose project covered the
order walkthrough, both cancellations, offset reset, cutoff, SIGTERM, malformed
stop, and lag, using a verification-only workaround for Order Service TLS trust.
Author review: Keith confirmed verification, with 551 tests passed on the Pytest
suite; the command and environment were not stated. No wider code review is
recorded.

See the [usage record](ai/usage-log.md#ai-20261104-003). Original per-message
timestamps are unavailable; no redactions; no header exceptions.

### Consumer retries and dead-letter queue (ai-20261105-001)

Claude Code (model: claude-opus-5-5) provided **Writing implementation code**,
**Boilerplate generation**, and **Refactoring and documentation improvements**:
`correlation_id` in `app/events.py`, the backoff setting in `app/config.py`,
failure handling in `app/worker.py`, Notification-related settings in root
`compose.yaml` and `.env.example`, tests under `tests/`, and the Worker section of
this README. The work followed the user's specification, with
`credit-service/app/worker.py` as the conventions reference.

Observed verification (agent only): with PostgreSQL 16 the full suite had 625
passed and 1 warning; without `TEST_DATABASE_URL` it had 550 passed, 75 skipped,
and 1 warning. The tests caught all 26 mutations applied. A live run of an isolated
Compose project covered malformed records, unstorable text, retries running out,
recovery, SIGTERM during backoff, and a failed DLQ write.

Author review (confirmed by Keith on 2026-11-08, covering ai-20261105-001 to
ai-20261107-001 as one increment): Keith ran `.venv/bin/python -m pytest -rs` with
throwaway PostgreSQL 16 and Kafka 4.1.2 (topics from `event-broker/create-topics.sh`)
and 645 passed; manually read and verified the code; and ran manual checks in an
isolated Compose project. The specific Compose checks were not stated.

See the [usage record](ai/usage-log.md#ai-20261105-001). Original per-message
timestamps are unavailable; no redactions; no header exceptions.

### Oversized records and the DLQ (ai-20261106-001)

Claude Code (model: claude-opus-5-5) provided **Writing implementation code**,
**Boilerplate generation**, **Debugging assistance**, and **Refactoring and
documentation improvements**: the DLQ producer limit and Kafka error code logging in
`app/worker.py`, the topic limit in `event-broker/create-topics.sh`, tests under
`tests/`, and notes in this README and `event-broker/README.md`. The user reported the
issue, and chose the limit, the handling of compressed records, the test approach,
and the upgrade path for existing topics.

Observed verification (agent only): with PostgreSQL 16 and Kafka 4.1.2 the full suite
had 634 passed and 1 warning; with neither it had 554 passed, 80 skipped, and 1
warning. The tests caught all 7 mutations applied. A live run of an isolated Compose
project reproduced the restart cycle before the change, and showed the same records
reaching the DLQ with no restarts after it.

Author review (confirmed by Keith on 2026-11-08, covering ai-20261105-001 to
ai-20261107-001 as one increment): Keith ran `.venv/bin/python -m pytest -rs` with
throwaway PostgreSQL 16 and Kafka 4.1.2 (topics from `event-broker/create-topics.sh`)
and 645 passed; manually read and verified the code; and ran manual checks in an
isolated Compose project. The specific Compose checks were not stated.

See the [usage record](ai/usage-log.md#ai-20261106-001). Original per-message
timestamps are unavailable; no redactions; no header exceptions (a correction: the
`event-broker/` files now have headers).

### Database hang timeouts (ai-20261106-002)

Claude Code (model: claude-opus-5-5) provided **Writing implementation code**,
**Debugging assistance**, and **Refactoring and documentation improvements**: a
worker-only `make_engine` option in `app/db.py` with the user's specified keepalive,
`tcp_user_timeout`, `lock_timeout`, and `statement_timeout` values, its use in
`app/worker.py`, tests under `tests/`, and the Worker section of this README.

Observed verification (agent only): with PostgreSQL 16 and Kafka 4.1.2 the full suite
had 642 passed and 1 warning; with neither it had 557 passed, 85 skipped, and 1
warning. The tests caught all 8 mutations applied. A live run
of an isolated Compose project reproduced the hang before the change, and covered a
network cut, recovery, a held lock, a stopped database, and `docker pause` after it.

Author review (confirmed by Keith on 2026-11-08, covering ai-20261105-001 to
ai-20261107-001 as one increment): Keith ran `.venv/bin/python -m pytest -rs` with
throwaway PostgreSQL 16 and Kafka 4.1.2 (topics from `event-broker/create-topics.sh`)
and 645 passed; manually read and verified the code; and ran manual checks in an
isolated Compose project. The specific Compose checks were not stated.

See the [usage record](ai/usage-log.md#ai-20261106-002). Original per-message
timestamps are unavailable; no redactions; no header exceptions.

### Failure code on offset commit failures (ai-20261107-001)

Claude Code (model: claude-opus-5-5) provided **Debugging assistance** and **Writing
implementation code**: verified and applied the fix the user identified, so that
`notification_offset_commit_failed` logs the record's failure code, with tests in
`tests/test_worker.py`.

Observed verification (agent only): with PostgreSQL 16 and Kafka 4.1.2 the full suite
had 645 passed and 1 warning; with neither it had 560 passed, 85 skipped, and 1
warning. With the defect restored on a scratch copy, the new assertions failed.

Author review (confirmed by Keith on 2026-11-08, covering ai-20261105-001 to
ai-20261107-001 as one increment): Keith ran `.venv/bin/python -m pytest -rs` with
throwaway PostgreSQL 16 and Kafka 4.1.2 (topics from `event-broker/create-topics.sh`)
and 645 passed; manually read and verified the code; and ran manual checks in an
isolated Compose project. The specific Compose checks were not stated.

See the [usage record](ai/usage-log.md#ai-20261107-001). Original per-message
timestamps are unavailable; no redactions; no header exceptions.

### History and read-status API (ai-20261108-001)

Claude Code (model: claude-opus-5-5) provided **Writing implementation code**,
**Boilerplate generation**, and **Refactoring and documentation improvements**:
the User Service client and bearer-token dependency (`app/clients.py`,
`app/auth.py`, following Credit Service), API-only settings in `app/config.py`,
the DTO and per-type `params` schemas (`app/schemas.py`), the endpoints
(`app/routes/notifications.py`) and their wiring in `app/main.py`, the httpx pin,
the notification-service settings in root `compose.yaml`, tests under `tests/`,
and the API section of this README. The work followed the user's specification.

Observed verification (agent only): with PostgreSQL 16 the full suite had 790
passed and 5 skipped (the real-broker tests, with no Kafka); without a database it
had 668 passed and 127 skipped. EXPLAIN on a 20,300-row dataset showed the list
queries using `ix_notifications_recipient_id_desc`, the count and read-all using
`ix_notifications_recipient_unread`, and no sequential scan. The tests caught all 8
mutations applied. `docker compose config` succeeded. No live Compose run against
User Service was done by the agent.

Author review (confirmed by Keith on 2026-11-08): Keith ran
`.venv/bin/python -m pytest -rs` with a throwaway PostgreSQL 16 and 790 passed, with
the 5 real-broker worker tests skipped; read and verified the code; and ran manual
checks against the full Compose stack with the real User Service. The specific
Compose checks were not stated.

See the [usage record](ai/usage-log.md#ai-20261108-001). Original per-message
timestamps are unavailable; no redactions; no header exceptions.

### Live notification stream (ai-20261108-002)

Claude Code (model: claude-opus-5-5) provided **Writing implementation code**,
**Boilerplate generation**, and **Refactoring and documentation improvements**:
the `LISTEN` connection and stream hub (`app/listener.py`), the
`GET /notifications/stream` endpoint (`app/routes/stream.py`), the
`SSE_HEARTBEAT_SECONDS` and `SSE_MAX_LIFETIME_SECONDS` settings in
`app/config.py`, root `compose.yaml`, and `.env.example`, the wiring in
`app/main.py`, `--timeout-graceful-shutdown 5` in the `Dockerfile` command, tests
under `tests/`, and the "Live stream" section of this README.
The work followed the user's specification and the user's answers on
`Last-Event-ID` edge cases.

Observed verification (agent only): with PostgreSQL 16 the full suite had 918
passed and 5 skipped (the real-broker tests, with no Kafka); without a database it
had 753 passed and 170 skipped. The PostgreSQL stream tests use a real uvicorn
server and the worker's real NOTIFY. The tests caught all 14 mutations applied.
With the shutdown timeout and a stream open, uvicorn stopped 5 seconds after
SIGTERM, ran the app's shutdown, and closed the `LISTEN` connection; the image
built with the new command. No live Compose run with User Service, Order Service,
and Kafka was done by the agent.

Author review (confirmed by Keith on 2026-11-09): Keith ran
`.venv/bin/python -m pytest -rs` and 918 passed, with 5 skipped; and performed
manual SSE checks against the local Compose stack. The test environment and the
specific Compose checks were not stated.

See the [usage record](ai/usage-log.md#ai-20261108-002). Original per-message
timestamps are unavailable; no redactions; no header exceptions.

### Documentation and end-to-end walkthrough (ai-20261109-001)

Claude Code (model: claude-opus-5-5) provided **Refactoring and documentation
improvements**: this README's purpose, contract assumption, planning documents,
"Running it", walkthrough, API reference, DLQ investigation runbook, and Frontend
Service handover sections, the single full-suite test command, and a
restructuring of the existing API, Worker, and test sections. The work followed
the user's specification. It found that Order Service in Compose returns 503 for
every authenticated request because it can't trust the internal CA. The bug was
reported, not fixed. The user chose to document a temporary, git-ignored Compose
override as the workaround. No service code, `compose.yaml`, or frontend file
was changed. After Prompt 2, every command block was labelled with the
terminal and directory to run it from. The walkthrough's live stream moved into a
second terminal. "Running tests" was reordered into numbered steps, with a loop
that waits for the test broker.

Observed verification (agent only): before Prompt 2, against the local Compose stack with the
override, the walkthrough commands ran as written in zsh, and the login helper in
bash and zsh. An order created through the Order Service API produced
`order.opened`, `order.accepted`, `order.picked_up`, and `order.completed`
notifications. They appeared in `notification-db`, in the history API, and live on
a `curl -N` stream. Every status in the handover table was observed: 503 with
User Service stopped, and 401 before 422. `http://notification-service:8080` was
reachable from the `frontend-service` container. A NUL in `reason` produced a
`UNEXPECTED_PROCESSING_ERROR` DLQ record, and the runbook commands matched it to
the source record and the worker log lines. The documented full-suite command,
with throwaway PostgreSQL 16 and Kafka 4.1.2, gave 923 passed, 0 skipped. After Prompt 2,
all 32 command blocks passed `bash -n` and `zsh -n`. The edited walkthrough and
test procedure were not rerun, because the Compose stack had been taken down and
the test container names were in use outside the agent's session.

Author review (confirmed by Keith on 2026-11-09): Keith performed all the
end-to-end checks and tests included in this README, which covers the edited
walkthrough and test procedure the agent did not rerun, and confirmed the
validity of the whole document. The test run had 923 passed. Other results were
not stated.

See the [usage record](ai/usage-log.md#ai-20261109-001). Original per-message
timestamps are unavailable; no redactions; no header exceptions.

### Per-recipient commit order (ai-20261110-001)

Claude Code (model: claude-opus-5-5) provided **Writing implementation code** and
**Refactoring and documentation improvements**: a per-recipient,
transaction-scoped advisory lock in the worker's `store_event`
(`app/worker.py`), taken in sorted order between the `processed_events` flush
and the notifications insert, so that each recipient's rows commit in id order
and several workers are safe for the live stream; tests in
`tests/test_worker_postgres.py`; the `app/routes/stream.py` docstring; and the
stream section's commit-order paragraph in this README. The work followed the
user's specification. The lock namespace value (`0x4E4F5446`) was the agent's
choice.

Observed verification (agent only): with throwaway PostgreSQL 16 and Kafka 4.1.2,
`.venv/bin/python -m pytest -rs` gave 940 passed and 0 skipped. The new tests
passed five more times in a row. The tests caught all three mutations applied:
locking in each event's own order, no lock, and locking before the
`processed_events` flush.

Author review (confirmed by Keith on 2026-11-10): Keith verified and tested the
change with `.venv/bin/python -m pytest -rs`, and 940 tests passed. The test
environment, the skipped count, and what the verification covered were not
stated.

See the [usage record](ai/usage-log.md#ai-20261110-001). Original per-message
timestamps are unavailable; no redactions; no header exceptions.

### Operational observability (ai-20261110-002)

Codex (model: GPT-5) provided **Writing implementation code** and
**Refactoring and documentation improvements** for the shared JSON logging
contract, request context middleware, safe API/authentication/read-status/
listener/SSE events, worker lifecycle/heartbeat/processing/retry/DLQ/offset
events, migration lifecycle logs, User Service context propagation, Docker and
Compose metadata, Vector collection, Grafana heartbeat alerting, and regression
tests. Raw credentials, Kafka records, and notification contents remain
excluded from logs.

Observed verification (agent only):
`python -m pytest notification-service/tests packages/foc-observability/tests -q`
gave 784 passed and 187 skipped without disposable PostgreSQL/Kafka services.
YAML parsing, Python compilation, and `git diff --check` passed. Real Compose,
PostgreSQL, Kafka, Loki, Grafana, and Docker image checks were not run.

Author review: Pending. See the
[usage record](ai/usage-log.md#ai-20261110-002). Original per-message timestamps
are unavailable; no redactions; no header exceptions.

### Frontend relay documentation (ai-20261111-001)

Claude Code (model: claude-opus-5-5) provided **Refactoring and documentation
improvements** to this README while building the Frontend Service notification
relay: the introduction and the "Notification relay" handover section now say
the relay is built and link to the
[Frontend Service README](../frontend-service/README.md#notification-service),
and the configuration note says Compose sets `NOTIFICATION_SERVICE_URL`. No
Notification Service code changed.

Author review: Not confirmed (pending). See the
[usage record](ai/usage-log.md#ai-20261111-001) and the canonical
[Frontend Service record](../frontend-service/ai/usage-log.md#ai-20261111-001).
Original per-message timestamps are unavailable; no redactions; no header
exceptions.
