# Errand Service

Relay's errand catalogue and requester/courier lifecycle.

- `frontend/`: React Module Federation remote, served under `/remotes/errand/`.
- `backend/`: Express API, PostgreSQL/Prisma persistence, lifecycle workers,
  and a UserDeleted consumer.
- `event-publisher/`: separate process that publishes transactional outbox events.

Run `npm ci` once, then `npm run dev` from the repository root with Docker
running. Open http://localhost:8080. Source development uses frontend port
5003 and API port 3002; container API traffic uses port 3000 internally.
Use `npm run up:compose` for the full container environment, or `npm run up:eks`
for local Kubernetes. See the [local guide](../floci/README.md).

The API validates users and suppliers, reserves credits through Credit Service,
and records lifecycle events in its database transaction. Credit settles or
releases reservations from those events. A separate notification service
broadcasts errand events to browsers using SSE. Credit estimation is called
through Errand's authenticated recommendation route.

See the [backend guide](backend/README.md) for outbox behavior, account-deletion
handling, the profile audit, and regression tests. The [load-test guide](../load-tests/README.md)
covers lifecycle, core correctness, and read/write load scenarios.
