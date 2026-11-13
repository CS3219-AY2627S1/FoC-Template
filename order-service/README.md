# Order Service

## Development

From `order-service/`:

```sh
uv sync
uv run uvicorn main:app --app-dir src --reload --host 127.0.0.1 --port 3002
```

From the repository root: `docker compose up --build user-service order-service`.
Deployment uses a [clean database and queue cutover](../README.md#deployment).

## Orders and credits

`status` records fulfilment: `init`, `open`, `accepted`, `picked_up`, `delivered`,
`received`, `completed`, `cancelled`, `expired` or `rejected`.
Disputes are separate records, with at most one open case of each kind
(`fulfilment` or `financial`) per order.

Read `credit_operation` (`RESERVE`, `RELEASE`, `TRANSFER`) together with
`credit_status` (`pending`, `succeeded`, `rejected`):

- Creation reserves credits; success opens the order, rejection rejects checkout.
- Cancellation and open-order expiry release credits.
- Confirmed receipt transfers credits; success completes the order.
- Administrative settlement preserves the fulfilment milestone.
- Credit rejection opens a financial case, except ordinary insufficient-funds or
  missing-wallet checkout refusals. A missing wallet rejects checkout without
  retrying the payment command; provisioning recovers independently, and the user
  can submit a new checkout later. Missing wallets during owed settlements still
  require investigation. Pending operations open a case on settlement timeout.
- Late reservation success after initialization expiry queues a release without
  reopening the order.

Credit results and order/case updates commit atomically. Identical duplicate
results are harmless; conflicting replies fail validation. Unknown outcomes replay
under the original request ID with capped exponential backoff and jitter. Explicit
rejection stops automatic replay.

## Credit event contract

Credit publishes six event identities on the existing durable `credit_events`
direct exchange. The AMQP `type` and routing key are:

| AMQP type | Routing key |
| --- | --- |
| `CreditReserved` | `credit.reserved` |
| `CreditReservationRejected` | `credit.reservation.rejected` |
| `CreditReleased` | `credit.released` |
| `CreditReleaseRejected` | `credit.release.rejected` |
| `CreditTransferred` | `credit.transferred` |
| `CreditTransferRejected` | `credit.transfer.rejected` |

The three commands (`credit.reserve`, `credit.release`, `credit.transfer`) are
unchanged. Order binds the existing durable `order_credit_results` queue to all
six keys and still orchestrates settlement. Admin Dispute remains within Order.
Database schemas and stored command/result JSON formats are unchanged. Duplicate
commands replay the stored outcome with the new event identity, without repeating
financial operations.

Deploy Order first so its new bindings exist before upgrading Credit. Order also
retains the `credit.operation.result` binding and accepts legacy
`CreditOperationResult` deliveries while old publishers and queued results drain.
Credit publishes only the six new identities. Do not purge the queue or outboxes.

## Disputes and administration

Participants can `PATCH /orders/{order_id}/dispute` with `{"reason":"..."}` from
`accepted`, `picked_up` or `delivered`. An open fulfilment case blocks progress
without moving credits or changing the milestone. Repeats preserve the original
reason. Reasons require 1–2000 trimmed characters. Report problems before confirming
receipt.

Live-authenticated `admin` and `admin_manager` roles can use:

| Endpoint | Purpose |
| --- | --- |
| `GET /orders/admin/disputed` | Review queue, categories and available actions |
| `GET /orders/admin/disputed/{order_id}/review` | Order, cases, command history, audits, financial evidence and participant profiles |
| `PATCH /orders/admin/disputed/{dispute_id}/resolve` | `action` (`refund`, `pay`) and `reason` |
| `POST /orders/admin/disputed/{dispute_id}/repair` | `request_id`, `action` (`charge_reserved`, `cover_reserved`) and `reason` |

`GET /orders/{order_id}/audit-logs` is available to participants and administrators.
Administrators may handle their own orders.

Fulfilment resolution requires confirmed held credits and no prior settlement
attempt. It closes the case, queues refund/payment, records the decision and blocks
further participant progress. The milestone remains unchanged. Repeating the same
action and reason is idempotent; changed details return 409.

Financial investigations resolve automatically after confirmed recovery when no command
outcomes remain unknown (`resolution: recovered`). Unsupported rejections remain open for
technical investigation; administrators cannot dismiss unresolved financial outcomes.
A dispute is resolved when `closed_at` is set.

The backend supplies and validates viewer-scoped order `available_actions` and each case's
`available_actions`. Order responses also include `is_active` and `review_category` for lists.
The review read composes service-owned evidence; it is not an atomic cross-service snapshot.
Unavailable financial or participant records return `diagnostics: null` and `evidence_error`
while preserving order/history visibility. Actions must still validate current state.

Financial repair
requires an open financial case, known outcomes and a qualifying rejected settlement.
`charge_reserved` funds missing held credits from the requester's available balance;
`cover_reserved` funds them at platform expense. Credit calculates the live shortfall
and [funds and settles atomically](../credit-service/README.md#atomic-reservation-funding-and-settlement).

Order persists authorization and the settlement command before returning 202.
Repeat a submission with the same request ID, action and reason, including after case
closure; changed intent returns 409. Insufficient requester funds may be followed by
a new platform-cover request. Unknown outcomes must reconcile under their existing
request ID. Repair cannot reopen rejected checkout.

## Deadlines

`TIMEOUT_DURATION` is the only configurable order countdown: a positive whole
number of seconds, defaulting to 900. Initialization is fixed at 60 seconds;
it is the maximum wait for reservation confirmation, not a mandatory delay.

| Stage | Duration | On timeout |
| --- | --- | --- |
| INIT | Fixed 60 seconds | Expire initialization; continue reconciliation |
| OPEN | `TIMEOUT_DURATION` | Expire open order and queue release |
| Fulfilment progress | `TIMEOUT_DURATION` | Open fulfilment case, retaining milestone |
| Credit settlement | `TIMEOUT_DURATION` | Open financial case for pending operation |

The former `ORDER_INIT_TIMEOUT_SECONDS`, `ORDER_OPEN_TIMEOUT_SECONDS`,
`ORDER_PROGRESS_TIMEOUT_SECONDS` and `ORDER_SETTLEMENT_TIMEOUT_SECONDS` settings
are no longer read. `CREDIT_RESULT_TIMEOUT_SECONDS` remains an independent
command-replay interval, not an order countdown. Successful reservation handling
starts a fresh OPEN countdown using the database clock; late success after INIT
expiry still queues a release rather than reopening the order.

For a short demo, run from the repository root:

```sh
TIMEOUT_DURATION=30 docker compose up -d --build --force-recreate order-service
```

Root Compose sets `TIMEOUT_DURATION` from the shell or root `.env`, defaulting to
900; that explicit environment value takes precedence over `order-service/.env`.
For standalone execution, set it in `order-service/.env` or the process environment.
All Order instances sharing a database must use the intended setting: any instance
can handle shared commands/results and persist deadlines using its own duration.
Credit publishers can also claim shared outbox rows and publish to their own broker.
This setting alone does not isolate deployments.

Recreate containers to apply environment changes. Existing deadlines remain unchanged
until a new timed stage begins. The expiry worker sweeps every 10 seconds; transitions
lock the order and check server time. `GET /orders/clock` synchronizes UI countdowns.

## Creation idempotency

`POST /orders` requires `Idempotency-Key` (1–128 nonblank characters). Requester-scoped
keys, order creation and the reserve command commit atomically. Identical retries
return 202 without calling Supplier; changed intent returns 409. Supplier snapshots
are not part of the intent.

## Tests

```sh
PYTHONPATH=src uv run python -m unittest discover -s tests
```

Set `ORDER_TEST_DATABASE_URL` to enable PostgreSQL tests in isolated temporary schemas.


### Saved errand templates

Authenticated users can create/list personal templates at `POST`/`GET /orders/saved-errands`, select reusable draft fields with `GET /orders/saved-errands/{id}`, and edit/delete with `PATCH`/`DELETE` on the same path. Access is scoped to the authenticated owner; another user's template returns 404. PATCH leaves omitted fields unchanged and rejects explicit null except for `pickup_notes`, which can be cleared.

On Orders, fill in the request and a template name, then choose **Save as template**. **Use template** prefills an editable new request; **Edit / rename** updates the saved template. Saving a template and submitting an order are separate operations with separate feedback. Actual submission continues through the existing supplier validation, credit reservation and idempotency workflow. Changing or deleting a template does not change existing orders.
