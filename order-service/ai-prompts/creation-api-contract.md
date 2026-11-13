<!-- AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
Scope: Archived user-supplied contract verbatim below. Team review pending; see ../usage-log.md. -->

Here are the important API contract details for Order Creation, based on your router, controller, and service implementation. You can share this directly with your UI teammate.

## 1. Create Order Route

POST

`/orders`

Creates a new order for an authenticated user.

Required headers:

```
Authorization: Bearer <JWT>
Content-Type: application/json
Idempotency-Key: <unique-key>
```

Only users with the `USER` role can create orders. The `ADMINISTRATOR` role alone does not grant creation permission.

## 2. Request Body

```
{
  "supplierId": "1",
  "destination": "PGP",
  "requestDetails": "One iced latte",
  "credits": 4,
  "expiryTime": "2026-10-20T16:00:00+08:00"
}
```

| Field            | Meaning                             |
| ---------------- | ----------------------------------- |
| `supplierId`     | Supplier identifier                 |
| `destination`    | Where the order should be delivered |
| `requestDetails` | Description of the requested items  |
| `credits`        | Credits offered for delivery        |
| `expiryTime`     | Order expiry timestamp              |

Important: The frontend should not send `requesterId`, `requesterName`, `pickupStore`, or `pickupLocation`. The backend derives the requester from the authenticated user and retrieves the additional details from User and Supplier Services.

The precise validation constraints (such as minimum credits and maximum text lengths) are defined in `createOrderSchema`, which wasn't included in the pasted code.

## 3. Response Formats

| HTTP status               | Meaning                                                      | Response                                    |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------- |
| `201 Created`             | New order successfully created                               | `{"order": {...}}`                          |
| `200 OK`                  | Existing order returned on an identical retry                | `{"order": {...}}`                          |
| `202 Accepted`            | Creation is still pending                                    | `{"creationId": "...", "state": "PENDING"}` |
| `400 Bad Request`         | Invalid request body or idempotency key                      | Error JSON                                  |
| `403 Forbidden`           | User not permitted to create                                 | Error JSON                                  |
| `409 Conflict`            | Idempotency conflict, expired order, or dependency rejection | Error JSON                                  |
| `503 Service Unavailable` | Required dependency unavailable                              | Error JSON                                  |

Authentication middleware can also return `401`; its exact response format isn't shown.

### Successful creation — 201

```
{
  "order": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "requesterId": "user-123",
    "courierId": null,
    "supplierId": "1",
    "destination": "PGP",
    "requestDetails": "One iced latte",
    "credits": 4,
    "status": "UNASSIGNED",
    "creditState": "RESERVED"
  }
}
```

This is an abbreviated example. The actual response uses the full `OrderDto`, including pickup information, names, timestamps, and other fields.

### Pending creation — 202

```
{
  "creationId": "550e8400-e29b-41d4-a716-446655440000",
  "state": "PENDING"
}
```

This means the order has not yet been confirmed as successfully created. The UI should not display it as a completed creation.

### Error response

Most command errors follow this structure:

```
{
  "error": "dependency-unavailable"
}
```

Possible `error` values include:

`invalid-input`, `forbidden`, `not-found`, `invalid-transition`, `expired`, `conflict`, `dependency-unavailable`, and `dependency-rejected`.

Some responses also include `creationId`. Validation errors additionally include a `message`:

```
{
  "error": "invalid-input",
  "message": "Valid order body and Idempotency-Key are required."
}
```

## 4. Important Frontend Behaviour

- Idempotency: Generate a unique key per new order attempt. Reuse the same key and identical body when retrying an uncertain request.
- Expiry: `expiryTime` must be in the future. The backend checks against database time.
- Credit reservation: Order creation depends on Credit Service successfully reserving credits and confirming the reservation.
- Dependencies: User, Supplier, and Credit Service adapters must all be available.
- Error handling: A `409` does not always mean a duplicate order. Inspect the `error` field for the actual reason.
- Pending creation: Preserve the `creationId` and original request details. Do not treat `202` as a confirmed order.

One implementation detail worth highlighting: your controller currently maps both `expired` and `dependency-rejected` to 409 Conflict, rather than returning separate status codes.

In summary: The frontend sends `POST /orders` with a JWT, idempotency key, and five request-body fields. It must handle `201` (created), `200` (successful replay), `202` (pending), and structured errors. The backend handles requester identity, supplier lookup, and credit reservation.