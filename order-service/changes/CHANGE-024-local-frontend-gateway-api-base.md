# CHANGE-024: Local Frontend Gateway API Base URL

## Status

Completed and verified locally.

## Problem

When the frontend was opened directly at `http://localhost:3000`, its empty
`FOC_API_BASE_URL` caused browser API requests such as `POST /api/users` to be
sent to the Next.js frontend container. The frontend has no `/api/users` route,
so signup returned `404`.

## Change

The local Compose frontend now sets:

```yaml
FOC_API_BASE_URL: http://localhost:8080
```

The gateway remains the canonical API entry point. Cloud/deployed configuration
is unchanged; deployed frontend instances continue to use their gateway
origin configuration.

## Verification

- `docker compose config --quiet`: passed.
- Frontend container recreated with the new runtime configuration.
- Gateway health: HTTP 200.
- Gateway `/api/users` route: reachable (HTTP 200 for the read-only check).
- Direct frontend `/api/users` behavior is no longer relied upon.
