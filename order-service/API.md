<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-10
Scope: Documentation only - wrote this API reference by reading the routes, controllers,
       services, validation, error codes and Socket.IO server as they are on main. No source
       code was changed. No requirements, architecture, schema, or API decisions were made
       by the AI tool.
Author review: George Yeo
-->

# Order Service API

Base URL in Compose: `http://order-service:3000`, published on the host at
`http://localhost:${ORDER_SERVICE_PORT:-3002}`. On AWS, the ALB sends `/orders`,
`/orders/*`, `/socket.io` and `/socket.io/*` to this service.

All ids of orders, series and users are **UUIDs**. `supplierId` and
`deliveryLocationId` are supplier-service **integer** ids. Times are ISO 8601 strings.
Request bodies are JSON (`Content-Type: application/json`).

## Contents

- [Authentication](#authentication)
- [Errors](#errors)
- [The order object](#the-order-object)
- [Health](#health): `GET /health`
- [Orders](#orders): create, list, read, edit
- [Status changes](#status-changes): accept, pickup, deliver, complete, cancel
- [Admin](#admin): `GET /orders/admin/users/:userId`
- [Series (recurring errands)](#series-recurring-errands)
- [Real-time (Socket.IO)](#real-time-socketio)

## Authentication

Every route except `GET /health` needs a User Service access token:

```
Authorization: Bearer <access token>
```

The token is verified locally as RS256 against User Service's JWKS
(`{USER_SERVICE_URL}/auth/.well-known/jwks.json`, cached). The service reads two claims:
`sub` (the caller's user id) and `role`.

A missing, malformed, expired or unverifiable token returns:

```json
HTTP 401
{ "message": "Unauthorized", "code": "UNAUTHORIZED" }
```

"Admin" below means `role` is `admin` or `super admin`.

## Errors

Most errors use one envelope. When there are several validation problems, `message` holds
one message per line:

```json
{ "message": "Request is missing a supplier.\nInvalid number of credits offered." }
```

The **status-change routes are the exception**: they return `{ "ok": false, "error": "<CODE>" }`
(see [Status changes](#status-changes)).

How error codes map to HTTP status for the order routes:

| HTTP | Codes |
| ---- | ----- |
| 400 | Any validation code (`MISSING_*`, `INVALID_*`, `COMPLETE_BY_IN_PAST`, `UNKNOWN_QUERY_PARAMETER`, `INVALID_CURSOR`, `DEADLINE_NOT_REACHED`, ...) |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN` |
| 404 | `ORDER_NOT_FOUND` |
| 409 | `ORDER_PENDING_EXISTS`, `INVALID_TRANSITION`, `ORDER_CONFLICT`, `ORDER_EXPIRED`, `ORDER_NOT_EDITABLE` |
| 422 | `SUPPLIER_NOT_FOUND`, `DELIVERY_LOCATION_NOT_FOUND`, `INSUFFICIENT_CREDITS`, `CREDIT_RESERVE_REJECTED` |
| 503 | `CREDIT_SERVICE_UNAVAILABLE`, `SUPPLIER_SERVICE_UNAVAILABLE` |

The full list of codes and their message text is in
[`src/constants/errors.ts`](src/constants/errors.ts). An unknown path returns 404.

## The order object

Every route that returns an order returns the full stored row:

```json
{
  "id": "0193a2b4-...",
  "requesterId": "5f0c...",
  "supplierId": 12,
  "description": "2x chicken rice",
  "deliveryLocationId": 3,
  "deliveryDetails": "Level 2 study room",
  "credits": 5,
  "completeBy": "2026-11-10T09:00:00.000Z",
  "additionalDetails": null,
  "courierId": null,
  "status": "open",
  "seriesId": null,
  "failureReason": null,
  "createdAt": "2026-11-10T08:00:00.000Z",
  "updatedAt": "2026-11-10T08:00:00.000Z",
  "acceptedAt": null,
  "deliveredAt": null,
  "creditReleasedAt": null,
  "version": 1
}
```

| Field | Notes |
| ----- | ----- |
| `status` | `pending`, `open`, `accepted`, `picked_up`, `delivered`, `completed`, `cancelled`, `expired` or `failed` |
| `completeBy` | Deadline. Defaults to one hour after creation when not given |
| `courierId` | Set when the order is accepted |
| `seriesId` | The series that posted it, or `null` |
| `failureReason` | Set only for series occurrences that failed or were skipped |
| `version` | Goes up by one on every change |

---

## Health

### `GET /health`

No authentication. Checks the database.

| HTTP | Body |
| ---- | ---- |
| 200 | `{ "status": "ok", "database": "up" }` |
| 503 | `{ "status": "error", "database": "down" }` |

---

## Orders

### `POST /orders` — create an order

The caller becomes the requester. The service checks the supplier and delivery location
with supplier-service (forwarding the caller's token), then reserves `credits` with
credit-service before returning.

**Body**

| Field | Type | Required | Rules |
| ----- | ---- | -------- | ----- |
| `supplierId` | integer | yes | Positive, must exist in supplier-service |
| `description` | string | yes | Non-empty |
| `deliveryLocationId` | integer | yes | Positive, must exist in supplier-service |
| `deliveryDetails` | string | yes | Non-empty after trimming, at most 250 characters (stored trimmed) |
| `credits` | integer | yes | Greater than 0 |
| `completeBy` | string or `null` | no | ISO date later than now. Omitted or `null`: one hour from now |
| `additionalDetails` | string or `null` | no | Any text |

```json
{
  "supplierId": 12,
  "description": "2x chicken rice",
  "deliveryLocationId": 3,
  "deliveryDetails": "Level 2 study room",
  "credits": 5,
  "completeBy": "2026-11-10T09:00:00.000Z"
}
```

**Responses**

| HTTP | When |
| ---- | ---- |
| 201 | Created. Body is the [order](#the-order-object), status `open` |
| 400 | A field is missing or invalid |
| 409 | `ORDER_PENDING_EXISTS`: another of the caller's orders is still being created |
| 422 | `SUPPLIER_NOT_FOUND`, `DELIVERY_LOCATION_NOT_FOUND`, `INSUFFICIENT_CREDITS` or `CREDIT_RESERVE_REJECTED` |
| 503 | supplier-service or credit-service could not be reached |

### `GET /orders` — list orders

Without `status`, lists **open** orders, the marketplace. With any other `status`, lists only
orders where the caller is the requester or courier. `pending` and `failed` cannot be listed.

**Query parameters** (all optional; unknown or repeated parameters return 400)

| Parameter | Type | Meaning |
| --------- | ---- | ------- |
| `status` | string | `open` (default), `accepted`, `picked_up`, `delivered`, `completed`, `cancelled`, `expired` |
| `location` | integer | Only this `deliveryLocationId` |
| `minCredits` | integer ≥ 0 | `credits` at least this |
| `maxCredits` | integer ≥ 0 | `credits` at most this. Must not be below `minCredits` |
| `expiresBefore` | ISO date | `completeBy` before this |
| `expiresAfter` | ISO date | `completeBy` after this, or no `completeBy` |
| `sort` | string | `completeBy` (default), `credits` or `createdAt` |
| `order` | string | `asc` (default) or `desc` |
| `cursor` | string | `nextCursor` from the previous page. Only valid with the same `sort` and `order` |

Pages hold 50 orders.

```json
HTTP 200
{ "ok": true, "orders": [ { "...": "order" } ], "nextCursor": "eyJzIjoi..." }
```

`nextCursor` is `null` on the last page. Invalid parameters return 400, naming the parameter
in brackets, e.g. `"Unknown query parameter. (foo)"`.

### `GET /orders/active` — my active deliveries

The orders the caller has accepted as courier that are `accepted`, `picked_up` or `delivered`.
Soonest-expiring first. No parameters.

```json
HTTP 200
{ "ok": true, "orders": [ { "...": "order" } ] }
```

### `GET /orders/mine` — my orders

The caller's own orders in every status, newest first. A `failed` order is included only
when it has a `failureReason` (a series occurrence).

| Parameter | Type | Meaning |
| --------- | ---- | ------- |
| `as` | string | `requester` (default): orders the caller posted. `courier`: orders the caller accepted |

```json
HTTP 200
{ "ok": true, "orders": [ { "...": "order" } ] }
```

Any other parameter, or another `as` value, returns 400.

### `GET /orders/:id` — one order

| Parameter | In | Rules |
| --------- | -- | ----- |
| `id` | path | Order UUID |

Readable by the order's requester, its courier, and admins. Anyone else can read it only while
it is `open`.

| HTTP | When |
| ---- | ---- |
| 200 | Body is the [order](#the-order-object) |
| 404 | `ORDER_NOT_FOUND`: no such order, `id` is not a UUID, or the caller may not see it |

### `PATCH /orders/:id/edit` — edit an open order

Only the requester can edit, and only while the order is `open`. `credits` cannot be changed.

**Body**: any of these fields. **`deliveryDetails` is required on every edit.**

| Field | Type | Rules |
| ----- | ---- | ----- |
| `deliveryDetails` | string | Required. Non-empty after trimming, at most 250 characters |
| `supplierId` | integer | Positive, must exist in supplier-service |
| `description` | string | Non-empty |
| `deliveryLocationId` | integer | Positive, must exist in supplier-service |
| `completeBy` | string or `null` | ISO date later than now. `null` keeps the current deadline |
| `additionalDetails` | string or `null` | Any text |

Any other field returns 400 `INVALID_FIELD`.

| HTTP | When |
| ---- | ---- |
| 200 | Body is the updated [order](#the-order-object) |
| 400 | Invalid or unsupported field |
| 403 | The caller is not the requester |
| 404 | No such order |
| 409 | `ORDER_NOT_EDITABLE` (not open) or `ORDER_CONFLICT` (changed at the same time, e.g. just accepted) |
| 422 | Supplier or delivery location not found |
| 503 | supplier-service could not be reached |

---

## Status changes

| Route | Change | Who may call it |
| ----- | ------ | --------------- |
| `POST /orders/:id/accept` | `open` → `accepted` | Anyone except the requester. The caller becomes the courier |
| `POST /orders/:id/pickup` | `accepted` → `picked_up` | The courier |
| `POST /orders/:id/deliver` | `picked_up` → `delivered` | The courier |
| `POST /orders/:id/complete` | `delivered` → `completed` | The requester |
| `POST /orders/:id/cancel` | `open`, `accepted` or `picked_up` → `cancelled` | The requester. An `accepted` or `picked_up` order only after its `completeBy` has passed |

No body. `id` is the order UUID; a non-UUID returns 404 `{ "message": "Order not found." }`.

**Success**

```json
HTTP 200
{ "ok": true, "order": { "...": "order" } }
```

**Failure**: `{ "ok": false, "error": "<CODE>" }`

| HTTP | `error` | When |
| ---- | ------- | ---- |
| 400 | `DEADLINE_NOT_REACHED` | Cancelling an accepted or picked-up order before `completeBy` |
| 403 | `FORBIDDEN` | The caller's role may not make this change |
| 404 | `ORDER_NOT_FOUND` | No such order |
| 409 | `INVALID_TRANSITION` | Not allowed from the order's current status |
| 409 | `ORDER_EXPIRED` | Accepting after `completeBy`, before the sweep marked it expired |
| 409 | `ORDER_CONFLICT` | The order changed at the same time |

What else each change does (in the background, after the response):

- **accept**: adds the courier to the order's chat; posts "The order has been accepted by
  &lt;username&gt;".
- **pickup / deliver**: posts a status message to the chat.
- **complete**: queues the credit transfer to the courier; posts a message and archives the chat.
- **cancel**: queues a credit release; posts a message and archives the chat.

The system also expires open orders past `completeBy` and auto-completes delivered orders.
These go through the same rules but have no route.

---

## Admin

### `GET /orders/admin/users/:userId` — a user's order history

Admins only. Every order where `:userId` is requester or courier, in every status, newest
first.

| Parameter | In | Rules |
| --------- | -- | ----- |
| `userId` | path | User UUID. Must exist in user-service (checked with the caller's token) |
| `page` | query | Positive integer, default `1`. No other query parameters are allowed |

Pages hold 10 orders.

```json
HTTP 200
{
  "totalCount": 23,
  "currentPage": 1,
  "pageSize": 10,
  "totalPages": 3,
  "orders": [ { "order": { "...": "order" }, "role": "requester" } ]
}
```

`role` is `requester` or `courier` relative to `:userId`. A page past the end returns
`orders: []`.

| HTTP | `message` from | When |
| ---- | -------------- | ---- |
| 400 | `MALFORMED_USER_ID` | `userId` is not a UUID |
| 400 | `INVALID_QUERY_PARAMETER`, `UNKNOWN_QUERY_PARAMETER` | Bad `page`, or another parameter |
| 401 | `UNAUTHENTICATED` | No usable token, or user-service rejected it |
| 403 | `FORBIDDEN` | Not an admin, or user-service refused access |
| 404 | `INVALID_USER_ID` | user-service has no such user |
| 503 | `USER_SERVICE_UNAVAILABLE` | user-service could not be reached or failed |

---

## Series (recurring errands)

A series posts a new order on each occurrence of an RFC 5545 recurrence rule (times in
Singapore time). Only the series' requester can read, edit or delete it.

Series routes use the same `{ "message": "..." }` envelope, with these statuses: 404
`SERIES_NOT_FOUND` (also for a non-UUID `seriesId`), 409 `SERIES_CONFLICT`, 403 `FORBIDDEN`,
400 for everything else.

**The public series object** (returned by GET and PATCH):

```json
{
  "id": "0193a2c0-...",
  "requesterId": "5f0c...",
  "supplierId": 12,
  "description": "Morning coffee",
  "deliveryLocationId": 3,
  "deliveryDetails": "Lab 4",
  "credits": 3,
  "durationMinutes": 60,
  "additionalDetails": null,
  "rrule": "FREQ=WEEKLY;BYDAY=MO,WE;BYHOUR=9;BYMINUTE=0",
  "startAt": "2026-11-10T01:00:00.000Z",
  "status": "active",
  "createdAt": "...",
  "updatedAt": "...",
  "version": 0,
  "upcomingDates": ["2026-11-11T01:00:00.000Z", "..."],
  "activeOrderCount": 1
}
```

`upcomingDates` holds the next three occurrences. `activeOrderCount` counts this series'
orders that are `pending` or `open`.

### `POST /orders/series` — create a series

| Field | Type | Required | Rules |
| ----- | ---- | -------- | ----- |
| `supplierId` | integer | yes | Positive |
| `description` | string | yes | Non-empty |
| `deliveryLocationId` | integer | yes | Positive |
| `deliveryDetails` | string | yes | Non-empty after trimming, at most 250 characters |
| `credits` | integer | yes | Greater than 0 |
| `rrule` | string | yes | RRULE text without `DTSTART`, with a `FREQ`, e.g. `FREQ=DAILY;BYHOUR=9;BYMINUTE=0`. `UNTIL`/`COUNT` end it |
| `startNow` | boolean | one of these two | `true`: start now |
| `startAt` | string | one of these two | ISO date to start from. Ignored when `startNow` is `true` |
| `durationMinutes` | integer | no | 1 to 1440. Each posted order's `completeBy` is its scheduled time plus this. Default 60 |
| `additionalDetails` | string or `null` | no | Any text |

Supplier and location are checked when each occurrence is posted, not at creation.

| HTTP | When |
| ---- | ---- |
| 201 | Created. Body is the stored series row: the fields above without `upcomingDates`/`activeOrderCount`, plus `nextFireAt` and the retry fields (`currentOccurrenceAt`, `retryType`, `attemptCount`, `nextRetryAt`) |
| 400 | Missing/invalid field, `MISSING_START_TIME`, `INVALID_RULE` (does not parse, or has no future occurrence) |

### `GET /orders/series/mine` — my series

The caller's series, newest first.

```json
HTTP 200
{ "ok": true, "series": [ { "...": "public series" } ] }
```

### `GET /orders/series/:seriesId` — one series

| HTTP | When |
| ---- | ---- |
| 200 | Body is the public series |
| 403 | Not the caller's series |
| 404 | No such series |

### `PATCH /orders/series/:seriesId/edit` — edit a series

**Body**: any of `supplierId`, `description`, `deliveryLocationId`, `deliveryDetails`,
`credits`, `durationMinutes`, `additionalDetails`, `rrule` (same rules as create), and
`status` (`active` or `inactive`, to pause or resume). Any other field returns 400
`INVALID_FIELD`.

- Changing `rrule` restarts the rule from now.
- Setting `status` to `active` on a paused series recalculates its next occurrence.
- Orders it already posted are not changed.
- If an occurrence was waiting to be retried, that occurrence is recorded as failed and the
  requester is notified.

| HTTP | When |
| ---- | ---- |
| 200 | Body is the updated public series |
| 400 | Invalid field, `INVALID_STATUS`, `INVALID_RULE` |
| 403 | Not the caller's series |
| 404 | No such series |
| 409 | `SERIES_CONFLICT`: changed at the same time |

### `DELETE /orders/series/:seriesId` — delete a series

Orders it already posted stay and lose their `seriesId`. A pending retry is recorded as
failed and the requester is notified.

| HTTP | When |
| ---- | ---- |
| 200 | `{ "ok": true }` |
| 403 | Not the caller's series |
| 404 | No such series |

---

## Real-time (Socket.IO)

Connect to the service's origin with the Socket.IO client (path `/socket.io`), passing the
same access token in the handshake `auth`:

```js
io(origin, { transports: ['websocket'], auth: { token: accessToken } })
```

The server accepts the WebSocket transport only (no long-polling).

A bad token fails the connection with `connect_error` `"unauthorized"`. The server
disconnects the socket when the token expires; reconnect with a fresh token.

On connect the server joins the socket to the caller's user room and to every order room it
is part of, then emits `ready`.

| Client → server | Effect |
| --------------- | ------ |
| `listing:subscribe` | Join the open-order feed |
| `listing:unsubscribe` | Leave it |

| Server → client | Sent when |
| --------------- | --------- |
| `order:created` | An order becomes open |
| `order:accepted`, `order:pickedUp`, `order:delivered`, `order:completed` | The matching status change |
| `order:cancelled`, `order:expired`, `order:failed` | The order ends without completing |
| `order:edited` | An open order is edited |

Payloads are small (`orderId`, `status`, `version`, `occurredAt`, plus listing-card fields
on the open-order feed, or a reason on failures). Treat them as a hint to refetch over REST.
