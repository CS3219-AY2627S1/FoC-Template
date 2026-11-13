# CHANGE-026 — Gateway CORS header deduplication

- **Date:** 2026-09-30
- **Status:** Implemented; runtime browser verification pending
- **Approver:** Vincent, 2026-09-30 (approval of local gateway CORS)

## Discovery

The browser reported multiple `Access-Control-Allow-Origin` values for
`http://localhost:3000`. The gateway emitted the approved local allowlist header while peer
services also emitted their own CORS headers. Browsers reject duplicate allow-origin values,
which caused the signup request to appear as `TypeError: Failed to fetch` after the User Service
returned `201 Created`.

## Change

The gateway remains the single browser CORS boundary. Its proxy snippet now hides upstream CORS
headers before the gateway's allowlisted headers are added. Peer service source/configuration was
not modified. The Firebase emulator `501 passwordPolicy` messages are separate emulator behavior;
the blocking signup failure was the duplicate gateway/peer CORS response.

## Verification

`git diff --check` and `docker compose config --quiet` passed. Rebuild the gateway and retry signup
with an authenticated browser when Docker is available; confirm one
`Access-Control-Allow-Origin: http://localhost:3000` header and successful Credit registration.
