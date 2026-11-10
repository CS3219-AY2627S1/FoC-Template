# Campus Errands UI

React and TypeScript frontend for Friend on Campus.

## Development

From `ui/`, with Node.js and npm:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open <http://localhost:5173>. Set `INTERNAL_GATEWAY_URL` in `.env.local` to a
reachable [internal gateway](../internal-gateway/README.md). The Docker gateway
is not published on the host. The address stays server-side; API requests retain
their `/user-api`, `/supplier-api`, `/order-api` and `/credit-api` prefixes.

For an external gateway, build-time overrides are `VITE_USER_API_URL`,
`VITE_SUPPLIER_API_URL`, `VITE_ORDER_API_URL` and `VITE_CREDIT_API_URL`.

## Docker

Configure backend `.env` files, then run from the repository root:

```sh
docker compose up --build
```

Open <http://localhost:4173>. Nginx serves the static UI and proxies same-origin
API requests using `INTERNAL_GATEWAY_URL` (default `http://internal-gateway`).
This is not a hot-reloading server.

The local [control portal](../internal-gateway/README.md#local-dashboard-start-and-stop-containers)
at <http://127.0.0.1:4180> starts/stops services and RabbitMQ. Its privileged Docker
socket mount must remain local-only.

## Orders

Signed-in users can request and deliver concurrently at `/orders`. Lists and
balances refresh every five seconds; countdowns use server deadlines. Personal
lists include history and sort by creation time.

Reservation opens a request; confirmed receipt starts courier payment. Fulfilment,
case decisions and credit settlement are displayed separately. Pending/rejected
settlement remains active even on cancelled orders. Report delivery problems before
confirming receipt: an open fulfilment case pauses participant progress.

Notifications announce observed reservation, payout and case-resolution changes,
not historical events on initial load.

### Submission retries

Each submission freezes its payload and idempotency key. Network failures, HTTP
408/429 and server errors retry with backoff and jitter: six attempts per cycle,
delays capped at 15 seconds. **Retry same request** retains the original key.
Definitive errors stop automatic retries.

**Cancel request** replays creation to recover the order ID, waits for reservation
if needed, then requests cancellation. Only server-confirmed cancellation counts.
Pending attempts live in page memory: leaving stops retries, loses the key on reload
and does not cancel the order.

## Administrative reviews

Admins and admin managers use `/admin/orders`. The queue refreshes every 15 seconds
and separates fulfilment, financial and resolved cases. Reviews show participant
profiles, reports, payment evidence and recorded decisions from one review endpoint.
The selected review refreshes with the queue. Unavailable evidence disables actions;
the backend supplies action eligibility and queue categories.

**Refund requester** and **Pay courier** require a reason and preserve the fulfilment
milestone. They block further participant progress. Confirmed settlement moves the
order to history; pending/rejected settlement stays active.

For eligible held-credit shortfalls:

- **Charge requester again** funds the reservation from available credits.
- **Cover missing credits — no charge to requester** funds it at platform expense.

The UI submits case, action, request ID and reason—not accounts or amounts. The
backend calculates the live shortfall and funds and settles atomically. Failure
rolls back funding; identical retries are safe. Once accepted, execution continues
if the page closes. Unknown outcomes must reconcile before a new payment is allowed.

Financial cases auto-resolve after confirmed recovery; unsupported failures remain
open for technical investigation. There is no manual financial closure, standalone
payment retry or generic wallet editing. Participant buttons use backend-provided
`available_actions`; activity filters use backend `is_active`.
Administrators may review their own orders.

## Demo controls

Run these in the browser console:

```js
orderDemo.dropNextCreateResponse() // Discard one successful creation response.
orderDemo.stopPollingOrder()      // Freeze automatic Orders-page refreshes.
orderDemo.resumePollingOrder()    // Resume refreshes on the next polling tick.
```

Discarding a creation response demonstrates retries with the same payload and key.
Pausing polling demonstrates stale cancellation: let another user accept, then
cancel the stale Open card. The server rejects it without releasing credits.
Actions still reach the server while polling is paused. Reload resets controls.

For a Credit outage demo, initialization expires after `ORDER_INIT_TIMEOUT_SECONDS`
(default 60). Late reservation success releases credits rather than reopening an
expired request. Restart Credit before expiry to demonstrate recovery-to-open, or
increase the timeout and recreate Order Service before creating the request.

## Checks

```sh
npm test
npm run lint
npm run build
npm run preview
```

Use two users for an end-to-end create/accept/pickup/deliver/receive flow. Check
reservation, payout, cancellation, expiry, insufficient funds and racing acceptance.
