# CHANGE-042 — Supplier lookup authentication-race diagnosis

**Date:** 2026-09-30
**Status:** Diagnosed; frontend guard fix pending
**Scope:** Order Service frontend diagnosis and learning only

## Finding

After a hard refresh, Supplier lookup can run before Firebase finishes restoring
the signed-in user/token. The page invokes `useSupplierNames` before its
`RequireAuth` child guard, so the guard does not prevent the hook effect. The
gateway therefore returns `401 UNAUTHENTICATED`; the response's CORS headers
show that this is not a CORS problem.

## Recommended fix

Gate supplier lookup and the initial Order fetch on settled authentication and
the presence of a current user/token. Do not change Supplier Service or its API.

## Boundary

No application source, peer-service source, API contract, schema, or
infrastructure was changed in this diagnostic turn. The requested learning
file was updated and remains uncommitted by project convention.
