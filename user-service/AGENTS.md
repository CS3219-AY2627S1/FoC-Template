<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus), dates: 2026-09-25 – 2026-10-19
Scope: AI drafted and updated the stack, conventions and design notes at the
author's request.
Author review: Author reviewed and approved each update. See
user-service/ai/usage-log.md, entries 001, 004, 008, 009, 016, 021.
-->

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
- **User events are published through the transactional outbox, never from the
  HTTP/gRPC handler.** The change and its `user_outbox` row go in one
  `prisma.$transaction`: `completeRegister` / `bootstrapAdmin` queue `user.created` to
  `CREDIT_USER_QUEUE`, `deleteAccount` queues `user.deleted` to
  `QUEUES.orderUser`, and a restoring `completeRegister` queues `user.restored` to
  `CREDIT_USER_QUEUE` with `deleteOnPublish`, so the row linking old and new
  ids is deleted once delivered. Only the background dispatcher calls
  `RabbitMQClient.publishToQueue`. A broker outage must not fail sign-up or
  deletion. Delivery is at-least-once: the same `eventId` is retried until
  `published_at` is set.
- **Passwords are hashed (bcryptjs), never encrypted/decrypted.**
- **All Administrator-role changes go through `adminService`:** one transaction
  that calls `lockAdminSet` first and writes an `AdminRoleChange` row. Never
  update an admin's `roles` directly (or via Prisma Studio). The lock
  plus `ensureNotLastAdmin` is what guarantees at least one active admin under
  concurrent requests — account deletion must call `ensureNotLastAdmin` too.
- **`/health` must ping the database**, not just return 200.
- Validate all input with zod (password rules: min 8 chars, ≥1 special, ≥1
  uppercase, ≥1 numeric — F1.1.2).
- Ports: REST on `3001`, gRPC on `50051` (both configurable via `.env`).
- **OTP state lives in Redis, not Postgres.** Codes expire (2 minutes), are
  single-use, and a new request overwrites the previous one. Keys are
  `register:{sha256(email)}` / `reset:{sha256(email)}` (`:record`, `:requests`,
  `:attempts`; register also has `:pending`). Client: `src/redis.ts`.
- **OTP HTTP routes match `userRoutes.ts`.** There is no generic `/users/otp`.
  HTTP register is OTP-gated and public: `initiateRegister` / `completeRegister`
  (pending signup in Redis, challenge `'register'`). Admin bootstrap is
  `bootstrapAdmin` (`buildNewUser` + outbox), not an immediate HTTP register.
  Password reset is logged-in only (`/reset-password/request` then
  `/reset-password/verify`), uses `RESET_CHALLENGE` (`'reset'`), and takes the
  email from the session, never the body. There is no logged-out
  forgot-password route; `requestForgotPassword` is kept but deprecated.
- **A pending signup is only replaced by the same password.** `initiateRegister`
  claims `:pending` with `SET NX`; a later request for that email must pass a
  bcrypt check against the stored hash, otherwise `409`. Without this, anyone
  could overwrite the pending signup with their own password and the owner
  would create the account for them by entering the code.
- **The OTP key is a local file, same pattern as the JWT keys.** `npm run keys:otp`
  writes `keys/otp.key` (git-ignored). Boot reads `OTP_HMAC_KEY_PATH`, decodes the
  32-byte key, and refuses to start if it is missing. OTPs are HMAC-SHA256 hashed
  with that key before they are stored in Redis — the plaintext code is never
  persisted.

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
- `src/jobs/` = background timers (e.g. the daily archive purge). Services never
  start timers themselves.
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
