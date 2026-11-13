# CHANGE-038 — HTTP peer adapter constructor injection fix

**Date:** 2026-09-30
**Status:** Implemented; Docker verification pending
**Scope:** Order Service only; no peer-service or learning files changed

## Problem

The HTTP-peer Compose run failed during Spring context initialization with:

```text
Failed to instantiate HttpPeerAdapters: No default constructor found
```

`HttpPeerAdapters` has a production URL-based constructor and a package-private
constructor used by adapter tests. With two constructors and no explicit
injection marker, Spring attempted default-constructor instantiation.

## Change

Annotated the URL-based production constructor with `@Autowired`. Spring now
injects the configured User, Supplier, and Credit URLs and builds the runtime
`RestClient` instances. The package-private test constructor remains unchanged.

## Verification

`git diff --check` passed. Maven could not run in this execution environment
because the Maven wrapper/JDK was unavailable, and Docker image verification
could not run because the local Docker Buildx configuration was inaccessible.
The developer should rebuild the HTTP-peer profile locally before claiming the
runtime smoke test passes.

## Boundaries

- No peer-service source or contract was modified.
- The two untracked files under `order-service/learning/` were left untouched.
- No adapter behavior or API contract changed; this only fixes Spring bean construction.
