<!--
AI Assistance Disclosure
Tool: GitHub Copilot, date: 2026-10-20
Scope: Document Gateway as a routing-only proxy that forwards auth to owning services.
Author review: Review pending.
-->

# API Gateway

## At a glance

This gateway is the entry point for frontend traffic in FoC. It routes requests to downstream services; each service validates authentication and authorization for its own endpoints.

It currently proxies requests to:

- User Service: `http://localhost:3002`
- Supplier Service: `http://localhost:3001`

This service is built with:

- TypeScript
- Node.js
- Express
- http-proxy-middleware
- CORS

## 1. Base URL

- http://localhost:8080

## 2. Routing behavior

### Forwarded routes

The gateway forwards these routes without validating credentials. Authentication and authorization are enforced by the owning service:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/credit/wallet/:user_id`
- `GET /api/credit/tx/:user_id`

- `POST /api/auth/logout`
- `GET /api/users/*`
- `PATCH /api/users/*`
- `POST /api/users/*`
- `DELETE /api/users/*`
- `GET /api/suppliers/*`
- `POST /api/suppliers/*`
- `PATCH /api/suppliers/*`
- `DELETE /api/suppliers/*`

### Notes

- The gateway forwards the `Authorization` header to downstream services.
- It adds or forwards `x-request-id` for request tracing.
- If a downstream service is unavailable, the gateway returns `502 Bad Gateway`.
- Credit wallet and transaction reads require a Bearer token whose user ID matches `:user_id`.

## 3. Quick start

From this folder, run:

```bash
npm install
npm run dev
```

You can verify the gateway is up with:

```bash
curl http://localhost:8080/health
```

Expected response:

```json
{
  "status": "UP",
  "service": "api-gateway"
}
```

## 4. Run the Gateway container independently

Start the User and Supplier Services separately and make sure they publish host ports `3002` and `3001`. Then, from this directory, run:

```bash
docker compose up --build
```

The standalone Compose file routes from the Gateway container to those host-published ports through `host.docker.internal`. Do not run it at the same time as the root Compose stack, which also binds port `8080`.

## 5. Required environment variables

Typical `.env` values:

```env
PORT=8080
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:5173
USER_SERVICE_URL=http://localhost:3002
SUPPLIER_SERVICE_URL=http://localhost:3001
```

Important:

- `FRONTEND_ORIGIN` must match the frontend origin allowed by CORS

## 6. Auth flow

The gateway does not validate JWTs or attach user identity headers. It forwards requests, including `Authorization`, and the receiving service decides whether the route requires authentication and which roles are allowed.

## 7. Example requests

### Login via gateway

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "alice",
    "password": "supersecurepassword123"
  }'
```

### Get current user profile via gateway

```bash
curl http://localhost:8080/api/users/me \
  -H "Authorization: Bearer <access-token>"
```

### Logout via gateway

```bash
curl -X POST http://localhost:8080/api/auth/logout \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<refresh-token>"
  }'
```

## 8. Production notes

- Run the gateway in the same network environment as the backend services.
- Ensure `USER_SERVICE_URL` and `SUPPLIER_SERVICE_URL` match the actual service addresses.
- Keep the gateway as the only externally exposed backend entry point for the frontend.

## 9. Collaboration notes

Use this checklist when you want to register a new backend service into the gateway. The goal is to make the service reachable via the gateway without changing the frontend to call the service directly.

### Step 1: Make sure the service is running on its own port

- Start the new service in its own folder.
- Confirm it listens on a dedicated port, such as `http://localhost:3004`.
- Verify it responds on its health endpoint or a simple test route before wiring it into the gateway.

### Step 2: Add the service URL to the gateway environment

Update the gateway `.env` file and add a new target URL:

```env
ORDER_SERVICE_URL=http://localhost:3004
```

This is the address the gateway will proxy to.

### Step 3: Add the config field in the gateway

In `src/config/env.ts`, add a matching property:

```ts
orderServiceUrl: process.env.ORDER_SERVICE_URL ?? "http://localhost:3004",
```

This makes the value available to the rest of the gateway code.

### Step 4: Create a proxy for the service

In `src/server.ts`, create a proxy function for the new service's route prefix:

```ts
const orderServiceProxy = createJsonProxy(
  env.orderServiceUrl,
  (path) => path.startsWith("/api/orders")
);
```

Then mount it in the gateway:

```ts
app.use(orderServiceProxy);
```

### Step 5: Protect routes in the owning service

Add the service's own authentication and authorization middleware to protected routes. Keep public routes unprotected in that service.

### Step 6: Keep the route path consistent

The gateway should expose the route at a gateway URL, not the service's raw internal port.

Example:

- Service URL: `http://localhost:3004/api/orders`
- Gateway URL: `http://localhost:8080/api/orders`

The frontend should call the gateway URL only.

### Step 7: Validate the route through the gateway

Run the gateway and the service together, then test the route from the gateway:

```bash
curl http://localhost:8080/api/orders \
  -H "Authorization: Bearer <token>"
```

Check:

- correct HTTP status
- auth middleware applied
- request is forwarded correctly
- response matches the service contract

### Step 8: Document the new route

Add to the service README and the gateway README:

- route path
- auth requirement
- request body
- response body
- example curl command

This ensures the next person can register another service without reverse-engineering the gateway.

### Minimal example

If the new service is `order-service` and the route is `POST /api/orders`, the minimum registration flow is:

1. Start `order-service` on `http://localhost:3004`
2. Add `ORDER_SERVICE_URL=http://localhost:3004` in gateway `.env`
3. Add `orderServiceUrl` in `src/config/env.ts`
4. Add this to `gateway/src/server.ts`:

```ts
const orderServiceProxy = createJsonProxy(
  env.orderServiceUrl,
  (path) => path.startsWith("/api/orders")
);

app.use(orderServiceProxy);
```

5. Test with `http://localhost:8080/api/orders`

This is the standard pattern for adding a service into the gateway.
