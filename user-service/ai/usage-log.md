# AI usage log: User Service

## 036: OTP email through Amazon SES with IRSA (EKS)

- **Timestamp:** 2026-11-11 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus 5.5.
- **Mode/scenario:** Making OTP email work on EKS, with a pivot from SES SMTP credentials to the SES API with IRSA.
- **Prompts:** [prompts/036-ses-email-irsa.md](prompts/036-ses-email-irsa.md).
- **Key response:** Explained that `emailServer.ts` only worked with local Mailpit, and planned configurable SMTP settings. Checked SES account status and DMARC policies (`u.nus.edu` rejects spoofed senders, so the sender is a verified Gmail address). When the sandbox blocked IAM user creation, switched to the SES API through the AWS SDK, with credentials from an eksctl-created service-account role (IRSA) restricted to sending as the verified address.
- **Affected locations:** `user-service/src/env.ts`, `user-service/src/api/middleware/emailServer.ts`, `user-service/package.json`, `package-lock.json`, `user-service/compose.yaml`, `user-service/compose.override.yaml`, `k8s/eks/cluster.yaml`, `k8s/user-service/user-service.yaml`, `k8s/user-service/user-config.yaml`.
- **Checks:** `tsc --noEmit` passed; `kubectl kustomize` rendered; local end-to-end test (register → SES email received at NUS address → verify → login) passed. EKS test pending.
- **Human review/edits:** Author chose SES over Gmail SMTP, verified the SES identities, asked why the IRSA setup works, reviewed the change, ran the local end-to-end test and approved.
- **External sources:** Nodemailer SES transport type definitions (`node_modules/nodemailer/dist/esm/ses-transport/index.d.ts`, v10.5) for the `{ sesClient, SendEmailCommand }` option; DMARC DNS records for `u.nus.edu`, `nus.edu.sg` and `gmail.com` (`dig TXT _dmarc.<domain>`).

## 035: Block pending signup overwrite (OTP review)

- **Timestamp:** 2026-11-11 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus 5.5.
- **Mode/scenario:** Review of `initiateRegister` (PR #112), then a security fix.
- **Prompts:** [prompts/035-pending-signup-overwrite.md](prompts/035-pending-signup-overwrite.md).
- **Key response:** Found that the OTP was sent before the pending signup was stored, and that another request for the same email could overwrite the pending signup with a different password (account takeover). Recommended claiming it with `SET NX` and letting only the same password resend; explained why the password is the check.
- **Affected locations:** `user-service/src/services/userService.ts`, `user-service/src/api/controllers/userController.ts`.
- **Checks:** `tsc --noEmit` passed. Manual test pending.
- **Human review/edits:** Author confirmed the attack scenario, chose the same-password check over a per-signup challenge ID, reviewed the change and approved.
- **External sources:** node-redis `SetOptions` type definitions (`@redis/client`, `lib/commands/SET.d.ts`) for the `NX` syntax.

## 033: README update for recent workflows

- **Timestamp:** 2026-11-02 (Asia/Singapore).
- **Tool/model:** OpenAI Codex; model identifier is not exposed in this session.
- **Mode/scenario:** Documentation update for recent author-specified account and cross-service workflows.
- **Prompts:** [prompts/033-readme-recent-changes.md](prompts/033-readme-recent-changes.md).
- **Key response:** Documented account deletion, archived-account restoration, archive purging, and Order Service deletion eligibility in the User Service README and root AI summary.
- **Affected locations:** `user-service/README.md`, `README.md`.
- **Checks:** `git diff --check` passed.
- **Human review/edits:** Author reviewed the changes line by line, manually
  tested and confirmed the behaviour, approved the implementation.
- **External sources:** None.

## 032: Deletion eligibility service disclosure

- **Timestamp:** 2026-11-02 (Asia/Singapore).
- **Tool/model:** OpenAI Codex; model identifier is not exposed in this session.
- **Mode/scenario:** Added the disclosure header to the moved Order Service service-layer logic.
- **Prompts:** [prompts/032-deletion-eligibility-service-header.md](prompts/032-deletion-eligibility-service-header.md).
- **Key response:** Added a comprehensive AI disclosure header to `deletionEligibility.ts`.
- **Affected locations:** `order-service/grpc/src/services/deletionEligibility.ts`.
- **Checks:** `git diff --check` pending.
- **Human review/edits:** Author reviewed the changes line by line, manually
  tested and confirmed the behaviour, approved the implementation.
- **External sources:** None.

## 031: Order deletion eligibility gRPC

- **Timestamp:** 2026-11-02 (Asia/Singapore).
- **Tool/model:** OpenAI Codex; model identifier is not exposed in this session.
- **Mode/scenario:** Implementation of an author-specified cross-service gRPC eligibility check.
- **Prompts:** [prompts/031-order-deletion-eligibility-grpc.md](prompts/031-order-deletion-eligibility-grpc.md).
- **Key response:** Added the Order Service gRPC contract, database-backed blocked-order count, User Service client wiring, and missing-argument/internal-error mappings. Existing stub behavior was replaced; no event behavior was changed.
- **Affected locations:** `shared/grpc/proto/order.proto`, `shared/grpc/src/clients.ts`, `order-service/grpc/src/grpc/server.ts`, `user-service/src/env.ts`, `user-service/src/services/userService.ts`, `user-service/package.json`.
- **Checks:** `npm run grpc:generate`, shared gRPC build, Order Service build, User Service build, `npm install --package-lock-only --ignore-scripts`, and `git diff --check` passed.
- **Human review/edits:** Author reviewed the changes line by line, manually
  tested and confirmed the behaviour, approved the implementation.
- **External sources:** None.

## 030: Archived user purge job

- **Timestamp:** 2026-11-02 (Asia/Singapore).
- **Tool/model:** OpenAI Codex; model identifier is not exposed in this session.
- **Mode/scenario:** Implementation of an author-specified scheduled cleanup job.
- **Prompts:** [prompts/030-archived-user-purge-job.md](prompts/030-archived-user-purge-job.md).
- **Key response:** Added expired `ArchivedUser` deletion at startup and on a 24-hour interval, with no `user.purged` event.
- **Affected locations:** `user-service/src/jobs/archivePurge.ts`, `user-service/src/index.ts`.
- **Checks:** Pending.
- **Human review/edits:** Author reviewed the changes line by line, manually
  tested and confirmed the behaviour, approved the implementation.
- **External sources:** None.

## 027: User restoration workflow

- **Timestamp:** 2026-11-02 (Asia/Singapore).
- **Tool/model:** OpenAI Codex; model identifier is not exposed in this session.
- **Mode/scenario:** Implementation of an author-specified registration restore workflow.
- **Prompts:** [prompts/027-user-restored-workflow.md](prompts/027-user-restored-workflow.md).
- **Key response:** Added `confirmRestore`, archived-email detection after duplicate checks, restore confirmation response, `buildUserRestored`, `enqueueUserRestored`, and transactional selection between `user.created` and `user.restored`.
- **Affected locations:** `user-service/src/api/dto/registerDto.ts`, `user-service/src/api/controllers/userController.ts`, `user-service/src/services/userService.ts`, `user-service/src/events/userRestored.ts`, `user-service/src/events/outboxStore.ts`.
- **Checks:** `npm run build --workspace user-service` and `git diff --check` passed. Author manually tested the user restoration behavior.
- **Human review/edits:** Author reviewed the changes line by line, manually tested the behavior successfully, and approved the implementation.
- **External sources:** None.

## 026: Enqueue user.deleted event

- **Timestamp:** 2026-11-02 (Asia/Singapore).
- **Tool/model:** OpenAI Codex; model identifier is not exposed in this session.
- **Mode/scenario:** Implementation of an author-specified outbox event workflow.
- **Prompts:** [prompts/026-user-deleted-event.md](prompts/026-user-deleted-event.md).
- **Key response:** Added `buildUserDeleted`, `enqueueUserDeleted`, and transactional enqueueing from `deleteAccount`, following the existing `user.created` pattern. No contract or consumer changes were made.
- **Affected locations:** `user-service/src/events/userDeleted.ts`, `user-service/src/events/outboxStore.ts`, `user-service/src/services/userService.ts`.
- **Checks:** `npm run build --workspace user-service` and `git diff --check` passed. Author manually tested the user.deleted enqueue behavior.
- **Human review/edits:** Author reviewed the changes line by line, manually tested the behavior successfully, and approved the implementation.
- **External sources:** None.

## 025: User account deletion workflow

- **Timestamp:** 2026-11-02 (Asia/Singapore).
- **Tool/model:** OpenAI Codex; model identifier is not exposed in this session.
- **Mode/scenario:** Implementation of an author-specified account deletion workflow.
- **Prompts:** [prompts/025-user-account-deletion.md](prompts/025-user-account-deletion.md).
- **Key response:** Added the Order Service eligibility stub, administrator last-admin protection under the advisory lock, `ArchivedUser` creation, hard deletion of the `User` row, and `DELETE /users/me` error mappings. Event handling was intentionally excluded.
- **Affected locations:** `user-service/src/services/adminGuards.ts`, `user-service/src/services/adminService.ts`, `user-service/src/services/userService.ts`, `user-service/src/api/controllers/userController.ts`, `user-service/src/api/routes/userRoutes.ts`.
- **Checks:** `npm run build --workspace user-service` and `git diff --check` passed. Author also manually tested the account deletion workflow.
- **Human review/edits:** Author checked all affected files, manually tested the implementation, and approved it.
- **External sources:** None.

## 023: Archived user retention schema

- **Timestamp:** 2026-11-02 (Asia/Singapore).
- **Tool/model:** OpenAI Codex; model identifier is not exposed in this session.
- **Mode/scenario:** Implementation of an author-specified Prisma schema model.
- **Exact prompt:**

  > ok, I need to implement user deletion, let's start with defining the schema. Can you implement this please: ArchivedUser, email String (PK), userId String, deletedAt (DateTime, now), purgeAfter datetime
  >
  > index on purgeAfter
  >
  > this archival is for keeping up to 4 years after user account deletion, to prevent a returning user from resetting their credits. Note that it only holds the email and old user id, and no other personal data

- **Key response:** Added the author-specified `ArchivedUser` Prisma model with `email` as the primary key, `userId`, `deletedAt` defaulting to `now()`, `purgeAfter`, and an index on `purgeAfter`. No additional personal data was added.
- **Affected locations:** `prisma/schema.prisma`.
- **Checks:** `npx prisma validate --schema user-service/prisma/schema.prisma` passed. `prisma migrate dev --name add_archived_user` could not generate a migration because the configured PostgreSQL database at `127.0.0.1:54322` was unavailable; no migration file was created.
- **Human review/edits:** Author reviewed and approved the schema change.
- **External sources:** None.

## 001: Initial user-service scaffolding (setup)

- **Timestamp:** 2026-09-24 – 2026-09-25 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Boilerplate and scaffolding for the author-chosen stack,
  step by step with explanations, plus setup documentation.
- **Prompts:** [prompts/001-initial-scaffolding.md](prompts/001-initial-scaffolding.md) (15 prompts).
- **Key responses:**
  1. "Here's the plan: the project config (`package.json` with dev, build and
     Prisma scripts, `tsconfig.json`, `.prettierrc.json`), the Prisma schema
     and first migration, the gRPC contract, the REST app and gRPC server, a
     shared entry point and env validation, then Docker. First, what should
     the User schema look like?"
  2. "Done. Run `npx prisma migrate dev --name init` to create the first
     migration. Next, `user.proto`: it defines the RPCs other services can
     call and their message shapes. Which endpoints should it expose?"
  3. "Added `GetPublicProfile` returning `user_id`, `username`, `first_name`
     and `last_name`. The gRPC server loads this proto and serves it on its
     own port; the handler is a stub until the endpoint is implemented."
  4. Explained the gRPC server setup.
  5. "Next, `rest/app.ts` builds the Express app and `index.ts` starts both
     the REST and gRPC servers and shuts them down cleanly. Do you also want a
     `/health` endpoint that can serve as a lightweight DB liveness probe?"
  6. "Added `/health`, which returns 200 or 503 using a `SELECT 1` ping in
     `db.ts`, where the shared Prisma client lives. Next, `env.ts` validates
     the environment variables with zod at startup, so a missing one fails
     fast."
  7. "Next: `.dockerignore`, `.env.example` and `.gitignore`."
  8. "For the Dockerfile: how many stages, which base image, and what layout?"
  9. Generated a two-stage `node:20-slim` Dockerfile.
  10. Explained it line by line, including installing OpenSSL for Prisma's
      engine and copying only the build output into the runtime stage.
  11. "`npm ci` installs exactly what's in the lockfile and fails if the two
      disagree, so every build gets the same versions."
  12. Generated `compose.yaml`, including a Postgres healthcheck and
      `depends_on: service_healthy`, so the app starts only once the database
      is ready, then explained it.
  13. "The named volume stores Postgres's data outside the container, so it
      survives `docker compose down` and container rebuilds."
  14. "Ok."
  15. "Done. The README has an easy setup (Docker) and a dev setup (DB in
      Docker, app on the host), and AGENTS.md records the stack and
      conventions."
- **Key output:** Express + Prisma + gRPC TypeScript scaffold: project config,
  `User` schema with `Roles[]` and its init migration, `user.proto`, REST app
  with `/health`, gRPC server, entry point, env validation, Prisma client.
  Two-stage Dockerfile, compose with Postgres and migrations before start,
  ignore files, `.env.example`, README and AGENTS.md.
- **Affected locations:** `package.json`, `tsconfig.json`, `.prettierrc.json`,
  `.gitignore`, `.dockerignore`, `.env.example`, `src/index.ts`,
  `src/rest/app.ts` (now `src/api/app.ts`), `src/grpc/server.ts`,
  `src/env.ts`, `src/db.ts`, `proto/user.proto`, `prisma/schema.prisma`,
  `prisma/migrations/20260925041350_init/`, `Dockerfile`, `compose.yaml`,
  `README.md`, `AGENTS.md`.
- **Human review/edits:** Author chose the stack (Express, Prisma with
  PostgreSQL, gRPC, Docker with compose) and specified the User schema and
  roles, the gRPC endpoint and its fields, ignoring `.env` but committing
  `.env.example`, the two-stage `node:20-slim` Dockerfile, and the two compose
  containers with migrations before start. Author asked for explanations,
  reviewed each step and approved.
- **External sources:** Official `postgres:16` and `node:20-slim` Docker
  images.

## 002: Registration request schema (F1)

- **Timestamp:** 2026-09-27 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Code generation for the F1 registration request schema.
- **Prompt:** [prompts/002-register-schema.md](prompts/002-register-schema.md).
- **Key response:** "Sure, here's a Zod schema for registration with the five
  required fields, an NUS email check and your password rules."
- **Key output:** Zod schema with the required fields, NUS email check and
  password rules.
- **Affected locations:** `src/api/dto/registerDto.ts`.
- **Human review/edits:** Author provided the implementation idea and specified
  the fields and validation rules. Author reviewed the code line by line and
  approved.
- **External sources:** None.

## 003: Validation middleware (F1)

- **Timestamp:** 2026-09-27 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Code generation for a reusable request body validation
  middleware.
- **Prompt:** [prompts/003-validate-middleware.md](prompts/003-validate-middleware.md).
- **Key response:** "Sure, here's a middleware that takes any zod schema and
  checks `req.body` against it. 400 Bad Request is right for invalid input."
- **Key output:** Middleware that validates `req.body` against a given schema
  and returns 400 with field errors on failure.
- **Affected locations:** `src/api/middleware/validate.ts`.
- **Human review/edits:** Author specified the requirements. Author reviewed
  the code and approved.
- **External sources:** None.

## 004: Register endpoint (F1)

- **Timestamp:** 2026-09-27 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Code generation for the register endpoint, documentation
  updates and code explanation.
- **Prompts:** [prompts/004-register-endpoint.md](prompts/004-register-endpoint.md) (4 prompts).
- **Key responses:**
  1. "Sure, here's the register endpoint. `userController.register` calls
     `userService.register`, which rejects an existing email or username with
     409 Conflict and creates the user with Prisma following the schema. One
     issue: the duplicate check and the insert are two separate steps, so two
     simultaneous registrations can both pass the check. The DB's `@unique`
     constraint blocks the second one, but the `P2002` error isn't handled and
     returns a 500. How would you like to handle this case?"
  2. "Got it. I'll catch `P2002` from the insert and return the same 409
     Conflict response as the pre-check."
  3. "We'll hash it with bcryptjs and store only `passwordHash`. Install it
     with `npm install bcryptjs` and I'll update the service."
  4. "Done. I've added the endpoint and how to test it to README.md, and the
     layer conventions to AGENTS.md."
- **Key output:** `POST /users/register` returning 201 with the public user
  fields, or 409 for a duplicate email or username. A duplicate that slips past
  the pre-check is caught from the DB constraint (`P2002`) and also returns
  409. Password hashed with bcryptjs.
- **Affected locations:** `src/api/controllers/userController.ts`,
  `src/services/userService.ts` (then `src/api/services/`),
  `src/api/routes/userRoutes.ts`, `src/api/app.ts`, `package.json`,
  `README.md`, `AGENTS.md`.
- **Human review/edits:** Author decided the layer structure (controller and
  service, no repository layer), specified the endpoint behaviour and
  requirements, and decided how to handle the concurrent-duplicate case.
  Author reviewed the code line by line with AI explanations, tested it
  manually and approved.
- **External sources:** None.

## 005: Login DTO review (F2)

- **Timestamp:** 2026-09-28 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Code review of the author-written login validation DTO.
- **Prompt:** [prompts/005-login-dto-review.md](prompts/005-login-dto-review.md).
- **Key response:** "I've checked the login schema and it looks fine. I don't
  see any bugs."
- **Key output:** No changes.
- **Affected locations:** `src/api/dto/loginDto.ts`.
- **Human review/edits:** Author implemented the code. AI only reviewed it.
- **External sources:** None.

## 006: Authentication middleware (F2)

- **Timestamp:** 2026-09-28 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Code generation for the JWT authentication middleware.
- **Prompt:** [prompts/006-authenticate-middleware.md](prompts/006-authenticate-middleware.md).
- **Key response:** "Sure, here's the middleware. It reads the Bearer token,
  verifies it with the public key and attaches the user to the request. And
  yes, 401 Unauthorized is the right status when the token is missing or
  invalid."
- **Key output:** Middleware that verifies the Bearer JWT with the RS256 public
  key, sets `req.user` and returns 401 on failure.
- **Affected locations:** `src/api/middleware/authenticate.ts`.
- **Human review/edits:** Author specified the requirements and the
  middleware's behaviour. Author reviewed the code line by line and approved.
- **External sources:** None.

## 007: Role check middleware (F2)

- **Timestamp:** 2026-09-28 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Code generation for the RBAC role check middleware.
- **Prompt:** [prompts/007-require-role-middleware.md](prompts/007-require-role-middleware.md).
- **Key response:** "Before I write it: which status should it return when
  there's no authenticated user, and which when the user lacks the role?"
- **Key output:** Middleware that allows the request if the user holds at
  least one of the given roles, returning 401 without a user and 403 for an
  insufficient role.
- **Affected locations:** `src/api/middleware/requireRole.ts`.
- **Human review/edits:** Author specified the behaviour and requirements and
  confirmed the error codes. Author reviewed the code and approved.
- **External sources:** None.

## 008: Login, JWT and RBAC demo endpoints (F2)

- **Timestamp:** 2026-09-28 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Code generation for login with RS256 JWTs and two
  endpoints demonstrating authentication and RBAC.
- **Prompts:** [prompts/008-login-jwt-rbac.md](prompts/008-login-jwt-rbac.md) (3 prompts).
- **Key responses:**
  1. "Before I write it, a few questions: how long should the token last,
     which signing algorithm should we use, what should failures return, and
     where should the signing logic live?"
  2. "Got it: RS256 (RSA), 15-minute expiry, 401 on failure, signing in the
     controller. I also return a generic 'Invalid email or password' message,
     so the response never reveals which one was wrong. On your side: add the
     JWT values to `.env.example` and `.env` (I can't read or modify `.env`),
     and install `jsonwebtoken` and `@types/jsonwebtoken`."
  3. "Sure, here are `GET /users/me` (any authenticated user, own profile) and
     `GET /users` (ADMINISTRATOR only). I'd also recommend a key generation
     script so teammates can create the RSA key pair with one command."
- **Key output:** `POST /users/login` verifying the password with bcryptjs and
  returning a 15-minute RS256 JWT carrying the user's roles; 401 with a generic
  message on failure. `GET /users/me` and admin-only `GET /users`. JWT config
  loading, the `req.user` type and `keys/` ignored by git.
- **Affected locations:** `src/api/controllers/userController.ts`,
  `src/services/userService.ts`, `src/api/routes/userRoutes.ts`, `src/env.ts`,
  `src/types/express.d.ts`, `.env.example`, `.gitignore`, `package.json`,
  `AGENTS.md`.
- **Human review/edits:** Author specified the login behaviour, the JWT and
  RBAC workflow, the token expiry, algorithm, error handling and where signing
  lives, and the two demo endpoints. Author reviewed the code and approved.
- **External sources:** None.

## 009: Key generation script, admin get-by-id and docs (F2)

- **Timestamp:** 2026-09-28 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Boilerplate (key generation script), code generation for
  an admin-only endpoint, documentation updates and manual test suggestions.
  Follows entry 008.
- **Prompts:** [prompts/009-keygen-get-by-id-docs.md](prompts/009-keygen-get-by-id-docs.md) (3 prompts).
- **Key responses:**
  1. "Done. I've added a `keys:generate` script to `package.json`. It uses
     openssl to create `keys/private.pem` and `keys/public.pem`, and `keys/`
     is already ignored by git."
  2. "Sure, here's `GET /users/:id`. It's ADMINISTRATOR only and returns 404
     when the user doesn't exist."
  3. "Done, I've updated README.md and AGENTS.md with the new endpoints. Here
     are some test cases you can run manually for a preliminary check."
- **Key output:** `npm run keys:generate` for the RSA key pair. Admin-only
  `GET /users/:id` returning 404 when not found. README and AGENTS.md updated
  for the auth endpoints.
- **Affected locations:** `package.json`, `.env.example`,
  `src/api/controllers/userController.ts`, `src/api/routes/userRoutes.ts`,
  `src/services/userService.ts`, `README.md`, `AGENTS.md`.
- **Human review/edits:** Author specified the endpoint and its access rule,
  reviewed the code and approved. Author trimmed the AI-generated comments
  across the service files to reduce clutter.
- **External sources:** None.

## 010: Refresh-token sessions and rotation (F2.2)

- **Timestamp:** 2026-10-11 – 2026-10-12 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Code generation for refresh-token sessions: issuing a
  refresh cookie on login and a `/users/refresh` endpoint with rotation.
- **Prompts:** [prompts/010-refresh-token-sessions.md](prompts/010-refresh-token-sessions.md) (3 prompts).
- **Key responses:**
  1. "Sure. Before I write it, I need a few decisions from you: (1) what
     should a refresh token row hold? (2) Should we store the raw token or a
     hash, and if a hash, bcrypt or SHA-256? (3) How long should it last, and
     should that be configurable? (4) Response body or cookie, and if a
     cookie, readable by JavaScript, HTTPS only, and sent to which paths?
     (5) If someone logs in again on the same browser with a valid refresh
     token, reuse it or revoke it and issue a new one? (6) Can one user be
     logged in on several browsers at once? (7) What should `/refresh` return
     when the token is missing, expired or revoked? (8) Should each `/refresh`
     also replace the refresh token?"
  2. "A few more things before I finish: Prisma needs the relation on both
     sides, so ok to add `refreshTokens RefreshToken[]` to `User`? Should
     `/refresh` re-read the user's current roles and reject deleted users? And
     if two refreshes arrive with the same token at once, I'll revoke it in a
     transaction that checks it's still live, so only one wins and the other
     gets 401. Is that the behaviour you want?"
  3. "Ok, done! And yes, 401 is right. I used SHA-256 for the token hash,
     since the token is already random and an unsalted hash lets us look the
     row up. I also set the cookie to secure in production with sameSite lax,
     added a `jti` to access tokens, and clear the cookie when refresh fails.
     On your side: add `REFRESH_TOKEN_TTL_DAYS` and `NODE_ENV` to `.env` and
     `.env.example`, run `npx prisma migrate dev --name add_refresh_tokens`,
     and run `npm install cookie-parser @types/cookie-parser`."
- **Key output:** `RefreshToken` model and migration. Login sets an httpOnly
  refresh cookie on `/users` and revokes this browser's previous session.
  `POST /users/refresh` rotates the token (single use, sliding 7-day expiry),
  re-reads current roles, rejects deleted users and lets only one of two
  concurrent refreshes win.
- **Affected locations:** `prisma/schema.prisma`,
  `prisma/migrations/20261010110413_add_refresh_tokens/`,
  `src/services/sessionService.ts`, `src/api/controllers/userController.ts`,
  `src/api/routes/userRoutes.ts`, `src/api/app.ts`, `src/env.ts`,
  `package.json`.
- **Human review/edits:** Author specified the refresh workflow, the
  RefreshToken schema and index, hashing the token, the configurable 7-day
  lifetime, the httpOnly cookie on `/users`, revoking on re-login, multiple
  sessions, 401 on failure and rotation. Author confirmed re-reading roles,
  rejecting deleted users and the race behaviour. AI chose SHA-256, the
  `secure`/`sameSite` settings, the `jti` and clearing the cookie on failure.
  Author reviewed the code and approved.
- **External sources:** None.

## 011: Logout review (F2.2)

- **Timestamp:** 2026-10-12 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Code review of the author-written logout handler.
- **Prompts:** [prompts/011-logout-review.md](prompts/011-logout-review.md) (2 prompts).
- **Key responses:**
  1. "Yes, it looks okay, but the error handling should always return 204, so
     logout is idempotent: no cookie or an already-revoked session should
     still succeed."
  2. "Updated, it now always returns 204."
- **Key output:** The logout handler always returns 204.
- **Affected locations:** `src/api/controllers/userController.ts`.
- **Human review/edits:** Author implemented the logout handler. AI reviewed
  it and suggested the idempotent 204, which the author accepted.
- **External sources:** None.

## 012: Refresh and logout documentation (F2.2)

- **Timestamp:** 2026-10-12 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Documentation updates for the refresh-token and logout
  work (entries 010 and 011).
- **Prompt:** [prompts/012-refresh-logout-docs.md](prompts/012-refresh-logout-docs.md).
- **Key response:** "Done. I've documented the refresh and logout flow in
  README.md. AGENTS.md already covers the conventions used, so it needed no
  change."
- **Key output:** README section on the refresh/logout flow and how to test
  it.
- **Affected locations:** `README.md`.
- **Human review/edits:** Author reviewed the documentation and approved.
- **External sources:** None.

## 013: gRPC GetPublicProfile (F2.6)

- **Timestamp:** 2026-10-14 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Code generation for an internal gRPC endpoint that other
  services use to read a user's public profile, plus a README update.
- **Prompts:** [prompts/013-grpc-public-profile.md](prompts/013-grpc-public-profile.md) (4 prompts).
- **Key responses:**
  1. "Sure. A few questions first: (1) should `GetPublicProfile` treat
     soft-deleted users as not found? (2) If it's called without a `user_id`,
     should it return `INVALID_ARGUMENT`? (3) If no user matches, `NOT_FOUND`?
     (4) gRPC has no default error handler, so an uncaught error leaves the
     caller waiting until its deadline. Should I catch errors, log them and
     return `INTERNAL`? (5) Should the response use the proto's field names
     (`userId`, `username`, `firstName`, `lastName`), mapped from the DB's
     `id`?"
  2. "Done. `getPublicProfile` in the service uses a new `publicProfileSelect`
     (id, username, first and last name, active users only), and the
     own-profile endpoints keep `publicUserSelect`. The gRPC handler maps the
     result to the proto fields and returns `INVALID_ARGUMENT`, `NOT_FOUND` or
     `INTERNAL` as agreed."
  3. "Renamed: `profileSelect` for the user's own or admin view and
     `publicProfileSelect` for other services. I've also renamed
     `getProfileById` to `getProfile` to match."
  4. "Done, the README now has a gRPC section with a `grpcurl` example."
- **Key output:** `GetPublicProfile` gRPC handler returning id, username and
  names for active users; `INVALID_ARGUMENT`, `NOT_FOUND` and `INTERNAL` error
  mapping. Separate `profileSelect` and `publicProfileSelect` in the service.
- **Affected locations:** `src/grpc/server.ts`, `src/services/userService.ts`,
  `src/api/controllers/userController.ts`, `README.md`.
- **Human review/edits:** Author specified the endpoint, the two separate
  selects and their fields, and the error behaviour, and asked for the
  clearer select names. Author reviewed the code and approved.
- **External sources:** None.

## 014: Profile update DTO (F2.4)

- **Timestamp:** 2026-10-14 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Code generation for the profile update request schema.
- **Prompt:** [prompts/014-update-profile-dto.md](prompts/014-update-profile-dto.md).
- **Key response:** "Sure, here's the update schema. Email and roles are
  rejected and an empty body fails. I'd suggest reusing the register rules for
  the name and username fields, so sign-up and edit can't drift apart."
- **Key output:** Zod schema that reuses the register field rules, rejects
  email and role changes and requires at least one field.
- **Affected locations:** `src/api/dto/updateProfileDto.ts`.
- **Human review/edits:** Author specified the requirements and approved
  reusing the register rules. Author reviewed the code line by line and
  approved.
- **External sources:** None.

## 015: Profile update endpoint and validation fix (F2.4)

- **Timestamp:** 2026-10-14 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Code generation for `PATCH /users/me`, and debugging: AI
  found a bug in the validation middleware while wiring up the update DTO
  (entry 014).
- **Prompts:** [prompts/015-profile-update.md](prompts/015-profile-update.md) (4 prompts).
- **Key responses:**
  1. "Sure. One note first: email and roles are already blocked by the update
     DTO, so those requests fail validation with 400 before reaching the
     controller, not 403."
  2. "Ok, keeping 400. While testing that, I found an issue: the validate
     middleware only sends back `fieldErrors`. Errors not tied to a field,
     like an unknown key or 'Provide at least one field to update', end up in
     `formErrors` and are dropped, so the response is `details: {}`. Do you
     want to fix it by also sending `formErrors` when present?"
  3. "Fixed. For the update itself, should I catch Prisma's
     `PrismaClientKnownRequestError` the same way as register, mapping
     `P2002` (duplicate username) to 409 and `P2025` (user no longer exists)
     to 404?"
  4. "Done. `PATCH /users/me` returns 200 with the updated profile, 404 if the
     user no longer exists and 409 for a duplicate username."
- **Key output:** `PATCH /users/me` with a username pre-check against other
  users, `P2002` → 409 and `P2025` → 404. Validation middleware now also
  returns `formErrors` as `errors` when present.
- **Affected locations:** `src/api/controllers/userController.ts`,
  `src/services/userService.ts`, `src/api/routes/userRoutes.ts`,
  `src/api/middleware/validate.ts`, `README.md`.
- **Human review/edits:** Author specified the endpoint, why it is PATCH, the
  blocked fields, the duplicate username rule and the error codes. Author
  chose to keep the 400 validation failure, accepted the validation fix and
  confirmed the Prisma error mapping. Author reviewed the code and approved.
- **External sources:** None.

## 016: Standardise service ports across FoC (setup)

- **Timestamp:** 2026-10-16 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Configuration changes applying the author's port map to
  every service.
- **Prompt:** [prompts/016-standardise-ports.md](prompts/016-standardise-ports.md).
- **Key response:** "Done. I've applied the port map everywhere it appears:
  each service's env defaults and `.env.example`, the Dockerfiles and compose
  files, the READMEs, the shared gRPC README and the example gRPC clients."
- **Key output:** gRPC ports standardised to user 50051, supplier 50052, order
  50053 and credit 50054 across the repository.
- **Affected locations:** `user-service/` (`src/env.ts`, `Dockerfile`,
  `.env.example`, `examples/grpc-clients.ts`, `README.md`, `AGENTS.md`),
  `supplier-service/` (`src/index.ts`, `grpc/src/env.ts`, `.env.example`,
  `Dockerfile`, `Dockerfile.grpc`, `compose.yaml`, `README.md`),
  `order-service/grpc/` (`src/env.ts`, `.env.example`),
  `credit-service/grpc/` (`src/env.ts`, `.env.example`),
  `shared/grpc/README.md`, root `README.md`.
- **Human review/edits:** Author decided the port map. AI applied it across
  the files. Author reviewed the changes and approved.
- **External sources:** None.

## 017: Refresh-token review fixes (F2.2)

- **Timestamp:** 2026-10-19 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus. The review comments
  themselves came from Codex's automated review on GitHub (PR #56).
- **Mode/scenario:** Explanation of three review comments on the refresh-token
  sessions (entry 010), then code changes to fix them.
- **Prompts:** [prompts/017-refresh-review-fixes.md](prompts/017-refresh-review-fixes.md)
  (4 prompts, plus the review comments).
- **Key responses:**
  1. "Sure. (1) Two tabs refresh with the same token: the losing tab clears
     the cookie, and if its response arrives last it deletes the winner's new
     cookie, logging the user out. (2) A refresh that commits just before
     logout creates a new token, and logout only revokes the old one, so the
     session survives. (3) Every refresh inserts a new row and nothing deletes
     old ones, so the table grows forever. Which one first?"
  2. "That works. A few details: (1) a nullable, unique `previousTokenHash`
     column only works if rotation updates the same row instead of inserting
     a new one. Is it ok to switch to in-place rotation? (2) How far back,
     only the immediately previous token or a longer history? (3) Should a
     match count as superseded only while that session is still live? (4) For
     a superseded refresh, still return 401 and just leave the cookie alone?"
  3. "Done. A superseded refresh returns 401 without clearing the cookie, and
     only a genuinely invalid token clears it. In-place rotation also covers
     the other two comments: logout now revokes the session by its current or
     previous hash, so a racing refresh can't keep it alive, and rows no
     longer pile up per refresh. I also delete a user's ended sessions
     whenever they start a new one, so the table stays bounded."
  4. "Done, README updated for the new session behaviour."
- **Key output:** In-place rotation with `previousTokenHash` (one step back,
  live sessions only) and an atomic check-and-swap. Superseded vs invalid
  refresh, with the cookie cleared only for invalid tokens. Logout matches the
  current or previous hash. Ended sessions deleted when a new one starts.
- **Affected locations:** `src/services/sessionService.ts`,
  `src/api/controllers/userController.ts`, `prisma/schema.prisma`,
  `prisma/migrations/20261019045404_rotate_refresh_in_place/`, `README.md`.
- **Human review/edits:** Author proposed the superseded vs invalid fix and
  tracking the previous token hash, and decided on in-place rotation, one step
  back, live sessions only and leaving the cookie alone. Author reviewed the
  code and approved.
- **External sources:** Codex automated review comments on GitHub PR #56
  (quoted in the prompt archive).

## 018: Admin bootstrap and audit tables (F3)

- **Timestamp:** 2026-10-19 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Code generation for two author-specified Prisma models
  and their migration.
- **Prompts:** [prompts/018-f3-schema.md](prompts/018-f3-schema.md) (4 prompts).
- **Key responses:**
  1. "Sure. To make sure there's only ever one row, I can fix the id at 1, so
     any second insert, including a concurrent one, fails on the primary key.
     Ok? I'll name the field `initializedAt`."
  2. "Done, `SystemBootstrap` is added. Once the audit table is in too, run
     `npx prisma migrate dev --name f3_admin_roles`."
  3. "A few questions: (1) what should `actorId` be when the system bootstrap
     grants the first admin? (2) Should `actorId` and `targetId` be foreign
     keys to `User`, or plain ids so the history survives if an account is
     deleted? (3) Should the enum values be `GRANT` and `REVOKE`?"
  4. "Done, `AdminRoleChange` is added with a nullable `actorId`, plain ids
     and an index on `targetId`. Run the migrate command now to create both
     tables."
- **Key output:** `SystemBootstrap` singleton (fixed id 1). `AdminRoleChange`
  append-only audit with `AdminRoleAction` (`GRANT`, `REVOKE`), nullable
  `actorId` for the system bootstrap and no foreign keys to `User`. Migration
  `f3_admin_roles`.
- **Affected locations:** `prisma/schema.prisma`,
  `prisma/migrations/20261019105105_f3_admin_roles/`.
- **Human review/edits:** Author specified both tables, their fields and the
  index, null `actorId` for the bootstrap and plain ids instead of foreign
  keys. Author confirmed the fixed singleton id and the enum values. Author
  reviewed the schema and approved.
- **External sources:** Course material on bootstrapping the first admin
  (https://sds-edu.github.io/resource-bootstrap-first-admin/), for its
  reproducibility and auditability points.

## 019: Initial admin bootstrap CLI (F3.2.1)

- **Timestamp:** 2026-10-19 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Code generation for an interactive CLI that creates the
  first administrator, and an admin service that bootstraps the account.
- **Prompts:** [prompts/019-admin-bootstrap-cli.md](prompts/019-admin-bootstrap-cli.md) (2 prompts).
- **Key responses:**
  1. "On it. A few things to settle first: (1) should the password be hidden
     while typing, with a confirm step, and never accepted as an argument or
     env var? (2) Refuse to run without an interactive terminal? (3) Give the
     admin both `USER` and `ADMINISTRATOR`? (4) Create the user, the
     `SystemBootstrap` row and the audit record in one transaction? (5) For
     mismatched passwords, invalid input, a taken email or username, or an
     already initialized system, print a message, change nothing and exit?
     (6) If two people run the script at the same time, both can pass the
     'already initialized' check. How do you want to handle this?"
  2. "Done. `bootstrapAdmin` takes a Postgres advisory lock, re-checks
     `SystemBootstrap` under the lock, then creates the user, the bootstrap
     row and the audit record in one transaction. A second concurrent run
     waits, then gets 'already initialized'. The password is hashed before
     taking the lock, since hashing is slow and doesn't need it. I also moved
     the shared account building and duplicate detection into helpers in
     `userService`, so register and the bootstrap build accounts the same
     way. Run it with `npm run admin:create`, or `npm run admin:create:dev`
     locally."
- **Key output:** `admin:create` CLI: interactive only, hidden password with
  confirmation, register rules, clear messages with no changes on failure.
  `bootstrapAdmin` with an advisory lock and a single transaction for the
  user (`USER` + `ADMINISTRATOR`), `SystemBootstrap` row and `GRANT` audit
  record (`actorId` null). Shared `buildNewUser` and `duplicateField` helpers.
- **Affected locations:** `src/scripts/createAdmin.ts`,
  `src/services/adminService.ts`, `src/services/userService.ts`,
  `package.json`.
- **Human review/edits:** Author specified the CLI workflow, reuse of the
  register rules and logic, the bootstrap steps, hidden password input,
  refusing non-interactive runs, both roles, a single transaction,
  no changes on failure, and using a Postgres lock for concurrent runs.
  Author reviewed the code and approved.
- **External sources:** Course material on bootstrapping the first admin
  (https://sds-edu.github.io/resource-bootstrap-first-admin/). Combined its
  bootstrap-script and framework-command approaches into a one-off CLI that
  calls the service's own provisioning logic, and followed its idempotency
  and concurrency requirements. Credentials are entered interactively instead
  of through environment variables.

## 020: Grant and revoke admin endpoints (F3.2, F3.3)

- **Timestamp:** 2026-10-19 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Code generation for admin-only endpoints to grant and
  revoke the Administrator role, with last-admin protection, plus a manual
  concurrency test suggestion.
- **Prompts:** [prompts/020-admin-grant-revoke.md](prompts/020-admin-grant-revoke.md) (5 prompts).
- **Key responses:**
  1. "Sure. One edge case first: the roles are carried in the JWT, which lasts
     up to 15 minutes. If an admin's role is revoked, their token still says
     ADMINISTRATOR until it expires, so `requireRole` would still let them
     grant admin. Should I re-check inside the locked transaction that the
     caller is still an active admin, and return 403 if not? And should a
     missing or deleted target return 404?"
  2. "On it. Done: `POST /users/:id/admin` takes the admin lock, re-checks the
     caller, returns 200 whether or not the role was already held, and writes
     a `GRANT` audit row in the same transaction."
  3. "A few questions: (1) revoking removes only `ADMINISTRATOR` and keeps
     `USER`? (2) 409 Conflict for revoking the last admin? (3) Two admins
     could revoke each other at the same moment and leave zero admins. Should
     the last-admin check use the same lock? (4) Make the check a separate
     exported function that counts the admins other than the target, so
     account deletion can reuse it? (5) Can an admin revoke their own role if
     others remain? (6) Same caller re-check, 404 and a `REVOKE` audit row as
     grant?"
  4. "You're right, the lock handles it, as long as the count runs after
     taking the lock and inside the same transaction. I'll take the lock
     first, then count, and note that `ensureNotLastAdmin` must only run after
     `lockAdminSet`. Do you want a quick manual test? Make two admins, then
     fire both revokes at the same time with curl."
  5. "Done: `DELETE /users/:id/admin` with `ensureNotLastAdmin` returning 409
     for the last admin. Here's the concurrent revoke test to run."
- **Key output:** `POST /users/:id/admin` and `DELETE /users/:id/admin`,
  ADMINISTRATOR only, idempotent (200), with the caller re-checked in the
  database (403), 404 for a missing or deleted target and an audit row per
  change, all under the admin advisory lock. `ensureNotLastAdmin` (exported,
  counts other active admins via `activeAdminWhere`) returns 409 for the last
  admin. Revoke removes only `ADMINISTRATOR`.
- **Affected locations:** `src/services/adminService.ts`,
  `src/api/controllers/userController.ts`, `src/api/routes/userRoutes.ts`.
- **Human review/edits:** Author specified both endpoints, their access
  rules, idempotency, the audit rows, the transaction and the lock, and the
  last-admin protection. Author decided on the caller re-check with 403, 404
  for missing targets, touching only the Administrator role, 409, reuse of the
  check and allowing self-revoke. Author reviewed the code, ran the concurrent
  revoke test and approved.
- **External sources:** None.

## 021: Admin bootstrap and role management documentation (F3)

- **Timestamp:** 2026-10-19 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Documentation updates for entries 018–020.
- **Prompt:** [prompts/021-f3-docs.md](prompts/021-f3-docs.md).
- **Key response:** "Done. The README now covers bootstrapping the first
  admin with `npm run admin:create`, the grant and revoke endpoints and the
  last-admin rule. I also added the admin conventions to AGENTS.md."
- **Key output:** README sections on the admin bootstrap and role management;
  F3 conventions in AGENTS.md.
- **Affected locations:** `README.md`, `AGENTS.md`.
- **Human review/edits:** Author reviewed the documentation and approved.
- **External sources:** None.

## 022: README notice for pre-F3 admin accounts (F3 review)

- **Timestamp:** 2026-10-20 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus. The review comment came
  from Codex's automated review on GitHub (PR #64).
- **Mode/scenario:** Documentation update in response to a review comment.
- **Prompt:** [prompts/022-pre-f3-admin-notice.md](prompts/022-pre-f3-admin-notice.md)
  (1 prompt, plus the review comment).
- **Key response:** "Sure. I've added an 'Upgrading from before F3?' notice to
  the README: don't create admins by editing `roles` in Prisma Studio, reset
  the local database once, then create the admin with the bootstrap command."
- **Key output:** README notice asking teammates to reset their local database
  and use the bootstrap command instead of editing roles directly.
- **Affected locations:** `README.md`.
- **Human review/edits:** Author decided to handle the comment by asking
  teammates to reset their local databases instead of changing the revoke
  logic, and will tell them in the group chat. Author reviewed the notice and
  approved.
- **External sources:** Codex automated review comment on GitHub PR #64
  (quoted in the prompt archive). The comment refers to teammate code in
  `credit-service/src/security/credit-authorizer.ts`.
