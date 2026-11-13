<!-- AI Assistance Disclosure: ChatGPT (Codex), 2026-11-03. Scope: Manual Postman checks for the approved User-compatible eligibility contract. Human review pending; see ../usage-log.md. -->
# Postman: Order deletion eligibility

These are manual gRPC checks, not an HTTP collection to import. They do not delete accounts. Use disposable demo accounts and orders. Existing account activity affects the count.

## Setup

1. Start PostgreSQL and the rebuilt Order Service. For lifecycle setup, also start User, Supplier, Credit and their normal dependencies. Ensure their migrations are applied and test accounts have Credit accounts.
2. In Postman, create a **gRPC request**, targeting `localhost:50053` (or your published Order gRPC port). Use plaintext, not HTTPS/TLS.
3. Import `shared/grpc/proto/order.proto` from this checkout and select `order.OrderService/CheckDeletionEligibility`. Add the standard protobuf include path if your importer cannot resolve `google/protobuf/timestamp.proto`. Reload the definition if Postman cached the old ID-list response.
4. Use the Postman desktop application for gRPC. REST requests below target `http://localhost:3003` and use a User Service bearer token.
5. Prepare three newly registered accounts: A (requester), B (courier), C (unrelated). Save their actual User IDs and bearer tokens. Supplier ID must exist. Use the destination API to select matching name and ID.

The proto request field is `user_id`; Postman can display its camelCase JSON form `userId`. Response JSON may likewise show `blockedOrderCount` for proto field `blocked_order_count`. It is a number, not an ID array.

## 1. No activity: eligible

Invoke:

```json
{ "userId": "<C user ID>" }
```

Expected gRPC status `OK`, `eligible: true`, `blockedOrderCount: 0`. Some protobuf displays omit zero-valued fields; zero remains the protobuf default.

## 2. Blank/missing ID: reject input

Invoke each separately:

```json
{ "userId": " " }
```

```json
{}
```

Expected `INVALID_ARGUMENT` (code 3), details `user_id is required`. There must not be an eligible response.

## 3. Requester with an unassigned order: blocked

Create a fresh order as A with REST:

```http
POST http://localhost:3003/orders
Authorization: Bearer <A token>
Content-Type: application/json
Idempotency-Key: <new unique key>
```

```json
{
  "supplierId": "<existing supplier ID>",
  "destination": "COM1",
  "destinationLocationId": "kr_001",
  "requestDetails": "Deletion eligibility demo",
  "credits": 1,
  "expiryTime": "<ISO timestamp at least two hours from now>"
}
```

Use COM1/kr_001 only if they are present in your seeded catalogue. Save the returned order ID. Wait for creation to succeed if the response is 202.

Invoke eligibility for A: expect `OK`, `eligible: false`, count `1` for an otherwise fresh A. Invoke for B and C: both remain eligible with count `0`.

Create a second order with a different key: A's count should become `2`. Replay with the same key and identical body: count must not increase.

## 4. Assigned order: both participants blocked

As B:

```http
POST http://localhost:3003/orders/<first order ID>/accept
Authorization: Bearer <B token>
Content-Type: application/json
```

Body: `{}`. Expect `200`, order status `ASSIGNED`.

Invoke eligibility for A and B. Both must return `eligible: false`. B's count is `1` if this is B's only order. A's count remains unchanged; accepting does not create a second order. C remains eligible.

## 5. Picked-up order: still blocked

As B, POST `/orders/<first order ID>/pickup`, bearer token B, JSON body `{}`. Expect `200`, status `PICKED_UP`.

A and B must still be ineligible.

## 6. Delivery and settlement: only resolved history becomes safe

As B, POST `/orders/<first order ID>/deliver`, bearer token B, JSON body `{}`.

- `200` with `creditState: SETTLED`: this order no longer contributes to either participant's blocker count.
- `202` with `SETTLEMENT_PENDING`: it must continue to block until settlement succeeds. Recheck after backend recovery; do not treat DELIVERED alone as sufficient.

If A still has the second unassigned order, A remains blocked with count `1`; B becomes eligible after settlement if B has no other activity.

## 7. Cancellation and refund: only resolved history becomes safe

As A, POST `/orders/<second order ID>/cancel`, bearer token A, JSON body `{}`.

- `200` with `REFUNDED`: no longer contributes to A's count.
- `202` with `REFUND_PENDING`: still blocks until the release completes.

When both demo orders are financially resolved and no other operations remain, A and B should both be eligible with count `0`. Repeated eligibility calls must not change any state.

## 8. Unavailable database: fail closed

Only in an isolated local demo stack, stop the Order PostgreSQL container while leaving Order running. Invoke eligibility. Expect `UNAVAILABLE` (code 14), never `eligible: true`. Restart that database immediately afterward. If Order exits when its DB stops, a connection-level UNAVAILABLE also correctly prevents checking eligibility, but does not exercise the handler's DB-error branch.

Stopping Order itself should also make the call unavailable. A User Service caller must reject deletion on either failure.

## Coverage limits

Pending creations, unresolved edit operations, exhausted Credit retries and inconsistent terminal records also block deletion. Those conditions have automated integration coverage; this guide avoids editing database rows to manufacture them.

This checkout does not yet contain the teammate's `DELETE /users/me` implementation. Direct gRPC checks do not prove User Service calls it correctly. After integrating that PR, separately verify User returns 409 for blockers and 503 when Order is unavailable, without deleting the account. Matching proto/client/server builds are required.
