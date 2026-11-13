# CHANGE-023: Temporary Local MongoDB Compose Dependency

## Status

Completed for local development; live peer-service, authenticated browser, and
Cloud Run verification remain pending.

## Reason

The approved frontend vertical slice calls User Service through the local
gateway. The existing User Service Compose block expected a peer-provided
`MONGODB_URI`, so the local stack could not be exercised end to end. The user
approved a temporary MongoDB dependency in shared Compose and explicitly
forbade changes to the User Service source or sibling service configuration.

## Change

- Added `user-mongodb` using the official `mongo:7` image.
- Defaulted User Service to the internal URI
  `mongodb://user-mongodb:27017/userservice`; `MONGODB_URI` remains overridable
  for a managed or peer-provided database.
- Added health-gated Compose startup for User Service.
- Exposed MongoDB on configurable host port `27018` by default to avoid a
  collision with an existing local MongoDB installation; container-to-container
  traffic continues to use port `27017`.
- Added the `user-mongodb-data` named volume.
- Did not modify any file under `user-service/` and did not add an Admin Service
  Dockerfile. Admin Service remains intentionally outside this local slice.

## Classification and approval

This is a local infrastructure implementation detail within the approved
Compose workflow, not a production User Service database decision. The user
approved the temporary MongoDB addition and the exclusion of Admin Service for
this task on 2026-09-30.

## Verification

- `docker compose config --quiet`: passed.
- `docker compose up -d user-mongodb user-service gateway`: passed after changing
  the default host mapping from conflicting `27017` to `27018`.
- `docker compose ps -a`: MongoDB, User Service, gateway, frontend, Order,
  Credit, Supplier, PostgreSQL, and Firebase containers healthy/running.
- User Service readiness returned HTTP 200.
- Gateway reached healthy status; its root actuator URL is not an exposed
  public route and is not used as the health verdict.

## Remaining verification

- Authenticated browser flows with Firebase emulator credentials.
- Live peer contract and authorization verification.
- Cloud Run deployment and Cloud SQL runtime connectivity.
