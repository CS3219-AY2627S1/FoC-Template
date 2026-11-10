# API Gateway API Contract

This contract describes the public API gateway boundary. Backend services own
the detailed request and response schemas for the routes being proxied.

## Endpoint overview

| Area | Methods | Public route prefix | Upstream route prefix | Authentication | Body handling |
| --- | --- | --- | --- | --- | --- |
| Health | `GET` | `/health` | Gateway-owned | None | Gateway returns health payload |
| User service | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` | `/api/users/...` | `/users/...` | Public auth routes or JWT | Forwarded unchanged |
| Supplier service | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` | `/api/suppliers/...` | `/suppliers/...` | JWT | Forwarded unchanged |
| Order service | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` | `/api/orders/...` | `/orders/...` | JWT | Forwarded unchanged |
| Credit service | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` | `/api/credits/...` | `/credits/...` | JWT | Forwarded unchanged |
| Notification service | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` | `/api/notifications/...` | `/notifications/...` | JWT | Forwarded unchanged |
| Chat service | `GET`, `POST`, `HEAD` | `/api/chat/...` | `/chat/...` | JWT | Forwarded unchanged |
| Chat WebSocket | WebSocket upgrade | `/api/chat/ws` | `/chat/ws` | One-time ticket (see below) | Frames relayed both ways |

The per-area method set above is the superset the proxy will accept, not the
authoritative allowlist. The actual (method, path) pairs the gateway forwards
are defined in `app/exposed_routes.py` (default deny), which currently defines
no `PUT` route; any `PUT` request therefore returns `404`.

## Path forwarding

The gateway removes the public `/api` prefix before forwarding requests:

```text
Client request:  /api/users/register
Forwarded request: /users/register
```

Query parameters, request bodies, and supported HTTP methods are forwarded to
the selected upstream service.

## Authentication contract

### Public routes

The following routes do not require a bearer token:

| Route | Purpose |
| --- | --- |
| `/health` | Gateway health check |
| `/api/users/register` | Register a user |
| `/api/users/login` | Log in |
| `/api/users/otp/verify` | Verify email OTP |
| `/api/users/otp/resend` | Resend email OTP |
| `/api/users/password/forgot` | Request a password reset |
| `/api/users/password/reset` | Reset password with token |

### Protected routes

All other `/api/...` routes require:

```http
Authorization: Bearer <jwt-token>
```

The JWT must contain:

```json
{
  "sub": "user-id",
  "role": "client",
  "exp": 1790000000
}
```

The gateway validates the JWT using `HS256`, `JWT_SECRET`, and the required
`sub`, `role`, and `exp` claims.

After successful validation, the gateway injects trusted identity headers:

```http
X-User-Id: user-id
X-User-Role: client
```

The gateway removes client-supplied `Authorization`, `X-User-Id`, and
`X-User-Role` headers before forwarding, then adds the validated identity
headers.

## WebSocket relay

WebSocket routes are not authenticated by the gateway. The backend authenticates
the handshake itself: the client first calls the JWT-protected
`POST /api/chat/ws-ticket` and then connects to `/api/chat/ws?ticket=<ticket>`.
chat-service redeems the ticket once, within 30 seconds.

Once open, frames of up to 1 MiB are relayed both ways (a larger client frame closes
the socket with `1009`), and the backend's close code is passed to the client. A
close without a code becomes `1000`; codes a server may not send become `1011`.


## Gateway-owned responses

### Health check

```http
GET /health
```

Success response — `200 OK`:

```json
{
  "status": "ok"
}
```

### Unknown route

Response — `404 Not Found`:

```json
{
  "code": "not_found",
  "message": "No route for this path."
}
```

### Missing or invalid token

Response — `401 Unauthorized`:

```json
{
  "code": "unauthorized",
  "message": "Missing bearer token."
}
```

For an invalid or expired token, the message is:

```json
{
  "code": "unauthorized",
  "message": "Invalid or expired token."
}
```

### Upstream unavailable

Response — `502 Bad Gateway`:

```json
{
  "code": "bad_gateway",
  "message": "Upstream service unavailable."
}
```

## CORS contract

Allowed browser origins are configured with:

```env
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

Multiple origins are comma-separated:

```env
CORS_ALLOWED_ORIGINS=http://localhost:5173,https://example.com
```

The gateway allows all configured methods and headers, but does not enable
credentialed cookies.

## Upstream service configuration

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `USER_SERVICE_URL` | `http://user-service:8000` | User-service upstream |
| `SUPPLIER_SERVICE_URL` | `http://supplier-service:8000` | Supplier-service upstream |
| `ORDER_SERVICE_URL` | `http://order-service:8000` | Order-service upstream |
| `CREDIT_SERVICE_URL` | `http://credit-service:8000` | Credit-service upstream |
| `NOTIFICATION_SERVICE_URL` | `http://notification-service:8000` | Notification-service upstream |
| `CHAT_SERVICE_URL` | `http://chat-service:8000` | Chat-service upstream (HTTP and WebSocket) |
| `JWT_SECRET` | Empty | Shared JWT signing secret |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Allowed browser origins (also the WebSocket `Origin` allowlist) |
