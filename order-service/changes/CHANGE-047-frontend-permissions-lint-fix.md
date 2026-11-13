# CHANGE-047 — Fix frontend supplier-permissions lint failure

**Date:** 2026-09-30
**Status:** Implemented; local npm verification unavailable
**Scope:** Shared frontend authentication/permission hook

## Finding

Frontend CI stopped at `npm run lint` because
`frontend/src/hooks/use-supplier-permissions.ts` called
`setPermissions(null)` synchronously inside an effect. The
`react-hooks/set-state-in-effect` rule treats that pattern as a cascading
render risk.

## Implementation

The hook now stores the Firebase UID together with the fetched permissions and
only exposes a result when it belongs to the currently signed-in UID. This
preserves the previous fail-closed behavior during auth loading and account
changes without a synchronous state update in the effect. Async success and
failure handling remains unchanged.

## Boundary

Only the shared frontend hook was changed. No peer-service source, backend
contract, gateway, deployment configuration, or learning file was modified.

## Verification

`git diff --check` passes. The local environment does not provide `node` or
`npm`, so `npm run lint`, Vitest, typecheck, and the production build could not
be executed here. CI must confirm that the error is gone; the existing unused
variable/import findings remain warnings rather than lint errors.
