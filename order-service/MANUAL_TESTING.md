<!-- AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
Scope: Generated manual integration instructions from the existing service contracts.
Human review pending; see usage-log.md. -->

# Manual Order integration testing

Run Order from `order-functionality`. These instructions use real User, Supplier
and Credit services. They do not start test doubles or bypass credit reservation.
Commands below are for local development, with Docker Desktop and Node.js available.

## 1. Check integration readiness first

The current checkout cannot yet complete a successful live creation by itself:

- Supplier `GetSupplier` returns UNIMPLEMENTED. The Supplier checkout also has
  merge-conflict markers in its Compose/controller files. Use the Supplier
  teammate's working implementation of GetSupplier and IsOpen.
- The current Credit workspace is a stub. Run the implemented
  `feat/credit-implementation` service, including its migrations and RabbitMQ consumer.
- Credit initializes accounts through `user.created`. The current User register
  implementation here does not publish that event. Use the integrated User
  implementation, or have the User/Credit teammates run their agreed account
  initialization flow. Registration/login alone in this checkout is insufficient.
- User and Order/Credit must use the same User signing-key pair: Order and Credit
  receive only the public key. Order/Credit must share the same service token.

Stop if any prerequisite is missing: an Order 503 or pending creation is not a
successful integration test. Automated tests can exercise the implemented Order
workflow independently; see the README's lifecycle test instructions.

Use separate working peer checkouts or teammates' running local services; there
is no need to switch the checkout serving Order to a different branch.

| Service | REST | gRPC | Database host port |
| --- | --- | --- | --- |
| User | 3001 | 50051 | 5432 |
| Supplier | 3002 | 50052 | 54332 |
| Order | 3003 | 50053 | 5434 |
| Credit | 3004 | 50054 | 5433 |

## 2. Start services

From the Order repository root, prepare this terminal:

```sh
export ORDER_REPO="$(pwd)"
export CREDIT_ORDER_SERVICE_TOKEN=local_order_credit_token
export CREDIT_POSTGRES_PORT=5434
export MANUAL_DIR="$(mktemp -d "${TMPDIR:-/tmp}/foc-order-manual.XXXXXX")"
```

Start the shared broker if not already running:

```sh
docker compose -f shared/messaging/compose.yaml up -d --wait
```

For User, generate its key pair using its existing `keys:generate` script only
if no pair exists. Preserve existing keys. Then, in the working User checkout:

```sh
docker compose -f user-service/compose.yaml up --build -d --wait
curl -i http://localhost:3001/health
```

Expected User health: HTTP 200. If User runs from another checkout, set
USER_PUBLIC_KEY_PATH below to its actual public-key file; Credit must mount the
same file. Ensure this User version publishes the registration event.

In the working Supplier checkout, after its conflict/stub issues are resolved:

```sh
docker compose -f supplier-service/compose.yaml up --build -d --wait
curl -i http://localhost:3002/suppliers
```

Expected: a supplier list. The REST response uses a `data` property. Select an
existing supplier whose hours make it open **now**, not just at the order deadline.
The actual supplier ID might not be 1.

For Credit, set this terminal variable to your separate working Credit checkout,
then copy its `credit-service/.env.example` to `.env` if you haven't already.
`CREDIT_ORDER_SERVICE_TOKEN` must match Order's. `DOCKER_RABBITMQ_URL` must reach
your RabbitMQ from Docker Desktop.

```sh
export CREDIT_REPO=/absolute/path/to/working-credit-checkout
docker compose --project-directory "$CREDIT_REPO/credit-service" up --build -d --wait
```

`--project-directory` loads Credit's `compose.yaml`, `compose.override.yaml`
(published ports) and `.env`, as if run from that folder. The `credit-migrate`
job applies Credit's migrations automatically before `credit-service` starts.
Credit mounts `../user-service/keys/public.pem` by default; set
`CREDIT_JWT_PUBLIC_KEY_PATH` in Credit's `.env` if User's keys live elsewhere.

Start Order with authenticated lifecycle integration enabled:

```sh
cd "$ORDER_REPO/order-service"
# Set this if User's keys live in a different checkout:
# export USER_PUBLIC_KEY_PATH=/absolute/path/to/user-service/keys/public.pem
# order-service/.env must contain CREDIT_ORDER_SERVICE_TOKEN (copy .env.example).

docker compose up --build -d --wait
curl -i http://localhost:3003/health
```

Expected: HTTP 200 with `{"status":"ok","db":"up"}`. This override mounts User's
public key and connects to host peer ports through host.docker.internal. Credit
gRPC is plaintext; x-credit-service-token authentication remains required.
Health only proves Order/PostgreSQL readiness, not peer-service readiness.

## 3. Register and log in through User Service

In the prepared terminal:

```sh
export TEST_RUN="$(node -p 'Date.now().toString()')"
export TEST_EMAIL="order.manual.${TEST_RUN}@u.nus.edu"
export TEST_USERNAME="order_manual_${TEST_RUN}"
export TEST_PASSWORD='ManualTest1!'

node -e 'console.log(JSON.stringify({firstName:"Manual",lastName:"Tester",username:process.env.TEST_USERNAME,email:process.env.TEST_EMAIL,password:process.env.TEST_PASSWORD}))' \
  > "$MANUAL_DIR/register.json"
curl -i -X POST http://localhost:3001/users/register \
  -H 'Content-Type: application/json' --data-binary @"$MANUAL_DIR/register.json"
```

Expected: HTTP 201 with `{user: {...}}`. If the integrated User version requires
email verification, complete its normal verification flow before login.

```sh
node -e 'console.log(JSON.stringify({email:process.env.TEST_EMAIL,password:process.env.TEST_PASSWORD}))' \
  > "$MANUAL_DIR/login.json"
export TOKEN="$(curl -fsS -X POST http://localhost:3001/users/login \
  -H 'Content-Type: application/json' --data-binary @"$MANUAL_DIR/login.json" \
  | node -pe 'JSON.parse(require("node:fs").readFileSync(0,"utf8")).token')"
curl -i http://localhost:3001/users/me -H "Authorization: Bearer $TOKEN"
```

Expected: login returns `{token: "..."}` and `/users/me` returns your own profile.
If the token expires during testing, log in again; keep the original Order keys
and payloads when retrying an Order request.

## 4. Check the supplier and credit account

Choose a real currently open supplier from the list:

```sh
export SUPPLIER_ID=1 # Replace with the selected real supplier ID.
curl -i "http://localhost:3002/supplier/$SUPPLIER_ID"
curl -i http://localhost:3004/credits/me/balance \
  -H "Authorization: Bearer $TOKEN"
```

Record availableCredits, reservedCredits and totalCredits. You need at least
4 available credits for creation, and 6 for the later edit example. If Credit
reports a missing account, stop and check the User registration event/Credit
consumer with the teammates; Order does not initialize or grant credits.

For an independent gRPC readiness check, if grpcurl is installed (reflection is
not required because the proto is supplied):

```sh
grpcurl -plaintext -import-path shared/grpc/proto -proto supplier.proto \
  -d "{\"supplier_id\":\"$SUPPLIER_ID\"}" localhost:50052 \
  supplier.SupplierService/GetSupplier
grpcurl -plaintext -import-path shared/grpc/proto -proto supplier.proto \
  -d "{\"supplier_id\":\"$SUPPLIER_ID\"}" localhost:50052 \
  supplier.SupplierService/IsOpen
```

Expected: supplier details and isOpen true. UNIMPLEMENTED confirms the required
Supplier implementation is not running. A successful Supplier REST lookup alone
does not establish that these RPCs work.

## 5. Create an order

Generate the key and body once, then keep both for retries:

```sh
export CREATE_KEY="$(node -p 'require("node:crypto").randomUUID()')"
node -e 'console.log(JSON.stringify({supplierId:process.env.SUPPLIER_ID,destination:"PGP",requestDetails:"One iced latte",credits:4,expiryTime:new Date(Date.now()+2*60*60*1000).toISOString()}))' \
  > "$MANUAL_DIR/create.json"
curl -sS -o "$MANUAL_DIR/create-response.json" -w 'HTTP %{http_code}\n' \
  -X POST http://localhost:3003/orders \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $CREATE_KEY" --data-binary @"$MANUAL_DIR/create.json"
cat "$MANUAL_DIR/create-response.json"
```

Expected: HTTP 201 and `{order: {...}}` with status UNASSIGNED, creditState RESERVED,
correct requester ID/name and supplier pickup snapshots. Order derives those
identity/snapshot fields; do not supply them in the request.

If HTTP 202 returns `{creationId, state:"PENDING"}`, creation is durable but not
published. Keep the exact body/key, restore the dependency and replay the command;
the backend worker can also recover without the browser staying open. Proceed
only after HTTP 201/200 includes an order.

```sh
export ORDER_ID="$(node -pe 'JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).order.id' "$MANUAL_DIR/create-response.json")"
curl -i http://localhost:3004/credits/me/balance \
  -H "Authorization: Bearer $TOKEN"
curl -i 'http://localhost:3004/credits/me/history?pageSize=50' \
  -H "Authorization: Bearer $TOKEN"
```

Compared with the baseline, available decreases by 4, reserved increases by 4,
and total stays unchanged. Confirm the reservation history.

## 6. Check replay and editing

Replay the original creation command/body/key from step 5. Expected: HTTP 200,
same order ID, no additional reservation. The same key with a changed body must
return 409. A different key is a separate creation request, even for identical
content; do not change keys while retrying an uncertain request.

Edit the unassigned order using a new key:

```sh
export EDIT_KEY="$(node -p 'require("node:crypto").randomUUID()')"
printf '%s\n' '{"destination":"UTown", "credits":6}' > "$MANUAL_DIR/edit.json"
curl -i -X PATCH "http://localhost:3003/orders/$ORDER_ID" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $EDIT_KEY" --data-binary @"$MANUAL_DIR/edit.json"
curl -i http://localhost:3004/credits/me/balance -H "Authorization: Bearer $TOKEN"
```

Expected: HTTP 200 with updated order, or 202 while reconciliation is pending.
After confirmation, total remains unchanged and the reservation is 6 credits
(only 2 extra reserved). Replay the identical PATCH with its original key/body:
no second credit adjustment. An edit must still satisfy the one-hour expiry and
currently-open supplier rules. If too much time has passed, include a new future
expiry in a new edit attempt.

## 7. Cancel and verify the refund

```sh
curl -i -X POST "http://localhost:3003/orders/$ORDER_ID/cancel" \
  -H "Authorization: Bearer $TOKEN"
curl -i http://localhost:3004/credits/me/balance -H "Authorization: Bearer $TOKEN"
curl -i 'http://localhost:3004/credits/me/history?pageSize=50' \
  -H "Authorization: Bearer $TOKEN"
```

Expected: 200 with CANCELLED, reason REQUESTER, creditState REFUNDED, or 202 with
REFUND_PENDING if Credit/reconciliation is unavailable. Once confirmed, the hold
is released: available/reserved return to their pre-order values; total is not
increased. Repeat cancellation: it must not refund twice. The Order row remains
for history.

Admin inspection uses a real ADMINISTRATOR token from User Service:

```sh
# Obtain ADMIN_TOKEN by logging in to an existing authorized administrator account.
curl -i http://localhost:3003/orders -H "Authorization: Bearer $ADMIN_TOKEN"
```

Expected: 200 with `{orders:[...]}`, including the cancelled order. The ordinary
TOKEN gets 403 on this admin endpoint. Scoped student listings and delivery are implemented; courier pickup and
order-detail endpoints are not implemented on this branch. Acceptance is available in the separate check below.

## 8. Accept a separate order as another user

Use a fresh UNASSIGNED order, separate from the cancellation example. Repeat
step 5 with a new creation key/body and save its ID as ACCEPT_ORDER_ID. Register
and log in a second USER through User Service (step 3 in a separate terminal),
then copy that login token into COURIER_TOKEN. This user must not be the requester.

```sh
export ACCEPT_ORDER_ID='the-fresh-unassigned-order-id'
export COURIER_TOKEN='token-from-the-other-user-login'
curl -i -X POST "http://localhost:3003/orders/$ACCEPT_ORDER_ID/accept" \
  -H "Authorization: Bearer $COURIER_TOKEN"
```

Expected: HTTP 200, status ASSIGNED, courierId equal to the second user's ID and
acceptedAt set. Credit balances are unchanged by acceptance. The requester token
cannot accept its own order (403); a subsequent acceptance on the assigned order
returns 409 for either courier. The requester can no longer edit or cancel it.
The worker still expires/refunds assigned orders when their deadline passes.

To manually check concurrency, use two different non-requester USER tokens and
another fresh unassigned order:

```sh
export RACE_ORDER_ID='another-fresh-unassigned-order-id'
export SECOND_COURIER_TOKEN='a-third-user-login-token'
curl -sS -o "$MANUAL_DIR/accept-a.json" -w 'Courier A HTTP %{http_code}\n' \
  -X POST "http://localhost:3003/orders/$RACE_ORDER_ID/accept" \
  -H "Authorization: Bearer $COURIER_TOKEN" &
curl -sS -o "$MANUAL_DIR/accept-b.json" -w 'Courier B HTTP %{http_code}\n' \
  -X POST "http://localhost:3003/orders/$RACE_ORDER_ID/accept" \
  -H "Authorization: Bearer $SECOND_COURIER_TOKEN" &
wait
cat "$MANUAL_DIR/accept-a.json" "$MANUAL_DIR/accept-b.json"
```

Exactly one response should be 200 and the other 409; the winning response's
courierId is the persisted assignment (also visible through the admin list).
Keep the worker running through expiry to release the accepted test order's hold;
pickup/delivery is not part of this branch yet.

## 9. Negative and recovery checks

Use separate keys for independent cases. Keep a key/body unchanged when retrying
that same uncertain attempt.

| Case | Expected |
| --- | --- |
| Missing/invalid/expired JWT | 401 |
| ADMINISTRATOR-only token attempting create/cancel | 403 |
| Another USER attempts to cancel your order | 403; no credit release |
| Missing Idempotency-Key on create/edit | 400 |
| Blank destination/requestDetails, zero/fractional credits, expiry under 1 hour | 400 |
| Nonexistent or currently closed supplier | 409 if explicitly rejected; unavailable/stub RPC gives 503 before creation is recorded |
| Credits above available balance | 409; no published order/reservation |
| Same creation key with changed body | 409 |
| Cancel malformed UUID/body or nonexistent order | 400 / 404 |
| Cancel assigned/picked-up/delivered order | 409; no requester cancellation |

For a local recovery test, stop only your local Credit application container:

```sh
docker compose --project-directory "$CREDIT_REPO/credit-service" stop credit-service
```

Create a new order with a new key/body, following step 5: directory checks must
still succeed. Expected: 202 after durable recording. Restart Credit promptly:

```sh
docker compose --project-directory "$CREDIT_REPO/credit-service" start credit-service
```

The worker should publish after reconciliation; replay the same original key/body
and expect 200 with one order/one reservation. Restart promptly, before the five
retries are exhausted. Delays are 5, 15, 45, 135, 135 seconds after the initial
attempt. Exhausted operations remain pending for operator reconciliation.

You can similarly stop Credit before cancelling a fresh active order: expect
202/CANCELLED/REFUND_PENDING. After restarting Credit, retry cancellation or let
the worker recover. Confirm only one release in Credit history.

## 10. Expiry check

Real API expiry must be at least one hour away; a seconds-long deadline should
be rejected. For a live expiry test, create a separate 1-credit order with expiry
61 minutes ahead, retaining its original body/key. Leave the backend and worker
running after closing the frontend. After its expiry timestamp, replay that exact
creation request or inspect through the admin endpoint.

Expected: status CANCELLED, cancellationReason EXPIRY, creditState REFUNDED after
confirmation, and the reservation returned in Credit balance/history. During a
Credit outage, expect REFUND_PENDING until recovery. Automated integration tests
exercise accelerated expiry, including PICKED_UP, without waiting an hour or
manually changing normal service database rows.

## 11. Troubleshooting and shutdown

```sh
docker compose -f order-service/compose.yaml logs --tail 100 order-service
```

- Order health 200 but writes 503: check public-key/token settings and peer RPCs.
- Creation 503: check User/Supplier addresses and Supplier GetSupplier implementation.
- Pending creation: check Credit availability, matching service token, account
  initialization and retry exhaustion. Preserve the creation ID and original key.
- Credit REST 401: log in again and check it uses User's matching public key.
- Supplier closed: select another currently open supplier or use the Supplier
  team's approved admin opening-hours controls.

Cancel your remaining active test orders and verify Credit releases before
stopping the stack. Stop Order while retaining its database:

```sh
docker compose -f order-service/compose.yaml down
```

Stop peer stacks using their respective Compose files when finished. Keep database
volumes unless deliberately resetting only your own disposable development data.
Temporary request/response files live in MANUAL_DIR, outside the repository.

## Scoped order retrieval

With orders created and accepted in the walkthrough, use:

```sh
curl -i 'http://localhost:3003/orders?scope=open' -H "Authorization: Bearer $TOKEN"
curl -i 'http://localhost:3003/orders?scope=requested' -H "Authorization: Bearer $TOKEN"
curl -i 'http://localhost:3003/orders?scope=assigned' -H "Authorization: Bearer $COURIER_TOKEN"
```

Expect 200 with `{ "orders": [...] }`. Open excludes your own orders and expired,
assigned or terminal orders. Requested includes your created orders and history;
assigned includes orders you accepted and their history. Entries include id,
status, destination and credits. An empty result is `orders: []`.
Check an invalid scope (`?scope=unknown`) returns 400, missing token returns 401,
and unscoped `/orders` with a USER-only token returns 403. The administrator
continues using unscoped `/orders` to retrieve all persisted orders.

## Delivery and settlement

Prerequisite: an existing unexpired PICKED_UP order assigned to COURIER_TOKEN's
subject. Pickup is not yet exposed by this branch, so the normal create/accept
walkthrough alone cannot reach this step. The dedicated integration suite
creates isolated PICKED_UP fixtures for testing.

```sh
export DELIVERY_ORDER_ID='picked-up-order-id'
curl -i -X POST "http://localhost:3003/orders/$DELIVERY_ORDER_ID/deliver" \
  -H "Authorization: Bearer $COURIER_TOKEN"
```

Expect 200 with DELIVERED/SETTLED, or 202 with DELIVERED/SETTLEMENT_PENDING when
Credit confirmation is pending. Compare real Credit balances/history: the held
amount transfers from requester to the assigned courier, exactly once. Repeating
delivery must not transfer again. A requester/another courier gets 403; an
ASSIGNED order that has not been picked up gets 409.

With Credit temporarily unavailable, expect durable 202, then automatic backend
reconciliation after recovery (within the bounded retry window). Inspect the
order via requested/assigned listing: creditState changes to SETTLED only after
confirmation. After retries are exhausted it remains SETTLEMENT_PENDING for
manual reconciliation. Do not treat DELIVERED alone as payment confirmation.

## Additional edit checks

Use a fresh unassigned order owned by TOKEN. Keep the exact payload and key when
retrying a pending edit; use a new key for each distinct change.

```sh
curl -i -X PATCH "http://localhost:3003/orders/$ORDER_ID" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: manual-edit-decrease-1' -d '{"credits":2}'
curl -i -X PATCH "http://localhost:3003/orders/$ORDER_ID" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: manual-edit-text-1' -d '{"destination":"Utown"}'
```

For a previously larger reward, decrease should return 200 with credits 2 and
Credit reserved balance should fall by the difference; available rises by the
same amount. The text edit changes destination without changing the hold.
Try an amount greater than the current reservation plus available balance:
expect 409 and unchanged order details/hold. An accepted order cannot be edited.
For uncertain responses expect 202; the worker reconciles without double charging.
Check the scoped requested listing to observe the persisted result.
