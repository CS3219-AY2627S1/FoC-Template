# CHANGE-019: Shared-File and Peer-Service Boundary

## Status

Implemented as a local workflow rule on 2026-09-30.

## Decision

- Sibling microservice directories are read-only during Order Service work.
- Shared files may receive only the smallest Order Service-specific additions.
- Peer-owned shared configuration must be preserved.
- If incompatible peer configuration blocks local Order Service startup, only the
  incompatible line/block may be commented out, with a restoration condition; it
  must not be deleted or rewritten.
- Atomic commits separate Order Service code, shared-file additions, and workflow/
  disclosure changes.

## Restoration applied in this turn

- Removed the previously added local MongoDB service/default because it was a
  User Service-specific change and was not required by Order Service.
- Restored the existing User Service `MONGODB_URI` Compose wiring and example value.
- Retained only the Order Service Dockerfile, PostgreSQL service, Order Service
  Compose block, ports, health checks, and related local variables.

## Verification

- Peer service folders were not modified.
- Compose syntax remains valid after restoration.
- Existing peer-owned User Service configuration remains unchanged.
