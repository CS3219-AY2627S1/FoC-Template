# Order Service

This folder contains one FastAPI order service:

- `main/create_errand.py`: `POST /errand/create` validates the request, verifies the JWT and supplier, checks and reserves credits through Credit Service, and saves an open errand to PostgreSQL.
- `main/accept_errand.py`: `POST /errand/accept` atomically assigns an open, unexpired errand to the authenticated courier.
- `main/deliver_errand.py`: `POST /errand/deliver` lets the assigned courier mark an accepted, unexpired errand as delivered.
- `main/cancel_errand.py`: `POST /errand/cancel` lets the requester cancel an open, unexpired errand and releases its credit reservation.
- `main/complete_errand.py`: `POST /errand/complete` lets the requester confirm completion of a delivered, unexpired errand and transfers reserved credits to the courier.
- `main/fail_errand.py`: `POST /errand/fail` lets the requester report failure of a delivered, unexpired errand with a required reason and releases its credit reservation.
- `main/get_errands.py`: `GET /errands` lists available open errands and the caller's own/assigned errands, or all errands for administrators.
- `main/recommendations/`: `GET /errands/recommended` ranks open errands for the caller's dashboard.
- `main/app.py`: registers the route modules in one FastAPI application.

## Install dependencies

From this folder:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Run the tests

```powershell
pytest
```

## Run a service

Run the order service:

```powershell
uvicorn main.app:app --reload --port 8002
```

Interactive API documentation is available at:

- `http://127.0.0.1:8002/docs`

Apply the database migrations before creating errands. From the repository root:

```powershell
docker compose up -d --build order-service
docker compose exec order-service alembic upgrade head
```

When running Python directly on the host, set `DB_HOST=localhost`, `DB_PORT=5435`,
`DB_NAME=campuscouriers_order`, `DB_USERNAME=order_service`, and `DB_PASSWORD` to
the configured database password. Docker Compose supplies these settings inside
the container. Python does not automatically load the root `.env` file.

The errand route forwards the bearer token to the Supplier Service's
`GET /suppliers/{id}` endpoint. Replace the example supplier and building UUIDs
with real identifiers. `required_item` is a required, nonblank description of the
requested item(s), stored as PostgreSQL `TEXT` and returned in the creation response.
The expiry must be timezone-aware, strictly in the future, and no more than seven
days from the current time (F2.1.2). Invalid expiry returns 422 identifying `expires_at`,
before credits are reserved. F2.1.5 is intentionally not implemented.

```powershell
$requestBody = @{
  supplier_id = "22222222-2222-4222-8222-222222222222"
  required_item = "Two sandwiches and one coffee"
  credit_value = 10
  delivery_building_id = "11111111-1111-4111-8111-111111111111"
  delivery_floor = "3"
  delivery_description = "Outside room 03-12"
  expires_at = [DateTimeOffset]::UtcNow.AddDays(1).ToString("o")
} | ConvertTo-Json

curl.exe -X POST http://127.0.0.1:8002/errand/create `
  -H "Authorization: Bearer <access-token>" `
  -H "Content-Type: application/json" `
  -d $requestBody
```

Migration `0003_add_required_item` adds the required column without a placeholder
default. It applies directly to an empty table. If existing errands are present,
backfill their real item descriptions with a staged migration before enforcing
the required column; do not delete data to make the migration succeed.

A successful request returns HTTP 201 with the created errand, its requester UUID,
supplier UUID, and `OPEN` status. The requester comes from the verified JWT; clients
cannot supply requester, courier, or status fields. Invalid input or an unavailable
supplier returns 422. Insufficient credits or a rejected reservation returns 409;
an unavailable Supplier Service returns 503.

Creation reads available balance and reserves through Credit Service only after
validation and supplier verification. Reservation itself enforces the balance atomically.
The errand UUID is generated before reserving and stored as the reservation orderId;
the returned reservation UUID is saved internally. See the credit integration section
below for required configuration, idempotency keys and retry/recovery behaviour.
Delivery building UUID syntax is validated, but building existence is not yet checked.

## Accept an errand

Send a bearer token and only the errand UUID in the JSON body:

```json
{"errand_id": "550e8400-e29b-41d4-a716-446655440000"}
```

`POST /errand/accept` returns 200 with `id`, `status`, `courier_id`, and `accepted_at`.
The courier UUID comes from the verified JWT. Missing/invalid/extra body fields
return 422, self-acceptance returns 403, an unknown errand returns 404, and a
non-open, expired, assigned, unfunded legacy, or pending-credit errand returns 409. Acceptance executes as
one conditional PostgreSQL update so concurrent couriers cannot both succeed.
Expired errands are rejected here; changing them to EXPIRED and releasing credits
belongs to the separate expiry workflow. No schema migration is needed for acceptance.

The acceptance tests run locally with SQLite for endpoint behavior. To also test
simultaneous acceptance with real PostgreSQL, run from the order-service directory:

```powershell
$env:TEST_ORDER_DATABASE_URL="postgresql+psycopg://order_service:password@localhost:5435/campuscouriers_order"
python -m pytest -q test/test_accept_errand.py
```

This PostgreSQL test creates and removes a uniquely named test schema. It does not
modify existing errands. The database user needs permission to create schemas.

## Cancel an errand

`POST /errand/cancel` accepts only `{"errand_id": "<errand UUID>"}` and a bearer
token. It returns 200 with `id`, `status: CANCELLED`, and `cancelled_at` after commit.
Only the requester can cancel an OPEN, unexpired, unassigned errand. Unauthorized
ownership returns 403, unknown errands return 404, unavailable errands return 409,
and invalid request bodies return 422. Repeated or concurrent cancellation cannot
invoke credit release twice after a successful cancellation. Acceptance and cancellation
compete through conditional updates to the same PostgreSQL row.

Cancellation persists a credit-operation intent before calling the reservation-release
API. On success, cancellation and its domain event commit together. On an unknown
result or failure, the original state remains and the pending intent blocks conflicting
actions. Retry cancellation with a valid requester token to recover the same reservation;
see the integration section below. Migration 0005 adds the necessary internal fields.

Run `python -m pytest -q test/test_cancel_errand.py` from this directory. Set
`TEST_ORDER_DATABASE_URL` as above to also test concurrent cancellation and
cancellation versus acceptance using an isolated PostgreSQL schema.

## Complete or fail an errand

Only the requester may terminate a DELIVERED, unexpired errand with an assigned
courier. Both endpoints obtain the requester UUID from the verified bearer token.

`POST /errand/complete` accepts only `{"errand_id": "<errand UUID>"}`. It sets
COMPLETED and `completed_at` after Credit Service completes the stored reservation
for the assigned courier, and returns 200 with `id`, `status`, and `completed_at`.

`POST /errand/fail` accepts `{"errand_id": "<errand UUID>", "failure_reason":
"Missing items"}`. The reason is required, trimmed, nonblank, and limited to 500
characters. It sets FAILED, `failed_at`, and `failure_reason`, calls the shared
reservation-release API, and returns 200 with those fields and `id`.

Both return 403 for another user (including the courier), 404 for an unknown errand,
409 for an invalid state/expired deadline/missing courier, and 422 for invalid inputs.
Credit conflicts return 409; unavailable services return 503; rejected credentials
return 401/403; invalid upstream success responses return 502. Durable intents make
the same operation retryable when the HTTP result or final database commit is unknown.
A pending operation cannot be replaced with a different terminal action.
Repeated or competing completion/failure requests cannot both commit successfully.

Apply migration 0005 before using credit integration. Run `python -m pytest -q test` for the service suite.
Set `TEST_ORDER_DATABASE_URL` to also run PostgreSQL terminal-state concurrency tests.
The separate sibling integration-test suite has not been changed. Automatic expiry
remains a separate feature.

## List errands and view details

`GET /errands` requires a verified bearer token. Regular users can see available
OPEN errands backed by a credit reservation with no pending credit action, plus
errands in any status where they are the requester or assigned
courier. Available means unexpired, unassigned OPEN with no leftover lifecycle
timestamps or failure reason. Administrators (`type: Administrator` in the verified
JWT) can see all errands, including overdue ones. Request parameters never grant
administrator access.

Omitting `status` selects all statuses within the caller's authorized visibility.
Optional filters are `errand_id`, `supplier_id`, `requester_id`, `courier_id`,
`delivery_building_id`, `min_credit_value`, `max_credit_value`, `expires_after`, and
`expires_before`. Filters use AND; repeated `status` values use OR. Credit and expiry
ranges are inclusive and expiry filters require timezones. Delivery floor is returned
but is not a filter. `available_only=true` restricts everyone, including participants
and administrators, to marketplace availability.

Sorting defaults to `sort=created_at,desc` (newest first). `created_at`, `credit_value`,
and `expires_at` each allow `asc` or `desc`; UUID provides a deterministic tie-breaker.
Use zero-based `page` (default 0) and `size` (default 20, maximum 100).

The response contains `total` and `items`. Total counts only authorized matching
records and is independent of pagination. Items include all existing errand fields,
including requester/courier UUIDs, lifecycle timestamps and failure reason. An
unknown or inaccessible `errand_id` returns `total: 0, items: []` without distinguishing
private from nonexistent errands. Invalid parameters return 422.

Couriers view completion confirmation using `GET /errands?errand_id=<uuid>`:
the returned item's COMPLETED status and `completed_at` show the requester's
confirmation, including after the deadline. Before confirmation a DELIVERED errand
has `completed_at: null`. This replaces the separate completion-confirmation route.
It reads the recorded decision after the reservation completion call succeeds.

Examples:

```text
GET /errands
GET /errands?available_only=true&sort=credit_value,desc
GET /errands?requester_id=<your-uuid>&status=ACCEPTED&status=COMPLETED
GET /errands?courier_id=<your-uuid>
GET /errands?errand_id=<uuid>
GET /errands?supplier_id=<uuid>&status=OPEN&status=ACCEPTED&size=1
```

The final example provides a supplier-wide active count only with an administrator
token; ordinary users' total is visibility-restricted. Supplier Service may forward
an admin token for this check; independent service authentication is not implemented.
There is no count-only or service-only mode. Participants and administrators can view
private errand details, so this is not strictly a requester-only details endpoint.

GET is read-only: it checks deadlines for availability but does not update expired
states, invoke credit operations, or trigger background expiry processing. Supplier
active counts include overdue records still stored as OPEN/ACCEPTED. Count and page
are separate reads and may briefly differ during concurrent changes; a count is not
an atomic safeguard against supplier deactivation racing with creation.

No schema migration is needed. Run `python -m pytest -q test/test_get_errands.py`.
Supplier Service integration remains future work. The separate sibling
integration-test suite has not been changed.

### Automatic expiry

The Order Service runs a lightweight background worker when the application starts.
Every `ERRAND_EXPIRY_INTERVAL_SECONDS` seconds (default: 60), it processes overdue
errands in a transaction:

- `OPEN` errands become `EXPIRED`.
- `ACCEPTED` errands become `FAILED` with the reason `Errand expired before delivery`.

Each transition writes an `errand.expired` outbox event in the same transaction.
Credit Service consumes that event and releases the reservation by the errand ID.
The release operation is safe to retry if Kafka redelivers the event.

## Recommended errands

`GET /errands/recommended?size=5` (size 1-20, bearer token required) returns the
dashboard's "Recommended for you" list. The code is in `main/recommendations/`:
`scoring.py` holds the ranking rules and `routes.py` the endpoint.

Candidates are errands the caller could accept now: available, not their own, and
more than 10 minutes from expiry. Each is scored with simple rules:

- +3 if the caller has completed a delivery from the same supplier;
- +2 if it goes to a building the caller has delivered to or requested to;
- up to +2 for credit value (scaled to the 25-credit maximum);
- +1 if it expires within two hours.

Ties go to higher credit, then the earlier deadline. A new user with no history is
ranked by credit and urgency only. Each item has the usual errand fields plus a
`recommendation_reason` naming the strongest signal. Tests:
`python -m pytest -q test/test_recommend_errands.py`.

See [CREDIT_INTEGRATION.md](CREDIT_INTEGRATION.md) for required configuration,
migration 0005, idempotency/recovery behaviour and repeatable Docker tests.
