# CHANGE-030: Order expiry validation feedback

- Date: 2026-09-30
- Status: Implemented; frontend verification pending
- Scope: Order Service shared frontend only

## Finding

Order Service rejects create requests whose `expiresAt` is less than 30 minutes
after creation. The post-request form previously allowed a five-minute expiry,
so the user received an opaque HTTP 400 response only after submission.

## Change

- Added a shared frontend validator that mirrors the approved backend minimum.
- Added a `datetime-local` minimum value for the expiry field.
- Added inline and toast feedback explaining the 30-minute rule and the other
  create-request validation constraints.
- Added a unit test covering the 29:59 rejection and 30:00 acceptance boundary.

## Compatibility and boundary

The backend rule remains authoritative. No Order Service API, domain rule,
database schema, peer-service source, or shared gateway contract was changed.

## Verification

`git diff --check` is expected to pass. Frontend Vitest/typecheck remain pending
when Node/npm are available in the execution environment.
