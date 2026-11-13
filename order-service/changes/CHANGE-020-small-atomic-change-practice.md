# CHANGE-020: Small Atomic Git Change Practice

## Request

Persist a small-size atomic Git practice for every Order Service file change and
reconfirm the peer-preserving local Compose boundary after the earlier restoration.

## Reason

The Order Service is developed alongside peer-owned services and shared root
configuration. Small explicit commits make review, rollback, handoff, and
peer-change preservation auditable without bundling unrelated work.

## Scope and decisions

- Sibling service directories remain read-only unless separately authorized.
- Shared files may receive only the smallest Order Service-specific addition.
- A genuinely incompatible peer block may only be commented out with an
  explanatory restoration condition; peer code and configuration must not be
  deleted or rewritten.
- Each commit contains one coherent concern. Source/configuration, tests or
  migrations, shared-file additions, workflow/docs, and AI disclosure are split
  when they are independent. Multi-file commits are allowed only when the files
  form one inseparable concern.
- Explicit-path staging, staged diff review, `git diff --cached --check`, and the
  smallest applicable deterministic check are required before each commit.
- The commit hash is recorded in the relevant change record or active-work
  handoff. Unfinished work remains explicitly uncommitted and reported.

## Restoration and local-stack review

The earlier restoration retained the existing peer User Service/MongoDB Compose
configuration and the Order Service-specific PostgreSQL/Compose additions. No
sibling service folder was modified. The current root Compose file remains the
local full-stack entry point; the empty `admin-service/` placeholder is not a
running container until that peer service supplies a non-empty Dockerfile and a
Compose block.

## Verification

- `docker compose config --quiet` passed (with the expected warning that
  `MONGODB_URI` is unset unless a local `.env` supplies it).
- The configured Compose services were enumerated and include `order-postgres`,
  `order-service`, the existing peer services, frontend, gateway, and the Firebase
  emulator.
- The Docker daemon was unavailable in this environment, so image builds, startup,
  health checks, and peer MongoDB connectivity remain unverified.
- No sibling service directory was changed.

## Reversal

Revert the workflow-only commit(s) for this change if the team adopts a different
commit policy. Do not revert the earlier peer-preserving Compose restoration as
part of this workflow change.
