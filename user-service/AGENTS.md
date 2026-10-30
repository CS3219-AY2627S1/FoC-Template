# AGENTS.md — User Service

Context and rules for AI coding agents working in `user-service/`.
Humans: see `README.md`. This file is the source of truth for the rules below —
keep it updated when a rule changes.

## What this is
The User Service of Friend on Campus (FoC), a microservices monorepo
(one service per folder). Covers account creation, login/logout, profile
management, role-based access control, and OTP email verification (FR F1–F4).

## Stack (do not substitute without team agreement)
- Node.js + TypeScript, Express (REST), `@grpc/grpc-js` + `@grpc/proto-loader` (RPC)
- Prisma + PostgreSQL
- zod (validation), bcryptjs (password hashing), dotenv (config)
- Dev runner: `tsx`. Formatting: prettier (no ESLint).

## Rules
- **Use `@grpc/grpc-js`, never the deprecated `grpc` package.**
- **Roles are an enum array (`Roles[]`), never a single field.** An account can
  hold USER and ADMINISTRATOR at once.
- **Schema changes go through `prisma migrate dev`, never `db push`.**
- **No cross-service database access.** This service owns its own DB/schema; talk
  to other services over gRPC/REST only.
- **`user.created` is published through the transactional outbox, never from the
  HTTP/gRPC handler.** `register` / `bootstrapAdmin` insert `User` and a
  `user_outbox` row in one `prisma.$transaction`. Only the background dispatcher
  calls `RabbitMQClient.publishToQueue`, and only to `CREDIT_USER_QUEUE`. A
  broker outage must not fail sign-up. Delivery is at-least-once: the same
  `eventId` is retried until `published_at` is set.
- **Passwords are hashed (bcryptjs), never encrypted/decrypted.**
- **All Administrator-role changes go through `adminService`:** one transaction
  that calls `lockAdminSet` first and writes an `AdminRoleChange` row. Never
  update an admin's `roles`/`isDeleted` directly (or via Prisma Studio). The lock
  plus `ensureNotLastAdmin` is what guarantees at least one active admin under
  concurrent requests — account deletion must call `ensureNotLastAdmin` too.
- **`/health` must ping the database**, not just return 200.
- Validate all input with zod (password rules: min 8 chars, ≥1 special, ≥1
  uppercase, ≥1 numeric — F1.1.2).
- Ports: REST on `3001`, gRPC on `50051` (both configurable via `.env`).

## Structure & conventions

**Layering (request flow):** `routes → middleware (validate) → controller → service → Prisma`
- **controller** — HTTP glue only: read the request, call a service, map the
  result to a status/response. No business logic.
- **service** — business logic; transport-agnostic so it can be reused (e.g. by
  the gRPC layer).
- **No repository layer** — Prisma is the data-access layer; services call it
  directly.

**Folder layout:**
- `src/api/` = HTTP (REST) transport; `src/grpc/` = gRPC transport.
- Shared building blocks (`env.ts`, `db.ts`) live at `src/` root.
- Services live in `src/services/`, shared by both transports (moved out of
  `src/api/` once gRPC needed them). Transports import services; services never
  import transport code — except `import type` of DTO input shapes from
  `api/dto/`, which is compile-time only and accepted to avoid duplicating them.

**File naming — camelCase, resource-prefixed:** `userController.ts`,
`userService.ts`, `userRoutes.ts`, `registerDto.ts`. Generic files with no
resource keep a plain name, e.g. `validate.ts`.

**Validation / DTOs:**
- zod schemas live in `api/dto/`, applied via the reusable `validate(schema)`
  middleware (responds `400` with per-field errors).
- DTOs define the API shape and are kept separate from the Prisma model.
- **Never expose internal fields** (e.g. `passwordHash`) — use Prisma `select`
  to return only public fields.

**Errors / responses:**
- Expected outcomes use explicit status codes: `201` created, `400` validation,
  `409` conflict.
- Services return a **discriminated result** (`{ ok: true | false, ... }`) for
  business outcomes rather than throwing.
- Unexpected errors bubble up to Express's default handler (no custom global
  handler yet).

**REST:** plural-noun resources (`/users`); auth-style verb routes (`/register`,
`/login`) are an accepted exception.

## Before making architectural decisions
If you introduce a new rule or convention, add it here (with a short rationale)
so the team stays consistent.
