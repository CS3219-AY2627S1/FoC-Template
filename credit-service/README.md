# Credit Service

Manages wallets, order reservations, settlement and financial audits.

## Development

From `credit-service/`:

```sh
uv sync
uv run uvicorn main:app --app-dir src --reload --host 127.0.0.1 --port 3002
```

From the repository root: `docker compose up --build user-service credit-service`.
Deployment uses a [clean database and queue cutover](../README.md#deployment).

## Commands and results

Commands receive durable `SUCCEEDED` or `REJECTED` results on
`credit.operation.result` (AMQP type `CreditOperationResult`). Results contain
`request_id`, `order_id`, `operation`, `outcome` and `reason` (null on success).
Identical retries replay the stored decision; changed commands under the same
request ID are rejected.

Missing wallets produce a durable `ACCOUNT_NOT_FOUND` refusal, not a payment
command retry. Wallet provisioning is handled separately by the retrying
`UserCreated` consumer and User service's outbox. After provisioning, a new checkout
uses a new request ID; replaying the refused request returns its original refusal.
Insufficient reservation funds similarly produce `INSUFFICIENT_CREDITS` without
moving credits. Missing-wallet and insufficient-funds refusals at checkout do not
need financial investigation; failures of owed settlements do. Stored results are
immutable; an authorized repair uses a new request ID.

## Administration

Live-authenticated `admin` and `admin_manager` roles can read
`GET /credits/admin/orders/{order_id}` for reservations, wallets, active reservation
totals, command results and audit history.

Money-moving actions use [Order's dispute API](../order-service/README.md#disputes-and-administration).
There is no public wallet correction endpoint.

### Atomic reservation funding and settlement

Order queues an authorized settlement command with a `repair` instruction:
`action`, `actor_id`, `dispute_id`, `rejected_request_id` and `reason`.

- `charge_reserved` funds the shortfall from the requester's available credits.
- `cover_reserved` issues credits at platform expense.

Credit requires an active reservation and a matching rejected settlement command.
It calculates the live wallet-wide held-credit shortfall, bounded by the order's
reservation. Missing reservations, excess held balances and unrelated discrepancies
require investigation.

Ordered account locks and an order guard serialize changes. Funding, settlement
and audits commit together; settlement failure rolls back funding and its audit.
Redelivery returns the stored result without moving credits twice. Failed requester
funding may be followed by a new platform-cover action.

## Tests

```sh
PYTHONPATH=src uv run python -m unittest discover -s tests
```

Set `CREDIT_TEST_DATABASE_URL` to enable PostgreSQL tests in isolated temporary schemas.
