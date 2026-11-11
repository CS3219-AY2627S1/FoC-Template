---
name: User Service Plan
overview: Implement the Friends on Campus User Service in Node.js/Express with Prisma/PostgreSQL, within user-service only, under requirements and architecture finalized by Josh Wang Kai Kiat.
todos:
  - id: accounts
    content: Implement signup, opaque sessions, login, profiles, status and authorization
    status: completed
  - id: verification
    content: Implement email and Telegram verification, password recovery and SES delivery
    status: completed
  - id: lifecycle
    content: Implement account lockout, deletion scheduling/cancellation/finalization and lifecycle events
    status: completed
  - id: admin
    content: Implement first-admin bootstrap, user administration, reports and suspension appeals
    status: completed
  - id: friendships
    content: Implement private bidirectional friendship requests, actions, listing and filtering
    status: completed
  - id: hardening
    content: Add OpenAPI, unit/integration tests, Docker/config and concise documentation
    status: completed
isProject: false
---

# User Service — requirements and implementation plan

Scope is [`user-service/`](../../user-service/) only. Frontend, gateway,
infrastructure, Admin, Order, Credit and other services are integration
handoffs and are not part of this implementation plan.

## Already decided by author (Josh Wang Kai Kiat)

- **Stack and data:** Node.js 20, Express, TypeScript, Prisma and PostgreSQL.
- **Authentication:** opaque bearer sessions stored as hashes; salted
  `scrypt` password hashes; server-enforced account availability and lockout.
- **Verification/recovery:** email OTP and Telegram verification; SES email;
  expiring password-reset tokens and session revocation rules.
- **Account lifecycle:** Created, Verified and Suspended presentation states;
  six-calendar-month scheduled deletion cancelled by successful login;
  atomic final deletion plus durable `UserDeleted` outbox.
- **Administration:** deployment-only first-admin bootstrap; persisted search,
  role/status changes and audit; User validates and relays reports/appeals to
  Admin without owning Admin records.
- **Friendships:** private request/accept/reject/remove flow; accepted relation
  visible to both users; minimal ID/name disclosure; optional friend-name
  filtering.
- **Integration:** internal authorization and Telegram lookup routes; Kafka
  lifecycle events; strict DTO validation and sanitized dependency failures.

## What OpenAI Codex may implement under that design

Routes, services, validation, Prisma schema/migration drafts, tests,
OpenAPI, Docker/Compose and configuration boilerplate, debugging fixes,
refactoring, and documentation wording—without changing service boundaries,
interfaces, schema decisions or security/performance trade-offs.

Applied Prisma migration SQL files are not given in-file headers; see
[`user-service/prisma/migrations/AI_ASSISTANCE.md`](../../user-service/prisma/migrations/AI_ASSISTANCE.md).
