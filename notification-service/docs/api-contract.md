# Notification Service API Contract

This contract describes the notification-service HTTP API and its gateway-facing paths.

## Route prefixes

| Access path | Prefix |
| --- | --- |
| Direct notification-service request | `/notifications` |
| API gateway request | `/api/notifications` |

The API gateway removes `/api` before forwarding the request to notification-service.
All three routes are exposed through the gateway (`api-gateway/app/exposed_routes.py`).

## Identity and authorization

Every endpoint is authenticated.
The gateway verifies the JWT and injects these trusted headers; notification-service never trusts a client-asserted role.

```http
X-User-Id: user-id
X-User-Role: client
```

A missing or blank role degrades to `client`, never `admin`.
Each endpoint enforces a **self-or-admin** rule: the caller may act only on their own `user_id`, unless `X-User-Role` is `admin`.

## Error body shape

Errors use the shared envelope:

```json
{
  "code": "forbidden",
  "message": "You may only view your own notifications."
}
```

Common codes: `unauthorized` (401), `forbidden` (403), `not_found` (404), `validation_error` (422), `internal_error` (500).

## Endpoints

### List notifications

```http
GET /notifications/{user_id}
```

Gateway path: `GET /api/notifications/{user_id}`

Query parameters:

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| `unread_only` | boolean | `false` | When true, returns only notifications with no `read_at`. |
| `limit` | integer 1-100 | `20` | Page size. |
| `offset` | integer >= 0 | `0` | Number of records to skip. |

Notifications are returned newest first.
`unread_count` is always the caller's total unread count, independent of `unread_only` and of the page window.
`total` reflects the filtered set.

Success response - `200 OK`:

```json
{
  "items": [
    {
      "notification_id": "9f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
      "event_type": "OrderApproved",
      "order_id": "order-1234-5678",
      "order_name": "Chicken rice",
      "order_status": "COMPLETED",
      "title": "Order complete",
      "body": "Your order \"Chicken rice\" is complete.",
      "created_at": "2026-01-01T12:00:00",
      "read_at": null
    }
  ],
  "unread_count": 1,
  "total": 1
}
```

Possible errors: `401` missing identity header, `403` requesting another user's list without the admin role, `422` invalid query parameter.

### Mark one notification read

```http
POST /notifications/{user_id}/{notification_id}/read
```

Gateway path: `POST /api/notifications/{user_id}/{notification_id}/read`

Request body: none.
Marking an already-read notification again is a no-op and still returns `200`.

Success response - `200 OK`:

```json
{
  "status": "ok"
}
```

Possible errors: `401` missing identity header, `403` acting on another user without the admin role, `404` the notification does not exist or is not owned by `user_id`.

### Mark all notifications read

```http
POST /notifications/{user_id}/read-all
```

Gateway path: `POST /api/notifications/{user_id}/read-all`

Request body: none.
Marks every unread notification owned by the caller.

Success response - `200 OK`:

```json
{
  "marked_read": 2,
  "unread_count": 0
}
```

`marked_read` is the number of rows this call flipped from unread to read.
`unread_count` is `0` by construction, since every unread notification was just marked.

Possible errors: `401` missing identity header, `403` acting on another user without the admin role.

## Health endpoint

```http
GET /health
```

Success response - `200 OK`:

```json
{
  "status": "ok"
}
```

## Common status codes

| Status | Meaning |
| --- | --- |
| `200` | Request successful |
| `401` | Missing identity header |
| `403` | Caller is neither the owner nor an admin |
| `404` | Notification not found or not owned by the caller |
| `422` | Invalid query parameter |
| `500` | Unexpected error |
