# Internal gateway

Nginx routes HTTP calls through one configured `INTERNAL_GATEWAY_URL`:

| Gateway path           | Backend path | Compose backend         |
|------------------------| --- |-------------------------|
| `/user-api/<path>`     | `/<path>` | `user-service:5005`     |
| `/supplier-api/<path>` | `/<path>` | `supplier-service:3001` |
| `/order-api/<path>`    | `/<path>` | `order-service:3002`    |
| `/credit-api/<path>` | `/<path>` | `credit-service:3002` |
| `/health` | Gateway liveness check | No backend |

The gateway strips only the service prefix and preserves methods, query
strings, bodies, authorization headers, cookies, and upstream status codes.
Authentication and authorization remain in the services. Supplier verifies
callers through `/user-api/authentication/sessions/current`; Order and Credit uses the same
route.

## Local Docker setup

After configuring the backend `.env` files, run from the repository root:

```sh
docker compose up --build
```

Open <http://127.0.0.1:4173>. The request path is:

```text
Browser → UI nginx → internal-gateway → user-service / supplier-service / order-service / credit-service
```

The gateway listens on port 80 inside Docker and has **no published host port**
or `extra_hosts` entries. Containers on the shared Compose network reach it at
`http://internal-gateway`; browsers enter through the UI instead. No gateway
host-port settings or additional Compose files are needed.

## Demo dashboard: simulate service outages

The dashboard starts with the default local stack and lets you disable or
restore each service's **gateway route**, without stopping containers. From the
repository root:

```sh
docker compose up -d --build
```

Open <http://127.0.0.1:4180>. Toggle User, Supplier, Order, or Credit between
normal routing and simulated outage (`503 Service Unavailable`). Changes take
effect without rebuilding or reloading nginx. Other routes and the gateway's
`/health` remain available. The normal application UI stays on port 4173.

The displayed state means **routing enabled/disabled**, not backend health. An
enabled service can still be unavailable. Calls bypassing this gateway are
unaffected; service-to-service calls through it are affected, including
user-session checks. This is a demo of gateway-visible failures, not actual
container crashes, latency, or network timeouts.

The dashboard and its control API are for trusted local testing only. They have
no authentication and bind to `127.0.0.1:4180`, separately from application
routes; do not publish them externally. Production deployments must exclude
`gateway-demo` and the shared outage-flag volume mount from the gateway.
Mutations require same-origin JSON requests and accept only the four predefined
service identifiers. The controller can only write outage flags; it has no
Docker socket, command-execution API, or arbitrary nginx configuration access.
NGINX mounts the shared flag volume read-only.

Disabled routes persist in the `gateway-demo-state` named volume, including
across container restarts. Restore all routes after a demo so outages do not
carry into subsequent runs. To reset via API while the dashboard is running:

```sh
for service in user supplier order credit; do
  curl --fail --request PUT "http://127.0.0.1:4180/api/services/$service" \
    --header 'Origin: http://127.0.0.1:4180' \
    --header 'Content-Type: application/json' --data '{"enabled":true}'
done
```

Use normal `docker compose` commands to manage the whole stack. Avoid
`docker compose down --volumes` on the application stack as a reset shortcut:
it also deletes application database/message-broker volumes.

## Configuration boundary

- Compose supplies service names and Docker DNS for this local topology.
  Application code does not assume localhost or silently choose a gateway.
- Callers configure `INTERNAL_GATEWAY_URL`. Only the gateway configures
  `USER_SERVICE_UPSTREAM`, `SUPPLIER_SERVICE_UPSTREAM`, `ORDER_SERVICE_UPSTREAM` and
  `CREDIT_SERVICE_UPSTREAM`; these must be origins without path prefixes or
  trailing slashes.
- The nginx images require their runtime URL and resolver settings. Supplier, Order and Credit also refuse to start without their required gateway/dependency
  configuration.
- `NGINX_DNS_RESOLVER` is deployment configuration; Compose supplies Docker's
  embedded resolver. The gateway resolves peers dynamically, so it can start
  without them and discover recreated containers without a reload.
- `/health` checks nginx itself using loopback inside the container. It does
  not prove backend readiness or network reachability.
- RabbitMQ and databases are separate dependencies, not gateway routes.

Root overrides are documented in [`.env.example`](../.env.example). Deployment
to separate machines needs its own reachable addresses, networking, and security
rules; that topology is outside this local Compose configuration.

## Troubleshooting UI 502s

Inspect the proxy logs and gateway network attachment:

```sh
docker compose logs --tail=50 ui internal-gateway
docker inspect "$(docker compose ps -q internal-gateway)" \
  --format '{{json .NetworkSettings.Networks}}'
curl -f http://127.0.0.1:4173/user-api/health
```

`internal-gateway could not be resolved` indicates a service-discovery problem.
The gateway must be on the same network as the UI; an empty network map (`{}`)
is not normal. If needed, recreate just the gateway:

```sh
docker compose up -d --no-deps --force-recreate internal-gateway
```

Allow a few seconds for cached Docker DNS records to expire after recreation.
`docker compose ps` showing `80/tcp` without a host mapping is expected.

## Routing tests

With Docker Compose and Python installed, run from the repository root:

```sh
python3 -m unittest discover -s internal-gateway/tests -v
```

Tests use an isolated Compose project with echo backends and a random loopback
UI port, then remove its containers and network. They cover an unpublished
gateway, backend-independent startup, missing runtime settings, routing through
the UI and gateway, prefix stripping, request/cookie forwarding, upstream
statuses, rejected gateway routes, and SPA fallback. They also exercise the
dashboard API, per-service outage/restoration for all four routes, isolation
between routes, still-running backends, gateway liveness during outages, and
rejection of unsafe control requests. No application secrets, databases, or
RabbitMQ are needed.
