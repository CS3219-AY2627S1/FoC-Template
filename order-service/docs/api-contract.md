<!-- AI-influenced: updated with Codex; see ai/usage-log.md. This file documents the implemented Order Service contract; endpoint and architecture decisions remain team-owned. -->

# Order Service - API Specification

Contract that the order-service exposes to its consumers (the frontend through
the API Gateway, and other backend services).
This is the **human-readable** reference for the implemented endpoints.
The running FastAPI service provides the machine-readable OpenAPI document.

> Status: all order-lifecycle endpoints are implemented.
> Create (`POST /orders`), available-order discovery (`GET /orders`), the
> participant lists (`GET /orders/assigned`, `GET /orders/assigned/completed`,
> `GET /orders/requested/ongoing`, `GET /orders/requested/completed`), order
> detail (`GET /orders/{order_id}`), update (`PATCH /orders/{order_id}`), delete
> (`DELETE /orders/{order_id}`), and the courier and requester actions
> (`POST /orders/{order_id}/accept`, `/pickup`, `/withdraw`, `/deliver`,
> `/approve`, and `/cancel`) are all live.
> The asynchronous tasks they start are polled through
> `GET /orders/updates/{task_id}` and `GET /orders/deletions/{task_id}`.
> Supplier validation, credit reservation, and credit release run as part of
> these workflows.
> Order-lifecycle event publishing on `foc.order.events` is live, as are the
> five-second expiry sweeper and the one-minute auto-approval sweeper.

---

## 1. Overview

- **Configured public prefix** (through the gateway): `/api/orders`
- **Internal base URL** (service-to-service, on the Docker network):
  `http://order-service:8000/orders`
- **Media type:** `application/json` (UTF-8); `POST /orders/{order_id}/deliver`
  additionally accepts `multipart/form-data` for its optional photo.
- **Live schema:** `/openapi.json`
- **Interactive documentation:** `/docs`

The API Gateway is intended to be the only public entry point.
It must remove client-supplied identity headers, authenticate the caller, and
inject trusted identity headers before forwarding the request to the service.

> Integration status: the gateway owns the public `/api` prefix.
> It authenticates the caller, strips client-supplied identity headers, injects
> trusted `X-User-Id` / `X-User-Role`, and rewrites `/api/orders/...` to
> `/orders/...` before forwarding to this service.
> The public prefix is operational.

---

## 2. Conventions

### HTTP semantics

| Method   | Use                                                                           |
| -------- | ----------------------------------------------------------------------------- |
| `GET`    | Read an order, poll a task, or list orders for the caller's role.             |
| `POST`   | Create an order, and drive the accept, pickup, withdraw, deliver, approve, and cancel actions. |
| `PATCH`  | Request an update to an open, unassigned order.                               |
| `DELETE` | Start deletion of an eligible requester-owned order.                          |

The lifecycle actions are modelled as `POST` sub-resources rather than a single
mutable status field; approve, cancel, update, and delete return `202` because
they start an asynchronous credit workflow.

### Status codes

| Code                        | Meaning in this service                                                     |
| --------------------------- | --------------------------------------------------------------------------- |
| `200 OK`                    | Successful order read, listing, task poll, or synchronous action (accept, pickup, withdraw, deliver). |
| `201 Created`               | Order created after supplier validation and credit reservation.             |
| `202 Accepted`              | An asynchronous task was started (approve, cancel, update, delete); the body carries its task ID and status. |
| `401 Unauthorized`          | Authentication failed at the API Gateway.                                   |
| `403 Forbidden`             | The caller's role or ownership does not permit the operation.               |
| `404 Not Found`             | An order, task, supplier, or requester credit account does not exist.       |
| `409 Conflict`              | The order state, a pending task, or a credit reservation prevents the operation. |
| `422 Unprocessable Entity`  | A required header, query parameter, request-body value, or uploaded photo failed validation. |
| `500 Internal Server Error` | An Order Service database operation or unexpected operation failed.         |
| `502 Bad Gateway`           | A dependency returned an invalid, unexpected, or unusable response.         |
| `503 Service Unavailable`   | Supplier Service, Credit Service, or photo storage is temporarily unavailable. |

### Error format

Order Service errors use the shared **error envelope**
(`foc_shared.errors.ErrorEnvelope`):

```json
{
  "code": "order_not_found",
  "message": "Order '123e4567-e89b-12d3-a456-426614174000' was not found."
}
```

`code` is a stable, machine-readable string (see §7); `message` is a
human-readable explanation.
Request validation failures are also converted to this envelope with
`code: "validation_error"`.

---

## 3. Authentication & Authorization

The service trusts only gateway-injected identity headers from
`foc_shared.auth`.
Clients must not be allowed to assert these headers through the public gateway.

| Header        | Required by these routes            | Meaning                                                      |
| ------------- | ----------------------------------- | ------------------------------------------------------------ |
| `X-User-Id`   | Yes                                 | Authenticated caller's user identifier.                      |
| `X-User-Role` | Yes on the role-gated routes        | Gateway-injected role (`client` or `admin`); courier-facing routes require `client`. |

### Access matrix

| Operation                                   | Current authorization rule                                              |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| Create an order                             | Any caller with a trusted `X-User-Id`.                                  |
| List available orders                       | Any caller with a trusted `X-User-Id`; own orders excluded.             |
| List assigned orders (ongoing or completed) | Role `client`; scoped to the courier in `X-User-Id`.                    |
| List requested orders (ongoing or completed)| Any caller with a trusted `X-User-Id`; scoped to the requester.         |
| Read an order by ID                         | The order's requester or its assigned courier.                          |
| Update or delete an order by ID             | Only the requester, subject to state and assignment rules.              |
| Cancel an order                             | Only the requester of an assigned `ACCEPTED` order.                     |
| Accept, pick up, or withdraw                | Role `client`; the courier identity comes from `X-User-Id`.             |
| Deliver an order                            | Role `client` or `admin`; `X-User-Id` must match the assigned courier.  |
| Approve a delivered order                   | Only the requester.                                                     |
| Poll an update or deletion task             | Only the requester who started the task.                                |

The role-gated routes read `X-User-Role` and reject a mismatch with
`403 Forbidden`.
The courier actions (accept, pickup, withdraw) and the courier listings require
`X-User-Role: client`; delivery accepts `client` or `admin`.
The current shared roles are `client` and `admin`, with clients acting as
requesters or couriers.
A missing `X-User-Id` at the service boundary produces a
`422 validation_error`; public authentication failures are the gateway's
responsibility.

---

## 4. Data model

### `OrderResponse`

| Field               | Type           | Notes                                                          |
| ------------------- | -------------- | -------------------------------------------------------------- |
| `order_id`          | string         | Server-generated UUID string and primary key.                   |
| `name`              | string         | Required; stripped and non-empty on creation.                   |
| `details`           | string         | Required; stripped and non-empty on creation.                   |
| `reward`            | integer        | Required and greater than zero.                                 |
| `deadline`          | date-time      | Timezone-aware ISO 8601 value; must be in the future on create. |
| `supplier_id`       | string         | Required; supplier must exist and be active.                    |
| `requester_id`      | string         | Taken from `X-User-Id`, never from the request body.            |
| `courier_id`        | string \| null | Assigned courier; `null` for a newly created or withdrawn order.|
| `pickup_location`   | string         | Required, stripped, and non-empty.                              |
| `delivery_location` | string         | Required, stripped, and non-empty.                              |
| `status`            | `OrderStatus`  | Server-managed lifecycle state; initially `OPEN`.               |
| `created_at`        | date-time      | Database-generated creation timestamp.                          |

The persisted order also stores an internal `reservation_id` for releasing the
Credit Service reservation, a nullable `proof_of_delivery_photo_key` for the S3
photo object, and `awaiting_approval_at`.
Those internal fields are not exposed by `OrderResponse`.

### `OrderDetailResponse`

`GET /orders/{order_id}` returns `OrderDetailResponse`, which is `OrderResponse`
plus one field.

| Field                      | Type           | Notes                                                                 |
| -------------------------- | -------------- | --------------------------------------------------------------------- |
| `proof_of_delivery_photo`  | string \| null | Base64 data URI of the delivery photo, or `null` when none was supplied. |

The service returns the image inline as a `data:` URI (for example
`data:image/jpeg;base64,...`) and sets `Cache-Control: private, no-store` on the
response.
Order listings never include the photo bytes, and the private S3 key is never
returned.

### `OrderActionResponse`

The asynchronous actions (`approve`, `cancel`, update, delete) and the two task
polls return `OrderActionResponse`.

| Field            | Type           | Notes                                                               |
| ---------------- | -------------- | ------------------------------------------------------------------- |
| `task_id`        | string         | Identifier of the started task; used in the poll endpoints.         |
| `order_id`       | string         | The order the task acts on.                                         |
| `status`         | string         | Task state. Release tasks (delete, cancel) use `pending`, `completed`, `failed`; update tasks use `pending`, `completed`, `rejected`. |
| `failure_reason` | string \| null | The task's last error, or `null`.                                   |

### `OrderStatus` (enum)

```text
OPEN · ACCEPTED · PICKED_UP · AWAITING_APPROVAL
COMPLETED · CANCELLED · EXPIRED
```

These seven values are exactly those stored in `orders.status`.
The allowed transitions are defined in `app/services/lifecycle.py` and are all
exercised by the live endpoints and sweepers; invalid transitions are rejected
in code.
See [`order-state-machine.svg`](./order-state-machine.svg) for the full state
machine.

### `OrderCreate`

The request body contains only client-provided fields:

```json
{
  "name": "Collect lunch",
  "details": "One vegetarian rice bowl",
  "reward": 5,
  "deadline": "2026-10-05T15:00:00+08:00",
  "supplier_id": "sup_001",
  "pickup_location": "The Deck",
  "delivery_location": "COM3"
}
```

### `OrderUpdate`

`PATCH /orders/{order_id}` takes the same client-editable fields as `OrderCreate`
(`name`, `details`, `reward`, `deadline`, `supplier_id`, `pickup_location`,
`delivery_location`) and forbids extra fields.

### `OrderCancellationRequest`

`POST /orders/{order_id}/cancel` takes a single `reason` string, stripped and 1
to 255 characters, with no extra fields.

---

## 5. Endpoints

### 5.1 `POST /orders` - create an order

Create an `OPEN` order owned by the authenticated requester.

- **Auth:** trusted `X-User-Id` header required.
- **Request body:** `OrderCreate` (see §4).
- **Workflow:**

  1. Retrieve the supplier through Supplier Service and require `active: true`.
  2. Generate the order UUID.
  3. Reserve `reward` credits through Credit Service for that order UUID.
  4. Insert the order and reservation ID in an Order Service database
     transaction.
  5. If database insertion fails, request release of the credit reservation
     before returning a persistence error.

- **201 response:** the persisted `OrderResponse`.

  ```json
  {
    "order_id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "Collect lunch",
    "details": "One vegetarian rice bowl",
    "reward": 5,
    "deadline": "2026-10-05T15:00:00+08:00",
    "supplier_id": "sup_001",
    "requester_id": "user-123",
    "courier_id": null,
    "pickup_location": "The Deck",
    "delivery_location": "COM3",
    "status": "OPEN",
    "created_at": "2026-10-04T13:00:00+08:00"
  }
  ```

- **422 response:** a required field is absent; a string field is empty;
  `reward` is not positive; or `deadline` lacks a timezone or is not in the
  future.
- **Dependency and persistence errors:**

  | HTTP | `code`                           | When                                               |
  | ---- | -------------------------------- | -------------------------------------------------- |
  | 404  | `supplier_not_found`             | Supplier Service reports an unknown supplier.      |
  | 409  | `supplier_inactive`              | The selected supplier is inactive.                 |
  | 404  | `credit_account_not_found`       | The requester has no Credit Service account.       |
  | 409  | `insufficient_credits`           | The requester cannot reserve the reward amount.    |
  | 409  | `reservation_conflict`           | Credit Service reports a reservation conflict.     |
  | 500  | `order_persistence_failed`       | The order could not be inserted.                    |
  | 502  | `dependency_invalid_response`    | A dependency violated its response contract.       |
  | 502  | `dependency_unexpected_response` | A dependency returned an unmapped response.         |
  | 503  | `dependency_unavailable`         | Supplier or Credit Service is unavailable.          |

### 5.2 `GET /orders` - list available orders

Return orders available to the authenticated caller for courier discovery.

- **Auth:** trusted `X-User-Id` header required.
- **Query parameters:**

  | Parameter    | Type              | Notes                                                         |
  | ------------ | ----------------- | ------------------------------------------------------------- |
  | `category`   | string, repeatable| Filter by one or more supplier categories; resolved to supplier IDs through Supplier Service. |
  | `min_reward` | integer `>= 1`    | Minimum reward, inclusive.                                    |
  | `max_reward` | integer `>= 1`    | Maximum reward, inclusive.                                    |
  | `sort_by`    | `deadline` \| `reward` | Sort field; defaults to `deadline`.                      |
  | `sort_order` | `asc` \| `desc`   | Sort direction; defaults to `asc`.                            |

  `min_reward` greater than `max_reward` returns `422`.
  A `category` filter that matches no suppliers returns `[]`.

- **Filters applied:**

  - `status` is `OPEN`;
  - `deadline` is strictly after the database's current time;
  - `courier_id` is `null`;
  - `requester_id` differs from the caller's `X-User-Id`; and
  - no pending update or release task exists for the order.

- **Ordering:** the chosen `sort_by` and `sort_order`, then `order_id`
  ascending.
- **200 response:** a JSON array of `OrderResponse` objects.

  ```json
  [
    {
      "order_id": "123e4567-e89b-12d3-a456-426614174000",
      "name": "Collect lunch",
      "details": "One vegetarian rice bowl",
      "reward": 5,
      "deadline": "2026-10-05T15:00:00+08:00",
      "supplier_id": "sup_001",
      "requester_id": "user-123",
      "courier_id": null,
      "pickup_location": "The Deck",
      "delivery_location": "COM3",
      "status": "OPEN",
      "created_at": "2026-10-04T13:00:00+08:00"
    }
  ]
  ```

- **Empty result:** returns `[]`, not `404`.
- **Pagination:** not implemented.
- **500 response:** `order_retrieval_failed` when the database query fails.
- **Availability window:** available orders exclude any whose deadline is at or
  before the database's current time; orders with a pending update or release
  task are also hidden.
  This keeps overdue orders out of the listing even before the expiry sweeper
  marks them `EXPIRED`.

### 5.3 `GET /orders/assigned` - courier ongoing orders

List the authenticated courier's ongoing assigned orders.

- **Auth:** trusted `X-User-Id`; `X-User-Role: client` required.
- **200 response:** an array of `OrderResponse` objects for orders in
  `ACCEPTED`, `PICKED_UP`, or `AWAITING_APPROVAL` status, sorted by deadline
  and then order ID.
- **Empty result:** returns `[]`.
- **403 response:** `X-User-Role` is not `client`.

### 5.4 `GET /orders/assigned/completed` - courier completed orders

List `COMPLETED` orders assigned to the authenticated courier.

- **Auth:** trusted `X-User-Id`; `X-User-Role: client` required.
- **200 response:** an array of `OrderResponse` objects, ordered by creation
  time newest first, then order ID.
- **Empty result:** returns `[]`.
- **403 response:** `X-User-Role` is not `client`.

### 5.5 `GET /orders/requested/ongoing` - requester ongoing orders

List orders created by the authenticated requester that are still in progress.

- **Auth:** trusted `X-User-Id` header required.
- **200 response:** an array of `OrderResponse` objects in `OPEN`, `ACCEPTED`,
  `PICKED_UP`, or `AWAITING_APPROVAL` status, ordered by deadline and then order
  ID.
- **Empty result:** returns `[]`.

### 5.6 `GET /orders/requested/completed` - requester completed orders

List the authenticated requester's `COMPLETED` orders.

- **Auth:** trusted `X-User-Id` header required.
- **200 response:** an array of `OrderResponse` objects, ordered by creation
  time newest first, then order ID.
- **Empty result:** returns `[]`.

### 5.7 `GET /orders/{order_id}` - order detail

Return one order to its requester or its assigned courier.

- **Auth:** trusted `X-User-Id` header required; caller must be the requester or
  the assigned courier.
- **Path parameter:** `order_id` - server-generated UUID string.
- **Response headers:** `Cache-Control: private, no-store`.
- **200 response:** an `OrderDetailResponse` - the full `OrderResponse` plus
  `proof_of_delivery_photo`, which is a base64 data URI when a delivery photo
  exists and `null` otherwise.
- **403 response:** the caller is neither the requester nor the assigned
  courier.

  ```json
  {
    "code": "order_access_denied",
    "message": "You do not have permission to access order '123e4567-e89b-12d3-a456-426614174000'."
  }
  ```

- **404 response:** no order has the supplied ID.

  ```json
  {
    "code": "order_not_found",
    "message": "Order '123e4567-e89b-12d3-a456-426614174000' was not found."
  }
  ```

- **500 response:** `order_retrieval_failed` when the database lookup fails.

### 5.8 `PATCH /orders/{order_id}` - update an order

Request an update to an open, unassigned order; the change is applied only after
Credit Service approves any reward amendment.

- **Auth:** trusted `X-User-Id` header required; caller must own the order.
- **Request body:** `OrderUpdate` (see §4).
- **Workflow:** the request commits a pending update task and its
  `OrderUpdateRequested` event to `order_event_outbox` in one transaction, then
  returns `202` with the task ID.
  Credit Service independently decides whether the reservation needs amendment
  and publishes `CreditAmended` or `CreditAmendRejected`.
  The update-result consumer locks the task by `task_id`, verifies its
  reservation and order IDs, then applies or rejects the update and records
  `OrderUpdated` or `OrderUpdateFailed` in the same outbox.
  A rejection leaves the live order unchanged.
- **202 response:** an `OrderActionResponse` with the update task ID and status.
- **Expected errors:**

  | HTTP | `code`                 | When                                                        |
  | ---- | ---------------------- | ----------------------------------------------------------- |
  | 403  | `order_access_denied`  | The order belongs to another requester.                     |
  | 404  | `order_not_found`      | No order has the supplied ID.                               |
  | 409  | `order_not_editable`   | The order is assigned or not `OPEN`.                        |
  | 409  | `invalid_order_state`  | A terminal action is pending, or a different update is already in progress. |
  | 409  | `supplier_inactive`    | A newly selected supplier is inactive.                      |
  | 404  | `supplier_not_found`   | A newly selected supplier is unknown.                       |

  Poll the result through `GET /orders/updates/{task_id}` (§5.16).
  While an update is pending, the order cannot receive another edit, be deleted,
  appear in the courier listing, or be accepted.

### 5.9 `DELETE /orders/{order_id}` - delete an order

Start deletion of an unassigned `OPEN` order; the row is removed only after its
credit reservation is released.

- **Auth:** trusted `X-User-Id` header required; caller must own the order.
- **Path parameter:** `order_id` - server-generated UUID string.
- **Workflow:**

  1. Lock the order row and require the caller to be its `requester_id`.
  2. Require `status: OPEN` and `courier_id: null`.
  3. Commit a pending deletion (release) task and an `OrderDeletionRequested`
     event to `order_event_outbox` in one transaction, then return `202` with
     the task ID.
  4. Credit Service consumes `OrderDeletionRequested` and publishes
     `CreditReleased` (or `CreditReleaseFailed`).
  5. The release-result consumer correlates the result to the task, hard-deletes
     the order row, and records `OrderDeleted` (or `OrderDeletionFailed`) in the
     same outbox.

- **202 response:** an `OrderActionResponse` with the deletion task ID and
  status.
- **Expected errors:**

  | HTTP | `code`                | When                                                            |
  | ---- | --------------------- | --------------------------------------------------------------- |
  | 403  | `order_access_denied` | The order belongs to another requester.                         |
  | 404  | `order_not_found`     | No order has the supplied ID.                                   |
  | 409  | `invalid_order_state` | The order is assigned, not `OPEN`, or has a conflicting pending task. |
  | 500  | `order_deletion_failed`| The deletion task could not be saved.                          |

  Poll the result through `GET /orders/deletions/{task_id}` (§5.17).
  Credit release happens asynchronously over events, not inside the request;
  the two services do not share a distributed transaction.

### 5.10 `POST /orders/{order_id}/accept` - accept an order

Assign an available order to the authenticated courier.
Returns `200` with the updated `OrderResponse`; no request body is needed.

- **Auth:** trusted `X-User-Id`; `X-User-Role: client` required.
- **Guards:** acceptance rejects missing orders (`404`), non-client roles
  (`403`), and state conflicts (`409`) for own orders, an already-assigned
  courier, a non-`OPEN` status, a passed deadline, a pending update task, any
  deletion task, or three existing ongoing orders.
  `ACCEPTED`, `PICKED_UP`, and `AWAITING_APPROVAL` count as ongoing.
- **Concurrency:** the service locks the order row and takes a
  transaction-scoped PostgreSQL advisory lock for the courier before checking
  the ongoing count, preventing double assignment and over-limit races.
- **Events:** the assignment and an `OrderAccepted` outbox record commit in one
  transaction; a database failure rolls back both and returns
  `500 order_acceptance_failed`.

### 5.11 `POST /orders/{order_id}/pickup` - mark picked up

Move an `ACCEPTED` order to `PICKED_UP`.
Returns `200` with the updated `OrderResponse`.

- **Auth:** trusted `X-User-Id`; `X-User-Role: client` required; caller must be
  the assigned courier.
- **Guards:** the order must be `ACCEPTED` with no pending terminal action.
- **Events:** the status change and an `OrderPickedUp` outbox record commit
  together.
- **Errors:** `403 order_access_denied` for a non-courier, `409 invalid_order_state`
  for the wrong state, and `500 order_pickup_failed` on a database failure.

### 5.12 `POST /orders/{order_id}/withdraw` - withdraw from an order

Reopen an `ACCEPTED` order (move it back to `OPEN`) while keeping its credit
reservation.
Returns `200` with the updated `OrderResponse`.

- **Auth:** trusted `X-User-Id`; `X-User-Role: client` required; caller must be
  the assigned courier.
- **Headers:** an `Idempotency-Key` header of 1 to 128 characters is required.
- **Idempotency:** successful withdrawals are saved in `order_requests`.
  Retrying with the same key, order, and courier returns the original response
  with no further state change or event; reusing the key for a different request
  returns `409`.
- **Events:** the unassignment and a `CourierWithdrawn` outbox record commit
  together; the reservation stays held.
- **Errors:** `403 order_access_denied`, `409 invalid_order_state`, and
  `500 order_withdrawal_failed`.

### 5.13 `POST /orders/{order_id}/deliver` - mark delivered

Move a `PICKED_UP` order to `AWAITING_APPROVAL`, optionally storing a proof
photo.
Returns `200` with the updated `OrderResponse`.

- **Auth:** trusted `X-User-Id`; `X-User-Role: client` or `admin`; `X-User-Id`
  must match the assigned courier.
- **Request body:** optional `multipart/form-data` `photo` file.
  When supplied it must be a valid JPEG, PNG, or WebP image, at most 5 MiB and
  20 million pixels, and is rebuilt from its pixels to strip EXIF/GPS metadata
  (EXIF rotation applied first) before upload to a private S3 bucket.
- **Workflow:** the S3 object key, the order update, `awaiting_approval_at`
  (which starts the 24-hour approval clock), and an `OrderDelivered` outbox
  record commit in one transaction.
  Without a photo the key stays `null`.
  Invalid images and S3 failures leave the order unchanged; a database failure
  after upload triggers best-effort deletion of the orphaned image.
- **Errors:** `403 order_access_denied`, `409 invalid_order_state`,
  `422 invalid_order_photo`, `503 order_photo_unavailable`, and
  `500 order_delivery_failed`.

### 5.14 `POST /orders/{order_id}/approve` - approve a delivered order

Start requester approval of an `AWAITING_APPROVAL` order.

- **Auth:** trusted `X-User-Id` header required; caller must own the order.
- **Workflow:** the pending approval task and an `OrderApprovalRequested` event
  commit to the outbox in one transaction, and the endpoint returns `202` with
  the task ID.
  Order Service consumes `CreditTransferSucceeded` or `CreditTransferFailed`,
  correlates it to the task, and on success records `OrderApproved` and moves
  the order to `COMPLETED`; a failed transfer leaves the order awaiting
  approval.
  An auto-approval sweeper independently completes orders 24 hours after
  delivery.
- **202 response:** an `OrderActionResponse` with the approval task ID.
- **Errors:** `403 order_access_denied`, `404 order_not_found`,
  `409 invalid_order_state`, and `500 order_approval_failed`.

### 5.15 `POST /orders/{order_id}/cancel` - cancel an assigned order

Start cancellation of an assigned `ACCEPTED` order before pickup; the row is
retained as `CANCELLED` after credit release.

- **Auth:** trusted `X-User-Id` header required; caller must own the order.
- **Request body:** `OrderCancellationRequest` with a `reason` (see §4).
- **Workflow:** a pending cancellation (release) task and an
  `OrderCancellationRequested` event commit to the outbox in one transaction,
  and the endpoint returns `202` with the task ID.
  Credit Service releases the reservation and publishes `CreditReleased`; the
  release-result consumer then moves the order to `CANCELLED` and records
  `OrderCancelled`.
- **202 response:** an `OrderActionResponse` with the cancellation task ID.
- **Errors:** `403 order_access_denied`, `404 order_not_found`,
  `409 invalid_order_state` (not `ACCEPTED`, unassigned, or a conflicting
  pending task), and `500 order_cancellation_failed`.

### 5.16 `GET /orders/updates/{task_id}` - poll an update task

Return an update task's status and failure reason to the requester who started
it.

- **Auth:** trusted `X-User-Id` header required; caller must own the task.
- **200 response:** an `OrderActionResponse` whose `status` is `pending`,
  `completed`, or `rejected`.
- **Errors:** `403 order_access_denied` for another requester, `404 order_not_found`
  for an unknown task, and `500 order_retrieval_failed` on a database failure.

### 5.17 `GET /orders/deletions/{task_id}` - poll a deletion task

Return a deletion task's status and failure reason to the requester who started
it.

- **Auth:** trusted `X-User-Id` header required; caller must own the task.
- **200 response:** an `OrderActionResponse` whose `status` is `pending`,
  `completed`, or `failed`.
- **Errors:** `403 order_access_denied` for another requester, `404 order_not_found`
  for an unknown or non-deletion task, and `500 order_retrieval_failed` on a
  database failure.

---

## 6. Filtering, sorting & pagination

- `GET /orders` accepts `category` (repeatable), `min_reward`, `max_reward`
  (each `>= 1`, with `422` when `min_reward` exceeds `max_reward`), `sort_by`
  (`deadline` or `reward`), and `sort_order` (`asc` or `desc`).
- Availability filtering uses order status, the database-time deadline window,
  courier assignment, requester ownership, and the absence of a pending update
  or release task.
- Available orders exclude any whose deadline is at or before the database's
  current time.
- Results are sorted by the chosen field and direction (default `deadline`
  ascending), then `order_id` ascending.
- Pagination is not implemented; the response is a bare JSON array.

---

## 7. Error codes

| `code`                             | HTTP | When                                                    |
| ---------------------------------- | ---- | ------------------------------------------------------- |
| `validation_error`                 | 422  | Header, query, or request-body validation fails.        |
| `order_not_found`                  | 404  | The order or task ID does not exist.                    |
| `order_access_denied`              | 403  | The caller does not own or participate in the order or task. |
| `invalid_order_state`              | 409  | The action is invalid for the order state, assignment, or a pending task. |
| `order_not_editable`               | 409  | The order is assigned or not `OPEN`, so it cannot be updated. |
| `order_update_pending`             | 503  | A durable update is still pending and will be retried.  |
| `invalid_order_photo`              | 422  | The uploaded proof-of-delivery photo is invalid.        |
| `order_photo_unavailable`          | 503  | Proof-of-delivery photo storage is unavailable.         |
| `supplier_not_found`               | 404  | Supplier Service reports an unknown supplier.           |
| `supplier_inactive`                | 409  | The selected supplier is inactive.                      |
| `invalid_category_filter`          | 422  | One or more `category` filters are not supported.       |
| `credit_account_not_found`         | 404  | The requester has no credit account.                    |
| `insufficient_credits`             | 409  | The requester cannot reserve the reward.                |
| `reservation_conflict`             | 409  | Credit reservation creation or release conflicts.       |
| `credit_reservation_not_found`     | 502  | The stored reservation cannot be found.                 |
| `credit_reservation_access_denied` | 502  | Credit Service rejects access to the reservation.       |
| `order_persistence_failed`         | 500  | Database insertion fails.                               |
| `order_retrieval_failed`           | 500  | Database retrieval fails.                               |
| `order_acceptance_failed`          | 500  | The acceptance database operation fails.                |
| `order_pickup_failed`              | 500  | The pickup database operation fails.                    |
| `order_withdrawal_failed`          | 500  | The withdrawal database operation fails.                |
| `order_delivery_failed`            | 500  | The delivery database operation fails.                  |
| `order_approval_failed`            | 500  | The approval task cannot be started.                    |
| `order_cancellation_failed`        | 500  | The cancellation task cannot be started.                |
| `order_deletion_failed`            | 500  | The deletion task cannot be saved.                      |
| `dependency_invalid_response`      | 502  | A dependency violates its response contract.            |
| `dependency_unexpected_response`   | 502  | A dependency returns an unmapped response.              |
| `dependency_unavailable`           | 503  | A required dependency is unavailable.                   |
| `internal_error`                   | 500  | An unexpected unhandled error occurs.                   |

---

## 8. Versioning & stability

- Breaking contract changes should be versioned rather than silently changing
  existing consumers.
  The team has not selected a path or header strategy.
- The generated OpenAPI document reflects the running code.
  This curated document additionally explains authorization, dependency
  workflows, and the asynchronous task model.

---

## 9. Related documents

- [`order-state-machine.svg`](./order-state-machine.svg) - Order lifecycle diagram.
- [`event-catalog.md`](../../docs/event-catalog.md) - implemented asynchronous lifecycle events on `foc.order.events`.
- [`architecture.md`](./architecture.md) - Order Service component view and lifecycle.
- [`../../docs/architecture.md`](../../docs/architecture.md) - repository architecture overview.
- [`README.md`](../README.md) - service responsibilities and run instructions.
