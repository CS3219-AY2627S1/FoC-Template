# Supplier service

The service exposes active supplier browsing plus administrator-only create,
update, and soft-delete operations.

## Local Docker setup

After configuring the backend `.env` files, run `docker compose up --build` from
the repository root. Compose supplies `http://internal-gateway` and the broker
address. The gateway is reachable on the shared Docker network, not through a
published host port. See the [gateway guide](../internal-gateway/README.md).

Application code has no address fallbacks: missing `INTERNAL_GATEWAY_URL`,
`RABBITMQ_URL`, or `DATABASE_URL` prevents startup. The gateway URL must be an
HTTP(S) origin; malformed values and URLs with credentials, paths, queries, or
fragments are rejected. Supplier does not configure or call a user-service
hostname directly. Other deployment topologies must supply reachable dependency
addresses themselves.

Protected operations forward the caller's bearer token (or `access_token`
cookie) as an Authorization header to `GET /user-api/authentication/sessions/current`
on the gateway. Nginx routes this to user-service's existing session validation
endpoint. Authentication and role checks remain unchanged; `admin` and
`admin_manager` may create, edit, and deactivate suppliers.

## Tests

```sh
uv run pytest
```
