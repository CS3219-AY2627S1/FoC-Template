<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-5), dates: 2026-10-14 and 2026-10-27
Mode: Integration handoff documentation.
Scope: Documented the implemented Credit administrator balance and transaction endpoints for peer-service consumers.
Author review: I reviewed for correctness.
-->

# Credit Admin API Handoff

**Date:** 2026-10-27

**Owning service:** Credit Service

**Audience:** Admin Service, frontend, gateway, and other authenticated API consumers

Credit Service now exposes three read-only operations for administrators:

1. Read one selected user's current credit balances.
2. Read one selected user's paginated credit transaction history.
3. Read paginated credit transaction history across the whole system.

All three operations are implemented and covered by API, service, persistence, recovery-filter,
and OpenAPI tests. They are regular Firebase-authenticated Credit APIs, not internal
service-account endpoints.

## What changed in Credit Service

- Added an administrator controller under `/api/credits`, protected by
  `@PreAuthorize("hasRole('ADMIN')")`.
- Reused the existing `BalanceResponse` and account lookup for a selected user's authoritative
  total, reserved, and usable balances.
- Reused the existing `TransactionPageResponse` for one selected user so its wire contract
  stays identical to `/api/credits/me/transactions`.
- Added `AdminTransactionPageResponse` and `AdminTransactionResponse` for the system-wide
  operation; only this item shape adds the owning `userId`.
- Carried `userId` through the internal transaction domain model and added a paginated
  repository/service operation for global history.
- Added a PostgreSQL query that filters compensated reservation/reversal pairs before counting
  and paging, with the same visibility rules as existing user history.
- Added Flyway migration `V8__add_global_credit_transaction_history_index.sql` to index the
  global newest-first ordering columns.
- Documented both operations in OpenAPI and the Credit README.
- Added authorization, validation, not-found, empty-result, cross-user ordering, pagination,
  filtering, delegation, and OpenAPI coverage.

## Calling requirements

- Send `Authorization: Bearer <firebase-id-token>` using the **administrator caller's** token.
- Credit Service resolves the caller's roles through User Service and requires `ROLE_ADMIN`.
- Do not send or impersonate the selected user's token.
- Through the gateway, call the relative `/api/credits/...` paths below. The gateway already
  routes the `/api/credits` prefix.
- Requests have no body and return JSON.
- For transaction endpoints, `page` is one-based and defaults to `1`; `size` defaults to `20`
  and must be from `1` to `100`.
- Treat user IDs and transaction IDs as opaque strings. URL-encode a user ID when placing it
  in a path segment.

## 1. Read a selected user's balance

```http
GET /api/credits/users/{userId}/balance
Authorization: Bearer <administrator-firebase-id-token>
Accept: application/json
```

Use this operation for the authoritative Credit-owned balance on a selected-user profile.
The selected user's token is not required and must not be impersonated. A user who has no
Credit account returns `404`.

### Successful response

```json
{
  "userId": "firebase-uid-123",
  "totalBalance": 105,
  "reservedBalance": 5,
  "usableBalance": 100,
  "asOf": "2026-10-11T12:00:00Z"
}
```

`usableBalance` is derived as total minus reserved. `asOf` is the account's last-update
instant, not the time of the read request.

### Example

```bash
curl \
  --url 'http://localhost:8080/api/credits/users/firebase-uid-123/balance' \
  --header 'Authorization: Bearer <administrator-firebase-id-token>'
```

## 2. Read a selected user's transactions

```http
GET /api/credits/users/{userId}/transactions?page=1&size=20
Authorization: Bearer <administrator-firebase-id-token>
Accept: application/json
```

Use this operation for a selected-user profile or investigation. Credit Service filters by
the requested user before counting and paging. An existing credit account with no visible
transactions returns an empty page. A user who has no Credit account returns `404`.

### Successful response

```json
{
  "items": [
    {
      "transactionId": "3ce2c8d8-6bbf-4a16-a2de-b5452cd65b15",
      "type": "RECEIVED",
      "amount": 10,
      "direction": "CREDIT",
      "occurredAt": "2026-10-14T08:30:00Z",
      "orderId": "order-123"
    }
  ],
  "page": 1,
  "size": 20,
  "totalItems": 1,
  "totalPages": 1
}
```

This endpoint intentionally reuses the existing user transaction item shape. Its items do
**not** contain `userId`; the owner is the `{userId}` from the request path.

### Example

```bash
curl --get \
  --url 'http://localhost:8080/api/credits/users/firebase-uid-123/transactions' \
  --header 'Authorization: Bearer <administrator-firebase-id-token>' \
  --data-urlencode 'page=1' \
  --data-urlencode 'size=20'
```

## 3. Read transactions across all users

```http
GET /api/credits/all/transactions?page=1&size=20
Authorization: Bearer <administrator-firebase-id-token>
Accept: application/json
```

Use this operation for a system-wide administrative transaction feed. Do not fetch every
user and merge their individual histories in the consumer. The global query performs its
own count, stable ordering, filtering, and database pagination.

### Successful response

```json
{
  "items": [
    {
      "transactionId": "3ce2c8d8-6bbf-4a16-a2de-b5452cd65b15",
      "userId": "firebase-uid-123",
      "type": "RECEIVED",
      "amount": 10,
      "direction": "CREDIT",
      "occurredAt": "2026-10-14T08:30:00Z",
      "orderId": "order-123"
    }
  ],
  "page": 1,
  "size": 20,
  "totalItems": 1,
  "totalPages": 1
}
```

Unlike the selected-user operation, every global item contains its owning `userId`.

When the system has no visible transactions, the response is:

```json
{
  "items": [],
  "page": 1,
  "size": 20,
  "totalItems": 0,
  "totalPages": 0
}
```

### Example

```bash
curl --get \
  --url 'http://localhost:8080/api/credits/all/transactions' \
  --header 'Authorization: Bearer <administrator-firebase-id-token>' \
  --data-urlencode 'page=1' \
  --data-urlencode 'size=20'
```

## Transaction fields

| Field | Type | Notes |
|---|---|---|
| `transactionId` | string | Opaque, stable ledger transaction identifier. |
| `userId` | string | Present only in the system-wide response; identifies the owning Firebase user. |
| `type` | string | One of `INITIAL_ALLOCATION`, `RESERVATION`, `PAID`, `RECEIVED`, `REFUNDED_CANCELLATION`, `REFUNDED_EXPIRY`, or `REFUNDED`. |
| `amount` | integer | Positive whole-credit amount. Use `direction` to determine whether it is a credit or debit. |
| `direction` | string | `CREDIT` or `DEBIT`. |
| `occurredAt` | string | ISO-8601 UTC instant for when the business event occurred. |
| `orderId` | string or null | Related opaque Order ID when the transaction belongs to an order. |

The envelope fields have their usual meanings: `page` is the returned one-based page,
`size` is the requested page size, `totalItems` is the count after visibility filtering,
and `totalPages` is computed from that filtered count.

## Ordering and visibility rules

- Results are newest first.
- The stable database order is `occurredAt` descending, internal `createdAt` descending,
  then `transactionId` descending. `createdAt` is an ordering detail and is not exposed in
  either response.
- Both endpoints apply the same user-visible projection as
  `GET /api/credits/me/transactions`.
- When a recovery compensation reverses a reservation for an Order that was never created,
  both the original reservation and its compensation reversal are hidden.
- Genuine cancellation and expiry refunds remain visible.
- Paging is offset-based. New transactions inserted while a consumer walks multiple pages
  can shift later pages; consumers should refresh from page 1 when they need the latest feed.

## Errors

All failures use the repository-standard error envelope:

```json
{
  "status": 403,
  "error": "FORBIDDEN",
  "message": "You do not have permission to perform this credit operation.",
  "path": "/api/credits/all/transactions",
  "timestamp": "2026-10-14T08:30:00Z"
}
```

| Status | Error | When |
|---|---|---|
| `400` | `VALIDATION_ERROR` | An invalid selected `userId`, or transaction `page < 1` or `size` outside `1..100`. |
| `401` | `UNAUTHENTICATED` | Firebase token is missing, invalid, or expired. |
| `403` | `FORBIDDEN` | The authenticated caller does not have the administrator role. |
| `404` | `ACCOUNT_NOT_FOUND` | Selected-user balance or transaction endpoint: no Credit account exists for `{userId}`. |
| `503` | `SERVICE_UNAVAILABLE` | User Service role resolution or Credit persistence is unavailable. |

An opaque `userId` must be non-blank, no longer than 128 characters, contain no `/`, not be
`.` or `..`, and not use a name bounded by double underscores. Consumers should normally pass
the authoritative Firebase UID without transforming it.

## Consumer guidance

- Use the selected-user transaction endpoint for a user detail page and the global endpoint for a global
  feed. Do not client-filter a global page to represent a user's complete history.
- Use the selected-user balance endpoint for authoritative balances; do not derive a balance
  from transaction pages or substitute the administrator's `/api/credits/me` response.
- Use `userId` from the global item to request User Service profile/summary data. Credit Service
  does not duplicate usernames or email addresses.
- Do not assume enum values are presentation labels; map them to consumer-owned display text.
- Preserve the standard `401`, `403`, and `503` behavior instead of falling back to mock or
  cached authorization data.

## API discovery and verification

- Swagger UI: `/api/credits/docs`
- OpenAPI JSON: `/api/credits/v3/api-docs`
- Credit Service verification command: `cd credit-service && ./mvnw verify`
- Verified implementation result: 115 tests passed; Flyway migrations V1-V8 and JaCoCo line
  and branch gates passed.

