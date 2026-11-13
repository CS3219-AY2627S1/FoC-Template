# api-gateway

The **single public entry point** for the platform. It routes external client
requests to the correct backend service and enforces authentication +
role-based authorization at the edge (backlog: API Gateway).

## Responsibilities (from backlog)

- **F1 Routing** — forward only the routes listed in `app/exposed_routes.py`
  (default deny; matching in `app/services/routing.py`); reject everything
  else with `404` (F1.1.1); backends are never exposed
  directly (only the gateway is published).
- **F2 Authentication** — validate the caller's session credential on every
  protected route before routing (F2.1); reject missing/malformed/expired
  (F2.1.1); validate the JWT locally using the shared `JWT_SECRET` (`HS256`),
  no call to the User Service (F2.1.2). See `app/services/auth.py`.
- **F3 Authorization (RBAC)** — derive the caller's role from the validated
  credential and forward it via trusted `X-User-Id` / `X-User-Role` headers
  (F3.1). **Client-asserted roles are stripped** (F3.1.1); admin-only routes
  are rejected for client-role callers (F3.1.2).

## How it works

`app/api/routes/proxy.py` exposes a catch-all `/api/{path:path}` proxy. It
calls `GatewayService`, which resolves the upstream from the route table,
authorizes the caller, strips client-supplied trusted headers, forwards via
`httpx`, and returns the upstream response.

## Route table

| Public prefix | Upstream service |
| ------------- | ---------------- |
| `/api/users` | user-service |
| `/api/suppliers` | supplier-service |
| `/api/orders` | order-service |
| `/api/credits` | credit-service |
| `/api/notifications` | notification-service |
| `/api/chat` | chat-service (HTTP, plus the WebSocket relay at `/api/chat/ws`) |

## Run

```bash
make up
make test-api-gateway
```

Published on host port `${GATEWAY_PORT:-8080}` → container `8000`.
Exposes `GET /health`.

## Status

Implemented. The gateway resolves routes against the default-deny allowlist
(unknown routes return `404`), validates the bearer JWT on protected routes
(missing or invalid/expired token returns `401`), strips client-supplied
trusted headers, and injects `X-User-Id` / `X-User-Role` before forwarding.
See `app/services/auth.py` and `app/api/routes/proxy.py`.

## Docs

- Architecture: [`docs/architecture.md`](docs/architecture.md)
- API contract: [`docs/api-contract.md`](docs/api-contract.md)
- Request flow: [`docs/flowchart.md`](docs/flowchart.md)
- Observability: [`../docs/observability.md`](../docs/observability.md) (edge metrics on internal port 9100)

Owner: Javier Enrique Wong.
