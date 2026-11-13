# CHANGE-080: Remove retired Mongo helper after Compose merge

- Date: 2026-10-08
- Developer: Yao Xiang, Developer 1
- Status: Implemented; base and HTTP-peer Compose validation pass locally; hosted CI rerun pending
- Approval: user explicitly requested the CI repair and directed preservation of main's peer-owned User Service configuration
- Scope: shared compose.yaml cleanup only; no sibling service source or CI workflow changed

## Problem and resulting behavior

The merge retained main's mongodb service, mongodb-data volume and UserServiceDB URI, but left the earlier Order-branch user-mongodb helper in services. Its user-mongodb-data volume was no longer declared. Compose rejected the project after CI created the empty ADC placeholder; touch and Pub/Sub credentials were not the cause.

Remove the obsolete helper and its temporary-dependency comment. Main's mongodb and user-service blocks remain identical to origin/main. Order's PostgreSQL service, volume, credentials mount, topics and schedulers remain unchanged. No database migrations or API/event contracts change. Existing Docker volumes are not deleted. This is an implementation cleanup under the approved deployment design, not a new architecture decision.

## Verification

- Reproduced the original config failure with exit code 1 and the exact undefined user-mongodb-data volume error.
- Used an empty temporary ADC file and a temporary --env-file for static Compose validation; no real credentials, containers, or cloud publishing were used.
- Base compose.yaml config --quiet: exit code 0.
- compose.yaml plus compose.http-peers.yaml config --quiet: exit code 0.
- Parsed normalized Compose JSON: nine services, exactly firebase-data/mongodb-data/order-postgres-data, and no undeclared named volume references.
- Exact block comparisons confirm main's MongoDB/User Service and the existing Order Service/PostgreSQL blocks are preserved.
- git diff --check passes. The local Docker CLI emitted a configuration-file permission warning; static Compose checks still completed successfully via the directly invoked Compose executable.
- No application behavior changed, so Maven/frontend suites were not rerun. Hosted CI and live container startup remain unverified.

## Records and next step

Current sprint, change log, Yao Xiang active work and AI disclosure record the repair. Commit/push this change and rerun the existing repository-checks job; the CI workflow and placeholder credential handling remain valid.
