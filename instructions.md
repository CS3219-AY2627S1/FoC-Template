# User Service — Claude Code Implementation Instructions

> **How to use this file**: Read and implement ONE stage at a time. After completing each stage, stop, verify the checklist, and wait for confirmation from me before proceeding to the next stage. Do not implement future stages speculatively.

## AI Usage Logging

After completing each stage, generate the following for me to copy into `/ai/usage-log.md`:

\```

## <date> — Stage <n>: <stage name>

**Tool:** Claude Code (claude-sonnet-5)
**Scope:** Implementation code

**What I prompted:**
<brief summary of the stage instructions given>

**What it produced:**
<list of files created/modified>

**What I kept/changed/rejected:**
<leave blank for me to fill in after review>
\```

Also add this header comment to every file you create:

\```
// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: <date>
// <DD/MM/YYYY>: <scope> <n>
// Author review: <leave blank for me to fill in>
// <DD/MM/YYYY>: <scope> <n>
// Author review: <leave blank for me to fill in>
\```

---

## Context

You are implementing the **User Service** for a campus errand platform (FoC) built on a microservices architecture. This service handles everything user-related: registration, login, OTP verification, JWT auth, RBAC, and profile management.

CLAUDE NOTE
Before implementing this stage, read the current code, not just instructions.md. Several
fixes were made after the instructions were written, and the file has not been updated.
Where the two disagree, follow the codebase and tell me about the difference.

Conventions established in the code (keep them):

1. Emails and usernames are lowercased at the Zod boundary. Emails are also trimmed.
   Use the shared emailField and usernameField in auth.controller.ts for every new schema.
   A login identifier is lowercased whole.
2. Locking: use withTransaction plus SELECT ... FOR UPDATE, and pass `client` to EVERY query
   inside it. Never use the pool inside a transaction, because it deadlocks. AFTER the lock
   is granted, re-check the row that lockUserById returns (null, or status changed). The
   pre-lock read can be stale.
3. A single-row state change (logout, consume OTP, activate user) should be a conditional
   UPDATE ... WHERE <expected state>, checking rowCount. Do not read, check, then write.
4. Wrong OTP guesses must persist: return { ok: false } from checkOtp and throw only after
   the transaction commits, or the rollback undoes the increment.
5. Time comes from the database clock. Write expiries as NOW() + make_interval(...) in SQL.
   Compare against clock_timestamp() AS db_now. Do not use Date.now() for OTPs or refresh
   tokens (JWT iat/exp is the only exception).
6. deleteStalePendingUsers uses FOR UPDATE SKIP LOCKED, so rows in use are not deleted.
7. Queries take db: Queryable = pool. Queries used only inside transactions may make it required.
8. The super admin bootstrap uses ON CONFLICT DO NOTHING plus a re-check.

Watch for these when implementing:

- forgot-password must go through the same lock, cooldown and resend limit as resend-otp.
  Otherwise it is an unlimited email spammer, and each call kills the victim's live OTP.
- Resend/cooldown counts need a per-flow window (for example the last hour, or since the last
  successful use). An all-time count permanently locks users out of password reset.
- Anything that changes a password, suspends a user or resets a password must revoke ALL that
  user's refresh tokens in the SAME transaction as the change (revokeAllRefreshTokensForUser
  with a db param).
- A login racing a reset or suspend can issue a refresh token after the revoke. Handle it.
- Do not add new test cases unless I ask. Existing tests may need fixtures updated.
- Rate limiting and account lockout (NFR1, NFR2) are deferred to week 10. Do not add them now,
  but do not build anything that assumes they never exist.

When done, list any place where you deviated from instructions.md and why.

Also, don't implement test cases first.

## Product Backlog — User Service (F1–F5, NFR1–NFR4)

### F1 — User Registration

- **F1.1.1** (High, Recess) Reject usernames that are already in use.
- **F1.1.2** (High, Recess) Reject emails that are not in a valid format (must contain @ and domain).
- **F1.1.3** (High, Recess) Reject emails that are already registered to another account.
- **F1.1.4** (High, Recess) Reject passwords that don't contain at least 8 characters, one uppercase, one lowercase, one digit, and one special character.
- **F1.1.5** (High, Week 7) Send an OTP to the provided email and only complete registration after the OTP is verified.
- **F1.1.6** (High, Week 7) Allow requesting a new OTP email 60 seconds after the previous one, up to 5 times.
- **F1.1.7** (High, Week 7) Invalidate the OTP after one use OR after 10 minutes OR after a new OTP is generated, whichever comes first.
- **F1.1.8** (High, Week 7) Reserve the username and email during the OTP period to prevent duplicates.
- **F1.2.1** (High, Recess) Store passwords as salted hashes.

### F2 — Login / Logout

- **F2.1.1** (High, Recess) Accept login attempts where username/email and password match a registered account.
- **F2.1.2** (High, Recess) Reject login attempts where they don't match.
- **F2.1.3** (High, Recess) Authenticate subsequent requests from a logged-in user without re-entering credentials for the session duration.
- **F2.2.1** (High, Week 7) Users who have logged out must log in again to access the app.
- **F2.3.1** (High, Week 7) Allow other services to verify a user's identity and role from their active session.

### F3 — Password Reset ("Forgot Password")

- **F3.1.1** (High, Week 7) If the email matches a registered email, send an OTP before permitting password change.
- **F3.1.2** (High, Week 7) If the email does not match, do not send an OTP.
- **F3.1.3** (High, Week 7) Reject the new password if it doesn't meet F1.1.4 complexity rules.
- **F3.1.4** (High, Week 7) Invalidate the OTP after one use or 10 minutes or a new OTP generated, whichever comes first.

### F4 — Viewing and Updating Profile Information

- **F4.1.1** (Med, Week 10) Allow users to view their username and registered email.
- **F4.2.1** (Med, Week 10) Reject a new email if already in use, same as old email, or fails F1.1.2 complexity rules.
- **F4.2.2** (Med, Week 10) Require password re-entry; reject the email change if it doesn't match the current password.
- **F4.2.3** (Med, Week 10) Send an OTP to the new email and require entry before allowing the change.
- **F4.2.4** (Med, Week 10) Allow requesting a new OTP email 60 seconds after the previous one, up to 5 times.
- **F4.2.5** (Med, Week 10) Invalidate the OTP after one use or 10 minutes or a new OTP generated, whichever comes first.
- **F4.2.6** (Med, Week 10) Use the existing email for all communications/authentication until OTP verification completes.
- **F4.3.1** (Med, Week 10) Require password re-entry; reject the password change if it doesn't match the current password.
- **F4.3.2** (Med, Week 10) Send an OTP to the registered email and require entry before allowing the password change.
- **F4.3.3** (Med, Week 10) Reject the new password if it fails F1.1.4 complexity rules, or is identical to the old password.
- **F4.3.4** (Low, Week 10) Invalidate any active sessions on other devices after a successful password change.
- **F4.4.1** (Med, Week 10) Reject a new username if already in use by another user or identical to the old username.

### F5 — Role Management

- **F5.1.1** (High, Week 7) Enforce administrative privilege separation across user/administrator/super administrator.
- **F5.1.2** (High, Week 7) On startup, if no super administrator exists, bootstrap one using pre-configured system credentials.
- **F5.1.3** (High, Week 7) Prevent registration of an administrator account via public registration endpoints.
- **F5.1.4** (High, Week 7) Prevent a standard user from modifying the role of any user (including themself).
- **F5.1.5** (High, Week 7) Prevent an administrator from modifying the role of any user (including themself).
- **F5.1.6** (High, Week 7) Allow a super administrator to modify the role of any other user (excluding themself) to administrator or standard user.
- **F5.2.1** (High, Week 7) All users can post and fulfill errands without restriction.
- **F5.2.2** (High, Week 7) Persist the user's last active view (requestor/courier) across sessions.
- **F5.3.1** (High, Week 7) Allow administrators to view all users.
- **F5.3.2** (High, Week 7) Allow administrators to view transaction details of individual users.
- **F5.3.3** (High, Week 7) Allow administrators to suspend/unsuspend individual users.

### NFR1 — Brute-Force Protection

- **NFR1.1** Automatically lock an account for 1 hour after 5 consecutive failed login or OTP attempts within a 15-minute window.
- **NFR1.1.1** (Med, Week 10) Upon lock, dispatch a security notification email with an unlock link within 60 seconds.

### NFR2 — Timely OTP Delivery

- **NFR2.1** Dispatch the OTP email within 1 minute of the triggering event.
- **NFR2.1.1** (Med, Week 10) Retry failed OTP email attempts up to 3 times.
- **NFR2.1.2** (Med, Week 10) Log any OTP email delivery failures for monitoring.

### NFR3 — Additional Auth & Data Masking for Sensitive Info

- **NFR3.1.1** (Med, Week 10) Mask sensitive user fields (e.g. email addresses) by default across all standard admin views.
- **NFR3.1.2** (Med, Week 10) Require secondary OTP verification before unmasking sensitive user fields.
- **NFR3.1.3** (Med, Week 10) Unmasked info remains visible for max 15 minutes before automatically re-masking.
- **NFR3.2.1** (Med, Week 10) Require secondary OTP verification prior to high-risk admin actions (e.g. manual suspension, direct credit adjustments).
- **NFR3.2.2** (Med, Week 10) Record all secondary OTP verification attempts and high-risk admin actions in an audit log.

### NFR4 — Session Support

- **NFR4.1.1** (High, Week 8) Automatically invalidate a session after 30 minutes of inactivity, requiring re-authentication.
- **NFR4.1.2** (High, Week 8) Automatically invalidate a session after 7 days since last login, requiring re-authentication. _(labeled "NFR4.1." in the source — likely a typo for NFR4.1.2)_
- **NFR4.2.1** (High, Week 8) Notify the user 1 minute before session expiry due to inactivity, with an option to extend.

## Stage 1: Project Scaffold

Set up the below files and directory structure.

### Stack:

- Runtime: Node.js (Express) - TypeScript
- Database: PostgreSQL + pg (raw pg, no ORM or query builder)
- Containerisation: Docker + Docker Compose
- Frontend: React Vite (already partially implemented — do not touch it unless instructed)
- Auth: RS256 JWT (access token 15 min, refresh token 7 days stored as SHA-256 hash in DB)
- Password hashing: bcrypt (work factor 10)
- OTP/token hashing: SHA-256
- Email handing: Nodemailer
- Crypto handling: Node's build in crypto
- Request body validation: Zod
- Test runner: Vitest
- Linter: ESLint
- Formatter: Prettier

### Given repo structure (single-repo, one folder per microservice):

```
/
├── foc-mockup/    ← this is my frontend, already exists, do not modify
├── user-service/  ← you are building this
├── compose.yaml    ← top-level, to be created/extended
├── data           ← supplier seed data
└── ...            ← other services are here
```

### User service structure

user-service/
├── src/
├── keys/
├── Dockerfile ← already there
├── package.json
├── tsconfig.json
├── .env.example
├── .env ← gitignored
└── .gitignore

src/
├── routes/
├── controllers/
├── middleware/
├── services/
├── db/
│ ├── pool.ts
│ ├── init.sql
│ └── queries/
├── utils/
├── config.ts
└── app.ts

````

### Set up `package.json`

Create `user-service/package.json`:

```json
{
  "name": "user-service",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/app.ts",
    "dev": "nodemon -L --watch src --ext ts,json --exec tsx src/app.ts",
    "build": "tsc",
    "test": "vitest",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "dependencies": {
    "bcrypt": "^6.0.0",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.5",
    "express": "^4.21.2",
    "jsonwebtoken": "^9.0.2",
    "nodemailer": "^10.0.10",
    "pg": "^8.13.1",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.17.0",
    "@types/bcrypt": "^5.0.2",
    "@types/cookie-parser": "^1.4.7",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^20.11.0",
    "@types/nodemailer": "^6.4.17",
    "@types/pg": "^8.11.10",
    "eslint": "^9.17.0",
    "nodemon": "^3.1.9",
    "prettier": "^3.4.2",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "typescript-eslint": "^8.19.0",
    "vitest": "^1.6.0"
  }
}
````

### Set up `.env.example`

Create `user-service/.env.example`:

```env
# Server
PORT=3001
NODE_ENV=development

# PostgreSQL
DB_HOST=user-db
DB_PORT=5432
DB_NAME=user_service
DB_USER=postgres
DB_PASSWORD=postgres

# JWT (RS256)
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem
ACCESS_TOKEN_TTL_MINUTES=15
REFRESH_TOKEN_TTL_DAYS=7

# Email (Nodemailer)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

### Set up `keys`

- Create `user-service/keys/`
- Generate an RS256 key pair and place them here

### Set up `.gitignore`

- Create `user-service/.gitignore` and add `keys/` in

### Set up app.ts

- Create a barebones app.ts stub in `/src/`

### Set up tsconfig.json

- Create a tsconfig.json in `/user-service/`

```
{
  "compilerOptions": {
    "target": "es2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,

    "rootDir": "./src",
    "outDir": "./dist",
    "sourceMap": true,


    "allowJs": true,
    "resolveJsonModule": true,
    "moduleDetection": "force",
    "isolatedModules": true,
    "verbatimModuleSyntax": true,

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  },
  "include": ["src/**/*"]
}
```

### Verification

- Run `npm install` inside `user-service/` and confirm it completes without errors
- Confirm `keys/private.pem` and `keys/public.pem` exist

## Stage 2: Databaset setup

### Stage 2a: Write the schema

Create the SQL schema file `user-service/src/db/init.sql` with the following requirements:

- Create enums safely using DO $$ BEGIN ... EXCEPTION WHEN duplicate_object blocks:
  - `status_enum`: 'active', 'suspended'
  - `role_enum`: 'user', 'admin', 'super admin'
  - `purpose_enum`: 'Registration', 'Forgot Password', 'Change Email', 'Change Password', 'Admin Action'
- Create table using IF NOT EXISTS:

  ```
  CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status status_enum NOT NULL DEFAULT 'active',
  role role_enum NOT NULL DEFAULT 'user'
  );

  CREATE TABLE IF NOT EXISTS users_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  otp_hash CHAR(64) NOT NULL,
  new_email VARCHAR(255),
  purpose purpose_enum NOT NULL,
  attempts_count SMALLINT NOT NULL DEFAULT 0,
  max_attempts SMALLINT NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ```

### Stage 2b: Set up `config.ts`

Create `user-service/src/config.ts`:

- Load and validate all environment variables using Zod at startup
- If any required variable is missing, log a clear error and exit immediately
- Export a single structured `config` object grouped by concern (db, jwt, email, etc.)
- All other files in the project must import env vars from here, never from `process.env` directly

### Stage 2c: Set up connection pool

Create `user-service/src/db/pool.ts`:

- Export a single `pg.Pool` instance
- All connection config must come from `config.ts`, never from `process.env` directly

### Verification

- Remove a required env var from `.env` and confirm it crashes with a clear error message

## Stage 3: Docker Setup

### Stage 3a: Dockerfile

Modify the existing `user-service/Dockerfile`:

- Let's have a multi-stage Dockerfile - one stage for dev (FROM image AS dev) and one stage for prod (FROM image AS prod)
  - Dev stage: runs nodemon -L src/app.ts via tsx
  - Prod stage: compiles TypeScript first (tsc), then runs node dist/app.js

- Base image: `node:24-alpine`
- Working directory: `/app`
- Install dependencies from `package.json`
- Copy source files
- Expose port 3001

### Stage 3b: Docker Compose

Populate the existing `compose.yaml` at the repo root:

- A `user-db` service:
  - Image: `postgres:16-alpine`
  - Container name: `foc-user-db`
  - Healthcheck using `pg_isready`
  - Mount `./user-service/src/db/init.sql` into `/docker-entrypoint-initdb.d/` so the schema is applied on first run
  - Named volume for data persistence
- A `user-service` service:
  - Built from `./user-service/Dockerfile`, specify `target: dev`
  - Container name: `foc-user-service`
  - Depends on `user-db` being healthy before starting
  - Load all env vars using `env_file: ./user-service/.env`
  - Mount `./user-service/src:/app/src` for live code reloading
  - Mount `./user-service/keys:/app/keys` for JWT key access

### Stage 3c: .env files

- Create `user-service/.env` by copying `.env.example` as-is, remind user (with a comment) to fill in the SMTP details.
- Add `user-service/.env` to `.gitignore`

### Verification

- Run `docker compose up --build` and confirm both containers start cleanly
- Connect to the DB and verify all tables and enums exist:

```bash
  docker exec -it foc-user-db psql -U postgres -d user_service -c "\dt"
  docker exec -it foc-user-db psql -U postgres -d user_service -c "\dT"
```

## Stage 4: Core Auth

> Users are immediately active upon registration. OTP verification is added in Stage 5 — at that point, registration will require OTP before the account is activated. For now, registration creates an active account directly.

---

### Stage 4a: App Setup + Middleware

#### Dependencies

Add `cookie-parser` and its types to `package.json`:

```json
"cookie-parser": "^1.x"
"@types/cookie-parser": "^1.x"
```

#### Update `app.ts`

- Register `cookie-parser` middleware
- Register `express.json()` middleware if not already present
- Mount auth router at `/auth`

#### Create `src/utils/hash.ts`

- Export a `sha256(input: string): string` function using Node's built-in `crypto`

#### Create `src/utils/jwt.ts`

- jwt.ts has a single exported function, e.g. verifyAccessToken(token: string): { user_id: string, role: string }.
- It should call jwt.verify(token, publicKey, { algorithms: ['RS256'] }) and return { user_id, role }.

#### Create `src/middleware/authenticate.ts`

- Extract Bearer token from `Authorization` header
- Call verifyAccessToken(token) from jwt.ts
- If it succeeds, attach `{ user_id, role }` to `req.user`
- Reject with `401` and `{ message: 'Unauthorized', code: 'UNAUTHORIZED' }` if invalid or missing
- Also, add `src/types/express.d.ts` declaring `Express.Request.user?: { user_id: string; role: string }` via global declaration merging

#### Create `src/routes/auth.routes.ts`

- Set up an Express router
- Export it — handlers will be added in later sub-stages

#### Create `src/utils/AppError.ts`

A custom error class for known application errors:

- Constructor takes `status: number`, `message: string`, `code: string`
- Extends the built-in `Error` class

#### Create `src/utils/asyncHandler.ts`

A wrapper that automatically catches errors from async controller functions and passes them to Express's error handler via `next(err)` — eliminates the need for try/catch in every controller.

#### Update `app.ts`

Add a global error handler as the **last** middleware registered:

- If the error is an `AppError`, return `{ message, code }` with the appropriate status code
  If the error is a ZodError: return 400. If any issue has code unrecognized_keys, set message to "Request contains unexpected fields"; otherwise use the first issue's message. code: 'VALIDATION_ERROR'.
- If the error is a SyntaxError with err.type === 'entity.parse.failed' (malformed JSON body from express.json()): return 400 with { message: 'Malformed JSON body', code: 'VALIDATION_ERROR' }.
- Otherwise: log the error and return 500 with { message: 'Internal server error', code: 'INTERNAL_ERROR' }.

#### Create `src/utils/cookies.ts`

- Export a `REFRESH_COOKIE_OPTIONS` constant: `{ httpOnly: true, secure: ..., sameSite: 'lax' }`
- Both `login` (sets the cookie, with `maxAge`) and `logout` (clears it) must import and reuse this constant — never duplicate the options literally in two places

#### Cors

- Add the `cors` package (`^2.x`) to `user-service/package.json`. In `app.ts`, register `cors({ origin: '<frontend dev URL, e.g. http://localhost:5173>', credentials: true })`.

#### General requirements (add to existing list)

- All Zod schemas must use `.strict()` to reject requests containing fields not defined in the schema
- All controllers must be wrapped with `asyncHandler` — no try/catch in controllers
- All known errors (duplicate username, invalid credentials etc.) must be thrown as `AppError` from the service layer
- The global error handler in `app.ts` is the single place that converts errors to HTTP responses
- Since `tsconfig.json` uses `"module": "NodeNext"`, all relative imports throughout the project must include the explicit `.js` extension (e.g. `import { sha256 } from '../utils/hash.js'`), even though the source files are `.ts`
- Query functions returning a user row (findByUsername, findByEmail, findById) return the full row, including password_hash. Callers must never return, log, or spread the full user object directly — always destructure only the needed fields. password_hash must never leave the service layer.

#### Verification

- `app.ts` compiles and starts without errors inside Docker
- A request with no token → `401`
- A request with an expired or tampered-signature token → `401`
- A request with a malformed JSON body → `400`
- A request with an extra / unrecognised field in an otherwise valid body → `400`: `"Request contains unexpected fields"`

---

### Stage 4b: Registration

#### Create `src/db/queries/users.queries.ts`

Implement the following query functions:

- `createUser({ username, email, passwordHash })` — inserts into `users` table
  - In authService.register(), wrap the userQueries.createUser() call in a try/catch. If the caught error has code === '23505' (Postgres unique violation), inspect err.constraint: if it includes username, throw AppError(409, 'Username already in use', 'USERNAME_TAKEN'); if it includes email, throw AppError(409, 'Email already in use', 'EMAIL_TAKEN'). Re-throw any other error unchanged.
- `findByUsername(username)` — returns user or null
- `findByEmail(email)` — returns user or null
- `findById(userId)` - returns user or null

#### Create `src/services/auth.service.ts`

Implement `register({ username, email, password })`:

- Validate username format: min 3 chars, max 255 chars, no spaces, no special characters
- Validate email format: must contain @ and valid domain
- Validate password complexity: min 8 chars, at least one uppercase, one lowercase, one digit, one special character
- If any format validation fails → throw `AppError(400, '...', 'VALIDATION_ERROR')`
  - Username: "Username must contain between 3 and 255 chars and have no spaces or special characters."
  - Email: "Please enter a valid email"
  - Password: "Password must contain at least 8 characters, with at least one uppercase, one lowercase, one digit and one special character. "
- Check username not already in use → call `userQueries.findByUsername()`, throw `AppError(409, 'Username already in use', 'USERNAME_TAKEN')`
- Check email not already in use → call `userQueries.findByEmail()`, throw `AppError(409, 'Email already in use', 'EMAIL_TAKEN')`
- Hash password with bcrypt (work factor 10)
- Call `userQueries.createUser()` to insert into `users` table with `status = 'active'`, `role = 'user'`

#### Create `src/controllers/auth.controller.ts`

- Wrap controller with asyncHandler
  Implement `register` handler:

Validate request body with Zod (use custom messages instead of Zod's own defaults) — check only presence, type, and extra fields; all format/complexity rules stay in the service layer:

- username: required error "Username is required", type error "Username must be a string"
- email: required error "Email is required", type error "Email must be a string"
- password: required error "Password is required", type error "Password must be a string"

**Normalisation (applied in the Zod schema, so the service and DB only ever see normalised values):**

- `email`: trim, then lowercase. Define it once as a shared `emailField` in `auth.controller.ts` and reuse it in every schema that takes an email (register, verify-otp, resend-otp, and any later stage).
- `username`: lowercase only. Do **not** trim, so a leading or trailing space still fails the "no spaces" rule in the service layer.
- Usernames and emails are stored lowercase, so lookups are effectively case-insensitive.

Use .strict() to reject requests containing fields not defined in the schema above. The resulting unrecognized_keys error is handled by the global error handler set up in Stage 4a (message: "Request contains unexpected fields") — no additional handling needed in this controller.

- Call `authService.register()`
- Return `201` with `{ message: 'User registered successfully', code: 'REGISTER_SUCCESS' }`

#### Wire up route

Add to `auth.routes.ts`:

```ts
router.post("/register", authController.register);
```

#### Verification

- `POST /auth/register` with valid body → 201, user appears in DB with hashed password (superseded by stage 5d: reponse is `201_OTP_SENT`, account starts `pending`)
- `POST /auth/register` with duplicate username → 409 USERNAME_TAKEN
- `POST /auth/register` with duplicate email → 409 EMAIL_TAKEN
- `POST /auth/register` with weak password → 400 VALIDATION_ERROR
- `POST /auth/register` with invalid email format → 400 VALIDATION_ERROR
- `POST /auth/register` with username less than 3 chars → 400 VALIDATION_ERROR
- `POST /auth/register` with username containing spaces → 400 VALIDATION_ERROR
- `POST /auth/register` with a field missing entirely (e.g. no password key) → 400 VALIDATION_ERROR, message "Password is required"
- `POST /auth/register` with a field of the wrong type (e.g. password: 12345) → 400 VALIDATION_ERROR, message "Password must be a string"
- `POST /auth/register` with an extra/unrecognized field (e.g. role: 'admin' included in the body) → 400 VALIDATION_ERROR, message "Request contains unexpected fields"
- `POST /auth/register` with malformed JSON body (not valid JSON at all) → 400 VALIDATION_ERROR, message "Malformed JSON body"
- Fire two `POST /auth/register` requests with the same username near-simultaneously → confirm one succeeds 201 and the other returns 409 USERNAME_TAKEN (not 500)

---

### Stage 4c: Login + Tokens

#### Create `src/db/queries/tokens.queries.ts`

Implement the following query functions:

- `createRefreshToken({ userId, tokenHash, ttlDays, userAgent, ipAddress })` — inserts into `refresh_tokens` table, with `expires_at = NOW() + make_interval(days => $ttl)` computed in SQL (see the clock rule in Stage 5c)
- `findRefreshToken(tokenHash)` — returns token row (plus `clock_timestamp() AS db_now`) or null
- `lockRefreshToken(tokenHash, db)` — `SELECT *, clock_timestamp() AS db_now ... FOR UPDATE`, returns the token row (plus `db_now`) or null
- `revokeRefreshToken(tokenHash, db)` — sets `is_revoked = true`, `revoked_at = now`

All token queries take an optional last parameter `db: Queryable = pool`, like the user queries, so they can run inside a transaction.

#### Update `src/services/auth.service.ts`

Implement `login({ identifier, password }, userAgent, ipAddress)`:

- Look up user by username or email using `identifier`
- Reject if not found → throw `401` with `{ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }`
- Reject if password doesn't match bcrypt hash → throw `401` with same error
- Reject if `status = 'suspended'` → throw `403` with `{ message: 'Account suspended', code: 'ACCOUNT_SUSPENDED' }`
- Issue RS256 access token (15 min TTL) with claims `{ sub: user.id, role: user.role }` using private key from `config.ts`
- Generate refresh token: 32 cryptographically random bytes (hex string) using Node's built-in `crypto`
- Store SHA-256 hash of refresh token in `refresh_tokens` table with `expires_at = now + 7 days`
- **Race-safety:** verify the password before locking (bcrypt is slow), then create the refresh token inside `withTransaction`: `locked = lockUserById(user.id, client)`; if `locked` is null or `locked.password_hash !== user.password_hash` → `401 INVALID_CREDENTIALS` (the password changed while logging in); if `locked.status` is `'suspended'` → `403 ACCOUNT_SUSPENDED`; otherwise `createRefreshToken(..., client)`. Take the role for the access token from `locked`. Without this, a login that verified the old password can create a refresh token _after_ a password reset has revoked all of them. (Added in Stage 6, see "Changes to already-implemented code".)
- Return `{ accessToken, refreshToken, user: { id, username, email, role } }`

#### Update `src/controllers/auth.controller.ts`

Implement `login` handler - accepts both username / email AND password

Validate request body with Zod (use custom messages instead of Zod's own defaults) — check only presence, type, and extra fields; all format/complexity rules stay in the service layer:

- identifier: required error "Username/Email is required", type error "Username/Email must be a string"
- password: required error "Password is required", type error "Password must be a string"
- `identifier` is trimmed and lowercased whole (usernames and emails are both stored lowercase).

Use .strict() to reject requests containing fields not defined in the schema above. The resulting unrecognized_keys error is handled by the global error handler set up in Stage 4a (message: "Request contains unexpected fields") — no additional handling needed in this controller.

- Call `authService.login()`
- Set refresh token as the settings specified in `src/utils/cookies.ts`.
- Return `200` with `{ accessToken, user: { id, username, email, role } }`

Error responses:

- `401`: `{ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }`
- `403`: `{ message: 'Account suspended', code: 'ACCOUNT_SUSPENDED' }`

#### Wire up route

Add to `auth.routes.ts`:

```ts
router.post("/login", authController.login);
```

#### Verification

- `POST /auth/login` with valid credentials → `200`, access token in body, refresh token cookie set
- `POST /auth/login` with wrong password → `401`
- `POST /auth/login` with unknown identifier → `401`
- `POST /auth/login` with suspended account → `403`
- Confirm refresh token hash appears in `refresh_tokens` table in DB
- `POST /auth/login` using the registered email as `identifier` → `200`, succeeds
- `POST /auth/login` using the registered username as `identifier` → `200`, succeeds
- `POST /auth/login` with a field missing entirely (e.g. no `identifier`) → `400` `VALIDATION_ERROR`, message `"Username/Email is required"`
- `POST /auth/login` with a field of the wrong type (e.g. `identifier: 12345`) → `400` `VALIDATION_ERROR`, message `"Username/Email must be a string"`
- `POST /auth/login` with an extra/unrecognized field → `400` `VALIDATION_ERROR`, message `"Request contains unexpected fields"`
- Decode the returned access token (e.g. jwt.io or a script) → confirm claims are `{ sub: <user id>, role: <user role> }`, algorithm `RS256`, `exp` ≈ 15 min out

---

### Stage 4d: Logout + Refresh

#### Update `src/services/auth.service.ts`

Implement `logout(refreshToken)`:

- Hash refresh token with SHA-256
- Run everything inside `withTransaction`, so two concurrent logouts with the same cookie cannot both succeed:
  - Look up the token with `lockRefreshToken(tokenHash, client)`, which is `SELECT ... FOR UPDATE` on `refresh_tokens`, so a second request waits and then sees the first one's committed result
  - If not found or already revoked → throw `401` with `{ message: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' }`
  - Set `is_revoked = true`, `revoked_at = now` using the same `client`

Implement `refresh(refreshToken)`:

- Hash refresh token with SHA-256
- `findRefreshToken(tokenHash)` as a plain, unlocked read. This is a cheap early exit and it gives the `user_id`: if not found, revoked, or expired (compare `expires_at` against the row's `db_now`, not `Date.now()`) → throw `401` with `{ message: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' }`
- Then, inside `withTransaction`, lock and re-check. **Lock order matters: user row first, then token row.**
  1. `lockedUser = lockUserById(tokenRow.user_id, client)`. If null → `401 INVALID_REFRESH_TOKEN`
  2. `lockedToken = lockRefreshToken(tokenHash, client)`. If null, revoked, or expired (compare against its `db_now`) → `401 INVALID_REFRESH_TOKEN`
  3. If `lockedUser.status` is `'suspended'` → `AppError(403, 'Account suspended', 'ACCOUNT_SUSPENDED')` instead of issuing a new token
  4. Issue the new RS256 access token (15 min TTL) from `lockedUser.id` and the freshly-locked `lockedUser.role` (not any cached role), so a role change (e.g. promotion) takes effect on the next refresh rather than only after re-login
- Return `{ accessToken }`

**Why the locks:** without them, a refresh already in flight can mint an access token after a logout, password reset, or suspension has committed. With them, a refresh either finishes before that action or waits and then sees the revoked token (`401`). An access token issued earlier still lives out its 15 minutes.

**Lock ordering rule (whole service):** whenever a transaction locks both a user row and refresh-token rows, lock the **user row first**. Reset-password (user, then its tokens), login and refresh all follow it. Locking a token first and the user second could deadlock against reset-password, and the caller would get a 500. Logout locks only the token row, so it cannot form a cycle.

#### Update `src/controllers/auth.controller.ts`

Implement `logout` handler. It does **not** use the `authenticate` middleware: the refresh cookie is the credential, so logout still works after the access token has expired (otherwise an expired access token blocks logout, the refresh token stays valid, and the browser's silent refresh logs the user straight back in):

- Extract refresh token from `req.cookies.refreshToken`. If the cookie is missing → `401 INVALID_REFRESH_TOKEN`
- Call `authService.logout()`
- Clear the `refreshToken` cookie (with settings from `src/utils/cookies.ts`)
- Return `200` with `{ message: 'Logged out successfully', code: 'LOGOUT_SUCCESS' }`

Logout revokes only the refresh token in the cookie (that device's session). The access token is stateless and stays valid until it expires.

Implement `refresh` handler:

- Extract refresh token from `req.cookies.refreshToken`
- Call `authService.refresh()`
- Return `200` with `{ accessToken }`

#### Wire up routes

Add to `auth.routes.ts`:

```ts
router.post("/logout", authController.logout);
router.post("/refresh", authController.refresh);
```

#### Verification

- `POST /auth/logout` with a valid refresh cookie → `200`, cookie cleared, token revoked in DB, whether or not an `Authorization` header is sent (including an expired access token)
- `POST /auth/logout` without a `refreshToken` cookie → `401 INVALID_REFRESH_TOKEN`
- `POST /auth/refresh` with valid cookie → `200`, new access token returned
- `POST /auth/refresh` after logout → `401`
- `POST /auth/refresh` with expired refresh token → `401`
- `POST /auth/logout` with a valid access token but a missing/garbage `refreshToken` cookie → `401 INVALID_REFRESH_TOKEN`
- `POST /auth/logout` with a valid access token but an already-revoked `refreshToken` cookie → `401 INVALID_REFRESH_TOKEN`
- Fire several `POST /auth/logout` requests at once with the same access token and cookie → exactly one `200`, the rest `401 INVALID_REFRESH_TOKEN`
- Suspend the user in the DB directly (`UPDATE users SET status = 'suspended' WHERE ...`), then `POST /auth/refresh` with their still-valid, non-expired, non-revoked cookie → `403 ACCOUNT_SUSPENDED`, no new access token issued
- Promote the user in the DB directly (`UPDATE users SET role = 'admin' WHERE ...`), then `POST /auth/refresh` with a valid cookie → `200`, decode the new access token and confirm its `role` claim reflects `'admin'`, not the stale role from the original login
- `POST /auth/refresh` with a `refreshToken` cookie that never existed (random hex string, never issued) → `401 INVALID_REFRESH_TOKEN`
- Run `POST /auth/refresh` in a loop while `POST /auth/logout` runs with the same cookie → once logout has returned `200`, every refresh that starts afterwards returns `401 INVALID_REFRESH_TOKEN`
- Run `POST /auth/refresh` and `POST /auth/reset-password` concurrently several times (Stage 6d) → no deadlock errors: no `500` responses and no `deadlock detected` in the service logs

---

### Stage 4e: Inter-Service Verify + Super Admin Bootstrap

#### GET /auth/verify

Add to `src/controllers/auth.controller.ts`:

Implement `verify` handler:

- Extract the Bearer token from the Authorization header
- Call the verifyAccessToken(token) util from src/utils/jwt.ts (created in Stage 4a)
- On success, return 200 with { user_id, role } from the verified claims
- Reject with `401` and `{ message: 'Invalid token', code: 'INVALID_TOKEN' }` if invalid or missing or expired

Add to `auth.routes.ts`:

```ts
router.get("/verify", authController.verify);
```

#### Super admin bootstrap

Add the following to `.env.example` and `.env`:

```env
# Super Admin Bootstrap
SUPER_ADMIN_USERNAME=superadmin
SUPER_ADMIN_EMAIL=superadmin@foc.com
SUPER_ADMIN_PASSWORD=
```

On app startup in `app.ts`:

- Check if a user with `role = 'super admin'` exists in the `users` table
- If not, create one using `SUPER_ADMIN_USERNAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` from `config.ts`
- Password must meet the same complexity rules as regular registration
- Log a clear message when bootstrap creates the super admin
- Skip silently if super admin already exists

**Race-safe creation:** the check-then-create must tolerate two instances starting at once, and a configured username or email that already belongs to a regular user.

- Insert with `INSERT ... ON CONFLICT DO NOTHING RETURNING *`. `createSuperAdmin` returns the new row, or nothing if the insert was skipped.
- Lowercase (and trim) the configured username and email before inserting, like every other username and email.
- If the insert was skipped, run the super admin check again:
  - A super admin now exists → another instance created it; continue silently.
  - Still none → the configured username or email belongs to a non-super-admin account; throw a clear error, for example `SUPER_ADMIN_USERNAME or SUPER_ADMIN_EMAIL is already used by a non-super-admin account.`

- In app.ts, ensure the super admin bootstrap check completes (await it) before calling app.listen().
- In config.ts's Zod schema, SUPER_ADMIN_PASSWORD must use .min(1) (or equivalent) rather than a bare .string().

Add super admin credentials to `config.ts` Zod schema.

#### Verification

- `GET /auth/verify` with valid access token → `200`, returns `{ user_id, role }`
- `GET /auth/verify` with invalid token → `401`
- `GET /auth/verify` with expired token → `401`
- Confirm super admin exists in DB on first startup:

```bash
  docker exec -it foc-user-db psql -U postgres -d user_service -c "SELECT username, role FROM users;"
```

- Restart containers and confirm super admin is not duplicated
- Configure `SUPER_ADMIN_USERNAME` to a username already held by a regular user (on a DB that has no super admin) → the app exits with the clear error message, not a raw Postgres unique-violation
- `GET /auth/verify` with no `Authorization` header at all → `401 INVALID_TOKEN`
- `GET /auth/verify` with a well-formed but wrong-signature token (e.g. signed with a different key pair) → `401 INVALID_TOKEN`
- Take one valid access token, confirm it's accepted by both an `authenticate`-protected route and by `GET /auth/verify` (logout no longer uses `authenticate`, so no route uses it until `GET /users/me` in a later stage; until then check this with a temporary protected test route, or defer it) — confirms both call sites agree, since they share `verifyAccessToken`

## Stage 5: OTP Flow (Send, Verify, Resend)

> **Scope**: This stage builds the generic OTP infrastructure (generation, hashing, email delivery, verification, resend) and wires it up for the **Registration** purpose only. Forgot Password, Change Email, Change Password and Admin Action are wired in later stages, so the service layer must take `purpose` as a parameter, but the public endpoints only accept `registration` for now.
>
> Registration changes from "instant active account" (Stage 4b) to "pending account, active only after OTP verification".
>
> Backlog refs: F1.1.5, F1.1.6, F1.1.7, F1.1.8.

### Design decisions (already made, do not change)

| Rule                       | Value                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| OTP format                 | 6 digits, numeric, cryptographically random (`crypto.randomInt`), zero-padded                                             |
| OTP storage                | SHA-256 hash in `users_otps.otp_hash`, never the plaintext                                                                |
| OTP lifetime               | 10 minutes from creation                                                                                                  |
| Single use                 | Consumed on successful verification (`consumed_at` set)                                                                   |
| New OTP invalidates old    | Generating a new OTP sets `consumed_at` on all of that user's still-active OTPs for the same purpose                      |
| Wrong-guess limit          | `max_attempts` = 5 per OTP (DB default). Once `attempts_count` reaches the max, that OTP is dead and the user must resend |
| Resend cooldown            | 60 seconds since the previous OTP was created                                                                             |
| Resend limit               | 5 resends per registration (i.e. at most 6 OTP rows per user for `Registration`)                                          |
| Username/email reservation | The pending user row itself holds the username and email until the latest OTP expires                                     |
| Registration `new_email`   | `NULL` (only used by Change Email later)                                                                                  |

---

### Stage 5a: Schema, Config, Utilities

#### Update `src/db/init.sql`

- Add `'pending'` to `status_enum`: `('pending', 'active', 'suspended')`
- Keep the `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object` wrapper
- Note: `init.sql` only runs on a fresh DB volume. After this change, reset the dev DB with `docker compose down -v` (dev data only) so the enum is recreated. Remind me of this in your summary.

#### Update `.env.example` and `.env`

```env
# OTP
OTP_TTL_MINUTES=10
OTP_RESEND_COOLDOWN_SECONDS=60
OTP_MAX_RESENDS=5
OTP_RESEND_WINDOW_MINUTES=60
```

#### Update `src/config.ts`

- Add the four OTP vars to the Zod schema (coerce to numbers, positive integers) and expose them as `config.otp = { ttlMinutes, resendCooldownSeconds, maxResends, resendWindowMinutes }`. `resendWindowMinutes` is the rolling window used to count resends for purposes other than registration (see `countOtps` in Stage 5c).
- SMTP vars (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) may be empty **only when** `NODE_ENV=development`. In any other environment they are required and the app must exit with a clear error, as before.

#### Update `src/utils/hash.ts`

- Add `hashesMatch(a: string, b: string): boolean` using `crypto.timingSafeEqual` on the two hex digests (return `false` if lengths differ, never throw)

#### Create `src/utils/otp.ts`

- `generateOtp(): string` — `crypto.randomInt(0, 1_000_000)` padded to 6 digits with leading zeros. Do not use `Math.random`.

#### Create `src/db/transaction.ts`

Some operations in this stage involve several database steps that must succeed or fail together (e.g. creating a pending user _and_ its OTP). This file provides a helper for that.

**`withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T>`**

A transaction has to run on a single connection, so this helper:

1. Borrows one connection from the pool.
2. Runs `BEGIN`, then calls `fn(client)`. All queries inside `fn` must use this `client`, not the pool.
3. If `fn` finishes normally, runs `COMMIT` and returns its result.
4. If `fn` throws, runs `ROLLBACK` to undo everything, then rethrows the same error so the global error handler still sees it.
5. Always returns the connection to the pool in a `finally` block, whether it succeeded or failed. A leaked connection will eventually make the whole service hang.

**`Queryable` type: `pg.Pool | pg.PoolClient`**

Both the pool and a checked-out client have a `.query()` method. Exporting this type lets each query function accept either one, so it works on its own (using the pool) or inside a transaction (using the transaction's client).

#### Update `src/db/queries/users.queries.ts`

All query functions now accept an optional last parameter `db: Queryable = pool` so they can run inside a transaction. Existing callers keep working unchanged.

- `createUser({ username, email, passwordHash, status })` — `status` is now a parameter (`'pending' | 'active'`). Update the Stage 4b caller and the super admin bootstrap to pass it explicitly (bootstrap passes `'active'`).
- `lockUserById(userId, db)` — `SELECT ... FOR UPDATE`, returns the row or null
- `activateUser(userId, db)` — sets `status = 'active'`, `updated_at = NOW()` **only where `status = 'pending'`**; returns whether a row was updated
- `deleteStalePendingUsers({ username, email }, db)` — a single statement:

```sql
DELETE FROM users
WHERE id IN (
  SELECT id FROM users
  WHERE status = 'pending'
    AND (username = $1 OR email = $2)
    AND NOT EXISTS (
      SELECT 1 FROM users_otps o
      WHERE o.user_id = users.id AND o.expires_at > NOW()
    )
  FOR UPDATE SKIP LOCKED
);
```

`FOR UPDATE SKIP LOCKED` matters: a row that a verify or resend has locked is skipped instead of waited on. Without it, the delete waits for the lock and then deletes the row even though the resend just gave it a live OTP. The skipped row is then seen as taken, and the register request returns `USERNAME_TAKEN` or `EMAIL_TAKEN`.

Cascade deletes the stale OTP rows. This is how an expired reservation is released.

#### Verification

- `docker compose down -v && docker compose up --build` starts cleanly
- `\dT+ status_enum` shows `pending`, `active`, `suspended`
- App still boots with SMTP vars empty in development
- Temporarily set `NODE_ENV=production` with empty SMTP vars → app exits with a clear error naming the missing variables (revert afterwards)
- `generateOtp()` never returns a string that isn't exactly 6 digits (quick Vitest unit test: 10,000 iterations, regex `^\d{6}$`)

---

### Stage 5b: Email Service

#### Create `src/services/email.service.ts`

- Create one Nodemailer transport from `config.email`
- Export `sendOtpEmail({ to, otp, purpose }: { to: string; otp: string; purpose: string }): Promise<void>`
- Subject and body wording come from a small `purpose → { subject, intro }` map. For now only `Registration` is needed: subject `"Your FoC verification code"`.
- Send both `text` and `html` bodies. Body contains the OTP and the expiry (`config.otp.ttlMinutes` minutes). No links.
- The function **throws** on send failure. Callers decide what to do (see 5d/5e).
- Development fallback: if `NODE_ENV=development` and `SMTP_HOST` is empty, do not attempt SMTP. Log `[DEV EMAIL] to=<to> purpose=<purpose> otp=<otp>` to the console instead. This branch must be unreachable in any other environment.
- Never log the OTP anywhere else.

#### Verification

- With SMTP empty in development, calling the function prints the dev log line
- With real SMTP credentials filled in, an email arrives at a real inbox with the correct code and expiry text

---

### Stage 5c: OTP Queries + Service

#### Create `src/db/queries/otp.queries.ts`

All functions take `db: Queryable` as the last parameter.

- `createOtp({ userId, otpHash, purpose, newEmail, ttlMinutes }, db)` — inserts into `users_otps`, with `expires_at = NOW() + make_interval(mins => $ttl)` computed in SQL
- `invalidateActiveOtps(userId, purpose, db)` — `UPDATE users_otps SET consumed_at = NOW() WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`
- `findLatestOtp(userId, purpose, db)` — most recent row by `created_at` (any state), plus `clock_timestamp() AS db_now`, or null
- `countOtps(userId, purpose, db, sinceMinutes?)` — number of rows for that user and purpose (used for the resend limit).
  - Without `sinceMinutes` it counts **all** rows. Registration deliberately calls it this way (5 resends per registration, per F1.1.6), because the flow ends when the last OTP expires and the user can register again. Do not route the registration resend through `requestOtp` (Stage 6a) without keeping this behaviour.
  - With `sinceMinutes` it counts only rows with `created_at > clock_timestamp() - sinceMinutes`. Purposes that can be requested repeatedly over an account's lifetime (forgot password, change email, change password, admin action) pass `config.otp.resendWindowMinutes`, so the limit is per rolling window and a user is never locked out permanently.
- `incrementAttempts(otpId, db)` — `attempts_count = attempts_count + 1`, returns the new count
- `consumeOtp(otpId, db)` — `SET consumed_at = NOW() WHERE id = $1 AND consumed_at IS NULL`, returns whether a row was updated

**Clock rule (applies to the whole service):** the database owns time. Write expiries in SQL (`NOW() + make_interval(...)`). For "has it expired?" and cooldown checks, compare against the `db_now` returned by the query (`clock_timestamp()`), never `Date.now()`. Use `clock_timestamp()` rather than `NOW()` for these reads, because `NOW()` is frozen at the start of the transaction and would be stale after waiting on a row lock. JWT `iat`/`exp` are the only exception, since they are set by the JWT library.

#### Create `src/services/otp.service.ts`

This layer is purpose-agnostic and knows nothing about HTTP.

- `issueOtp({ userId, email, purpose, newEmail? }, db)`:
  1. `invalidateActiveOtps`
  2. `generateOtp()`, then `sha256` it
  3. `createOtp` with `ttlMinutes: config.otp.ttlMinutes` (the database computes the expiry)
  4. `sendOtpEmail` (sent to `newEmail ?? email`)
  5. If sending throws, log the error (without the OTP) and throw `AppError(503, 'Unable to send verification email. Please try again.', 'EMAIL_SEND_FAILED')`
  - Callers run this inside `withTransaction`, so a send failure rolls back the new OTP (and any invalidation of the previous one).

- `checkOtp({ userId, purpose, otp }, db)` — must be called inside a transaction that already holds the user row lock:
  1. `findLatestOtp`. If null, or `consumed_at` is set → `AppError(400, 'Invalid or expired OTP', 'INVALID_OTP')`
  2. If `expires_at` has passed → `AppError(400, 'OTP has expired. Please request a new one.', 'OTP_EXPIRED')`
  3. If `attempts_count >= max_attempts` → `AppError(429, 'Too many incorrect attempts. Please request a new OTP.', 'OTP_ATTEMPTS_EXCEEDED')`
  4. Compare `sha256(otp)` to `otp_hash` with `hashesMatch`
  5. On mismatch: `incrementAttempts`, then return `{ ok: false }` (do **not** throw inside the transaction, see the warning below)
  6. On match: `consumeOtp`. If it returns false, treat as `INVALID_OTP`. Return `{ ok: true }`.

> **Warning: the attempt increment must survive.** If the wrong-guess path throws inside `withTransaction`, the `ROLLBACK` will undo the `incrementAttempts` and the attempt limit becomes bypassable. `checkOtp` returns `{ ok: false }`, the transaction commits, and only then does the caller throw `AppError(400, 'Invalid or expired OTP', 'INVALID_OTP')`.

#### Verification

- Unit-test `checkOtp`'s branching with a stubbed `db` where practical (Vitest); at minimum verify manually via 5e

---

### Stage 5d: Registration Now Creates a Pending Account

#### Update `authService.register()` in `src/services/auth.service.ts`

Keep all existing format validation (username, email, password) and error messages unchanged. Replace the persistence part with a single `withTransaction`:

1. `deleteStalePendingUsers({ username, email })`
2. Existing duplicate checks: `findByUsername` then `findByEmail`, throwing `USERNAME_TAKEN` / `EMAIL_TAKEN` (409) as before. A live pending user (unexpired OTP) counts as taken, which is the F1.1.8 reservation.
3. Hash the password with bcrypt (work factor 10)
4. `createUser({ ..., status: 'pending' })`, keeping the existing `23505` catch → `USERNAME_TAKEN` / `EMAIL_TAKEN` mapping (this still covers the concurrent-register race)
5. `issueOtp({ userId, email, purpose: 'Registration' })`

If any of the 5 steps fails, the transaction rolls back and no pending user remains.

#### Update `register` in `src/controllers/auth.controller.ts`

- Request validation unchanged
- Return `201` with `{ message: 'Verification code sent to your email', code: 'OTP_SENT' }`

#### Update `authService.login()`

- After the password check succeeds, if `status = 'pending'` → `AppError(403, 'Account not verified', 'ACCOUNT_NOT_VERIFIED')`
- Keep the order: not found / wrong password (401) first, then pending (403), then suspended (403). This prevents revealing account state to someone who doesn't know the password.

#### Verification

- `POST /auth/register` valid body → `201 OTP_SENT`, user row exists with `status = 'pending'`, one `users_otps` row exists with `purpose = 'Registration'`, `otp_hash` is 64 hex chars, `expires_at` ≈ 10 min out, `new_email` is NULL
- Dev console shows the OTP (or a real email arrives if SMTP is configured)
- `POST /auth/login` with the pending account's correct credentials → `403 ACCOUNT_NOT_VERIFIED`
- `POST /auth/login` with the pending account and a wrong password → `401 INVALID_CREDENTIALS`
- `POST /auth/register` again with the same username/email while the OTP is still live → `409 USERNAME_TAKEN` / `EMAIL_TAKEN`
- Set the pending user's OTP `expires_at` to the past in the DB, then register again with the same username and email → `201`, and the old pending row is gone (only one row for that username)
- Force an email failure (e.g. temporarily break the transport) → `503 EMAIL_SEND_FAILED`, and no pending user or OTP row is left behind
- Concurrent duplicate registration test from Stage 4b still returns one `201` and one `409`, never `500`
- Existing super admin bootstrap still works (creates an `active` super admin)

---

### Stage 5e: Verify OTP + Resend OTP Endpoints

Both endpoints are **public** (no `authenticate`). The API-facing `purpose` value is lowercase (`'registration'`); map it to the DB enum value (`'Registration'`) in one place. Only `'registration'` is accepted for now; extend the Zod enum in later stages.

#### Request validation (Zod, `.strict()`, custom messages, presence/type/extra-fields only)

`POST /auth/verify-otp`:

- email: required "Email is required", type "Email must be a string" (use the shared `emailField`: trimmed and lowercased)
- otp: required "OTP is required", type "OTP must be a string"
- purpose: required "Purpose is required", type "Purpose must be a string", not in the allowed list → "Invalid purpose"

`POST /auth/resend-otp`:

- email and purpose as above (no `otp`)

Format rule stays in the service layer: `otp` must match `^\d{6}$`, else `AppError(400, 'OTP must be a 6-digit code', 'VALIDATION_ERROR')`.

#### `authService.verifyRegistrationOtp({ email, otp })`

Inside `withTransaction`:

1. Look up the user by email. If none, or `status !== 'pending'` → `INVALID_OTP` (same generic error, do not reveal which case)
2. `locked = lockUserById(user.id)` (serialises concurrent verify/resend for this user). **Re-check after the lock:** if `locked` is null or `locked.status !== 'pending'` → `INVALID_OTP`. The status read in step 1 can be stale, because another request may have changed the row while this one waited for the lock.
3. `checkOtp(...)`
4. If `{ ok: true }` → `activateUser(user.id)`; if it returns false, treat as `INVALID_OTP`
5. Commit, then: if `{ ok: false }` → throw `AppError(400, 'Invalid or expired OTP', 'INVALID_OTP')`
6. On success return nothing sensitive

> Leave a `// TODO(credit-service): emit user-registered event here` comment at the activation point. Do not implement it (F19.1.1 is a later stage).

#### `authService.resendRegistrationOtp({ email })`

Inside `withTransaction`:

1. Look up the user by email. If none or not `pending` → `AppError(400, 'No pending registration found', 'NO_PENDING_REGISTRATION')`
2. `locked = lockUserById(user.id)`. **Re-check after the lock:** if `locked` is null or `locked.status !== 'pending'` → `AppError(400, 'No pending registration found', 'NO_PENDING_REGISTRATION')`. The status read in step 1 can be stale, because another request may have changed the row while this one waited for the lock.
3. `countOtps(user.id, 'Registration')`. If `count - 1 >= config.otp.maxResends` → `AppError(429, 'Maximum OTP resends reached. Please try registering again in about 10 minutes.', 'OTP_RESEND_LIMIT')`. No `Retry-After` here. The 10 minutes is the OTP lifetime (`OTP_TTL_MINUTES`): the pending registration holds the username and email until its latest OTP expires, and registering again earlier returns `USERNAME_TAKEN` / `EMAIL_TAKEN`. If you change `OTP_TTL_MINUTES`, update this message.
4. `findLatestOtp`. If `created_at + cooldown > db_now` → `AppError(429, 'Please wait before requesting another OTP', 'OTP_RESEND_COOLDOWN')`, and set a `Retry-After` header (seconds remaining, about 60). To set the header, attach an optional `retryAfterSeconds` field to `AppError` and have the global error handler emit the header when present. The JSON body stays `{ message, code }`.
5. `issueOtp(...)` (this invalidates the previous OTP and sends the email)

> **Frontend behaviour for registration:** during the first 5 resends, disable the resend button and show a countdown from `Retry-After` ("try again in 60 seconds"). When `OTP_RESEND_LIMIT` is returned, disable resend and show the message ("try registering again in about 10 minutes"); there is no countdown.

#### Controllers in `src/controllers/auth.controller.ts`

- `verifyOtp` → `200` with `{ message: 'Registration complete. You can now log in.', code: 'REGISTER_SUCCESS' }`. No tokens are issued; the user logs in normally afterwards.
- `resendOtp` → `200` with `{ message: 'A new verification code has been sent to your email', code: 'OTP_SENT' }`
- Both wrapped in `asyncHandler`, no try/catch

#### Wire up routes in `auth.routes.ts`

```ts
router.post("/verify-otp", authController.verifyOtp);
router.post("/resend-otp", authController.resendOtp);
```

#### Verification

Happy path:

- Register → `POST /auth/verify-otp` with the correct OTP → `200 REGISTER_SUCCESS`, user `status = 'active'`, OTP row has `consumed_at` set
- Login with the now-active account → `200`

OTP rules:

- Re-submitting the same (already used) OTP → `400 INVALID_OTP`
- Wrong OTP → `400 INVALID_OTP`, `attempts_count` incremented **and persisted** (check the DB after the request)
- 5 wrong OTPs, then the correct OTP → `429 OTP_ATTEMPTS_EXCEEDED`; account stays `pending`
- Expired OTP (set `expires_at` to the past) with the correct code → `400 OTP_EXPIRED`
- Resend, then use the **old** OTP → `400 INVALID_OTP` (old one was invalidated); the **new** OTP works
- OTP `12345` (5 digits) or `abcdef` → `400 VALIDATION_ERROR`, message `"OTP must be a 6-digit code"`
- Unknown email → `400 INVALID_OTP`; already-active email → `400 INVALID_OTP`

Resend rules:

- Resend immediately after registering → `429 OTP_RESEND_COOLDOWN` with a `Retry-After` header
- Resend after 60 seconds (or after backdating `created_at` in the DB) → `200 OTP_SENT`, previous OTP row now has `consumed_at`
- After 5 successful resends (backdate `created_at` between each), the 6th resend → `429 OTP_RESEND_LIMIT`
- Resend for an unknown email or already-active account → `400 NO_PENDING_REGISTRATION`
- Resend when the SMTP send fails → `503 EMAIL_SEND_FAILED`, and the previous OTP is still valid (rolled back)

Validation:

- Missing `otp` → `400 VALIDATION_ERROR`, `"OTP is required"`
- `otp: 123456` (number) → `400 VALIDATION_ERROR`, `"OTP must be a string"`
- `purpose: "forgot password"` → `400 VALIDATION_ERROR`, `"Invalid purpose"`
- Extra field → `400 VALIDATION_ERROR`, `"Request contains unexpected fields"`

Concurrency:

- Fire two `POST /auth/verify-otp` with the correct OTP near-simultaneously → exactly one `200`, the other `400 INVALID_OTP`, user is active exactly once
- Fire two `POST /auth/resend-otp` near-simultaneously (cooldown backdated) → one `200` and one `429`, and only one active (unconsumed) OTP row exists afterwards

---

### Notes for Later Stages (do not implement now)

- `GET /users` (admin) must exclude `status = 'pending'` users
- Forgot Password, Change Email, Change Password and Admin Action reuse `issueOtp` / `checkOtp` and extend the `purpose` enum in the Zod schemas; authenticated purposes will need `authenticate` on their own routes
- Resend-limit counting for those purposes uses the rolling window (`config.otp.resendWindowMinutes`) via `requestOtp`. Only registration counts all rows, because a user only ever has one registration flow.
- NFR2 (email retry ×3 + delivery-failure logging) and NFR1 (lockout after repeated failed OTP attempts) are Week 10 items
- A periodic cleanup of expired pending users is optional; `deleteStalePendingUsers` already reclaims them lazily on re-registration
- Frontend: the register response changed (`201 OTP_SENT`, no active session) and two new endpoints exist; the OTP entry screen is a separate frontend task

> **Superseded by Stage 9:** the "GET /users must exclude pending users" note above no longer holds — Stage 9 shows all users regardless of status, including pending ones.

# Stage 6: Forgot Password Flow

> **Scope**: This stage adds the Forgot Password flow (F3.1), reusing the generic OTP
> infrastructure built in Stage 5 (`issueOtp`, `checkOtp`, `otp.queries.ts`,
> `email.service.ts`). It extends the `purpose` handling in the existing `verify-otp` and
> `resend-otp` endpoints rather than creating parallel ones, and adds one new endpoint:
> `POST /auth/reset-password`.
>
> Backlog refs: F3.1.1, F3.1.2, F3.1.3, F3.1.4.

### Design decisions (already made, do not change)

- **API-facing purpose string** — `forgot_password` maps to the DB enum value `'Forgot Password'`
- **Unknown email** — `forgot-password` and `resend-otp` (purpose `forgot_password`) return `404 EMAIL_NOT_FOUND` and send no OTP (F3.1.2). Hiding which emails are registered is deliberately not a goal for this flow, since registration already reveals it.
- **Throttling is reported, not hidden** — a throttled request gets a real `429`: `OTP_RESEND_COOLDOWN` for the first 5 resends (with a `Retry-After` header, about 60 seconds), and `OTP_RESEND_LIMIT` once the limit is reached, with the message "try again in about an hour" (no `Retry-After`; it matches the default `resendWindowMinutes` of 60)
- **OTP verification is two-step** — `verify-otp` checks the code without consuming it; `reset-password` does the real, consuming check
- **`checkOtp` change** — add an optional `consume` param, defaulting to `true`, so existing callers (registration) are unaffected
- **On successful reset** — set the new password hash, then revoke all of that user's refresh tokens (logs them out everywhere)
- **Account status** — reset works for active and suspended accounts; it doesn't change status. A **pending** (unverified) account gets `403 ACCOUNT_NOT_VERIFIED` from forgot-password, resend, verify and reset: it cannot log in anyway, so a reset would do nothing useful, and a forgot-password OTP on a pending row would keep its username and email reserved for longer (the stale-user cleanup treats any live OTP as a reason to keep the row).
- **New password validation** — reuses the same complexity rule and error message as registration
- **Resend/cooldown/attempt limits** — reuse the OTP infrastructure and config from Stage 5, except that the resend count uses the rolling window (`config.otp.resendWindowMinutes`) instead of counting all rows

---

## Changes to already-implemented code (do these first)

Stage 6 needs the following changes to code that earlier stages already built. Each is specified in detail in the stage named.

> Status (2026-09-26): all nine changes below are implemented. Row 5's controller half was completed in 6c (verify-otp) and 6e (resend-otp).

| #   | File                                                                                                | Change                                                                                                                                                                                                                                                                       | Where specified |
| --- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | `.env.example`, `.env`, `src/config.ts`                                                             | Add `OTP_RESEND_WINDOW_MINUTES=60` to the env files, the Zod schema, and `config.otp.resendWindowMinutes`                                                                                                                                                                    | Stage 5a        |
| 2   | `src/db/queries/otp.queries.ts`                                                                     | `countOtps(userId, purpose, db, sinceMinutes?)`: without `sinceMinutes` it counts all rows (registration, unchanged); with it, only rows created within that many minutes (compared against `clock_timestamp()`)                                                             | Stage 5c        |
| 3   | `src/services/otp.service.ts`                                                                       | `checkOtp` gets an optional `consume` parameter, default `true`; when `false`, skip `consumeOtp` but still increment attempts on a wrong guess                                                                                                                               | Stage 6a        |
| 4   | `src/services/email.service.ts`                                                                     | Add a `Forgot Password` entry to the purpose map (subject "Your FoC password reset code")                                                                                                                                                                                    | Stage 6a        |
| 5   | `src/controllers/auth.controller.ts`                                                                | Extend the purpose map (`PURPOSE_MAP`) and the Zod `purpose` enum for `verify-otp` and `resend-otp` with `forgot_password` → `'Forgot Password'`, and add the dispatch case in `verifyOtp` and `resendOtp`                                                                   | Stage 6c, 6e    |
| 6   | `src/services/auth.service.ts` (`login`)                                                            | Create the refresh token inside `withTransaction` after locking the user, and re-check the password hash and status on the locked row (see the race-safety bullet in Stage 4c)                                                                                               | Stage 4c        |
| 7   | `src/services/auth.service.ts` (`resendRegistrationOtp`)                                            | Change the limit message text to `'Maximum OTP resends reached. Please try registering again in about 10 minutes.'`. Nothing else about registration changes.                                                                                                                | Stage 5e        |
| 8   | `src/services/auth.service.ts` (`refresh`), `src/db/queries/tokens.queries.ts` (`lockRefreshToken`) | `refresh` runs in `withTransaction`: plain early-exit read, then lock the user row, then lock the token row (`lockRefreshToken`), re-check revoked/expired/suspended on the locked rows, and issue the token from the locked user. `lockRefreshToken` also returns `db_now`. | Stage 4d        |
| 9   | `src/routes/auth.routes.ts`                                                                         | Remove `authenticate` from `POST /auth/logout`: `router.post('/logout', authController.logout)`. The handler already reads the refresh cookie, so nothing else changes. `authenticate` then has no consumers until `GET /users/me` (Stage 7).                                | Stage 4d        |

New code (not changes to existing code): `requestOtp` in `otp.service.ts`, `revokeAllRefreshTokensForUser` in `tokens.queries.ts`, `updatePasswordHash` in `users.queries.ts`, and the new service functions and controllers in 6b–6e.

---

## Stage 6a: `checkOtp` Consume Flag + Email Template

### Update `src/services/otp.service.ts`

Change `checkOtp`'s signature to accept an optional `consume` parameter, default `true`:

```ts
checkOtp({ userId, purpose, otp }, db, consume: boolean = true)
```

- Steps 1–4 (find latest OTP, check expiry, check attempts, compare hash) are unchanged.
- Step 5 (wrong guess): unchanged — always `incrementAttempts`, return `{ ok: false }`, regardless of `consume`.
- Step 6 (correct guess):
  - If `consume` is `true` (the default): unchanged — call `consumeOtp`. If it returns `false`, treat as `INVALID_OTP`. Return `{ ok: true }`.
  - If `consume` is `false`: **do not** call `consumeOtp`. Just return `{ ok: true }`.

All existing callers (registration's `verifyRegistrationOtp`) keep working unchanged since they don't pass the third argument.

### Add `requestOtp` to `src/services/otp.service.ts`

`issueOtp` sends an email unconditionally, so calling it directly from an endpoint lets a caller spam an address and repeatedly invalidate a user's live OTP. **Any endpoint that sends an OTP must go through `requestOtp`, never `issueOtp` directly** (forgot-password, resend, and later change email, change password and admin action).

`requestOtp({ userId, email, purpose, newEmail? }, db)` — must be called inside `withTransaction`:

1. `locked = lockUserById(userId, db)`. If `locked` is null (deleted while waiting) → return `{ status: 'no-user' }`. If `locked.status === 'pending'` → return `{ status: 'not-verified' }` (a pending account never gets OTPs through `requestOtp`; registration has its own resend).
2. Resend limit: `countOtps(userId, purpose, db, config.otp.resendWindowMinutes)` (rolling window). If `count - 1 >= config.otp.maxResends` → return `{ status: 'throttled', reason: 'limit' }`.
3. Cooldown: `findLatestOtp(userId, purpose, db)`. If `created_at + config.otp.resendCooldownSeconds > db_now` → return `{ status: 'throttled', reason: 'cooldown', retryAfterSeconds }`, where `retryAfterSeconds` is the time until the next resend is allowed.
4. Otherwise `issueOtp(...)` and return `{ status: 'sent' }`. `EMAIL_SEND_FAILED` from `issueOtp` propagates unchanged.

When throttled, **nothing is sent and the existing OTP is not invalidated**. `requestOtp` only reports what happened; each caller decides how to react. Forgot-password and its resend turn `throttled` into a real `429` (`OTP_RESEND_COOLDOWN` with `Retry-After`, or `OTP_RESEND_LIMIT`).

### Update `src/services/email.service.ts`

Add an entry to the `purpose → { subject, intro }` map for `Forgot Password`:

- Subject: `"Your FoC password reset code"`
- Body: same shape as the registration email (OTP + expiry from `config.otp.ttlMinutes`), no links, dev-log fallback unchanged

### Verification

- No behavior change for the existing registration flow: re-run Stage 5e's happy-path and wrong-OTP tests, confirm they still pass unmodified
- The `consume: false` behaviour is verified through the endpoints in Stage 6c (the OTP row's `consumed_at` stays `NULL` after `verify-otp`, and wrong guesses still increment `attempts_count`). Vitest unit tests for Stage 6 are deferred.
- `requestOtp` when throttled (inside the cooldown, or at the resend limit) → returns `throttled`, no email is sent, and the previous OTP row's `consumed_at` is still `NULL`

---

## Stage 6b: `POST /auth/forgot-password`

### Update `src/services/auth.service.ts`

Implement `forgotPassword({ email })`, inside `withTransaction`:

- `findByEmail(email)`. If no user found → `AppError(404, 'Email not found', 'EMAIL_NOT_FOUND')` (no OTP sent). If the user is `pending` → `AppError(403, 'Account not verified. Please finish registration first.', 'ACCOUNT_NOT_VERIFIED')` (cheap early exit; `requestOtp` re-checks after the lock)
- If found → `requestOtp({ userId: user.id, email, purpose: 'Forgot Password' }, client)` (see Stage 6a) and map its result:
  - `sent` → return normally
  - `throttled` with `reason: 'cooldown'` → `AppError(429, 'Please wait before requesting another OTP', 'OTP_RESEND_COOLDOWN', retryAfterSeconds)` (about 60 seconds)
  - `throttled` with `reason: 'limit'` → `AppError(429, 'Maximum OTP resends reached. Please try again in about an hour.', 'OTP_RESEND_LIMIT')`
  - `no-user` → `AppError(404, 'Email not found', 'EMAIL_NOT_FOUND')`
  - `not-verified` → `AppError(403, 'Account not verified. Please finish registration first.', 'ACCOUNT_NOT_VERIFIED')`
- `EMAIL_SEND_FAILED` from `requestOtp` propagates as `503`

### Update `src/controllers/auth.controller.ts`

Implement `forgotPassword` handler:

Validate request body with Zod (`.strict()`, custom messages, presence/type/extra-fields only):

- `email`: required `"Email is required"`, type `"Email must be a string"` (use the shared `emailField`: trimmed and lowercased)

- Call `authService.forgotPassword()`
- Return `200` with `{ message: 'A reset code has been sent to your email', code: 'OTP_SENT' }`

### Wire up route

Add to `auth.routes.ts`:

```ts
router.post("/forgot-password", authController.forgotPassword);
```

### Verification

- `POST /auth/forgot-password` with a registered email → `200 OTP_SENT`, one `users_otps` row created with `purpose = 'Forgot Password'`, dev console shows the OTP
- `POST /auth/forgot-password` twice in a row for a registered email → the second returns `429 OTP_RESEND_COOLDOWN` with a `Retry-After` header; only one `users_otps` row exists and the first OTP is still valid
- Two concurrent `POST /auth/forgot-password` for the same email → exactly one `200`, the other `429`, and exactly one OTP row created
- `POST /auth/forgot-password` after the resend limit is reached (backdate `created_at` between requests) → `429 OTP_RESEND_LIMIT` with the message "try again in about an hour"; no new row, no email
- `POST /auth/forgot-password` with an unregistered email → `404 EMAIL_NOT_FOUND`, no `users_otps` row created
- `POST /auth/forgot-password` with the email of a still-pending (unverified) registration → `403 ACCOUNT_NOT_VERIFIED`, no `Forgot Password` OTP row created
- `POST /auth/forgot-password` with a missing/wrong-type `email` field → `400 VALIDATION_ERROR` as usual
- `POST /auth/forgot-password` with an extra field → `400 VALIDATION_ERROR`, `"Request contains unexpected fields"`
- Force an email-send failure for a registered email → `503 EMAIL_SEND_FAILED`

---

## Stage 6c: `verify-otp` — Forgot Password Purpose

This extends the existing `verify-otp` endpoint from Stage 5e rather than adding a new route.

### Update Zod schema in `src/controllers/auth.controller.ts`

Extend the `purpose` enum for `POST /auth/verify-otp` to accept `'registration'` (existing) and `'forgot_password'` (new). Same error message pattern: not in the allowed list → `"Invalid purpose"`.

### Update `src/services/auth.service.ts`

Implement `verifyForgotPasswordOtp({ email, otp })`:

Inside `withTransaction`:

1. `findByEmail(email)`. If none → `AppError(404, 'Email not found', 'EMAIL_NOT_FOUND')`. If the user is `pending` → `AppError(403, 'Account not verified. Please finish registration first.', 'ACCOUNT_NOT_VERIFIED')`.
2. `locked = lockUserById(user.id)`. If `locked` is null (the row was deleted while waiting) → `EMAIL_NOT_FOUND`. If `locked.status === 'pending'` → `ACCOUNT_NOT_VERIFIED`. Suspended accounts are allowed.
3. `checkOtp({ userId: user.id, purpose: 'Forgot Password', otp }, client, /* consume */ false)`
4. Commit, then: if `{ ok: false }` → throw `AppError(400, 'Invalid or expired OTP', 'INVALID_OTP')`
5. On success, return nothing sensitive — **no state change happens here**, this call only validates

> Note the same warning from Stage 5c applies: the wrong-guess path must not throw inside the transaction, or the attempt increment gets rolled back and the limit becomes bypassable.

### Update the `verifyOtp` controller

Dispatch on `purpose`:

- `'registration'` → existing `authService.verifyRegistrationOtp()` call, unchanged, returns `{ message: 'Registration complete. You can now log in.', code: 'REGISTER_SUCCESS' }`
- `'forgot_password'` → new `authService.verifyForgotPasswordOtp()` call, returns `200` with `{ message: 'Code verified. You can now set a new password.', code: 'OTP_VERIFIED' }`

### Verification

- `POST /auth/verify-otp` with the correct forgot-password OTP → `200 OTP_VERIFIED`, and the OTP row's `consumed_at` is still `NULL` afterward (confirm in DB)
- Re-submitting the same correct OTP again → still `200 OTP_VERIFIED` (not yet consumed, so it's still valid) — confirm this is the intended behavior, not a bug
- Wrong OTP → `400 INVALID_OTP`, `attempts_count` incremented and persisted
- 5 wrong OTPs → `429 OTP_ATTEMPTS_EXCEEDED`
- Expired OTP with the correct code → `400 OTP_EXPIRED`
- Unknown email → `404 EMAIL_NOT_FOUND`
- Email of a still-pending (unverified) registration → `403 ACCOUNT_NOT_VERIFIED`
- `purpose: "forgot password"` (with a space, wrong format) → `400 VALIDATION_ERROR`, `"Invalid purpose"`

---

## Stage 6d: `POST /auth/reset-password`

### Create query in `src/db/queries/tokens.queries.ts`

- `revokeAllRefreshTokensForUser(userId, db)` — `UPDATE refresh_tokens SET is_revoked = true, revoked_at = NOW() WHERE user_id = $1 AND is_revoked = false`

### Update `src/services/auth.service.ts`

Implement `resetPassword({ email, otp, newPassword })`:

- Validate `newPassword` complexity using the same rule and message as registration → `AppError(400, '...', 'VALIDATION_ERROR')` if it fails
- Validate `otp` matches `^\d{6}$` → `AppError(400, 'OTP must be a 6-digit code', 'VALIDATION_ERROR')` if not

Inside `withTransaction`:

1. `findByEmail(email)`. If none → `AppError(404, 'Email not found', 'EMAIL_NOT_FOUND')`. If the user is `pending` → `AppError(403, 'Account not verified. Please finish registration first.', 'ACCOUNT_NOT_VERIFIED')`.
2. `locked = lockUserById(user.id)`. If `locked` is null (the row was deleted while waiting) → `EMAIL_NOT_FOUND`. If `locked.status === 'pending'` → `ACCOUNT_NOT_VERIFIED`. Suspended accounts are allowed.
3. `checkOtp({ userId: user.id, purpose: 'Forgot Password', otp }, client)` — **default consuming check**, this is the real gate
4. If `{ ok: true }`:
   - Hash `newPassword` with bcrypt (work factor 10)
   - Update `users.password_hash` for this user
   - `revokeAllRefreshTokensForUser(user.id, client)`
5. Commit, then: if `{ ok: false }` → throw `AppError(400, 'Invalid or expired OTP', 'INVALID_OTP')`

You'll need a new query function for the password update — add `updatePasswordHash(userId, passwordHash, db)` to `users.queries.ts` if it doesn't already exist.

### Update `src/controllers/auth.controller.ts`

Implement `resetPassword` handler:

Validate request body with Zod (`.strict()`, custom messages, presence/type/extra-fields only — format/complexity rules stay in the service layer):

- `email`: required `"Email is required"`, type `"Email must be a string"` (use the shared `emailField`: trimmed and lowercased)
- `otp`: required `"OTP is required"`, type `"OTP must be a string"`
- `newPassword`: required `"New password is required"`, type `"New password must be a string"`

- Call `authService.resetPassword()`
- Return `200` with `{ message: 'Password reset successful. Please log in with your new password.', code: 'PASSWORD_RESET_SUCCESS' }`

### Wire up route

Add to `auth.routes.ts`:

```ts
router.post("/reset-password", authController.resetPassword);
```

### Verification

Happy path:

- `forgot-password` → `verify-otp {purpose: forgot_password}` (optional, doesn't consume) → `reset-password` with the correct OTP → `200 PASSWORD_RESET_SUCCESS`, password hash changed in DB, all that user's `refresh_tokens` rows now have `is_revoked = true`
- Login with the new password → `200`
- Login with the old password → `401 INVALID_CREDENTIALS`
- A previously-issued access token for this user is still valid until it naturally expires (only refresh tokens are revoked) — confirm this is the intended behavior

OTP rules (same shape as Stage 5e, now on `reset-password` instead of `verify-otp`):

- Wrong OTP → `400 INVALID_OTP`, attempt incremented and persisted
- 5 wrong OTPs, then the correct one → `429 OTP_ATTEMPTS_EXCEEDED`, password unchanged
- Expired OTP with the correct code → `400 OTP_EXPIRED`
- Re-using an already-consumed OTP (call `reset-password` twice with the same code) → second call → `400 INVALID_OTP`
- Calling `reset-password` directly, skipping `verify-otp` entirely, with a correct OTP → `200 PASSWORD_RESET_SUCCESS` (confirms `verify-otp` is optional UX, not a required gate)
- Unknown email → `404 EMAIL_NOT_FOUND`
- Email of a still-pending (unverified) registration → `403 ACCOUNT_NOT_VERIFIED`

Validation:

- Weak `newPassword` → `400 VALIDATION_ERROR` with the standard password-complexity message
- `otp` not 6 digits → `400 VALIDATION_ERROR`, `"OTP must be a 6-digit code"`
- Missing `newPassword` → `400 VALIDATION_ERROR`, `"New password is required"`
- Extra field → `400 VALIDATION_ERROR`, `"Request contains unexpected fields"`

Concurrency:

- Fire two `POST /auth/reset-password` with the correct OTP near-simultaneously → exactly one `200`, the other `400 INVALID_OTP`, password changed exactly once
- Run several `POST /auth/login` requests with the **old** password in a loop while calling `reset-password` → after the reset, no non-revoked refresh token exists for that user that was created by an old-password login

---

## Stage 6e: `resend-otp` — Forgot Password Purpose

This extends the existing `resend-otp` endpoint from Stage 5e.

### Update Zod schema in `src/controllers/auth.controller.ts`

Extend the `purpose` enum for `POST /auth/resend-otp` to accept `'forgot_password'` alongside `'registration'`.

### Update `src/services/auth.service.ts`

Implement `resendForgotPasswordOtp({ email })`. It is the same operation as `forgotPassword` (both request a fresh OTP through `requestOtp`), so implement it once and call it from both:

- `findByEmail(email)`, then `requestOtp(...)` inside `withTransaction`, with the same result mapping as Stage 6b: unknown email or `no-user` → `404 EMAIL_NOT_FOUND`; pending account or `not-verified` → `403 ACCOUNT_NOT_VERIFIED`; `throttled` → `429 OTP_RESEND_COOLDOWN` (with `Retry-After`) or `429 OTP_RESEND_LIMIT`; `sent` → return normally.

### Update the `resendOtp` controller

Dispatch on `purpose`, same pattern as `verifyOtp`:

- `'registration'` → existing `authService.resendRegistrationOtp()`, unchanged
- `'forgot_password'` → new `authService.resendForgotPasswordOtp()`

Both return `200` with `{ message: 'A new verification code has been sent to your email', code: 'OTP_SENT' }` on success. For `forgot_password`, an unknown email returns `404 EMAIL_NOT_FOUND`, and a throttled request returns a real `429`.

### Verification

- Resend for a registered email, immediately after `forgot-password` → `429 OTP_RESEND_COOLDOWN` with a `Retry-After` header (seconds until the next resend is allowed)
- Resend for a registered email, after the cooldown → `200 OTP_SENT`, previous OTP row now has `consumed_at` set
- After 5 successful resends inside the window, the 6th → `429 OTP_RESEND_LIMIT` (message: try again in about an hour)
- Once the oldest OTP is older than `resendWindowMinutes`, resend works again (the limit is not permanent)
- Resend for an unregistered email → `404 EMAIL_NOT_FOUND`, no DB row created
- Resend for a still-pending (unverified) registration → `403 ACCOUNT_NOT_VERIFIED`, no `Forgot Password` OTP row created

- Extra/wrong-type fields → same `400 VALIDATION_ERROR` pattern as before

---

### Notes for Later Stages (do not implement now)

- Every endpoint that sends an OTP (change email, change password, admin action, and any future one) must call `requestOtp`, never `issueOtp` directly. Without it, a logged-in user could use `PUT /users/me/email` to email any address without limit.
- Frontend for forgot-password: for the first 5 resends, disable the resend button with a countdown from `Retry-After` ("try again in 60 seconds"). On `OTP_RESEND_LIMIT`, disable resend and show "try again in about an hour" (no countdown).
- Change Email and Change Password reuse the same `issueOtp`/`checkOtp` pair, but don't need the `consume` flag — their `PUT /users/me/...` endpoints already know the new value (new email / new password) before the OTP is even sent, so it's natural for them to store it on the pending user/OTP state and let `verify-otp` finalize directly in one step, the same way registration does. Confirm this design when we get there rather than assuming it carries over unchanged.
- Admin Action's OTP purpose will need its own finalize shape (likely: the pending action's target and effect stored somewhere before the OTP is sent) — not yet designed.
- Lock ordering: any transaction that locks both a user row and refresh-token rows locks the user row first (see the lock ordering rule in Stage 4d). Suspend and change-password must follow it too.
- Suspending a user (admin) and changing a password (F4.3.4) must revoke all of the user's refresh tokens in the same locked transaction as the change; the login check added in Stage 4c (re-verify hash and status after locking) is what stops a concurrent login from issuing a token afterwards.
- NFR1 (account lockout after repeated failed attempts) is a Week 10 item and separate from the per-OTP `max_attempts` limit already built.

## Stage 7: Comprehensive Test Suite (For Stage 1-6)

> **How to use this stage**: This supersedes the earlier instruction "Do not add
> new test cases unless I ask" — this stage is that ask. It covers everything
> built in Stages 1–6 (scaffold through Forgot Password). Do not write
> implementation code changes as part of this stage — see the rules below.

### Ground rules

1. **Read the current codebase first**, not just this file. Where the code and
   this file disagree, follow the code and tell me about the difference (same
   rule as every other stage).
2. **Do not make any design decisions, choose behavior for unclear cases, or
   pick an interpretation when this file is ambiguous.** If you're about to
   write a test and the correct expected behavior isn't clearly specified
   anywhere (in this file, the product backlog, or the working docs), stop and
   ask me instead of guessing. A wrong guess here becomes a de facto spec that
   later work gets held to — that's worse than an unanswered question.
3. **Do not modify application code to make a test pass.** If a test reveals a
   real deviation from something this file specifies, report it as a separate
   finding — do not fix it, and do not write the test to assert the buggy
   behavior as correct.
4. **Do not test for the absence of deferred features.** NFR1 (lockout), NFR2
   (email retry/delivery logging), and rate limiting generally are Week 10
   items per this file's own notes. Don't write tests asserting they don't
   exist yet — that breaks the day they land — and don't write tests for their
   behavior since they aren't built.
5. Before writing any tests, produce a list of every point you found unclear
   or unspecified, as a separate deliverable — not buried in code comments.
   Wait for my answers on anything you're genuinely unsure about rather than
   picking a reasonable-sounding default.

### Test stack

- **Vitest** for the runner and assertions (already the project's choice).
- **Supertest** for HTTP-level tests against the Express app — add it and its
  types to `package.json` devDependencies.
- **A real Postgres instance for integration tests — do not mock `pg`.** Most
  of what this file cares about (`SELECT ... FOR UPDATE`, `FOR UPDATE SKIP
LOCKED`, transaction rollback on wrong OTP guesses, lock ordering to avoid
  deadlocks, `clock_timestamp()` vs `NOW()`) is database behavior that a
  mocked pool cannot validate. Set up a dedicated test database (or schema),
  apply `init.sql` fresh, and truncate the relevant tables in
  `beforeEach`/`afterEach`.
- Reserve mocked-`pg` unit tests for pure logic with no locking or
  transactions involved — `hash.ts`, `otp.ts`'s digit-format check, `jwt.ts`
  claim shape, and Zod schema validation in isolation.
- For tests that need to manipulate DB state directly (expire an OTP, backdate
  `created_at`, suspend a user, promote a role), write small SQL test helpers
  rather than going through the API — several of this file's own verification
  steps already describe doing this manually.
- Structure test files to mirror the source tree, not the build stages.
  Co-locate each test file next to the source it covers, with `describe`
  blocks per function/route and further nesting for edge cases where a
  function has several (happy path, expiry handling, attempt limiting, etc.):
  - `controllers/auth.controller.test.ts` — one `describe` per route handler
    (register, login, logout, refresh, forgotPassword, resetPassword)
  - `services/auth.service.test.ts` — one `describe` per exported function
  - `services/otp.service.test.ts` — verify, resend, generate (whichever
    exist as separate functions)
  - `services/email.service.test.ts`
  - `services/bootstrap.service.test.ts`
  - `middleware/authenticate.test.ts` — inter-service token verification
  - `db/queries/users.queries.test.ts`, `otp.queries.test.ts`,
    `tokens.queries.test.ts` — integration tests against the real test DB
  - `utils/hash.test.ts`, `jwt.test.ts`, `otp.test.ts` — pure-logic unit
    tests, mocked `pg` where relevant (per the mocking rule above)
    Keep a separate top-level `concurrency/` folder for the cross-cutting
    race-condition tests (these show up across login, register, verify-otp,
    resend-otp, logout, refresh, and reset-password, and are easiest to review
    together) — do not duplicate a concurrency case inside its
    controller/service test file just because it's _about_ that function.

### Infrastructure

- **App/server split**: split `app.ts` into a pure `app` export (Express app
  only, no `bootstrapSuperAdmin()` call, no `.listen()`) and a new
  `server.ts` that imports `app`, runs the bootstrap, then listens. Nothing that
  currently imports `app.ts` for its side effects should break; check for any such
  imports and update them to use `server.ts` instead.
- **Test database**: a second database on the existing `user-db` Postgres
  instance (e.g. `user_service_test`), not a new container. Add a one-time
  setup script that runs the existing `init.sql` against it, so the test
  schema can never drift from the real schema. Reuse `user-db`'s existing
  credentials; only `DB_NAME` differs.
- **Env vars**: a committed `.env.test` (no real secrets — dummy SMTP, dummy
  super-admin password, test DB name), loaded via a Vitest setup file
  (`dotenv.config({ path: '.env.test' })`), wired in through
  `vitest.config.ts`'s `setupFiles`.
- **JWT keys**: generate a throwaway RS256 key pair at test-setup time
  (`crypto.generateKeyPairSync`) rather than relying on the gitignored
  `keys/` folder, which won't exist on a fresh clone or in CI. Write to a
  temp path and point the key-path env vars at it.
- **Parallelism**: set `fileParallelism: false` in `vitest.config.ts`. Tests
  share one DB and truncate between runs, so sequential execution is the
  safe default.
- **Location**: tests live in `user-service/tests/`, sibling to `src/`, with
  `tests/concurrency/` for the cross-cutting race-condition suite. Since
  `tsconfig.json` only includes `src/**/*`, this keeps test files out of
  `tsc` and the prod Docker build with no tsconfig changes needed.
- Add `vitest.config.ts` at `user-service/` root, `supertest` and its
  `@types` to `package.json` devDependencies, and a `"test"` script already
  exists (`vitest`) — confirm it picks up the new config and test location.

### Mocking policy

- **Email**: mock `sendOtpEmail` (or the nodemailer transport) with `vi.mock`
  for both OTP capture and forced-failure (503/rollback) tests. This is
  exempt from the "no mocking `pg`" rule — that rule is specifically about
  locking/transaction correctness, which only real Postgres can validate.
  Prefer mocking the function directly over spying on the dev-fallback
  `console.log` — the console log is a logging implementation detail, not a
  stable test seam.
- **Config (bootstrap tests only)**: `vi.mock` the config module is
  permitted for the single test file covering "configured super-admin
  username/email already belongs to a regular user," since it needs
  different config values than the rest of the suite. Keep this mock scoped
  to that file.

### Manual-only verification bullets

- `npm install`, `docker compose up --build`, `\dT+ status_enum` inspection,
  and "keys exist" checks are infra/tooling, not application behavior — leave
  these manual. List them in the traceability table as "manual — not
  automated" rather than omitting them.
- The two config-validation exit cases (missing required env var; empty SMTP
  vars with `NODE_ENV=production`) are real application logic in `config.ts`
  and should be automated by spawning it as a child process with a modified
  env and asserting on exit code and stderr content.

### Temporary protected route

For Stage 4e's cross-check between `authenticate` middleware and
`GET /auth/verify` against the same token, mount a throwaway Express route
inside the test file itself. Do not add anything to `app.ts`/`server.ts` for
this.

### Concurrency test parameters

Define shared constants once (e.g. `CONCURRENT_REQUESTS`, in a test-helpers
file) and reuse them across the `concurrency/` suite rather than varying
per-test. Start with a small number sufficient to reliably trigger the race
(e.g. 5 concurrent requests) and a modest loop count for sustained-race tests
(e.g. 20 iterations); adjust only if a specific test proves flaky.

### Traceability table

- Items that are partially built (e.g. F5.1.1, F5.1.4–F5.1.6, F2.2.1,
  F2.3.1, NFR4) are listed as **partial**, with a one-line note of what's
  covered by tests so far and what isn't — not excluded from the table.
- Items not yet built at all (F4, F5.3) are listed as **not yet
  implemented** — not omitted.
- The table lives in `user-service/tests/TRACEABILITY.md`, not in chat, since
  it needs to be revisited as later stages land.

### Coverage

Treat every bullet under every stage's **Verification** section (Stages 1
through 6, including the "Changes to already-implemented code" table in
Stage 6) as a required test case, not a suggestion — that list already
enumerates the edge cases and alternative workflows this file cares about most:
duplicate username/email races, OTP wrong-guess persistence across rollback,
resend cooldown/limit boundaries (including the rolling-window vs all-time
distinction between registration and forgot-password), lock-ordering deadlock
checks between `refresh` and `reset-password`, stale-pending-user cleanup with
`SKIP LOCKED`, suspended/pending account interactions with login/refresh,
role-claim freshness after promotion, and the "confirm this is intended, not a
bug" notes (e.g. non-consuming `verify-otp` for forgot-password being
re-submittable, an old access token surviving a password reset).

### Stage 7 changes to reverse or review before deployment

Changes made for the test suite that affect how the service is run. The first two must be undone before any real deployment.

- **`compose.yaml`, `user-db` `ports: - "5434:5432"` (REVERSE):** publishes the database on the host so Vitest can reach it. Remove the `ports:` block (and its TEMPORARY comment) before deploying, so the database is only reachable inside the compose network.
- **`user_service_test` database on the `user-db` instance (REVIEW):** `tests/setup/globalSetup.ts` drops and recreates it on every test run. It refuses to touch any database whose name does not end in `_test`. Do not run the suite against a deployed database, and drop `user_service_test` if it exists there.
- **`.env.test` (no action):** committed, dummy values only. It must never hold real credentials.
- **`app.ts` / `server.ts` split (KEEP):** `app.ts` now only builds and exports the Express app. `src/server.ts` runs the super admin bootstrap and calls `listen()`. The `start` and `dev` scripts in `package.json` and the prod `CMD` in `Dockerfile` (`node dist/server.js`) were updated to match. This is not meant to be reversed.

### Deliverables

1. The test files

# Stage 8: RBAC Middleware

> **Scope**: This stage builds the authorization layer only — the `authorize` middleware
> itself. It has no consumers yet; Stages 9 and 10 are where it actually gets wired onto
> routes. No DB changes in this stage.
>
> Backlog refs: supports F5.1.1, F5.1.4, F5.1.5, F5.1.6 (enforcement mechanism only —
> the actual endpoints these protect are Stages 9–10).

### Design decisions (already made, do not change)

| Rule                     | Value                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role check style         | Minimum-role (`authorize('admin')` = "admin or higher"), not an explicit per-route list                                                                                                                                                                                                                 |
| Role ordering            | `user` (0) < `admin` (1) < `super admin` (2)                                                                                                                                                                                                                                                            |
| Stale role claims        | A role change (promotion or demotion) does **not** invalidate an already-issued access token. The token rides out its remaining life (up to 15 min) on the old role — identical to how a suspension is handled today. Enforcement catches up at the next `refresh` call, not immediately.               |
| Refresh-token revocation | A role change revokes **all** of the target user's refresh tokens in the same transaction as the change (same treatment `resetPassword` and suspend already give). This doesn't shrink the 15-minute window above — it only stops the old role from being extended indefinitely via repeated refreshes. |

### Create `src/middleware/authorize.ts`

- Export a rank table:

```ts
const ROLE_RANK: Record<string, number> = {
  user: 0,
  admin: 1,
  "super admin": 2,
};
```

- Export `authorize(minimumRole: string)` — a middleware **factory**. Calling
  `authorize('admin')` returns an Express middleware function; it does not itself take
  `(req, res, next)`.
- The returned middleware:
  1. Reads `req.user` (set by `authenticate`, which must run first in the chain).
  2. If `req.user` is missing (defensive — `authorize` used on a route without
     `authenticate` ahead of it), reject with `401` and
     `{ message: 'Unauthorized', code: 'UNAUTHORIZED' }`, matching `authenticate`'s own
     shape. Do not treat this as a `403` — the caller was never authenticated at all.
  3. Otherwise compare `ROLE_RANK[req.user.role] >= ROLE_RANK[minimumRole]`.
  4. If the check passes, call `next()`.
  5. If it fails, reject with `403` and
     `{ message: 'Forbidden', code: 'FORBIDDEN' }`.
- Usage pattern (for reference — not implemented until Stage 9/10):

```ts
router.get("/users", authenticate, authorize("admin"), usersController.list);
router.put(
  "/users/:id/role",
  authenticate,
  authorize("super admin"),
  usersController.changeRole,
);
```

### Verification

- Unit test (Vitest, no DB, no Express app needed): for each of the 6 (caller role ×
  required role) combinations that matter — `user`→`user`, `user`→`admin`,
  `admin`→`user`, `admin`→`admin`, `admin`→`super admin`, `super admin`→`admin` — confirm
  `next()` is called or not, as expected, by passing a fake `req`/`res`/`next`.
- `authorize('admin')` with no `req.user` set at all → `401 UNAUTHORIZED`, `next()` never
  called.
- Confirm `authorize` throws no errors of its own — it only ever calls `next()` or
  responds directly; it should not need `asyncHandler` (no async work, no DB call).

### Tests (Vitest)

Write the Vitest tests for this stage, following the Stage 7 ground rules and layout
(`tests/middleware/authorize.test.ts`). Every bullet under Verification above is a required test
case. Do not modify application code to make a test pass.

---

# Stage 9: Admin Endpoints — View Users, Suspend/Unsuspend

> **Scope**: `GET /users`, `GET /users/:id`, `PUT /users/:id/status`. All three require
> `authenticate` + `authorize('admin')`.
>
> Backlog refs: F5.3.1, F5.3.3.

### Design decisions (already made, do not change)

| Rule                               | Value                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /users` response shape        | `{ users: [...] }` (wrapped, not a bare array)                                                                                                                                                                                                                                                                 |
| Fields returned per user           | Every column except `password_hash` — `id, username, email, status, role, created_at, updated_at`                                                                                                                                                                                                              |
| Pending users                      | `GET /users` and `GET /users/:id` both return users **regardless of status, including `pending`**. The `status` field in the response is how a caller tells a pending (unverified) registration apart from a real account — no separate flag needed.                                                           |
| `GET /users/:id` — not found       | `404` with `{ message: 'User not found', code: 'USER_NOT_FOUND' }`                                                                                                                                                                                                                                             |
| `GET /users/:id` — malformed `:id` | `400` with message `"Invalid user ID"`, code `VALIDATION_ERROR` — enforced via a Zod `.uuid()` check on `req.params.id` at the controller (same convention as every other validation in this codebase), before any DB call                                                                                     |
| `PUT /users/:id/status` body       | `{ status: 'active' \| 'suspended' }`                                                                                                                                                                                                                                                                          |
| Suspend side-effect                | Revokes **all** of the target user's refresh tokens in the same transaction (already required by the general rule from Stage 4: "anything that... suspends a user... must revoke ALL that user's refresh tokens in the SAME transaction as the change")                                                        |
| Unsuspend side-effect              | None beyond the status flip — no tokens to revoke, there's nothing live to reactivate                                                                                                                                                                                                                          |
| Locking                            | `withTransaction` + `lockUserById` + re-check-after-lock, same pattern as every other state-changing operation in this service                                                                                                                                                                                 |
| Target role restriction            | An `admin` caller may only suspend/unsuspend a target with `role = 'user'`. A `super admin` caller may suspend/unsuspend a `user` or `admin` target, but not another `super admin`.                                                                                                                            |
| Error codes for role restrictions  | Any caller targeting a `super admin` (including a super admin targeting one) → `403 SUPER_ADMIN_IMMUTABLE`. An `admin` caller targeting an `admin` → `403 FORBIDDEN`.                                                                                                                                          |
| Pending target                     | The status of a `pending` user cannot be changed through this endpoint, to either `suspended` or `active`. A pending account only becomes active through OTP verification. Responds `422 CANNOT_CHANGE_STATUS_PENDING_USER`, message `'Cannot change the status of a pending user'`, for either target status. |
| No-op requests                     | If the target is already in the requested status, this is a success, not an error: return `200` with the unchanged user, and skip both the DB write and the token revocation                                                                                                                                   |
| Service file location              | `listUsers`, `getUserById`, `changeUserStatus` (and Stage 10's `changeUserRole`) live in a new `src/services/users.service.ts`, not `auth.service.ts` — matching how `otp.service.ts` and `email.service.ts` were already split out from `auth.service.ts`                                                     |
| Naming (query vs. service)         | The query function stays `updateUserStatus` (matches the SQL operation). The service function that calls it is `changeUserStatus`, to avoid two different-layer functions sharing one name (same split for Stage 10's `updateUserRole` query vs. `changeUserRole` service)                                     |

### Add to `src/db/queries/users.queries.ts`

- `listAllUsers(db)` — `SELECT * FROM users ORDER BY created_at DESC`. (Named `listAllUsers`, not `listActiveUsers` — it returns every status, including `pending` and `suspended`, so a name implying an "active" filter would be misleading.)
- `updateUserStatus(userId, status, db)` — `UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, run inside the transaction against the locked row

### Create `src/services/users.service.ts`

Implement `listUsers()`:

- Call `listAllUsers()`, strip `password_hash` from every row before returning

Implement `getUserById(id)`:

- `findById(id)`. If none → `AppError(404, 'User not found', 'USER_NOT_FOUND')`
- Strip `password_hash`, return the rest
- (UUID format is already validated at the controller before this function is called — no need to re-check here)

Implement `changeUserStatus(requestorRole, targetId, status)`:
Inside `withTransaction`:

1. `locked = lockUserById(targetId, client)`. If null → `AppError(404, 'User not found', 'USER_NOT_FOUND')`
2. Target-role restriction, checked before anything else:
   - If `locked.role === 'super admin'` → `AppError(403, 'Cannot modify a super administrator', 'SUPER_ADMIN_IMMUTABLE')` (whoever the caller is)
   - If `locked.role === 'admin' && requestorRole === 'admin'` → `AppError(403, 'Only a super admin may suspend an admin', 'FORBIDDEN')`
3. Pending target: if `locked.status === 'pending'` → reject; the status of a pending user cannot be changed → `AppError(422, 'Cannot change the status of a pending user', 'CANNOT_CHANGE_STATUS_PENDING_USER')`
4. No-op check: if `locked.status === status` → return `locked` (minus `password_hash`) as-is, no write, no revocation
5. `updateUserStatus(locked.id, status, client)`
6. If `status === 'suspended'` → `revokeAllRefreshTokensForUser(locked.id, client)` (already built in Stage 6d)
7. Return the updated row, `password_hash` stripped

### Controllers in a new `src/controllers/users.controller.ts`

- `list` → `asyncHandler`, calls `usersService.listUsers()`, returns `200` with `{ users: [...] }`
- `getById` → validate `req.params.id` with a Zod schema (`z.object({ id: z.string().uuid('Invalid user ID') })`), then calls `usersService.getUserById(id)`, returns `200` with the user object. A failed `.uuid()` check produces a `ZodError`, which the global error handler already turns into `400 VALIDATION_ERROR` with that message — no manual `400` handling needed here.
- `updateStatus` → validate `req.params.id` the same way as `getById`, validate the body with Zod (`.strict()`, `status` enum of `['active', 'suspended']`, custom messages matching your existing style: required → `"Status is required"`, type → `"Status must be a string"`, invalid enum value → `"Status must be 'active' or 'suspended'"`), then calls `usersService.changeUserStatus(req.user.role, req.params.id, status)`, returns `200` with the updated user object

### Create `src/routes/users.routes.ts`

```ts
router.get("/", authenticate, authorize("admin"), usersController.list);
router.get("/:id", authenticate, authorize("admin"), usersController.getById);
router.put(
  "/:id/status",
  authenticate,
  authorize("admin"),
  usersController.updateStatus,
);
```

Mount at `/users` in `app.ts`.

### Verification

- `GET /users` as a regular user → `403 FORBIDDEN`
- `GET /users` as an admin → `200`, `{ users: [...] }`, no `password_hash` field on any entry, includes a `pending` account (mid-registration, OTP not yet verified) alongside `active`/`suspended` ones, distinguishable via its `status` field
- `GET /users` with no `Authorization` header → `401 UNAUTHORIZED`
- `GET /users/:id` with a valid existing ID → `200`, full user minus `password_hash`
- `GET /users/:id` on a pending user's ID → `200`, returns the user with `status: 'pending'`
- `GET /users/:id` on a suspended user's ID → `200`, returns the user with `status: 'suspended'`
- `GET /users/:id` with a well-formed UUID that doesn't exist → `404 USER_NOT_FOUND`
- `GET /users/:id` with a non-UUID string (e.g. `abc123`) → `400 VALIDATION_ERROR`, `"Invalid user ID"`
- `PUT /users/:id/status {status: 'suspended'}` on an active user → `200`, user's status is `suspended` in DB, all their `refresh_tokens` rows now `is_revoked = true`
- `PUT /users/:id/status {status: 'active'}` on a suspended user → `200`, status flips back, no token rows touched by this call
- `PUT /users/:id/status {status: 'pending'}` → `400 VALIDATION_ERROR` (not a valid target)
- `PUT /users/:id/status` as a regular user → `403 FORBIDDEN`
- `PUT /users/:id/status` on a nonexistent ID → `404 USER_NOT_FOUND`
- Admin suspends a plain user → `200`
- Admin suspends an admin → `403 FORBIDDEN`
- Admin suspends the super admin → `403 SUPER_ADMIN_IMMUTABLE`
- Super admin suspends a plain user → `200`
- Super admin suspends an admin → `200`
- Super admin attempts to suspend the super admin account → `403 SUPER_ADMIN_IMMUTABLE`
- `PUT /users/:id/status {status: 'suspended'}` on a `pending` user → `422 CANNOT_CHANGE_STATUS_PENDING_USER`, user stays `pending`
- `PUT /users/:id/status {status: 'active'}` on a `pending` user → `422 CANNOT_CHANGE_STATUS_PENDING_USER`, user stays `pending`, not activated
- Suspend an already-suspended user → `200`, unchanged user returned, `updated_at` unchanged, no new revocation activity, none of the tokens' `revoked_at` timestamps change
- Unsuspend an already-active user → `200`, unchanged user returned, `updated_at` unchanged, no new revocation activity
- Suspend a user, then attempt `POST /auth/refresh` with their pre-suspension refresh cookie → `401` (revoked) — confirms this endpoint reuses the same revocation your reset-password flow already relies on
- Two concurrent `PUT /users/:id/status` calls on the same user (different target statuses) → no deadlock, no `500`, exactly one status wins, reflects normal lock-then-write serialization

### Tests (Vitest)

Write the Vitest tests for this stage, following the Stage 7 ground rules, real-Postgres
approach and layout (query tests, service tests, controller/HTTP tests, and the concurrent-status
case in `tests/concurrency/`). Every bullet under Verification above is a required test case.
Do not modify application code to make a test pass.

---

# Stage 10: Super Admin — Promote / Demote

> **Scope**: `PUT /users/:id/role`. Requires `authenticate` + `authorize('super admin')`.
> Backlog refs: F5.1.6.

### Design decisions (already made, do not change)

| Rule                     | Value                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Body                     | `{ role: 'admin' \| 'user' }` — `super admin` is never a valid value here (it's assigned only by bootstrap, never by this endpoint)                                                                                                                                                                                     |
| Self-targeting           | Rejected — a super admin cannot change their own role via this endpoint                                                                                                                                                                                                                                                 |
| Target is a super admin  | Rejected — a super admin account can never be modified through this endpoint (there is exactly one, created by bootstrap)                                                                                                                                                                                               |
| Target is not active     | Rejected — the role of a `pending` or `suspended` user cannot be changed; only an `active` target is allowed. `pending` → `422 CANNOT_CHANGE_ROLE_PENDING_USER` (`'Cannot change the role of a pending user'`); `suspended` → `422 CANNOT_CHANGE_ROLE_SUSPENDED_USER` (`'Cannot change the role of a suspended user'`). |
| Refresh-token revocation | A successful role change revokes **all** of the target user's refresh tokens in the same transaction (same as suspend)                                                                                                                                                                                                  |
| No-op requests           | If the target already has the requested role, this is a success, not an error: return `200` with the unchanged user, and skip both the DB write and the token revocation                                                                                                                                                |
| Locking                  | `withTransaction` + `lockUserById` + re-check-after-lock                                                                                                                                                                                                                                                                |
| `:id` validation         | Same as Stage 9 — Zod `.uuid()` at the controller: `400 VALIDATION_ERROR` for a malformed UUID, `404 USER_NOT_FOUND` for a well-formed one that doesn't exist                                                                                                                                                           |
| Service/query naming     | Query function `updateUserRole` (in `users.queries.ts`); service function `changeUserRole` (in `users.service.ts`) — same split as Stage 9's status functions                                                                                                                                                           |

### Add to `src/db/queries/users.queries.ts`

- `updateUserRole(userId, role, db)` — `UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, run inside the transaction against the locked row

### Add to `src/services/users.service.ts`

Implement `changeUserRole(requesterId, targetId, newRole)`:

- If `targetId === requesterId` → `AppError(403, 'Cannot modify your own role', 'SELF_ROLE_CHANGE')`

Inside `withTransaction`:

1. `locked = lockUserById(targetId, client)`. If null → `AppError(404, 'User not found', 'USER_NOT_FOUND')`
2. If `locked.role === 'super admin'` → `AppError(403, 'Cannot modify a super administrator', 'SUPER_ADMIN_IMMUTABLE')`
3. Non-active target: the role of a non-active user cannot be changed.
   - If `locked.status === 'pending'` → `AppError(422, 'Cannot change the role of a pending user', 'CANNOT_CHANGE_ROLE_PENDING_USER')`
   - If `locked.status === 'suspended'` → `AppError(422, 'Cannot change the role of a suspended user', 'CANNOT_CHANGE_ROLE_SUSPENDED_USER')`
     This is checked before the no-op case, so a non-active user is rejected even if `newRole` equals their current role.
4. No-op check: if `locked.role === newRole` → return `locked` (minus `password_hash`) as-is, no write, no revocation
5. `updateUserRole(locked.id, newRole, client)`
6. `revokeAllRefreshTokensForUser(locked.id, client)`
7. Return the updated row, `password_hash` stripped

### Controller

`changeRole` in `users.controller.ts` → `asyncHandler`, validate `req.params.id` with the same Zod `.uuid()` schema as Stage 9 (`400 VALIDATION_ERROR`, `"Invalid user ID"` if not), validate body with Zod (`.strict()`, `role` enum of `['admin', 'user']`, custom messages: required → `"Role is required"`, type → `"Role must be a string"`, invalid enum → `"Role must be 'admin' or 'user'"`), read the requester's own ID off `req.user.user_id`, call `usersService.changeUserRole()`, return `200` with the updated user object.

### Wire up route

```ts
router.put(
  "/:id/role",
  authenticate,
  authorize("super admin"),
  usersController.changeRole,
);
```

### Verification

- `PUT /users/:id/role {role: 'admin'}` on a regular user, as super admin → `200`, role updated, all their refresh tokens revoked
- `PUT /users/:id/role {role: 'user'}` on an admin, as super admin → `200`, demoted, tokens revoked
- Same call as a regular admin (not super admin) → `403 FORBIDDEN` (blocked by `authorize`, never reaches the handler — confirms F5.1.5 is satisfied by the middleware alone)
- Same call as a regular user → `403 FORBIDDEN`
- Super admin targets their own ID → `403 SELF_ROLE_CHANGE`
- Super admin targets the bootstrap super-admin account's own ID (if somehow not caught by the self-check, e.g. a second super admin existed) → `403 SUPER_ADMIN_IMMUTABLE`
- `{role: 'super admin'}` in the body → `400 VALIDATION_ERROR`, `"Role must be 'admin' or 'user'"`
- Nonexistent target ID → `404 USER_NOT_FOUND`
- Non-UUID target ID → `400 VALIDATION_ERROR`, `"Invalid user ID"`
- Promote a user to admin, then that user's _pre-promotion_ access token (still `role: user`) hits an admin-only route within its remaining lifetime → still rejected with `403` (expected — a promotion also doesn't take effect until refresh, same as the stale-claim rule from Stage 8); after they `refresh`, the new token carries `role: admin` and the same route succeeds
- Demote an admin, then within the old token's remaining lifetime, hit an admin route → still succeeds (expected, matches Stage 8's documented tradeoff); attempt `POST /auth/refresh` with their old refresh cookie → `401` (revoked), forcing re-login rather than a quiet demotion
- `PUT /users/:id/role` on a `pending` user → `422 CANNOT_CHANGE_ROLE_PENDING_USER`, role unchanged
- `PUT /users/:id/role` on a `suspended` user → `422 CANNOT_CHANGE_ROLE_SUSPENDED_USER`, role unchanged, no token rows touched
- Two concurrent `PUT /users/:id/role` calls on the same target with different roles → no deadlock, no `500`, exactly one role wins
- Promote an admin to admin again → `200`, unchanged user, no refresh tokens revoked
- Demote a user to user again → `200`, unchanged user, no refresh tokens revoked

### Tests (Vitest)

Write the Vitest tests for this stage, following the Stage 7 ground rules, real-Postgres
approach and layout (with the concurrent-role case in `tests/concurrency/`). Every bullet under
Verification above is a required test case. Do not modify application code to make a test pass.

# Stage 11: Requester/Courier Toggle

> **Scope**: `PUT /users/me/active-view`. Requires `authenticate` only — any logged-in user can toggle their own view; no role restriction, since F5.2.1 already establishes every user can act as both requester and courier without restriction.
>
> Backlog refs: F5.2.2.

### Design decisions (already made, do not change)

| Rule                        | Value                                                                                                                                                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enum values                 | `'requester'` \| `'courier'`                                                                                                                                                                                                                                          |
| Default                     | `'requester'` — for both new users (schema default) and existing rows (migration backfill)                                                                                                                                                                            |
| Column                      | `active_view` on the `users` table, new `active_view_enum` type                                                                                                                                                                                                       |
| Route location              | New `src/routes/me.routes.ts`, mounted at `/users/me`                                                                                                                                                                                                                 |
| Controller/service location | New `src/controllers/me.controller.ts` and `src/services/me.service.ts` — self-service concerns, kept separate from admin's `users.controller.ts` / `users.service.ts`. Stage 12's profile endpoints (view/change own username, email, password) will also live here. |
| Endpoint shape              | One endpoint only: `PUT /users/me/active-view`. No separate `GET` — the frontend gets the current value from the `user` object already returned by `login` (this stage adds `activeView` to that object)                                                              |
| Locking                     | None needed — this is a single-column update with no dependent side effects (no token revocation, no other rows affected), so a plain conditional `UPDATE` is enough; it doesn't need `withTransaction` + `lockUserById` the way suspend/role-change do               |
| Authorization scope         | No cross-service exposure — `activeView` doesn't gate what a user can do (F5.2.1 already allows all actions to all users), so it isn't added to the JWT claims or to `GET /auth/verify`. It's a display preference only the owning user's own frontend ever reads.    |

### Update `src/db/init.sql`

Add a new enum, using the same safe-creation pattern as the existing enums:

```sql
DO $$ BEGIN
  CREATE TYPE active_view_enum AS ENUM ('requester', 'courier');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
```

Add the column to the `users` table:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS active_view active_view_enum NOT NULL DEFAULT 'requester';
```

`init.sql` only applies to a fresh DB volume — if you're adding this to an existing dev database, either reset with `docker compose down -v` (dev data only, same as the Stage 5a pattern) or run the `ALTER TABLE` manually against the running container. Remind me which applies when you report back.

### Update `src/db/queries/users.queries.ts`

- `updateActiveView(userId, activeView, db)` — `UPDATE users SET active_view = $2, updated_at = NOW() WHERE id = $1 RETURNING *`

### Create `src/services/me.service.ts`

Implement `changeActiveView(userId, activeView)`:

- `updateActiveView(userId, activeView)` — no lock, no transaction, no existing-value check (unlike Stage 9/10's status/role changes, there's no "invalid transition" here — a user can always freely switch between the two values, and there's no side effect to make atomic with the write)
- If the query returns no row (user was deleted concurrently — unlikely but possible), throw `AppError(404, 'User not found', 'USER_NOT_FOUND')`
- Strip `password_hash`, return the rest

### Create `src/controllers/me.controller.ts`

Implement `updateActiveView`:

- `asyncHandler`-wrapped
- Validate body with Zod (`.strict()`, custom messages matching your existing style): `activeView` required → `"Active view is required"`, type → `"Active view must be a string"`, invalid enum value → `"Active view must be 'requester' or 'courier'"`
- Read the caller's own ID off `req.user.user_id` (never take an ID from the request body — this endpoint only ever modifies the caller's own row)
- Call `meService.changeActiveView(req.user.user_id, activeView)`
- Return `200` with the updated user object

### Create `src/routes/me.routes.ts`

```ts
router.put("/active-view", authenticate, meController.updateActiveView);
```

### Update `app.ts`

Mount `meRouter` at `/users/me` **before** `usersRouter` at `/users`:

```ts
app.use("/users/me", meRouter);
app.use("/users", usersRouter);
```

This order is required — if `usersRouter` (with its `GET /:id` route from Stage 9) is registered first, a request to `/users/me` would be matched by `/:id` with `id = 'me'`, fail the UUID validation, and never reach `meRouter` at all.

---

## Change to already-implemented code

| #   | File                                     | Change                                                                                                                           | Where specified         |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1   | `src/services/auth.service.ts` (`login`) | Add `activeView` to the returned `user` object: `{ id, username, email, role, activeView }`. No other change to `login`'s logic. | Stage 4c (return shape) |

### Verification

- `PUT /users/me/active-view {activeView: 'courier'}` while authenticated → `200`, updated user object returned with `active_view: 'courier'` (same DB-row shape as `GET /users/:id`, snake_case — not `activeView`, which is only `login`'s response shape), `active_view` column updated in DB
- `PUT /users/me/active-view {activeView: 'requester'}` on a user already set to `'requester'` → `200`, unchanged (this doesn't need a special no-op branch like Stage 9/10 — an unconditional `UPDATE` to the same value is harmless and still returns `200` correctly)
- `PUT /users/me/active-view` with no `Authorization` header → `401 UNAUTHORIZED`
- `PUT /users/me/active-view {activeView: 'admin'}` (not a valid enum value) → `400 VALIDATION_ERROR`, `"Active view must be 'requester' or 'courier'"`
- Missing `activeView` field → `400 VALIDATION_ERROR`, `"Active view is required"`
- `activeView: 123` (wrong type) → `400 VALIDATION_ERROR`, `"Active view must be a string"`
- Extra field in the body → `400 VALIDATION_ERROR`, `"Request contains unexpected fields"`
- A newly registered-and-verified user, before ever calling this endpoint → their `active_view` is `'requester'` by default (schema default, not a manual insert)
- `POST /auth/login` response now includes `activeView` in the `user` object, reflecting whatever was last set (or the default, if never changed)
- Request to `/users/me` (no further path segment) → `meRouter` has no `GET` route, so this falls through to `usersRouter`'s `GET /:id` with `id = 'me'`, which is expected and not a mount-order bug: no token → `401 UNAUTHORIZED`; regular user → `403 FORBIDDEN` (blocked by `authorize('admin')`); admin → `400 VALIDATION_ERROR`, `"Invalid user ID"` (the UUID check rejects `'me'`). `PUT /users/me/active-view` still reaches `meRouter`, because it is mounted first — that's what the mount order actually guards.
- Two concurrent `PUT /users/me/active-view` calls with different values from the same user → no deadlock (there's no lock to deadlock on), last write wins, no `500`

## Stage 11b: Test Suite — Requester/Courier Toggle

> **Scope**: Vitest tests for Stage 11 only (`PUT /users/me/active-view`, the `activeView`
> addition to `login`'s response, and the `active_view` column/enum).

Follow the same ground rules, test stack, and mocking policy established in Stage 7 (read the
current codebase first, not just this file; do not invent behavior for anything unclear — list
it and ask instead of guessing; do not modify application code to make a test pass; use the
real test Postgres instance for anything involving the DB, mocked `pg` only for pure logic with
no DB/transaction involved).

### What to test

Treat every bullet in Stage 11's own **Verification** section as a required test case:

- Successful toggle to `'courier'` and to `'requester'`, confirming both the response body and
  the `active_view` column in the DB
- The "set to the same value it already has" case — confirm this returns `200` normally, since
  Stage 11 deliberately has no no-op short-circuit (unlike Stage 9/10's status/role changes)
- Missing `Authorization` header → `401`
- Invalid enum value, missing field, wrong type, and unrecognized extra field → the four
  `400 VALIDATION_ERROR` cases, each with its exact message
- A newly registered-and-activated user defaults to `'requester'` without ever calling this
  endpoint
- `POST /auth/login`'s response now includes `activeView` in the `user` object
- Two concurrent `PUT /users/me/active-view` calls with different values from the same user →
  no deadlock, no `500` (there's no lock here, so this is really just confirming the endpoint
  doesn't blow up under concurrent writes, not testing any serialization guarantee)

### One thing NOT to test here

Do not write a test asserting what `GET /users/me` currently does (falling through to
`usersRouter`'s `GET /:id`, producing `403` for a regular user or `400` for an admin). That
behavior is a known, temporary gap that Stage 12 closes by giving `meRouter` its own route for
the bare path — a test asserting today's fallthrough would immediately become false, and
contradict Stage 12's own tests, the moment that stage lands. If you think this gap needs
documenting somewhere, note it in your unclear-points list rather than encoding it as a test.

### Deliverables

1. The test file(s) for Stage 11, placed to mirror the source tree per Stage 7's convention
   (e.g. `tests/controllers/me.controller.test.ts`, `tests/services/me.service.test.ts`)

## Stage 12: Profile Management (View, Change Username / Email / Password)

> **Scope**: `GET /users/me`, `PUT /users/me/username`, `PUT /users/me/email`, `PUT /users/me/password`, `POST /users/me/confirm-password-change`, plus two new authenticated OTP routes: `POST /users/me/verify-otp`, `POST /users/me/resend-otp`. `/auth/verify-otp` and `/auth/resend-otp` are untouched — still public, still only `registration` | `forgot_password`.
>
> Backlog refs: F4.1, F4.2, F4.3, F4.4.

### Design decisions (already made, do not change)

| Rule                                         | Value                                                                                                                                                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /users/me` response                     | `{ username, email }` only                                                                                                                                                                                                                                                           |
| Username change                              | `PUT /users/me/username` — no password re-entry, no OTP                                                                                                                                                                                                                              |
| Username validation                          | Same format rule as registration (min 3, max 255, no spaces/special chars). Same as current → `409 USERNAME_UNCHANGED`. Taken by another account → `409 USERNAME_TAKEN` (reuses registration's code)                                                                                 |
| Email change — API-facing purpose            | `change_email` → DB enum `'Change Email'`                                                                                                                                                                                                                                            |
| Email change flow                            | One-step, like registration: `PUT /users/me/email` (current password + newEmail) issues an OTP to the NEW email, stored as `users_otps.new_email`; `POST /users/me/verify-otp {purpose: change_email}` finalizes directly, writing `users.email`                                     |
| Email validation                             | Same format rule as registration. Same as current → `409 EMAIL_UNCHANGED`. Taken by another account → `409 EMAIL_TAKEN`                                                                                                                                                              |
| Old email stays authoritative until verified | F4.2.6 — `users.email` untouched until the OTP is verified                                                                                                                                                                                                                           |
| Password change — API-facing purpose         | `change_password` → DB enum `'Change Password'`                                                                                                                                                                                                                                      |
| Password change flow                         | Two calls, nothing pending stored server-side: `PUT /users/me/password` (current password + newPassword — validated, NOT persisted) issues an OTP to the CURRENT/registered email; `POST /users/me/confirm-password-change {otp, newPassword}` re-supplies and applies `newPassword` |
| New password validation                      | Same complexity rule as registration. Identical to current password → `400 PASSWORD_UNCHANGED`                                                                                                                                                                                       |
| Password re-entry check (both flows)         | `bcrypt.compare` against the current password hash — verified on an unlocked read first (bcrypt is slow), then re-verified against the locked row inside the transaction, same race-safety pattern as `login`                                                                        |
| Successful password change side-effect       | Revoke ALL of that user's refresh tokens in the same transaction (F4.3.4)                                                                                                                                                                                                            |
| Successful email/username change side-effect | None                                                                                                                                                                                                                                                                                 |
| Route split for OTP endpoints                | `/auth/verify-otp` / `/auth/resend-otp` stay PUBLIC, purposes `registration` \| `forgot_password` only. Two NEW, AUTHENTICATED routes: `POST /users/me/verify-otp` (purpose `change_email` only) and `POST /users/me/resend-otp` (purposes `change_email`, `change_password`)        |
| Why password-change has no verify-otp entry  | Its OTP is checked and consumed only inside `confirm-password-change` — `/users/me/verify-otp`'s purpose enum has just `change_email` for now                                                                                                                                        |
| Resending a change-email OTP                 | `/users/me/resend-otp {purpose: change_email}` resends to the SAME pending `new_email`, read off the latest OTP row — the client does not repeat it                                                                                                                                  |
| Locking                                      | `withTransaction` + `lockUserById`, same pattern as every other state-changing operation                                                                                                                                                                                             |
| Concurrent duplicate username/email          | Same `23505` → mapped-error pattern as registration                                                                                                                                                                                                                                  |
| Service file location                        | All new functions live in `src/services/me.service.ts` (created in Stage 11) — not `auth.service.ts` or `users.service.ts`                                                                                                                                                           |

No changes to already-implemented code are needed for this stage — everything below is additions only.

---

### Stage 12a: `GET /users/me`

#### Add to `src/services/me.service.ts`

`getOwnProfile(userId)`:

- `findById(userId)`. If none → `AppError(404, 'User not found', 'USER_NOT_FOUND')`
- Return `{ username: user.username, email: user.email }` — nothing else, not just `password_hash` stripped

#### Add to `src/controllers/me.controller.ts`

`getProfile` — `asyncHandler`, calls `meService.getOwnProfile(req.user.user_id)`, returns `200` with the object directly (not wrapped in `{ user: ... }`).

#### Add to `src/routes/me.routes.ts`

```ts
router.get("/", authenticate, meController.getProfile);
```

#### Verification

- `GET /users/me` while authenticated → `200`, `{ username, email }`, no other fields
- `GET /users/me` with no `Authorization` header → `401 UNAUTHORIZED`

---

### Stage 12b: Change Username

#### Add to `src/db/queries/users.queries.ts`

`updateUsername(userId, username, db)` — `UPDATE users SET username = $2, updated_at = NOW() WHERE id = $1 RETURNING *`

#### Add to `src/services/me.service.ts`

`changeUsername(userId, newUsername)`:

- Validate format (same rule/message as registration's username) → `400 VALIDATION_ERROR`

Inside `withTransaction`:

1. `locked = lockUserById(userId, client)`. If null → `404 USER_NOT_FOUND`
2. If `newUsername === locked.username` → `AppError(409, 'New username must be different from your current username', 'USERNAME_UNCHANGED')`
3. `existing = findByUsername(newUsername, client)`. If `existing && existing.id !== userId` → `AppError(409, 'Username already in use', 'USERNAME_TAKEN')`
4. `updateUsername(locked.id, newUsername, client)` — wrap in try/catch for `23505` → same `USERNAME_TAKEN` mapping as registration (covers the concurrent race)
5. Return `{ username: updated.username, email: updated.email }`

#### Add to `src/controllers/me.controller.ts`

`changeUsername` — Zod (`.strict()`): `newUsername` required "New username is required", type "New username must be a string", lowercased-only (not trimmed, same as registration's username field). Calls `meService.changeUsername()`, returns `200` with the returned profile object.

#### Add to `src/routes/me.routes.ts`

```ts
router.put("/username", authenticate, meController.changeUsername);
```

#### Verification

- Valid new username → `200`, `{ username: <new>, email }`, DB row updated
- Same as current username → `409 USERNAME_UNCHANGED`
- Username belonging to another account → `409 USERNAME_TAKEN`
- Invalid format (too short / spaces / special chars) → `400 VALIDATION_ERROR`
- Missing/extra/wrong-type fields → standard `400 VALIDATION_ERROR` pattern
- No `Authorization` header → `401 UNAUTHORIZED`
- Two concurrent `PUT /users/me/username` requests from two different accounts both targeting the same new username → exactly one `200`, the other `409 USERNAME_TAKEN`, never `500`

---

### Stage 12c: Change Email — Initiate

#### Update `src/services/email.service.ts`

Add a `Change Email` entry to the purpose map: subject `"Confirm your new FoC email address"`, same body shape as the others.

#### Add to `src/services/me.service.ts`

`initiateEmailChange(userId, { currentPassword, newEmail })`:

- Validate `newEmail` format (same rule as registration) → `400 VALIDATION_ERROR`
- Unlocked read: `user = findById(userId)`. `bcrypt.compare(currentPassword, user.password_hash)`; mismatch → `AppError(401, 'Current password is incorrect', 'INVALID_PASSWORD')`
- If `newEmail === user.email` → `AppError(409, 'New email must be different from your current email', 'EMAIL_UNCHANGED')`
- `existing = findByEmail(newEmail)`. If `existing && existing.id !== userId` → `AppError(409, 'Email already in use', 'EMAIL_TAKEN')`

Inside `withTransaction`:

1. `locked = lockUserById(userId, client)`. If null → `404 USER_NOT_FOUND`
2. Re-verify `currentPassword` against `locked.password_hash` (race-safety) → `401 INVALID_PASSWORD` on mismatch
3. Re-check `newEmail` against `locked.email` and re-query `findByEmail(newEmail, client)` for the same two conditions (closes the gap between the unlocked read and the lock)
4. `requestOtp({ userId, email: locked.email, purpose: 'Change Email', newEmail }, client)`
5. Map the result the same way `forgotPassword` does: `sent` → success; `throttled` (cooldown/limit) → `429 OTP_RESEND_COOLDOWN` / `429 OTP_RESEND_LIMIT`; `EMAIL_SEND_FAILED` propagates as `503`

#### Add to `src/controllers/me.controller.ts`

`changeEmail` (`PUT /users/me/email`) — Zod (`.strict()`): `currentPassword` required "Current password is required"/string; `newEmail` uses the shared `emailField`. Returns `200` with `{ message: 'Verification code sent to your new email', code: 'OTP_SENT' }`.

#### Add to `src/routes/me.routes.ts`

```ts
router.put("/email", authenticate, meController.changeEmail);
```

#### Verification

- Correct current password + valid new unused email → `200 OTP_SENT`, `users_otps` row with `purpose = 'Change Email'`, `new_email` set, dev console/inbox shows the OTP
- Wrong current password → `401 INVALID_PASSWORD`, no OTP row created
- `newEmail` same as current → `409 EMAIL_UNCHANGED`
- `newEmail` already registered to another account → `409 EMAIL_TAKEN`, no OTP row created
- Immediately repeating the request → `429 OTP_RESEND_COOLDOWN` with `Retry-After`
- After the resend limit (backdate `created_at`) → `429 OTP_RESEND_LIMIT`
- SMTP send forced to fail → `503 EMAIL_SEND_FAILED`, rolled back cleanly
- No `Authorization` header → `401 UNAUTHORIZED`

---

### Stage 12d: `/users/me/verify-otp` and `/users/me/resend-otp`

#### Add to `src/db/queries/users.queries.ts`

`updateEmail(userId, email, db)` — `UPDATE users SET email = $2, updated_at = NOW() WHERE id = $1 RETURNING *`

#### Add to `src/services/me.service.ts`

`verifyEmailChangeOtp(userId, otp)`:

Inside `withTransaction`:

1. `locked = lockUserById(userId, client)`. If null → `404 USER_NOT_FOUND`
2. `pending = findLatestOtp(userId, 'Change Email', client)`. If none → `AppError(400, 'Invalid or expired OTP', 'INVALID_OTP')`
3. `checkOtp({ userId, purpose: 'Change Email', otp }, client)` — default consuming
4. If `{ ok: true }`: `updateEmail(locked.id, pending.new_email, client)`, wrapped in try/catch for `23505` → `AppError(409, 'Email already in use', 'EMAIL_TAKEN')` (someone else took it in the meantime — the whole transaction, including the OTP consumption, rolls back, so the OTP is still usable if the user picks a different email)
5. Commit; if `{ ok: false }` → `400 INVALID_OTP`

`resendChangeEmailOtp(userId)`:

Inside `withTransaction`:

1. `locked = lockUserById(userId, client)`. If null → `404 USER_NOT_FOUND`
2. `pending = findLatestOtp(userId, 'Change Email', client)`. If none, or `consumed_at` is set → `AppError(400, 'No pending email change found', 'NO_PENDING_EMAIL_CHANGE')`
3. `requestOtp({ userId, email: locked.email, purpose: 'Change Email', newEmail: pending.new_email }, client)`
4. Map result same as Stage 12c (cooldown/limit/sent/email-fail)

`resendChangePasswordOtp(userId)`:

Inside `withTransaction`:

1. `locked = lockUserById(userId, client)`. If null → `404 USER_NOT_FOUND`
2. `pending = findLatestOtp(userId, 'Change Password', client)`. If none or `consumed_at` is set → `AppError(400, 'No pending password change found', 'NO_PENDING_PASSWORD_CHANGE')`
3. `requestOtp({ userId, email: locked.email, purpose: 'Change Password' }, client)`
4. Map result same as above

#### Add to `src/controllers/me.controller.ts`

- `verifyOtp` — Zod (`.strict()`): `otp` required/string; `purpose` enum `['change_email']` only, "Invalid purpose" for anything else. Dispatches (currently only one case) to `verifyEmailChangeOtp`. Returns `200` with `{ message: 'Email updated successfully', code: 'EMAIL_CHANGE_SUCCESS' }`.
- `resendOtp` — Zod (`.strict()`): `purpose` enum `['change_email', 'change_password']`. Dispatches to `resendChangeEmailOtp` or `resendChangePasswordOtp`. Both return `200` with `{ message: 'A new verification code has been sent to your email', code: 'OTP_SENT' }`.
- Both read the user id from `req.user.user_id` — neither accepts an `email` field.

#### Add to `src/routes/me.routes.ts`

```ts
router.post("/verify-otp", authenticate, meController.verifyOtp);
router.post("/resend-otp", authenticate, meController.resendOtp);
```

#### Verification

- Correct OTP for a pending email change → `200 EMAIL_CHANGE_SUCCESS`, `users.email` updated, OTP row `consumed_at` set
- Wrong OTP → `400 INVALID_OTP`, `attempts_count` incremented and persisted
- 5 wrong OTPs → `429 OTP_ATTEMPTS_EXCEEDED`, email unchanged
- Expired OTP with correct code → `400 OTP_EXPIRED`
- `purpose: 'change_password'` sent to `/users/me/verify-otp` → `400 VALIDATION_ERROR`, `"Invalid purpose"`
- Someone else registers the pending `new_email` first, then the original user submits the correct OTP → `409 EMAIL_TAKEN`, OTP still valid afterward (not consumed)
- Resend for change_email → `200 OTP_SENT`, same `new_email` reused, previous OTP row's `consumed_at` set
- Resend for change_email with no pending change → `400 NO_PENDING_EMAIL_CHANGE`
- Resend for change_password with no pending change → `400 NO_PENDING_PASSWORD_CHANGE`
- Both routes with no `Authorization` header → `401 UNAUTHORIZED`
- `POST /auth/verify-otp` and `POST /auth/resend-otp` (the original public ones) still reject `change_email`/`change_password` as an invalid purpose — confirms the two purpose sets stayed separate

---

### Stage 12e: Change Password — Initiate + Confirm

#### Add to `src/services/me.service.ts`

`initiatePasswordChange(userId, { currentPassword, newPassword })`:

- Validate `newPassword` complexity (registration rule) → `400 VALIDATION_ERROR`
- Unlocked read: `user = findById(userId)`. `bcrypt.compare(currentPassword, user.password_hash)`; mismatch → `401 INVALID_PASSWORD`
- `bcrypt.compare(newPassword, user.password_hash)` — if true → `AppError(400, 'New password must be different from your current password', 'PASSWORD_UNCHANGED')`

Inside `withTransaction`:

1. `locked = lockUserById(userId, client)`. If null → `404 USER_NOT_FOUND`
2. Re-verify `currentPassword` against `locked.password_hash` → `401 INVALID_PASSWORD` on mismatch
3. `requestOtp({ userId, email: locked.email, purpose: 'Change Password' }, client)`
4. Map result (cooldown/limit/sent/email-fail), same pattern as 12c

`newPassword` is validated here but never written anywhere — it's discarded once this call returns.

`confirmPasswordChange(userId, { otp, newPassword })`:

- Validate `newPassword` complexity → `400 VALIDATION_ERROR`
- Validate `otp` matches `^\d{6}$` → `400 VALIDATION_ERROR`, `"OTP must be a 6-digit code"`

Inside `withTransaction`:

1. `locked = lockUserById(userId, client)`. If null → `404 USER_NOT_FOUND`
2. `bcrypt.compare(newPassword, locked.password_hash)` — if true → `400 PASSWORD_UNCHANGED` (re-checked here in case the password changed between initiate and confirm)
3. `checkOtp({ userId, purpose: 'Change Password', otp }, client)` — default consuming
4. If `{ ok: true }`: hash `newPassword` (bcrypt, work factor 10), `updatePasswordHash(locked.id, hash, client)`, `revokeAllRefreshTokensForUser(locked.id, client)`
5. Commit; if `{ ok: false }` → `400 INVALID_OTP`

#### Add to `src/controllers/me.controller.ts`

- `changePassword` (`PUT /users/me/password`) — Zod (`.strict()`): `currentPassword`, `newPassword` required/string, same message style as `reset-password`. Returns `200` with `{ message: 'Verification code sent to your email', code: 'OTP_SENT' }`.
- `confirmPasswordChange` (`POST /users/me/confirm-password-change`) — Zod (`.strict()`): `otp`, `newPassword` required/string. Returns `200` with `{ message: 'Password changed successfully. Please log in again on other devices.', code: 'PASSWORD_CHANGE_SUCCESS' }`.

#### Add to `src/routes/me.routes.ts`

```ts
router.put("/password", authenticate, meController.changePassword);
router.post(
  "/confirm-password-change",
  authenticate,
  meController.confirmPasswordChange,
);
```

#### Verification

Happy path:

- Correct current password + valid new password → `200 OTP_SENT` → `confirm-password-change` with correct OTP → `200 PASSWORD_CHANGE_SUCCESS`, hash updated, all refresh tokens revoked
- Login with new password → `200`; login with old password → `401 INVALID_CREDENTIALS`
- A previously-issued access token stays valid until it naturally expires (only refresh tokens revoked)

Validation / errors:

- Wrong current password at initiate → `401 INVALID_PASSWORD`, no OTP sent
- `newPassword` same as current at initiate → `400 PASSWORD_UNCHANGED`
- Weak `newPassword` at either step → `400 VALIDATION_ERROR`
- Wrong OTP at confirm → `400 INVALID_OTP`, attempt persisted
- 5 wrong OTPs → `429 OTP_ATTEMPTS_EXCEEDED`, password unchanged
- Expired OTP → `400 OTP_EXPIRED`
- Re-submitting an already-consumed OTP → `400 INVALID_OTP`
- `confirm-password-change` with a different `newPassword` than what was validated at initiate → succeeds with whatever was sent to confirm (confirms initiate's validation was advisory/early-feedback only, not authoritative — note this is intended, not a bug)
- No `Authorization` header on either route → `401 UNAUTHORIZED`

Concurrency:

- Two concurrent `confirm-password-change` calls with the correct OTP → exactly one `200`, the other `400 INVALID_OTP`, password changed once

## Stage 13: Auth Distribution — JWKS Instead of `GET /auth/verify`

> **Scope**: Replace the current inter-service auth pattern — `supplier-service` (and, going
> forward, `order-service` and `credit-service`) calling `GET /auth/verify` on `user-service`
> for every request — with each consuming service verifying the access token itself, locally,
> against `user-service`'s public key. `user-service` publishes its public key(s) at a JWKS
> endpoint instead of answering a per-request verify call. This stage only covers `user-service`
> (signing/publishing side) and a guide for implementers; it does not implement verification
> inside `order-service`, `supplier-service`, or `credit-service` — see Stage 13d.
>
> This supersedes the auth pattern documented in `SupplierServiceArchitecture.md §7` and
> `SupplierServiceSpec.md`. **Scope correction (2026-10-17):** those two docs are _not_ updated
> as part of this stage — the user-service owner only touches `user-service` and this file;
> updating the supplier-service docs is left to that service's own owner.

### Design decisions (already made, do not change)

| Rule                                     | Value                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signing algorithm                        | RS256, unchanged. `user-service` keeps signing with its private key; nothing about `signAccessToken`'s claims changes.                                                                                                                                                                                                                               |
| Key pair for this stage                  | Reuse the existing `user-service/keys/private.pem` / `public.pem` (RSA-2048) as the first key published via JWKS. No new key pair is generated for this stage.                                                                                                                                                                                       |
| Distribution mechanism                   | JWKS. `user-service` exposes its public key(s) at a new, unauthenticated endpoint; consuming services fetch and cache them instead of calling an endpoint per request.                                                                                                                                                                               |
| JWKS endpoint                            | `GET /auth/.well-known/jwks.json` on `user-service`, mounted on the existing `/auth` router. Public, no `authenticate` middleware. Returns `{ keys: [...] }`, standard JWK format (RFC 7517).                                                                                                                                                        |
| Token claims                             | Unchanged (`sub` → `user_id`, `role`). No `aud` claim. The only addition is `kid` in the **JWT header** (not the payload), identifying which key signed the token.                                                                                                                                                                                   |
| Key rotation mechanism                   | Smooth transfer via JWKS: when rotating, the new key's public half is published under a new `kid` and signing cuts over to it; the just-retired key's public half stays published under its own `kid` (as the "previous" key) until its most recently issued tokens (max lifetime: `ACCESS_TOKEN_TTL_MINUTES`) have all expired, then it is dropped. |
| Key/kid configuration                    | One set of env vars per key, not a keystore file. Current signing key: `JWT_KEY_ID`, `JWT_PRIVATE_KEY_PATH`, `JWT_PUBLIC_KEY_PATH` (the last two already exist). Previous key, set only during a rotation overlap window: `JWT_PREVIOUS_KEY_ID`, `JWT_PREVIOUS_PUBLIC_KEY_PATH` (optional; no private key needed for a retired key).                 |
| Access token lifetime                    | Unchanged — `ACCESS_TOKEN_TTL_MINUTES` (currently 15). Not part of this stage.                                                                                                                                                                                                                                                                       |
| Cutover                                  | Instant/hard cutover. `GET /auth/verify` is removed in this stage, not deprecated alongside the new endpoint. There is no dual-support window at the API level (the key-rotation overlap above is a separate, narrower concept — it overlaps _keys_ in the JWKS, not _verification methods_).                                                        |
| Services in scope for consuming the JWKS | `order-service`, `supplier-service`, `credit-service` — all three.                                                                                                                                                                                                                                                                                   |
| Who implements the consuming side        | Not this stage. Stage 13d is a guide only; each service's own implementer writes and owns their verification code.                                                                                                                                                                                                                                   |

---

### Stage 13a: Per-Key Config + Signing/Verification by `kid`

#### Add to `user-service/src/config.ts`

- `JWT_KEY_ID` (required) — the `kid` for the current signing key.
- `JWT_PREVIOUS_KEY_ID` (optional) and `JWT_PREVIOUS_PUBLIC_KEY_PATH` (optional) — set together
  only during a rotation overlap window; both absent otherwise.
- Expose these under `config.jwt` alongside the existing `privateKeyPath` / `publicKeyPath`.

#### Change `user-service/src/utils/jwt.ts`

- Load the current key as `{ kid: config.jwt.keyId, privateKey, publicKey }` from the existing
  paths.
- If both `JWT_PREVIOUS_KEY_ID` and `JWT_PREVIOUS_PUBLIC_KEY_PATH` are set, also load a previous
  key as `{ kid, publicKey }` (no private key).
- `signAccessToken` — same claims as today; add the `keyid` sign option (`jsonwebtoken`'s
  built-in way of setting the JWT header's `kid`) set to the current key's `kid`.
- `verifyAccessToken` — decode the token's header first to read `kid`, look it up against the
  known keys (current, and previous if loaded), and verify with whichever key's public half
  matches. An unknown or missing `kid` is treated as an invalid token (same `401` behavior as
  any other verification failure today — no new error shape).
- Add `getJwks()` — returns `{ keys: [...] }`: for each known public key, export it as a JWK
  (Node's `crypto.createPublicKey(pem).export({ format: 'jwk' })` already yields `{ kty, n, e }`
  for an RSA key — no extra dependency needed) and add `kid`, `use: 'sig'`, `alg: 'RS256'`.

#### Verification

- A token signed by the current key verifies and its `kid` round-trips through `getJwks()`'s
  output.
- A token with no `kid` header, or a `kid` that matches neither known key, fails verification
  the same way a bad-signature token does today.
- With `JWT_PREVIOUS_KEY_ID` / `JWT_PREVIOUS_PUBLIC_KEY_PATH` unset (the normal case), `getJwks()`
  returns exactly one key.

---

### Stage 13b: JWKS Endpoint

#### Add to `user-service/src/controllers/auth.controller.ts`

- `jwks` — `asyncHandler`, no auth check, calls `getJwks()` and returns `200` with its result
  directly.

#### Add to `user-service/src/routes/auth.routes.ts`

```ts
router.get("/.well-known/jwks.json", authController.jwks);
```

#### Remove from `user-service/src/routes/auth.routes.ts` and `auth.controller.ts`

- `router.get('/verify', authController.verify)` and the `verify` controller itself (Stage 13c
  covers the knock-on test/doc updates this removal needs).

#### Verification

- `GET /auth/.well-known/jwks.json` requires no `Authorization` header and returns `200` with
  the current key in JWK format.
- `GET /auth/verify` no longer exists (`404`).

---

### Stage 13c: Remove `GET /auth/verify` — Tests and Docs

#### `user-service` tests

- `tests/controllers/auth.controller.test.ts` — remove the `describe('GET /auth/verify', ...)`
  block. The two unrelated tests that reuse `GET /auth/verify` purely as a "is this access token
  still valid" check (one under `POST /auth/logout`, one under password reset) need a different
  authenticated route to check against instead — `GET /users/me` already exists and is
  `authenticate`-protected.
- `tests/middleware/authenticate.test.ts` — remove the
  `describe('authenticate and GET /auth/verify agree on the same token', ...)` block (the thing
  it was cross-checking against no longer exists).
- Add coverage for the new behavior: the JWKS endpoint's shape and public-access, and
  `verifyAccessToken`/`signAccessToken` round-tripping by `kid` (Stage 13a's verification bullets
  above, as actual test cases).

#### Docs

**Scope correction (2026-10-17):** out of scope for this stage. `supplier-service/SupplierServiceArchitecture.md §7`
and `supplier-service/SupplierServiceSpec.md` still describe calling `GET /auth/verify`; the
user-service owner does not touch them — the user is notifying the supplier-service owner
directly to update them, pointing at the JWKS flow and the Stage 13d guide. (Root `README.md`
was checked and has no such contract-description prose to update — only historical Log-index
rows mentioning the old endpoint, which stay as-is.)

---

### Stage 13d: Guide for `order-service` / `supplier-service` / `credit-service` Implementers

This is documentation, not implementation — write a guide (not code) for whoever implements
token verification in each of the three consuming services. It must cover, at minimum:

- Fetching the JWKS from `GET {USER_SERVICE_URL}/auth/.well-known/jwks.json`.
- Caching keys by `kid` and a reasonable refetch strategy for a `kid` not currently in the
  cache (so key rotation doesn't require restarting every consuming service).
- Verifying the token's signature (RS256) against the matched key, and reading `sub` → `user_id`
  and `role` off the verified payload — the same two fields `GET /auth/verify` used to return.
- Rejecting with `401` on a missing/invalid/unverifiable token, consistent with how
  `user-service`'s own `authenticate` middleware already behaves.
- Noting that `supplier-service/src/middleware/authenticate.ts` currently calls the
  now-removed `GET /auth/verify` and must be rewritten by its implementer following this guide —
  this stage does not rewrite it.

Each service's own implementer writes and owns that service's verification code; this guide
only tells them how, per the decisions in this stage.

- Running `POST /auth/login` with the OLD password in a loop while the reset completes → no non-revoked refresh token survives from an old-password login after the change commits

# Stage 14: Initial Credit Allocation via Transactional Outbox

> **Scope**: When a user becomes active, user-service tells credit-service to allocate their
> initial credits. The request is recorded in an outbox table in `user-db` in the **same
> transaction** as the activation, and a relay running inside user-service delivers it to
> credit-service's `POST /credits/allocate` over HTTP, retrying on failure. Credit-service's side
> is already built and is not touched in this stage.
>
> Activation points covered: registration OTP verification (`verifyRegistrationOtp`) and the
> super admin bootstrap (when it actually creates the super admin).
>
> Backlog refs: F19.1.1 (allocation itself is credit-service's; this stage triggers it). D3 Parts 2–3.
>
> **Before starting:** if any `[DECIDE]` placeholder remains anywhere in this stage, stop and ask
> me. Do not pick a value yourself.

### Design decisions (already made, do not change)

| Rule                    | Value                                                                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport               | HTTP. `POST {CREDIT_SERVICE_URL}/credits/allocate`, JSON body `{ "userId": "<uuid>" }`. No message broker.                                                                                                       |
| Credit-service contract | `201` = allocated. `409 ALREADY_ALLOCATED` = already allocated, nothing granted. Credit dedupes on `userId` only. No service-to-service auth. No `Idempotency-Key` or other custom header is sent.               |
| Durability              | Transactional outbox: the outbox row is inserted with the same `client` and in the same `withTransaction` as the activation (or the super admin insert). Both commit or neither does.                            |
| Relay location          | Inside user-service. Started from `server.ts` after the super admin bootstrap. `app.ts` must not start it (tests import `app`).                                                                                  |
| Poll interval           | 1 second between passes                                                                                                                                                                                          |
| Batch size              | 5 rows per group; a pass repeats groups until no row is due (see "Delivery within a pass")                                                                                                                       |
| Request timeout         | 3 seconds per call                                                                                                                                                                                               |
| Claiming                | None. Two relays may deliver the same row; Credit's `409` makes that harmless. Do not add `FOR UPDATE SKIP LOCKED`, a claim column, or any other claiming mechanism.                                             |
| Max attempts            | 10 failed attempts, then the row is `dead`                                                                                                                                                                       |
| Backoff                 | Exponential with full jitter (see "Backoff" below)                                                                                                                                                               |
| Dead rows               | Kept. Recovered only by the replay script (Stage 14e).                                                                                                                                                           |
| Sent rows               | Kept with `status = 'sent'`, never deleted                                                                                                                                                                       |
| Observability           | The outbox row is the record: `status`, `attempts`, `last_error`, `updated_at`. No per-attempt log lines. The only console output is `console.error` when a whole relay pass fails (e.g. `user-db` unreachable). |
| Super admin             | Gets credits. Bootstrap inserts an outbox row only when it actually created the super admin.                                                                                                                     |
| Already-active users    | Ignored. No backfill.                                                                                                                                                                                            |
| Config                  | `CREDIT_SERVICE_URL` is an env var. Every other value in this table is a constant in code.                                                                                                                       |

### Outcome → action

| Outcome of a delivery attempt                                                                                            | Action                                                             |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Any `2xx` (including `201`)                                                                                              | `sent`                                                             |
| `409`                                                                                                                    | `sent`                                                             |
| `400`, `401`, `403`, `404`, `500`                                                                                        | `dead` immediately (`attempts` incremented, `last_error` recorded) |
| `429`, and any `5xx` other than `500` (e.g. `502`, `503`, `504`)                                                         | Retry with backoff; `dead` once `attempts` reaches 10              |
| Timeout (3 s) or network error (`ECONNREFUSED`, `ENOTFOUND`, `ECONNRESET`, etc.)                                         | Retry with backoff; `dead` once `attempts` reaches 10              |
| `408`, `425` (may resolve on their own)                                                                                  | Retry with backoff; `dead` once `attempts` reaches 10              |
| Any other status not listed above, including every other `3xx` and `4xx` (won't resolve without a code or config change) | `dead` immediately (`attempts` incremented, `last_error` recorded) |

`last_error` format:

- HTTP response: `HTTP <status>` followed by the response body's `code` if the body is JSON and has one, e.g. `HTTP 500 BALANCE_INVARIANT_VIOLATION`. Never store the full response body.
- Timeout: `TIMEOUT`
- Network error: `NETWORK <error code>`, e.g. `NETWORK ECONNREFUSED`

### Backoff

`attempts` counts failed attempts. After the n-th failed attempt (n = the new `attempts` value):

- If n ≥ 10 → `status = 'dead'`
- Otherwise → `next_attempt_at = clock_timestamp() + (random() × min(300, 1 × 2^(n−1))) seconds`

So the caps on the wait are 1, 2, 4, …, 256 seconds, and the actual wait is a random value between 0 and the cap. Compute this in SQL (clock rule: the database owns time), not with `Date.now()` or `Math.random()`. A row whose wait has passed is picked up by the next group, in the same pass or the next one.

### Delivery within a pass

A pass works through the backlog in groups of 5:

1. `findDueCreditAllocations(5)`
2. If it returns no rows, the pass ends.
3. Otherwise, send all of the returned rows concurrently, wait until every request has settled (`Promise.allSettled`, so one failure never stops the others' results from being recorded), and record each result.
4. Go back to step 1 immediately. There is no 1-second wait between groups.

A pass ends only when no row is due. Rows still waiting out their backoff are not due, so they don't keep the pass going; a row whose wait expires during the pass is picked up by a later group in the same pass. Each group takes at most 3 s (the request timeout).

Passes never overlap within one process: schedule the next pass 1 second after the current pass finishes (chained `setTimeout`), not with `setInterval`.

---

## Changes to already-implemented code (do these as part of the sub-stages below)

| #   | File                                                     | Change                                                                                                                                              | Where specified |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | `src/db/init.sql`                                        | New `outbox_status_enum` and `credit_allocation_outbox` table                                                                                       | Stage 14a       |
| 2   | `.env.example`, `.env`, `.env.test`, `src/config.ts`     | Add `CREDIT_SERVICE_URL`                                                                                                                            | Stage 14a       |
| 3   | `src/services/auth.service.ts` (`verifyRegistrationOtp`) | Insert the outbox row after `activateUser` succeeds, same `client`. Replace the `// TODO(credit-service): emit user-registered event here` comment. | Stage 14d       |
| 4   | Super admin bootstrap                                    | Run `createSuperAdmin` and the outbox insert in one `withTransaction`; insert the outbox row only if `createSuperAdmin` returned a row              | Stage 14d       |
| 5   | `src/server.ts`                                          | Start the relay after the bootstrap                                                                                                                 | Stage 14c       |
| 6   | `package.json`                                           | Add the `outbox:replay` script                                                                                                                      | Stage 14e       |

---

## Stage 14a: Schema + Config

### Update `src/db/init.sql`

Add, using the same safe-creation pattern as the existing enums:

```sql
DO $$ BEGIN
  CREATE TYPE outbox_status_enum AS ENUM ('pending', 'sent', 'dead');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS credit_allocation_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status outbox_status_enum NOT NULL DEFAULT 'pending',
  attempts SMALLINT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`init.sql` only runs on a fresh volume. Remind me in your summary to reset with `docker compose down -v` (dev data only), and that the test database is rebuilt from `init.sql` by `globalSetup.ts`.

### Update `.env.example`, `.env`, `.env.test`

```env
# Credit service
CREDIT_SERVICE_URL=http://credit-service:3003
```

In `.env.test` use `http://localhost:3003` (no test calls it yet).

### Update `src/config.ts`

- Add `CREDIT_SERVICE_URL` to the Zod schema as a required URL string.
- Expose it as `config.creditService.url`.
- Strip a trailing slash if present, so `${url}/credits/allocate` is always well-formed.

### Verification

- `docker compose down -v && docker compose up --build` starts cleanly
- `\d credit_allocation_outbox` shows the table; `\dT+ outbox_status_enum` shows `pending`, `sent`, `dead`
- Remove `CREDIT_SERVICE_URL` from `.env` → the app exits with a clear error naming it (revert afterwards)

---

## Stage 14b: Outbox Queries

### Create `src/db/queries/creditOutbox.queries.ts`

All functions take `db: Queryable` as the last parameter (default `pool` where the function is not transaction-only).

- `insertCreditAllocation(userId, db)` — `INSERT INTO credit_allocation_outbox (user_id) VALUES ($1) RETURNING id`. Transaction-only: `db` is required.
- `findDueCreditAllocations(limit, db = pool)` — rows with `status = 'pending' AND next_attempt_at <= clock_timestamp()`, ordered by `next_attempt_at, created_at`, `LIMIT $1`. Plain read, no locking (see Claiming).
- `markCreditAllocationSent(id, db = pool)` — `SET status = 'sent', updated_at = NOW() WHERE id = $1 AND status = 'pending'`. Returns whether a row was updated.
- `markCreditAllocationDead(id, lastError, db = pool)` — `SET status = 'dead', attempts = attempts + 1, last_error = $2, updated_at = NOW() WHERE id = $1 AND status = 'pending'`. Returns whether a row was updated.
- `recordCreditAllocationFailure(id, lastError, { maxAttempts, baseDelaySeconds, maxDelaySeconds }, db = pool)` — one conditional `UPDATE ... WHERE id = $1 AND status = 'pending'` that:
  - sets `attempts = attempts + 1`, `last_error = $2`, `updated_at = NOW()`
  - sets `status = 'dead'` if `attempts + 1 >= maxAttempts`, else leaves it `'pending'`
  - when still pending, sets `next_attempt_at = clock_timestamp() + make_interval(secs => random() * LEAST(maxDelaySeconds, baseDelaySeconds * power(2, attempts)))`. In an `UPDATE`, `attempts` on the right-hand side is the **old** value (n − 1), which gives the 2^(n−1) cap from the Backoff section.

  Returns whether a row was updated. `maxAttempts`, `baseDelaySeconds` and `maxDelaySeconds` are passed as query parameters from the relay's constants, not hard-coded in the SQL.

- `replayDeadCreditAllocations(ids: string[] | null, db = pool)` — `SET status = 'pending', attempts = 0, next_attempt_at = NOW(), updated_at = NOW() WHERE status = 'dead'` and, when `ids` is not null, `AND id = ANY($1)`. Leave `last_error` unchanged. `RETURNING id`.

Every state change is a conditional `UPDATE ... WHERE status = '<expected>'` (convention 3), so a relay can never move a row out of `sent` or `dead`.

### Verification

- Covered through 14c–14e.

---

## Stage 14c: The Relay

### Create `src/services/creditOutbox.relay.ts`

Constants at the top of the file:

```ts
const POLL_INTERVAL_MS = 1000;
const BATCH_SIZE = 5;
const REQUEST_TIMEOUT_MS = 3000;
const MAX_ATTEMPTS = 10;
const BASE_DELAY_SECONDS = 1;
const MAX_DELAY_SECONDS = 300;
```

**`classifyResponseStatus(status: number)`** — pure function, no I/O. Returns `'sent' | 'dead' | 'retry'` per the Outcome → action table. Keep it separate so it can be unit-tested later.

**`deliverCreditAllocation(userId)`**:

- Sends the request:

  ```ts
  fetch(`${config.creditService.url}/credits/allocate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  ```

- Returns `{ action: 'sent' | 'dead' | 'retry', error?: string }`, where `error` follows the `last_error` format
- A timeout → `retry`, `TIMEOUT`. Any other thrown network error → `retry`, `NETWORK <code>` (use the error's `cause.code` if present, else `UNKNOWN`)
- Read the response body only to extract `code` for `last_error`. If the body isn't JSON, ignore it. Never store or log the body.

**One pass**: follows "Delivery within a pass" (groups of `BATCH_SIZE`, sent concurrently, repeated until no row is due). For each result in a group:

- `sent` → `markCreditAllocationSent`; `dead` → `markCreditAllocationDead`; `retry` → `recordCreditAllocationFailure` (passing `MAX_ATTEMPTS`, `BASE_DELAY_SECONDS`, `MAX_DELAY_SECONDS`)
- A `false` return from any of these (row no longer pending, e.g. another relay already handled it) is not an error. Skip it.

**`startCreditOutboxRelay(): { stop(): Promise<void> }`**:

- Runs a pass, then schedules the next one `POLL_INTERVAL_MS` after the pass finishes
- If a pass throws (e.g. `user-db` unreachable), `console.error` a single line with the error message (no user data, no response bodies) and continue with the next scheduled pass. The relay must never crash the process.
- `stop()` cancels the next scheduled pass and resolves once any in-flight pass finishes

### Update `src/server.ts`

- After the super admin bootstrap completes, call `startCreditOutboxRelay()`.
- If `server.ts` already handles shutdown signals, call `stop()` there. If it doesn't, do not add signal handling in this stage; tell me instead.
- `app.ts` must not import or start the relay.

### Verification

- With credit-service running: a pending row becomes `sent` within about a second, and credit-service shows a balance for that user
- With credit-service stopped (`docker compose stop credit-service`): the row stays `pending`, `attempts` goes up over time, `last_error` shows a `NETWORK ...` error, and `next_attempt_at` moves further out roughly as described in Backoff. Start credit-service again → the row becomes `sent` at its next due attempt
- Backdate `next_attempt_at` between attempts to speed it up: after the 10th failed attempt the row is `dead`, and the relay stops picking it up
- Insert more than 5 due rows at once (e.g. several pending rows via SQL for existing users) → they are delivered in groups of at most 5 within a single pass, with no 1-second gap between groups
- Set `CREDIT_SERVICE_URL=http://credit-service:3003/nonexistent` → credit-service returns `404` → the row goes straight to `dead` with `attempts = 1` and `last_error` starting `HTTP 404` (revert afterwards)
- Manually set a `sent` row back to `pending` → the relay delivers it again, credit-service returns `409`, the row becomes `sent`, and the user's balance is unchanged
- While credit-service is down, the rest of user-service (login, register, etc.) responds normally
- Stop `user-db` while user-service is running → one `console.error` line per failed pass, no crash; restart `user-db` → the relay resumes on its own

---

## Stage 14d: Wire Into Activation and Bootstrap

### Update `verifyRegistrationOtp` in `src/services/auth.service.ts`

- In the existing `withTransaction`, immediately after `activateUser(user.id, client)` returns `true`, call `insertCreditAllocation(user.id, client)`.
- Remove the `// TODO(credit-service): emit user-registered event here` comment.
- Nothing else in the function changes. In particular, the response does not wait for credit-service: verification succeeds even if credit-service is down.

### Update the super admin bootstrap

- Wrap `createSuperAdmin` and the outbox insert in one `withTransaction`, passing `client` to both.
- Insert the outbox row only if `createSuperAdmin` returned a row (the insert was not skipped by `ON CONFLICT DO NOTHING`).
- The existing "insert was skipped → re-check whether a super admin exists" logic is unchanged.
- An already-existing super admin gets no outbox row (no backfill).

### Verification

- Register → verify OTP → `200 REGISTER_SUCCESS`; one `credit_allocation_outbox` row for that user, created in the same transaction; it becomes `sent` and credit-service shows a 20-credit balance
- A failing verify (wrong OTP, expired OTP, attempts exceeded) creates no outbox row
- Two concurrent correct `verify-otp` requests → exactly one outbox row (only one activation succeeds)
- `docker compose down -v && docker compose up --build` → exactly one outbox row for the super admin, which becomes `sent`
- Restart the containers without `-v` → no new outbox row for the super admin
- With credit-service stopped, registration verification still returns `200 REGISTER_SUCCESS`

---

## Stage 14e: Replay Script

### Create `src/scripts/replayCreditOutbox.ts`

Usage:

```bash
npm run outbox:replay -- <outbox-id> [<outbox-id> ...]
npm run outbox:replay -- --all-dead
```

- No arguments, or an argument that is neither `--all-dead` nor a UUID → print usage and exit `1`
- Calls `replayDeadCreditAllocations` (with the IDs, or `null` for `--all-dead`)
- Prints the IDs that were reset. For explicit IDs, also prints the ones that were not reset (not found, or not `dead`). Only `dead` rows are ever reset.
- Ends the pool before exiting; exit `0` on success

### Update `package.json`

```json
"outbox:replay": "tsx src/scripts/replayCreditOutbox.ts"
```

Run it in dev with `docker exec -it foc-user-service npm run outbox:replay -- --all-dead`.

### Verification

- A `dead` row replayed by ID → `status = 'pending'`, `attempts = 0`, `last_error` unchanged; the relay then delivers it
- `--all-dead` resets every `dead` row and nothing else
- Replaying the ID of a `sent` or `pending` row → reported as not reset, row unchanged
- No arguments or an invalid ID → usage message, exit code `1`

---

### Tests

Deferred to the end-of-project test stage. Do not write tests in this stage.

# Stage 15: User Service Changes for Frontend Integration

> **Scope**: Backend changes the frontend needs. They are made before any frontend work:
>
> - `GET /users/me` also returns `activeView`
> - `GET /users` becomes paginated, searchable, filterable and sortable
> - every user-service JSON response uses camelCase keys
>
> DB columns stay snake_case.
>
> Backlog refs: F4.1.1, F5.2.2, F5.3.1.
>
> **Before starting:** if any `[DECIDE]` placeholder remains anywhere in Stages 15–16, stop and ask me. Do not pick a value yourself.

### Design decisions (already made, do not change)

| Rule                        | Value                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Response key convention     | camelCase for every JSON response from user-service. DB columns stay snake_case. Mapping happens in the service layer, in one place.                   |
| Consumers of user responses | The frontend is the only consumer. No other service reads user-service response bodies, so this is not a breaking change for other services.           |
| `GET /users/me`             | Returns `{ username, email, activeView }`                                                                                                              |
| `GET /users` change         | Changed in place (no new endpoint). The old bare `{ users: [...] }` shape is replaced.                                                                 |
| Pagination                  | Offset-based, `page` is 1-based, page size fixed at 50 (a constant, not a query param). A page past the end returns `200` with an empty `users` array. |
| Total count                 | Returned, so the frontend can show the total number of pages                                                                                           |
| Search                      | Two separate params: `username` (substring match) and `email` (exact match). Combined with AND.                                                        |
| Filters                     | `status` and `role`, each optional, combined with search using AND                                                                                     |
| Sort                        | `sortBy` one of `username`, `email`, `createdAt`; `sortDir` one of `asc`, `desc`. Not sortable by status or role. Default: `createdAt` `desc`.         |
| Query param names           | `page`, `username`, `email`, `status`, `role`, `sortBy`, `sortDir`                                                                                     |
| Pending users               | Still included (Stage 9 rule unchanged); `status` filter can isolate them                                                                              |

---

## Changes to already-implemented code

| #   | File                                                                   | Change                                                                                                                                | Where specified |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | `src/services/me.service.ts` (`getOwnProfile`)                         | Also return `activeView`                                                                                                              | Stage 15a       |
| 2   | `src/db/queries/users.queries.ts` (`listAllUsers`)                     | Replaced by a paginated, filtered query plus a count                                                                                  | Stage 15b       |
| 3   | `src/services/users.service.ts`, `src/controllers/users.controller.ts` | `listUsers` takes the query params and returns the paginated shape                                                                    | Stage 15b       |
| 4   | Every service function that returns a user row                         | Return the camelCase response shape via one shared mapper instead of a `password_hash`-stripped DB row                                | Stage 15c       |
| 5   | Existing tests                                                         | Update assertions that expect snake_case keys or the old `GET /users` shape. These are fixture/assertion updates, not new test cases. | Stage 15c       |

---

## Stage 15a: `activeView` on `GET /users/me`

### Update `src/services/me.service.ts`

`getOwnProfile(userId)` returns `{ username, email, activeView }`, where `activeView` comes from `user.active_view`. Nothing else changes.

### Verification

- `GET /users/me` → `200`, `{ username, email, activeView }`, no other fields
- After `PUT /users/me/active-view {activeView: 'courier'}`, `GET /users/me` returns `activeView: 'courier'`

---

## Stage 15b: Paginated `GET /users`

### Update `src/db/queries/users.queries.ts`

Replace `listAllUsers` with `listUsersPage({ usernameContains, email, status, role, sortBy, sortDir, limit, offset }, db = pool)`:

- Returns `{ rows, total }`. `total` counts **every** row matching the filters, ignoring `limit`/`offset`. Use the same `WHERE` clause for the count as for the rows: either a separate `COUNT(*)` query or `COUNT(*) OVER()`. If you use the window form, an empty page (past the end) still needs a correct `total`, so run a separate count when no rows come back.
- `usernameContains`: `username LIKE '%' || $n || '%' ESCAPE '\'`, with `\`, `%` and `_` in the input escaped first, so user input is matched literally. Usernames are stored lowercase, and the controller lowercases the input.
- `email`: exact `email = $n`
- `status`, `role`: exact match
- All values are bound parameters. `sortBy` and `sortDir` are **never** interpolated from input: map them through a fixed whitelist (`username` → `username`, `email` → `email`, `createdAt` → `created_at`; `asc`/`desc` → `ASC`/`DESC`).
- Order by the chosen column, then `id` (same direction) as a tie-breaker
- `LIMIT $limit OFFSET $offset`

### Update `src/services/users.service.ts`

`listUsers({ page, username, email, status, role, sortBy, sortDir })`:

- `PAGE_SIZE = 50` constant at the top of the file
- `offset = (page - 1) * PAGE_SIZE`
- Calls `listUsersPage`, maps each row with the Stage 15c mapper
- Returns `{ users, page, pageSize: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) }`

### Update `src/controllers/users.controller.ts` (`list`)

Validate `req.query` with Zod (`.strict()`, so an unknown param → `"Request contains unexpected fields"` via the global handler), messages in the existing style:

- `page`: optional, default `1`, coerced to an integer ≥ 1 → `"Page must be a positive integer"`
- `username`: optional string, lowercased (not trimmed, consistent with `usernameField`); empty string treated as absent → type error `"Username must be a string"`
- `email`: optional string, trimmed and lowercased (same normalisation as `emailField`, but optional); empty string treated as absent → type error `"Email must be a string"`
- `status`: optional, one of `pending`, `active`, `suspended` → `"Status must be 'pending', 'active' or 'suspended'"`
- `role`: optional, one of `user`, `admin`, `super admin` → `"Role must be 'user', 'admin' or 'super admin'"`
- `sortBy`: optional, one of `username`, `email`, `createdAt` → `"sortBy must be 'username', 'email' or 'createdAt'"`
- `sortDir`: optional, one of `asc`, `desc` → `"sortDir must be 'asc' or 'desc'"`. When absent: `desc` if `sortBy` is absent or `createdAt`, otherwise `asc`.
- A repeated param (Express turns `?status=a&status=b` into an array) fails the string type check → `400 VALIDATION_ERROR`

Return `200` with the service result.

### Verification

- `GET /users` (no params) → `200`, `{ users, page: 1, pageSize: 50, total, totalPages }`, sorted by `createdAt` desc
- With more than 50 users: `page=2` returns the next rows with no overlap or gap versus `page=1`
- `page` past the last page → `200`, `users: []`, `total` still correct
- `page=0`, `page=-1`, `page=abc`, `page=1.5` → `400 VALIDATION_ERROR`, `"Page must be a positive integer"`
- `username=ali` matches `alice` and `malik`; `username=%` matches only usernames that literally contain `%` (none, given the username format rule)
- `email=Alice@Example.com` matches `alice@example.com` exactly; `email=alice` matches nothing
- `username` + `email` + `status` + `role` combined → only rows matching all of them
- `status=pending` returns pending users
- `role=super admin` (URL-encoded) returns the super admin
- `sortBy=username&sortDir=asc` → alphabetical; `sortBy=status` → `400 VALIDATION_ERROR`
- Unknown param (e.g. `?foo=1`) → `400 VALIDATION_ERROR`, `"Request contains unexpected fields"`
- Regular user → `403 FORBIDDEN`; no token → `401 UNAUTHORIZED` (unchanged)
- No `password_hash` (or `passwordHash`) on any entry

---

## Stage 15c: camelCase Responses

### Create `src/services/userResponse.ts`

`toUserResponse(row)` returns `{ id, username, email, status, role, activeView, createdAt, updatedAt }` from a DB user row. It must never include the password hash. Every service function that currently returns a user row with `password_hash` stripped uses this mapper instead (at least `listUsers`, `getUserById`, `changeUserStatus`, `changeUserRole`, `changeActiveView`, including their no-op return paths).

### Sweep the rest of the service

Search every controller and service for any other response body with a snake_case key and convert it. Leave these alone:

- the JWKS response (its keys are fixed by RFC 7517)
- JWT claims (`sub`, `role`)
- error bodies (already `{ message, code }`)

List every response you changed in your summary.

### Update existing tests

Update assertions that expect snake_case keys (e.g. `active_view`, `created_at`) or the old `GET /users` shape. Do not add new test cases. If an existing test now fails for a reason other than key naming or the response shape, stop and report it instead of changing it.

### Verification

- `GET /users/:id`, `PUT /users/:id/status`, `PUT /users/:id/role`, `PUT /users/me/active-view` all return `{ id, username, email, status, role, activeView, createdAt, updatedAt }`
- The no-op paths of status and role changes return the same shape
- `POST /auth/login`'s `user` object is unchanged (`{ id, username, email, role, activeView }`)
- The full existing test suite passes after the assertion updates

---

# Stage 16: Frontend — User Service Integration

> **Scope**: Wire `frontend/` to user-service:
>
> - shared auth plumbing
> - login, registration (with OTP) and forgot password as pages
> - the `/account` page
> - the requester/courier toggle
> - admin user management
>
> Backlog refs: F1, F2, F3, F4, F5.1, F5.2.2, F5.3.1, F5.3.3.
>
> **Ground rules for every sub-stage:**
>
> - Work in `frontend/` only. Never touch `foc-mockup/`.
> - Read the current code before changing it. Where it disagrees with this file, follow the code and tell me.
> - Do not modify `src/realtime/orderSocket.js`, `src/data/users.js`, `src/components/DemoControls.jsx` or `AI-NOTES.md`. If you think one of them needs a change, stop and tell me why.
> - Do not change other teammates' pages except where a sub-stage says to (e.g. reading auth state). List every file outside user-service screens you touched.
> - React 18, JSX (no TypeScript), react-router-dom, Context API, Tailwind, lucide-react, native `fetch` through `src/api/http.js`. Do not add React Query, Redux, axios or a form library.
> - No tests in this stage (see the end of this file).

### Design decisions (already made, do not change)

| Rule                              | Value                                                                                                                                                                                                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend access                    | Relative same-origin paths through the existing Vite dev proxy (`/auth`, `/users` → user-service). No `VITE_*` URL in the browser bundle.                                                                                                                                                    |
| Access token                      | In memory only (never `localStorage`/`sessionStorage`). Attached as `Bearer` to every backend call, including supplier, order and credit.                                                                                                                                                    |
| Refresh                           | Both: refresh-on-401-and-retry (exists in `http.js`) and proactive refresh before expiry. Concurrent callers share one in-flight refresh (exists in `http.js`).                                                                                                                              |
| Auth state                        | A new `src/context/AuthContext.jsx`, separate from `DemoContext`                                                                                                                                                                                                                             |
| API modules                       | `src/api/auth.js` (auth/OTP/reset), new `src/api/profile.js` (`/users/me/*`), new `src/api/users.js` (admin `/users*`)                                                                                                                                                                       |
| Session restore                   | On load: `POST /auth/refresh`, decode the JWT for `id` and `role`, `GET /users/me` for `username`, `email`, `activeView`                                                                                                                                                                     |
| Pages, not modals                 | Login, registration, forgot password are pages. `LoginModal` is replaced.                                                                                                                                                                                                                    |
| Paths                             | `/login`, `/register` (one page: form step → OTP step), `/forgot-password` (one page: email → OTP → new password), `/account`, `/admin/users`. No frontend path may start with `/auth`, `/users`, `/credits`, `/orders`, `/api/v1` or `/socket.io` (the dev proxy would catch it on reload). |
| Landing after login               | The page the user was sent away from, else home. Same for every role.                                                                                                                                                                                                                        |
| Not logged in on a protected page | Redirect to `/login`, remembering the page                                                                                                                                                                                                                                                   |
| Wrong role                        | Admin links hidden from non-admins. Opening an admin URL anyway shows a 403 "Not authorised" view **in place** (URL unchanged).                                                                                                                                                              |
| Logout                            | Clear all client auth state even if `POST /auth/logout` fails, then go to `/login`                                                                                                                                                                                                           |
| Refresh failure                   | Same as logout (clear, go to `/login`)                                                                                                                                                                                                                                                       |
| Client validation                 | Mirror backend format rules (username, email, password complexity, 6-digit OTP) for instant feedback; the backend still enforces them                                                                                                                                                        |
| Error display                     | Inline under the field for field-specific errors; banner at the top of the form for whole-form errors (e.g. invalid credentials, account suspended); toast for background errors (e.g. failed view toggle)                                                                                   |
| Error text                        | The frontend maps backend `code` → its own text from one central map, with consistent phrasing. Backend `message` is not shown verbatim.                                                                                                                                                     |
| OTP input                         | 6 boxes, digits only, auto-advance, backspace moves back, pasting a 6-digit code fills all boxes, auto-submits when all 6 are filled. On a wrong code: clear and refocus the first box.                                                                                                      |
| Resend                            | During cooldown: disable resend with a countdown from `Retry-After`. On `OTP_RESEND_LIMIT`: disable resend, show the limit text, no countdown.                                                                                                                                               |
| Unverified login                  | `ACCOUNT_NOT_VERIFIED` from login → go to `/register` at the OTP step (see 16c)                                                                                                                                                                                                              |
| Register `409`                    | Show the taken error plus a hint: "Already signed up? Log in to finish verifying" linking to `/login`                                                                                                                                                                                        |
| Forgot password OTP               | Checked with `verify-otp` (`forgot_password`) before the new-password step is shown                                                                                                                                                                                                          |
| `/account`                        | Sections for profile view, change username, change email, change password                                                                                                                                                                                                                    |
| Active-view toggle                | Optimistic: update UI immediately, call `PUT /users/me/active-view`, revert and toast on failure                                                                                                                                                                                             |
| Admin row actions                 | A three-dot menu on each row, shown on hover: promote/demote and suspend/unsuspend. Each action asks for confirmation first. Promote/demote hidden from plain admins.                                                                                                                        |

### AI logging

Same as earlier stages: header comment on every file created **or modified**, and a usage-log entry per sub-stage in the existing format. JSX/JS files use `//` comments at the top of the file.

---

## Stage 16a: Read and Report (no code changes)

Read `frontend/` before writing anything. Read `AI-NOTES.md` for context but do not edit it. Then report the following and **stop and wait for my answers**:

1. **Admin supplier pages**: their route paths in `App.jsx`, and how a user reaches them (nav link, landing-page link, typed URL only). I will tell you where the Admin link goes and how it reaches `/admin/users`.
2. **`DemoContext` session consumers**: every file that reads session or auth state (`session`, `role`, `isAdmin`, login/logout functions, the local `role` `useState('requester')`) from `DemoContext`, and what each one reads. I will tell you how those consumers move to `AuthContext`.
3. **`http.js`**: confirm how the in-memory token, shared in-flight refresh and 401-retry work today, and where a proactive refresh and a "refresh failed → logged out" hook would attach.
4. **`LoginModal.jsx`**: every place that opens it.
5. **Home**: which route is home.
6. **Routes**: any existing frontend route that starts with a proxied prefix (`/auth`, `/users`, `/credits`, `/orders`, `/api/v1`, `/socket.io`).
7. **Toasts/banners**: any existing toast, banner or notice component (e.g. `ApiNotice.jsx`) that should be reused instead of building a new one.

---

## Stage 16b: Shared Auth Plumbing

### `src/context/AuthContext.jsx`

- Holds `user` (`{ id, role, username, email, activeView }`) and a status (`loading` | `authenticated` | `anonymous`)
- On mount: session restore (see decisions table). While restoring, protected routes render nothing (or a spinner), not a redirect.
- Exposes `login(identifier, password)`, `logout()`, `setActiveView(...)`, and a way for other sub-stages to update `username`/`email` after a profile change
- Consumers move off `DemoContext` exactly as I specified in my answer to 16a item 2

### `src/api/http.js`

- **Proactive refresh**: after each new access token, schedule a refresh 60 seconds before its `exp` (read from the decoded token). Reuse the existing shared in-flight refresh. Cancel the timer on logout.
- **Refresh failure** (proactive or after a 401): notify `AuthContext`, which clears state and goes to `/login`, remembering the current page
- Keep the existing in-flight GET de-duplication and 401-retry unchanged

### Route guards (in or next to `App.jsx`)

- `RequireAuth`: anonymous → `<Navigate to="/login" state={{ from: location }} replace />`
- `RequireRole minimum="admin"`: same rank order as the backend (`user` < `admin` < `super admin`); below it → render `<Forbidden />` in place

### Components

- `src/components/Forbidden.jsx`: "Not authorised" view with a link home
- `src/components/Toast.jsx` + a small toast provider (or reuse what 16a item 7 found)
- `src/components/FormBanner.jsx`: whole-form error/success banner
- `src/components/FieldError.jsx`: inline field error
- `src/components/OtpInput.jsx`: the 6-box input from the decisions table. Props: `onComplete(code)`, `disabled`, and a way for the parent to clear and refocus it after a wrong code.
- `src/components/ResendButton.jsx`: handles the cooldown countdown (`Retry-After`) and the limit state
- `src/utils/validation.js`: client-side mirrors of the backend rules (same regexes/limits as `auth.service.ts`)
- `src/api/errorMessages.js`: one map from backend `code` → frontend text, plus which display type (field / banner / toast) each code uses by default. Cover every code user-service can return to the frontend. Put the full map in your summary so I can review the phrasing.

### `/login` page

- `src/pages/Login.jsx`: identifier + password, links to `/register` and `/forgot-password`
- Success → `state.from` or home
- `INVALID_CREDENTIALS`, `ACCOUNT_SUSPENDED` → banner
- `ACCOUNT_NOT_VERIFIED`:
  ```js
  if (err.code === "ACCOUNT_NOT_VERIFIED") {
    navigate("/register", {
      state: {
        step: "otp",
        email: identifier.includes("@") ? identifier : null,
      },
    });
    return;
  }
  ```
- Shows a success banner when arriving with one in router state (from 16c/16d)
- Replace every place that opened `LoginModal` with navigation to `/login`. Delete `LoginModal.jsx` once nothing uses it.

### Logout

The TopNav logout button calls `AuthContext.logout()`: call `POST /auth/logout`, then clear state and go to `/login` whether or not the call succeeded. Do not redirect to a "from" page after an explicit logout.

### Verification

- Reload while logged in → still logged in; `username`, `email`, `role`, `activeView` populated
- No access token in `localStorage`/`sessionStorage` (check DevTools)
- Wait (or shorten the TTL in dev) → a proactive refresh happens before expiry, no 401 seen by pages
- Revoke the refresh token in the DB → the next refresh fails → `/login`
- Open `/account` logged out → `/login` → log in → back on `/account`
- Regular user opens `/admin/users` → 403 view, URL unchanged, no Admin link in nav
- Logout with user-service stopped → still lands on `/login` with state cleared
- Login with a pending account via email → `/register` OTP step with email filled; via username → OTP step with an email field
- Supplier/order/credit calls still carry the `Bearer` token

---

## Stage 16c: Registration (`/register`)

`src/pages/Register.jsx`, one page with two steps. Starts at the step given in `location.state.step`, default `form`.

**Form step**:

- `username`, `email`, `password` with client validation → `POST /auth/register`
- On `201` → OTP step, carrying the email
- `USERNAME_TAKEN` / `EMAIL_TAKEN` → inline on that field, plus the "Already signed up? Log in to finish verifying" hint linking to `/login`

**OTP step**:

- If no email was carried in (arrived from login with a username), show an email field above the boxes. Resend and verify are disabled until it's filled.
- When arrived from login (`state.step === 'otp'`): show a clear **"Send a new code"** button at the top, since the original code has probably expired. Do not send automatically.
- `OtpInput` → `POST /auth/verify-otp` (`purpose: 'registration'`)
- `ResendButton` → `POST /auth/resend-otp` (`purpose: 'registration'`)
- Success → `/login` with a success banner
- `INVALID_OTP` → clear boxes, inline error
- `OTP_EXPIRED`, `OTP_ATTEMPTS_EXCEEDED` → error pointing at resend
- `NO_PENDING_REGISTRATION` on resend → banner

### Verification

- Full happy path: register → OTP (dev console) → login works
- Wrong code → boxes clear, attempts persist (DB)
- Pasting a 6-digit code fills and submits
- Non-digits can't be typed
- Resend immediately → countdown from `Retry-After`; 6th resend → limit text, no countdown
- Register again with the same username within 10 minutes → `USERNAME_TAKEN` inline + hint
- Abandon at OTP, later log in with correct credentials → lands on the OTP step; "Send a new code" → new code works
- Same via username → email field shown, works once filled

---

## Stage 16d: Forgot Password (`/forgot-password`)

`src/pages/ForgotPassword.jsx`, one page, three steps. The email and verified OTP are kept in component state only; a reload restarts at the email step.

1. **Email** → `POST /auth/forgot-password`
   - `EMAIL_NOT_FOUND` → inline
   - `ACCOUNT_NOT_VERIFIED` → banner
   - Cooldown/limit → resend-style messaging
2. **OTP** → `OtpInput` → `POST /auth/verify-otp` (`purpose: 'forgot_password'`, non-consuming)
   - Success → step 3
   - Resend via `POST /auth/resend-otp` (`purpose: 'forgot_password'`). Limit text says "about an hour".
3. **New password** (client complexity check) → `POST /auth/reset-password` with email, OTP, new password
   - Success → `/login` with a success banner
   - `INVALID_OTP` / `OTP_EXPIRED` / `OTP_ATTEMPTS_EXCEEDED` here (e.g. the code expired between steps) → back to step 2 with the error

### Verification

- Happy path end to end; old password then fails at login
- Wrong code at step 2 never shows step 3
- Expire the OTP in the DB while on step 3 → submit → back at step 2 with the expiry error
- Reload mid-flow → back at step 1

---

## Stage 16e: Account Page (`/account`)

`src/pages/Account.jsx` behind `RequireAuth`, linked from the nav. Calls go through `src/api/profile.js`.

- **Profile**: `username`, `email` from `AuthContext` (`GET /users/me` already loaded)
- **Change username**: `PUT /users/me/username`
  - `USERNAME_UNCHANGED` / `USERNAME_TAKEN` → inline
  - Success → update `AuthContext`, success banner in the section
- **Change email**: current password + new email → `PUT /users/me/email` → OTP shown inline in the same section → `POST /users/me/verify-otp` (`change_email`)
  - Resend: `POST /users/me/resend-otp` (`change_email`)
  - `INVALID_PASSWORD` → inline on current password
  - `EMAIL_UNCHANGED` / `EMAIL_TAKEN` → inline on new email
  - Success → update `AuthContext`
- **Change password**: current + new password → `PUT /users/me/password` → OTP inline → `POST /users/me/confirm-password-change` with the OTP and the **same** new password, kept in component state from the first step so the user doesn't retype it
  - Resend: `POST /users/me/resend-otp` (`change_password`)
  - `PASSWORD_UNCHANGED` → inline
- **After a successful password change**: the backend revokes **all** of the user's refresh tokens, including this browser's. Decided: immediate forced re-login. Right after the success response, clear all client auth state (same as `AuthContext.logout()`'s state-clearing, but skip the `POST /auth/logout` call since the refresh token is already revoked) and redirect to `/login` with a banner telling the user to sign in again with their new password. Do not wait for the next proactive refresh to catch this.

### Verification

- Each section's happy path; the nav and profile show new values without a reload
- Each inline error above
- OTP cooldown and limit behave as in 16c
- Password change → immediately redirected to `/login` with the "sign in again" banner, not left on `/account` until the next refresh fails

---

## Stage 16f: Requester/Courier Toggle

- The toggle reads `AuthContext.user.activeView`
- On change: update immediately, call `PUT /users/me/active-view`. On failure, revert and show a toast.
- Anything that previously read the local `role` state in `DemoContext` reads `activeView` from `AuthContext`, as specified in my 16a answer
- Gabriel will adjust `TopNav.jsx` layout if needed; keep TopNav changes minimal and list them

### Verification

- Toggle → UI changes instantly; the DB column updates
- Reload → the same view persists
- Stop user-service, toggle → UI reverts, toast shown
- Log in on another browser → same view

---

## Stage 16g: Admin User Management (`/admin/users`)

`src/pages/AdminUsers.jsx` behind `RequireAuth` + `RequireRole minimum="admin"`. Reached as I specified in my 16a answer. Calls go through `src/api/users.js`.

- **Table columns**: username, email, status, role, created (date)
- **Search**: two boxes, username (substring) and email (exact), 300 ms debounce, AND-combined. Empty boxes are omitted from the query.
- **Filters**: status (pending/active/suspended/any), role (user/admin/super admin/any)
- **Sort**: click the username, email or created header to sort; click again to flip direction. Status and role headers are not sortable. Default: created, newest first.
- **Pagination**: 50 per page, prev/next plus "Page X of Y" from `totalPages`. Changing search, filter or sort resets to page 1.
- **Row actions**: a three-dot menu, visible on row hover; always visible on touch / small screens. It shows only the actions the backend would allow:

| Caller      | Target row                  | Suspend / Unsuspend    | Promote / Demote                 |
| ----------- | --------------------------- | ---------------------- | -------------------------------- |
| admin       | user (active/suspended)     | shown                  | hidden                           |
| admin       | admin, super admin, own row | hidden                 | hidden                           |
| super admin | user or admin (active)      | shown                  | Promote if user, Demote if admin |
| super admin | user or admin (suspended)   | shown                  | hidden (backend `422`)           |
| any         | pending row                 | hidden (backend `422`) | hidden (backend `422`)           |
| any         | super admin row, own row    | no menu                | no menu                          |

If a row has no allowed actions, show no menu.

- **Confirmation**: each action opens a confirmation dialog naming the user and the action
- **Action results**: success → update the row from the response, success toast. Error (including a stale-state `403`/`422` from a race) → toast, then refetch the current page.

### Verification

- Admin and super admin each see exactly the actions in the table above
- Plain user → 403 view
- Search, filters and sort each change the request params and results; combinations AND together
- Page past the end (e.g. after a filter shrinks results) shows an empty state, and "Page X of Y" stays correct
- Suspend → the row shows suspended; that user's next refresh fails (logged out)
- Promote → the row shows admin
- Menu works on a phone-width viewport with no hover

---

## After Stage 16

### Deviations

List every place where you deviated from this file and why.

### Reminder: tests still owed

Tests have not been written for:

- Stage 14 (outbox, relay, replay script)
- Stage 15 (paginated `GET /users`, camelCase responses, `activeView` on `/users/me`)
- Stage 16 (frontend)

Also check every other stage for gaps against its Verification list. Write these in the end-of-project test stage, following the Stage 7 ground rules.

### Kept in view (not in this stage)

- **NFR4** (session inactivity timeout, 7-day limit, expiry warning). Design notes so far:
  - server-side enforcement
  - activity = scroll, touch and API calls, shared across tabs via BroadcastChannel
  - 1-minute warning configured in the frontend, 30-minute timeout in the backend
  - user-service never sees other services' API calls, so the frontend must report activity to it (endpoint and reporting rate still undecided)
- **F5.3.2**: an admin user-detail page with a user's credit transactions and their orders. Needs a credit-service endpoint, and order data.
- **NFR3** masking: emails are shown unmasked in the admin list for now.
- **`orderSocket.js`**: may need to disconnect on logout and use refreshed tokens. Flag it to the order-service owner if so.

# Stage 17: Local Setup Script

> **Scope**: One script that prepares a fresh checkout of `user-service` to run: creates `.env`,
> fills in a generated `SUPER_ADMIN_PASSWORD`, and generates the RS256 keypair. Run on the host
> with `npm run setup`. Part 1 of `user-service/docs/user-service-instructions.md` is updated to
> point at it, and the missing usage-log record of the doc rename is added.
>
> This is local-dev tooling only. It is never run in AWS or CI deployments: there, the private key
> and `SUPER_ADMIN_PASSWORD` come from Secrets Manager.
>
> **Before starting:** read the current code, not just this file. If any `[DECIDE]` placeholder
> remains, or anything below disagrees with the code, stop and ask me.

### Design decisions (already made, do not change)

| Rule                    | Value                                                                                                                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language / runner       | TypeScript, run with `tsx`, on the host (not inside a container)                                                                                                                                                                              |
| File                    | `user-service/src/scripts/setupLocalDev.ts` (same folder as `replayCreditOutbox.ts`)                                                                                                                                                          |
| npm script              | `"setup": "tsx src/scripts/setupLocalDev.ts"`, so it runs as `npm run setup` (and `npm run setup -- --force`)                                                                                                                                 |
| `.env`                  | If `user-service/.env` does not exist, copy `.env.example` to `.env`. An existing `.env` is never replaced; only the specific lines below are changed.                                                                                        |
| `SUPER_ADMIN_PASSWORD`  | If blank or missing in `.env`, generate one, write it into `.env`, and print it to the terminal once. If already set, leave it unchanged and do not print it.                                                                                 |
| Password generation     | 24 characters, CSPRNG only (`crypto.randomInt`; never `Math.random`). One character from each class (lowercase, uppercase, digit, special), the remaining 20 from the combined set, then a Fisher–Yates shuffle driven by `crypto.randomInt`. |
| Special characters      | `[DECIDE]` — the allowed set, e.g. `!@%^*-_+.~`. Must contain no `#`, `$`, quotes, backslash or whitespace (they break `.env` parsing or Compose interpolation).                                                                              |
| Password rule           | Imported, not copied: the script checks every generated password against the existing `PASSWORD_REGEX` and throws if it does not match                                                                                                        |
| Keys                    | RSA-2048 via `crypto.generateKeyPairSync`. Private key PEM (PKCS#8) → `keys/private.pem` with file mode `0600`; public key PEM (SPKI) → `keys/public.pem`. Create `keys/` if missing.                                                         |
| When keys are generated | If either `private.pem` or `public.pem` is missing, regenerate **both**. If both exist, skip unless `--force` is passed.                                                                                                                      |
| `--force`               | Applies to the keys and `JWT_KEY_ID` only. It never touches `SUPER_ADMIN_PASSWORD` or any other `.env` value.                                                                                                                                 |
| `JWT_KEY_ID`            | Whenever keys are generated (first run or `--force`), set `JWT_KEY_ID` in `.env` to the current UTC time to the second, ISO 8601 without milliseconds: `YYYY-MM-DDTHH:MM:SSZ` (e.g. `2026-11-04T01:48:30Z`). Unchanged when keys are skipped. |
| Editing `.env`          | Replace only the matching `KEY=...` line, preserving every other line and comment. If the key's line is absent (stale `.env`), append it.                                                                                                     |
| Never printed or logged | The private key. The password is printed exactly once, only when it was just generated.                                                                                                                                                       |
| Arguments               | No arguments, or exactly `--force`. Anything else → print usage, exit `1`.                                                                                                                                                                    |

### Watch for

- **`config.ts` exits at import time** when `.env` is missing or incomplete, which is exactly the state this script runs in. The script must not import `config.ts`, `pool.ts`, or any module that imports them, directly or transitively. If `PASSWORD_REGEX` is only exported from a module that pulls in `config.ts`, **stop and tell me** — moving it is a code change I need to approve.
- The script runs from the host, so all paths must resolve relative to the `user-service/` directory (e.g. via `import.meta.url`), not the shell's working directory.
- Write the key files before updating `JWT_KEY_ID` in `.env`.

### Script output

Print a short summary of what was done:

- `.env`: created from `.env.example` / already existed
- `SUPER_ADMIN_PASSWORD`: generated (followed by the password, once) / already set
- Keys: generated (with the new `JWT_KEY_ID`) / already exist, skipped (with a hint that `--force` regenerates them)

After `--force`, also print that tokens signed with the old key are no longer valid, and that other running services (credit, supplier) should be restarted so they pick up the new key.

### Update `package.json`

Add the `setup` script above.

### Update `user-service/docs/user-service-instructions.md`

- Replace Part 1's manual steps 1–3 (copy `.env`, set `SUPER_ADMIN_PASSWORD`, openssl keypair) with: `cd user-service && npm install && npm run setup`, then a short description of what the script does, that it is safe to re-run, and what `--force` does.
- Keep steps 4 (SMTP / `TEST_USER_*`) and 5 (start the stack). Renumber as needed.
- Part 2 is unchanged.
- Add a dated entry to the file's AI disclosure header.

### Usage log: the doc rename

On 2026-10-22 the guide was created and merged as `user-service/docs/local-dev-setup.md`, but was committed as `user-service/docs/user-service-instructions.md` (commit `862f88b`). The log entries say `local-dev-setup.md`.

- First check whether `ai/usage-log.md` already records the rename (search for `user-service-instructions`). If it does, tell me and skip the next step.
- Otherwise append a new entry recording that `local-dev-setup.md` was renamed to `user-service-instructions.md` before it was committed, so the two 2026-10-22 entries refer to the file now at the new path. Do **not** edit earlier entries; the log is append-only.
- Add the matching README Log index row, as with every log entry.

### Verification

- Fresh state (no `.env`, no `keys/`): `npm run setup` → `.env` created, `SUPER_ADMIN_PASSWORD` filled and printed, both keys created, `private.pem` mode is `600`, `JWT_KEY_ID` is a UTC timestamp in the required format
- `docker compose up --build` then starts `user-service` cleanly, the super admin can log in with the printed password, and `GET /auth/.well-known/jwks.json` shows the new `kid`
- Run `npm run setup` again → nothing changes: same password (not printed), same keys, same `JWT_KEY_ID`
- Delete only `public.pem` → both keys regenerated, `JWT_KEY_ID` updated
- `npm run setup -- --force` → new keys, new `JWT_KEY_ID`, `SUPER_ADMIN_PASSWORD` unchanged; the old access token is rejected after restart
- Existing `.env` with a blank `SUPER_ADMIN_PASSWORD` → only that line changes; every other line and comment is identical
- Existing `.env` missing the `JWT_KEY_ID` line entirely → line appended when keys are generated
- `npm run setup -- --foo` → usage, exit `1`
- Runs on a fresh clone where `.env` is absent without hitting the `config.ts` validation exit

### Tests (Vitest)

Write the tests in this stage, following the Stage 7 ground rules and layout. Every bullet under Verification above that does not need Docker is a required test case. To make the script testable, structure it so the logic takes the target directory as a parameter and the CLI entry point passes `user-service/`; tests run against a temp directory. Also cover the password generator directly: over 10,000 runs every password is 24 characters, matches `PASSWORD_REGEX`, and uses only allowed characters. Do not modify other application code to make a test pass.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry for this stage.

## Stage 18: Account Lockout and OTP Send Escalation (NFR1.1)

**Scope:** `user-service` (backend) and `frontend` (the Stage 16 pages that show these errors). NFR1.1.1 (unlock email) is **deferred** and not part of this stage.

Every decision in the table below was made by the team.

### Design decisions (already made, do not change)

#### Login lockout

| Topic                    | Decision                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What counts as a failure | Every password attempt goes to the **same** counter: a wrong password on `POST /auth/login`, and a wrong current password (`INVALID_PASSWORD`) on `PUT /users/me/email` and `PUT /users/me/password`.                                                                                                                           |
| What does not count      | An identifier that matches no account (there is nothing to lock). Any attempt on a `pending` or `suspended` account, whether the password is right or wrong.                                                                                                                                                                    |
| Threshold                | 5 failures within 15 minutes, measured from the **first** failure in the window.                                                                                                                                                                                                                                                |
| Lock length              | Escalates each time the threshold is hit: **1 h**, then **4 h**, then **24 h** (capped at 24 h).                                                                                                                                                                                                                                |
| Check order              | The lock check runs **before** the password check. A locked account gets the lock error whatever password is sent.                                                                                                                                                                                                              |
| Requests during a lock   | Rejected with the lock error. They are not counted and do not extend the lock.                                                                                                                                                                                                                                                  |
| What a lock blocks       | Login, and the current-password check on `PUT /users/me/email` and `PUT /users/me/password` (both rejected with `ACCOUNT_LOCKED`). Existing refresh tokens are **not** revoked.                                                                                                                                                 |
| What resets everything   | A successful login, a correct current password on `PUT /users/me/email` or `PUT /users/me/password`, or an admin unlock. Each clears the failure count, the window and the escalation level.                                                                                                                                    |
| Escalation reset         | The login lock has its own quiet window, separate from the OTP side. The level drops back to the start if 24 h pass after the last time the threshold was hit without it being hit again.                                                                                                                                       |
| Response                 | `429`, code `ACCOUNT_LOCKED`, message following the existing style, e.g. "Too many failed login attempts. Please try again in about an hour." / "…about 4 hours." / "…about a day.", with a `Retry-After` header carrying the exact seconds remaining.                                                                          |
| Who can be locked        | Any account, including super admin.                                                                                                                                                                                                                                                                                             |
| Suspend interaction      | A locked account can be suspended. Unsuspending does **not** clear a lock.                                                                                                                                                                                                                                                      |
| Storage                  | Columns on `users`: `login_failed_attempts`, `login_failure_window_start`, `login_locked_until`, `login_lock_level`. No separate "last locked at" column: the time the threshold was last hit is derived as `login_locked_until` minus the lock length for the current `login_lock_level`, and used for the quiet-window reset. |

#### OTP send escalation (forgot password, change email, change password)

| Topic                  | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-OTP guess limit    | Unchanged: 5 wrong guesses per OTP, then `OTP_ATTEMPTS_EXCEEDED`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Send cap               | Unchanged: 5 resends, counted per user **per purpose** over the existing rolling 60-minute window. The 60 s cooldown is unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Block length           | Escalates each time the cap is hit: **1 h**, then **4 h**, then **24 h** (capped at 24 h). The counting window does **not** grow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| What a block covers    | Sending only. Verifying an OTP that was already sent still works.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Escalation reset       | Two events reset the level: (a) a successful consuming verify for that purpose (`reset-password` for forgot password, `verify-otp` with `change_email`, `confirm-password-change`); `verify-otp` with `forgot_password` does **not** reset it. (b) 24 h passing after the last time the cap was hit without it being hit again.                                                                                                                                                                                                                                                                                                     |
| Response               | Unchanged code `OTP_RESEND_LIMIT`, existing message format, with the duration wording matching the level ("about an hour" / "about 4 hours" / "about a day"). Adds a `Retry-After` header with the exact seconds remaining.                                                                                                                                                                                                                                                                                                                                                                                                         |
| Per-target-address cap | None.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Storage                | New columns on `users_otps`: `send_escalation_level` and `send_blocked_until`. When the cap is hit, the new level and block-end time are written onto the **latest existing row** for that user and purpose (no new row is created). The current level and block are read from that latest row. When a later send creates a new row, `send_escalation_level` and `send_blocked_until` are **copied forward** from the previous latest row. No separate "last capped at" column: the time the cap was last hit is derived as `send_blocked_until` minus the block length for the current level, and used for the quiet-window reset. |
| Registration           | **Unchanged** in this stage. It keeps its existing all-rows cap. Marked TODO.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

#### Admin

| Topic               | Decision                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Unlock endpoint     | New endpoint `POST /users/:id/unlock`, behind `authenticate` + `authorize('admin')`.                                                     |
| Permission rules    | Same as `PUT /users/:id/status`: `SUPER_ADMIN_IMMUTABLE` on a super-admin target, and `FORBIDDEN` when an admin targets another admin.   |
| Effect              | Clears the login lock **and** resets the login escalation, and clears OTP send blocks and their escalation for all three purposes.       |
| `GET /users` fields | Each user object gains `isLocked`, `lockedUntil`, `lockLevel` (camelCase, per Stage 15c).                                                |
| `GET /users` filter | New query parameter `locked=true\|false`. It is a closed enum and uses the same one-fixed-error-message pattern as the existing filters. |

#### Config

New env vars, added to `config.ts`'s Zod schema and to `.env.example`, `.env` and `.env.test`:

- `LOGIN_MAX_FAILURES=5`
- `LOGIN_FAILURE_WINDOW_MINUTES=15`
- `LOCK_ESCALATION_HOURS=1,4,24`, shared by the login lock and the OTP send blocks
- `LOCK_ESCALATION_RESET_HOURS=24`

#### Cross-cutting

| Topic       | Decision                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrency | Counting must be exact under concurrent requests. For example, N concurrent 5th failures produce exactly one lock. Follow the existing user-row locking pattern and the Stage 4d lock-order rule. |
| Frontend    | Matches existing patterns: `errorMessages.js` mapping, `FormBanner` / `FieldError` / toast display, and `getRowActions` for the admin row menu.                                                   |
| Tests       | Stage 7's "do not test NFR1" exclusion is **lifted** for NFR1.1. Simulate time by backdating rows, as in earlier stages.                                                                          |

### Changes to already-implemented code

| #   | File                                                                                                                                                         | Change                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/db/init.sql`                                                                                                                                            | Add the four `users` columns and the two `users_otps` columns. Existing dev volumes need `docker compose down -v`.                                                                |
| 2   | `src/config.ts`, `.env*`                                                                                                                                     | Add the new env vars.                                                                                                                                                             |
| 3   | `src/services/auth.service.ts` (`login`)                                                                                                                     | Add the lock check before the credential check. Count failures, lock on threshold, and reset on success. Skip `pending` and `suspended` accounts.                                 |
| 4   | `src/services/me.service.ts` (`initiateEmailChange`, `initiatePasswordChange`)                                                                               | Reject with `ACCOUNT_LOCKED` before the password check when locked. Count `INVALID_PASSWORD` on the login counter; a correct password resets it.                                  |
| 5   | `src/services/otp.service.ts` (`requestOtp`)                                                                                                                 | Apply the escalating block for the three purposes, writing level and block-end onto the latest row on a cap hit and copying them onto each new row. Leave registration unchanged. |
| 6   | `src/services/auth.service.ts` (`forgotPassword`, `resetPassword`) and `me.service.ts` (`throwOnUnsentOtp`, `verifyEmailChangeOtp`, `confirmPasswordChange`) | Level-matched message and `Retry-After` on `OTP_RESEND_LIMIT`. Reset the level on a successful consuming verify.                                                                  |
| 7   | `src/services/userResponse.ts` (`toUserResponse`)                                                                                                            | Add `isLocked`, `lockedUntil`, `lockLevel`.                                                                                                                                       |
| 8   | `src/db/queries/users.queries.ts` (`listUsersPage`), `users.controller.ts` (`list`)                                                                          | Add the `locked` filter.                                                                                                                                                          |
| 9   | `users.routes.ts`, `users.controller.ts`, `users.service.ts`                                                                                                 | Add `POST /users/:id/unlock`.                                                                                                                                                     |

### Sub-stages

- **18a: Schema and config.** Rows 1–2.
- **18b: Login lockout.** Rows 3–4.
- **18c: OTP send escalation.** Rows 5–6.
- **18d: Admin unlock, `GET /users` fields and filter.** Rows 7–9.
- **18e: Frontend.**
  - `errorMessages.js`: add `ACCOUNT_LOCKED` (banner).
  - `Login.jsx`: show it as a banner.
  - `AdminUsers.jsx`: add the three lock fields as columns, a `locked` filter, and an Unlock row action that follows the same visibility rules as Suspend in `getRowActions`.
  - `api/users.js`: add `unlockUser`.
- **18f: Tests**, as below.

### Verification

- 4 wrong logins, then the correct password: login succeeds and the counter resets.
- 5 wrong logins within 15 min: `429 ACCOUNT_LOCKED` with `Retry-After`. The correct password is still rejected during the lock.
- 5 wrong logins spread over more than 15 min from the first failure: no lock.
- Login attempts during a lock do not extend it.
- Second lock lasts 4 h, third and later 24 h. With the threshold not hit for 24 h after the last lock, the next lock is 1 h again.
- Wrong passwords on a `pending` or `suspended` account do not count. An unknown identifier does not count.
- `INVALID_PASSWORD` on `/users/me/email` and `/users/me/password` counts toward the same counter. A correct current password there resets it. While locked, both endpoints return `429 ACCOUNT_LOCKED`.
- A lock does not revoke refresh tokens. `POST /auth/refresh` still works while locked.
- A super admin can be locked. Suspending a locked account works. Unsuspending leaves the lock in place.
- OTP: hitting the send cap blocks sends for 1 h, then 4 h, then 24 h. Verifying an already-sent OTP still works during a block.
- OTP: `reset-password`, `verify-otp` (`change_email`) and `confirm-password-change` each reset that purpose's level. `verify-otp` (`forgot_password`) does not. 24 h after the last cap hit with no new cap hit, the level resets.
- OTP: after a block ends and a send succeeds, the new row carries the previous level, so the next cap hit escalates rather than restarting at 1 h.
- OTP: caps and levels are per purpose. Registration behaviour is unchanged.
- `POST /users/:id/unlock`: clears the login lock and the OTP blocks and resets escalation. It follows the suspend permission rules (`SUPER_ADMIN_IMMUTABLE` and `FORBIDDEN` cases).
- `GET /users` shows `isLocked`, `lockedUntil` and `lockLevel`, and `locked=true|false` filters. An invalid value returns `400` with the fixed message.
- Concurrency: N concurrent wrong logins at the threshold produce exactly one lock and the correct level. Concurrent sends at the cap produce exactly one escalation.
- Frontend: the login banner shows the lock message. The admin page shows the lock columns, the filter and the Unlock action, and the row updates in place with a toast.

### Tests (Vitest)

Follow the Stage 7 ground rules: real Postgres, the existing mocking policy, and tests under `tests/` mirroring `src/` with concurrency tests in `tests/concurrency/`. Cover every Verification bullet above that does not need Docker. Simulate elapsed time by backdating the relevant timestamp columns.

### Backlog edit (for the team to make in `docs/FoC-ProductBacklog.md`)

- **NFR1.1:** the current wording ("lock … after 5 consecutive failed login or OTP attempts within a 15-minute window") no longer matches this stage. Login failures lock with escalation; OTP protection is the existing per-OTP guess limit plus an escalating send block.
- **NFR1.1.1:** mark as deferred.

# Stage 19: OTP Email Retry and Delivery Logging (NFR2.1.1, NFR2.1.2)

> **Scope**: `user-service` only. Failed OTP email sends are retried inline, within a time limit,
> and every send attempt is logged to the console. The outcome after the final failure is
> unchanged: `503 EMAIL_SEND_FAILED`, and the new OTP is rolled back.
>
> Backlog refs: NFR2.1, NFR2.1.1, NFR2.1.2.
>
> The read-and-report step for this stage is done; the decisions below incorporate your report.
> If anything below still disagrees with the code, stop and ask me.

### Design decisions (already made, do not change)

| Rule                                    | Value                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attempts                                | Up to 4 sends in total: the first attempt plus 3 retries                                                                                                                                                                                                                                                                                           |
| OTP across retries                      | The same OTP and the same email content on every attempt. No new OTP is generated per attempt.                                                                                                                                                                                                                                                     |
| Transient errors (retried)              | `ETIMEDOUT`, `ESOCKET`, `ECONNECTION`, `EDNS` — always. `EENVELOPE`, `EMESSAGE`, `EAUTH` — only when `responseCode` is between 400 and 499 inclusive. The per-attempt timeout (below) also counts as transient.                                                                                                                                    |
| Non-transient errors (fail immediately) | `EENVELOPE`, `EMESSAGE`, `EAUTH` with any other `responseCode` or none (this includes 5xx replies and the "Missing credentials" `EAUTH`), `EPROTOCOL`, and any error without a recognised `code`. No further attempts, no wait.                                                                                                                    |
| Where retries run                       | Inline, inside the request, within the existing transaction                                                                                                                                                                                                                                                                                        |
| Retry loop location                     | Inside `sendOtpEmail` in `src/services/email.service.ts`. Its contract is unchanged: it resolves on success and throws after the final failure.                                                                                                                                                                                                    |
| Backoff                                 | The same shape as Stage 14: after the n-th failed attempt, wait `random() × min(300, 1 × 2^(n−1))` seconds (full jitter), so the caps are 1, 2 and 4 s. Computed in code (nothing is stored); `Math.random()` is acceptable here.                                                                                                                  |
| Nodemailer phase timeouts               | `connectionTimeout`, `greetingTimeout`, `socketTimeout` and `dnsTimeout` all set to 5000 ms on the transport, at `createTransport()` time                                                                                                                                                                                                          |
| Per-attempt cap                         | 5 s total per attempt, enforced by racing each `sendMail()` against a 5 s timer. If the timer wins, the attempt counts as a failed, transient attempt.                                                                                                                                                                                             |
| Abandoned sends                         | Nodemailer cannot cancel an in-flight send. An attempt cut off by the timer is left to finish on its own. Its later result must be caught (no unhandled rejection) and is not logged. Accepted consequences: the user may get duplicate emails with the same code, and if all attempts fail, a late email may deliver a code that was rolled back. |
| Overall deadline                        | 30 s from the start of the first attempt. No wait may start if it would end after the deadline; in that case, stop and fail. An attempt in flight at the deadline is handled like any other cut-off attempt.                                                                                                                                       |
| Configuration                           | Constants in code at the top of `email.service.ts`, like Stage 14. No new env vars.                                                                                                                                                                                                                                                                |
| After the final failure                 | Unchanged: `AppError(503, 'Unable to send verification email. Please try again.', 'EMAIL_SEND_FAILED')` from `issueOtp`, and the transaction rolls back                                                                                                                                                                                            |
| Purposes covered                        | Every send through `issueOtp`: Registration, Forgot Password, Change Email, Change Password                                                                                                                                                                                                                                                        |
| Dev console fallback                    | Unchanged. When `NODE_ENV=development` and `SMTP_HOST` is empty, there are no retries and no new log lines; the existing `[DEV EMAIL]` line stays as it is.                                                                                                                                                                                        |
| Logging destination                     | Console only. No DB table.                                                                                                                                                                                                                                                                                                                         |
| What is logged                          | One line per attempt, both successes and failures                                                                                                                                                                                                                                                                                                  |
| Log fields                              | Outcome, username, masked email, purpose, attempt number, and error code (failures only)                                                                                                                                                                                                                                                           |
| Email masking                           | First character of the local part, then `***`, then `@` and the full domain, e.g. `g***@u.nus.edu`                                                                                                                                                                                                                                                 |
| Never logged                            | The OTP, the full email address, the email body, and SMTP response text                                                                                                                                                                                                                                                                            |

### Log line format

```
[OTP EMAIL] outcome=sent user=<username> to=<masked email> purpose=<purpose> attempt=<n>/4
[OTP EMAIL] outcome=failed user=<username> to=<masked email> purpose=<purpose> attempt=<n>/4 error=<code>
```

- Successes use `console.log`, failures `console.error`.
- `error` is the Nodemailer `code`, followed by the `responseCode` when present (e.g. `EENVELOPE 452`). An attempt cut off by the 5 s timer logs `error=ATTEMPT_TIMEOUT`.
- For Change Email, `to` is the masked new email (the address the OTP was sent to).

### Changes to already-implemented code

| #   | File                            | Change                                                                                                                                                          |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/services/email.service.ts` | Phase timeouts on the transport; `sendOtpEmail` gains `username` and implements the retry loop, per-attempt cap, deadline, backoff and logging                  |
| 2   | `src/services/otp.service.ts`   | `issueOtp` gains `username` and passes it to `sendOtpEmail`. `requestOtp` gains `username` and passes it to its internal `issueOtp` call (line 159).            |
| 3   | `src/services/auth.service.ts`  | Pass `username` at `register()` (line 212, normalised input), `resendRegistrationOtp()` (line 444, looked-up row) and `forgotPassword()` (line 466, locked row) |
| 4   | `src/services/me.service.ts`    | Pass `locked.username` at `initiateEmailChange()` (269), `resendChangeEmailOtp()` (328), `resendChangePasswordOtp()` (356), `initiatePasswordChange()` (437)    |
| 5   | Existing tests                  | Update mocks or fixtures affected by the signature changes. Do not change what they assert.                                                                     |

Line numbers are from your report; re-check them before editing.

### Watch for

- The final failure must still throw so `withTransaction` rolls back, exactly as today.
- A non-transient failure must not be retried and must not wait.
- The 5 s timer must be cleared when the send settles first, so no stray timers keep running.
- An abandoned send's later rejection must be caught.
- `requestOtp`'s cooldown is measured from the OTP row's `created_at`, which is set before the send. Do not change this.

### Verification

- SMTP succeeds on the first attempt → `200`, one `outcome=sent ... attempt=1/4` line
- Transient failure on attempts 1–2, success on attempt 3 → `200`, two `failed` lines then one `sent` line, one OTP row, and the same OTP in every attempt
- Transient failure on all 4 attempts → `503 EMAIL_SEND_FAILED`, four `failed` lines, no new OTP row (rolled back), and the previous OTP still valid
- Each of `ETIMEDOUT`, `ESOCKET`, `ECONNECTION`, `EDNS` is retried
- `EENVELOPE`, `EMESSAGE` and `EAUTH` with `responseCode` 400 and 499 are retried; with 399, 500 and 550 they fail immediately
- `EAUTH` with no `responseCode` ("Missing credentials"), `EPROTOCOL`, and an error with no `code` each fail immediately: `503`, one `failed` line, no waits
- Waits between attempts fall within 0–1 s, 0–2 s and 0–4 s
- An attempt that has not settled after 5 s is cut off, logged as `error=ATTEMPT_TIMEOUT`, and retried; its later rejection does not cause an unhandled rejection and is not logged
- The whole send never exceeds 30 s; a wait that would end after the deadline is not started, and the result is `503 EMAIL_SEND_FAILED`
- Each purpose (registration, forgot password, change email, change password) retries and logs, with the correct username
- Change Email logs the masked new email, not the current one
- No log line contains the OTP, a full email address, or SMTP response text
- Dev fallback (development, empty `SMTP_HOST`) behaves exactly as before: no retries, no `[OTP EMAIL]` lines

### Tests (Vitest)

Write the tests in this stage, following the Stage 7 ground rules and layout. Stage 7's "do not test NFR2" exclusion is **lifted** for NFR2.1.1 and NFR2.1.2. Every bullet under Verification above is a required test case.

- Mock the Nodemailer transport (permitted by the Stage 7 mocking policy) to produce success, each error type above with chosen `responseCode`s, and sends that never settle.
- Use Vitest fake timers for the backoff waits, the 5 s cap and the 30 s deadline, so the suite does not actually sleep.
- Spy on `console.log` / `console.error` to assert the log lines.
- Use the real test Postgres for the rollback and previous-OTP-still-valid checks.
- Do not modify application code to make a test pass.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry for this stage.

### Backlog note (for the team)

- NFR2.1.2 says "for monitoring". This stage logs to the console only; there is no dashboard or alerting.

# Stage 20: Email Masking in Admin Views (NFR3.1.1)

> **Scope**: `user-service` and `frontend`. Emails are masked by the backend in every admin
> response. An admin unmasks one row's email at a time with an eye icon on `/admin/users`. Every
> unmask attempt, granted or denied, is logged to the console.
>
> Backlog refs: NFR3.1.1. Replaces NFR3.1.2 and NFR3.1.3 (no OTP before unmasking, no
> 15-minute window). The same log is used for NFR3.2.2.
>
> **Before starting:** read the current code, not just this file. If any `[DECIDE]` placeholder
> remains, or anything below disagrees with the code, stop and ask me.

### Design decisions (already made, do not change)

| Rule                          | Value                                                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Masked field                  | `email` only                                                                                                                                                                                               |
| Where masking happens         | In the backend. The response's `email` key holds the masked value; there is no separate field and no flag saying whether it is masked.                                                                     |
| Mask format                   | Same as Stage 19: first character of the local part, then `***`, then `@` and the full domain, e.g. `g***@u.nus.edu`. A one-character local part follows the same rule: `a@x.com` → `a***@x.com`.          |
| Responses that are masked     | Every admin response containing a user object: `GET /users`, `GET /users/:id`, `PUT /users/:id/status`, `PUT /users/:id/role`, `POST /users/:id/unlock`, including no-op return paths                      |
| The caller's own row          | Not masked                                                                                                                                                                                                 |
| Self views                    | Not masked: `GET /users/me`, `PUT /users/me/*` responses, and the `user` object from `POST /auth/login`                                                                                                    |
| Email search on `GET /users`  | Unchanged (exact match on the real email). Results show the masked email.                                                                                                                                  |
| Sort by email                 | Unchanged (sorts on the real email)                                                                                                                                                                        |
| Unmask endpoint               | `GET /users/:id/full-email`, behind `authenticate` + `authorize('admin')`. Returns `200` with `{ email }` (the full email only).                                                                           |
| Who can unmask                | Admin and super admin                                                                                                                                                                                      |
| Super admin target            | No one can unmask a super admin's email → `403`, code `FORBIDDEN`, message `'Cannot unmask a super administrator\'s email'`                                                                                |
| Pending and suspended targets | Can be unmasked                                                                                                                                                                                            |
| `:id` validation              | Same as Stage 9: Zod `.uuid()` at the controller → `400 VALIDATION_ERROR`, `"Invalid user ID"`. Well-formed but unknown → `404 USER_NOT_FOUND`.                                                            |
| Unmask granularity            | One row's email per click                                                                                                                                                                                  |
| Re-masking                    | Frontend only, no server call, no log line. Happens when the eye is clicked again, or 60 seconds after unmasking, whichever comes first.                                                                   |
| Rate limit                    | None                                                                                                                                                                                                       |
| Log destination               | Console only (append-only by nature). No DB table. Only developers with console access can read it.                                                                                                        |
| What is logged                | Every unmask attempt that reaches the unmask controller, granted or denied                                                                                                                                 |
| Log fields                    | Actor (ID and username), target (ID and username), timestamp, user agent, outcome, and the rejection reason for denied attempts. No IP address.                                                            |
| Log failure                   | If writing the log line fails, the unmask fails. The granted line is written before the response is sent; if writing it throws, the request fails with `500 INTERNAL_ERROR` and the email is not returned. |
| NFR3.2.2                      | Shares this log                                                                                                                                                                                            |

### Log line format

```
[UNMASK EMAIL] actorId=<id> actorUsername=<username> targetId=<id> targetUsername=<username> timestamp=<ISO 8601 UTC> userAgent=<quoted> outcome=granted
[UNMASK EMAIL] actorId=<id> actorUsername=<username> targetId=<id> targetUsername=<username> timestamp=<ISO 8601 UTC> userAgent=<quoted> outcome=denied reason=<code>
```

- Granted lines use `console.log`, denied lines `console.error`.
- `reason` is the error code returned to the caller (e.g. `FORBIDDEN`, `USER_NOT_FOUND`, `VALIDATION_ERROR`).
- `userAgent` is the `User-Agent` request header written with `JSON.stringify`, since it contains spaces. A missing header is written as `-`.
- When the target does not exist or `:id` is not a valid UUID, `targetUsername` is `-`, and `targetId` is the raw `:id` value, also written with `JSON.stringify`.
- The actor's username is not in the access token (only `sub` and `role`), so it is read from the `users` table by `req.user.user_id`.
- `timestamp` comes from the database clock (`clock_timestamp()`, per convention 5), never `Date.now()`. Read it with a query for each log line (it can be selected alongside the actor or target lookup).
- Never logged: the email (masked or full).
- Requests rejected before the unmask controller runs (`authenticate` → `401`, `authorize('admin')` → `403`) are **not** logged.
- A caller targeting their own ID gets no special handling: the normal rules apply (an admin gets their email, logged as `granted`; a super admin is a super admin target, so `403 FORBIDDEN`).

---

## Changes to already-implemented code

| #   | File                                                                             | Change                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Stage 19 masking helper (wherever it lives now)                                  | Reuse it. If it lives in `email.service.ts`, move it to `src/utils/maskEmail.ts` and import it from both places. Its output must be unchanged for Stage 19's log lines. |
| 2   | `src/services/userResponse.ts` (`toUserResponse`)                                | Take the requester's ID. Mask `email` unless the row's `id` equals the requester's ID. Every admin caller passes `req.user.user_id` through to the service.             |
| 3   | `src/services/me.service.ts` (`changeActiveView`) and any other self-view caller | Must return the email unmasked (the row is always the caller's own, so passing the caller's ID is enough)                                                               |
| 4   | `src/services/users.service.ts`, `src/controllers/users.controller.ts`           | `listUsers`, `getUserById`, `changeUserStatus`, `changeUserRole`, unlock: pass the requester's ID to the mapper                                                         |
| 5   | `src/services/users.service.ts`, `users.controller.ts`, `users.routes.ts`        | Add `getFullEmail(actorId, targetId, userAgent)` and the `GET /users/:id/full-email` route                                                                              |
| 6   | Existing tests                                                                   | Update assertions that expect real emails in admin responses. Do not change what they assert otherwise. If a test fails for another reason, stop and report it.         |
| 7   | `frontend/src/api/users.js`                                                      | Add `getFullEmail(id)`                                                                                                                                                  |
| 8   | `frontend/src/pages/AdminUsers.jsx`                                              | Eye icon in the email cell (see Stage 20b)                                                                                                                              |
| 9   | `frontend/src/api/errorMessages.js`                                              | Check `FORBIDDEN`, `USER_NOT_FOUND` and `VALIDATION_ERROR` have toast text suitable for an unmask failure                                                               |

Route order: register `GET /:id/full-email` so it is reached (it must not be shadowed by `GET /:id`).

---

## Stage 20a: Backend

### `getFullEmail(actorId, targetId, userAgent)` in `src/services/users.service.ts`

1. Look up the actor by `actorId` for their username.
2. `findById(targetId)`. If none → log `denied reason=USER_NOT_FOUND`, then `AppError(404, 'User not found', 'USER_NOT_FOUND')`.
3. If the target's `role === 'super admin'` → log `denied reason=FORBIDDEN`, then `AppError(403, 'Cannot unmask a super administrator\'s email', 'FORBIDDEN')`.
4. Write the `granted` line, then return `{ email: target.email }`. If writing the line throws, let it propagate (global handler → `500`).

No transaction or lock: this is a single read with no state change.

### Controller `fullEmail` in `src/controllers/users.controller.ts`

- `asyncHandler`-wrapped
- Validate `req.params.id` with the Stage 9 `.uuid()` schema. On failure, log `denied reason=VALIDATION_ERROR`, then return the usual `400`. (The log needs the actor's username, so look it up first.)
- Calls `usersService.getFullEmail(req.user.user_id, req.params.id, req.get('user-agent'))`, returns `200` with `{ email }`

### Route in `src/routes/users.routes.ts`

```ts
router.get(
  "/:id/full-email",
  authenticate,
  authorize("admin"),
  usersController.fullEmail,
);
```

### Verification

- `GET /users` as an admin → every `email` masked except the caller's own row; the super admin's row masked
- `GET /users/:id`, `PUT /users/:id/status`, `PUT /users/:id/role`, `POST /users/:id/unlock` (including no-op paths) → `email` masked unless the target is the caller
- `GET /users/me`, `PUT /users/me/active-view`, and the `POST /auth/login` `user` object → email unmasked
- Mask format: `gabriel@u.nus.edu` → `g***@u.nus.edu`; `a@x.com` → `a***@x.com`
- `GET /users?email=<real email>` still finds the user; the result's email is masked
- Sort by email still orders by the real email
- `GET /users/:id/full-email` as admin on a user, a pending user, a suspended user and another admin → `200 { email }` with the real email, and one `outcome=granted` line each
- Same as super admin on a user and an admin → `200`
- Any caller targeting the super admin → `403 FORBIDDEN`, one `outcome=denied reason=FORBIDDEN` line
- Unknown UUID → `404 USER_NOT_FOUND`, one denied line with `targetUsername=-`
- Non-UUID `:id` → `400 VALIDATION_ERROR`, `"Invalid user ID"`, one denied line
- Regular user → `403 FORBIDDEN`; no token → `401 UNAUTHORIZED`; neither writes a log line
- Admin targeting their own ID → `200 { email }`, one `granted` line; super admin targeting their own ID → `403 FORBIDDEN`, one denied line
- The logged `timestamp` matches the database clock (e.g. compare against `clock_timestamp()` read in the test), not the service clock
- Log lines contain actor ID and username, target ID and username, timestamp, quoted user agent, outcome; no email of any kind; no IP
- Missing `User-Agent` header → `userAgent=-`
- Logging forced to throw → `500 INTERNAL_ERROR`, email not returned

---

## Stage 20b: Frontend

### `src/api/users.js`

Add `getFullEmail(id)` → `GET /users/:id/full-email`, returns `{ email }`.

### `src/pages/AdminUsers.jsx`

- Email cell shows the masked value from the list response, with an eye icon (lucide-react) beside it
- No eye icon on the caller's own row (compare `id` with `AuthContext.user.id`) or on any row with `role === 'super admin'`
- Click → `getFullEmail(id)` → show the full email in that cell and switch the icon to "hide"
- Click again → re-mask (show the masked value from the list response), no request
- 60 seconds after unmasking → re-mask automatically. Clear the timer on re-mask and on unmount.
- Each row unmasks independently; unmasking one row does not affect others
- Failure → toast via the `errorMessages.js` map, row stays masked
- Any refetch of the table (after a row action, a search, filter or sort change, or a page change) re-masks every row and clears their timers
- Works with the row-hover three-dot menu and on touch / small screens (the icon is always visible, not hover-only)

### Verification

- Eye icon present on other users' rows, absent on own row and super admin rows
- Click → full email shown; click again → masked; wait 60 s → masked
- Two rows unmasked at once each re-mask on their own timers
- Stop user-service, click the eye → toast, still masked
- Network tab: re-masking makes no request
- Unmask a row, then change a filter (or suspend another user) → every row is masked after the refetch
- Phone-width viewport: the icon is visible and tappable

---

### Tests (Vitest)

Write the tests in this stage, following the Stage 7 ground rules and layout (real Postgres, query/service/controller tests mirroring `src/`). Every Verification bullet in 20a and 20b is a required test case. Spy on `console.log` / `console.error` for the log lines.

Frontend tests cover the 20b bullets that don't need a real browser (icon visibility, unmask/re-mask on click, the 60 s timer with Vitest fake timers, failure toast, re-mask on refetch), with `getFullEmail` mocked. If `frontend/` has no test setup yet, stop and tell me what you would add before adding it.

Do not modify application code to make a test pass.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry for this stage.

### Backlog edit (for the team to make in `docs/FoC-ProductBacklog.md`)

- **NFR3.1.1:** unchanged in intent; masking is enforced in the backend.
- **NFR3.1.2:** replace the OTP requirement with: unmasking is per row, via an eye icon, and every attempt is logged.
- **NFR3.1.3:** replace the 15-minute window with: an unmasked email re-masks when clicked again or after 60 seconds.
- **NFR3.2.2:** notes that unmask attempts are logged to the same (console) log.

---

# Stage 21: Row-Actions Menu Fix & Password Visibility Toggle (frontend)

## Stage 21a: Fix clipped row-actions menu (frontend)

### Problem

On `/admin/users`, the row-hover three-dot menu is rendered inside the table wrapper, which has `overflow-x: auto`. A non-`visible` overflow on one axis forces the other axis to `auto`, so the open menu is clipped and adds a vertical scrollbar to the table.

### `src/components/ActionMenu.jsx` (new)

- Trigger: `<button type="button">` with `aria-haspopup="menu"`, `aria-expanded`, and `aria-label` from a prop (e.g. `"Actions for testalice"`). Trigger content (e.g. lucide-react `MoreVertical`) passed as a prop.
- Menu rendered with `createPortal` into `document.body`, `position: fixed`, `role="menu"`; each item a `<button role="menuitem">`.
- Positioning: in `useLayoutEffect` after the menu renders, measure trigger and menu with `getBoundingClientRect()`.
  - Place below the trigger, right-aligned to it, 4px gap.
  - If it doesn't fit below the viewport bottom, flip above the trigger.
  - Clamp `left` to ≥ 8px.
  - Keep it `visibility: hidden` until positioned (no flash).
- Close on:
  - outside `mousedown`
  - Escape (return focus to the trigger)
  - item selection
  - `resize`
  - `scroll` (capture phase, so scrolling the table itself also closes it)

  Remove all listeners on close and unmount.

- `z-index` above the header and the chat button.
- Items: `{ label, onSelect, danger? }`; `danger` uses the existing destructive text colour.

### `src/pages/AdminUsers.jsx`

- Replace the existing absolutely positioned dropdown markup with `ActionMenu`. Delete the old menu code and its CSS; no dead code.
- Keep the existing item set and handlers (Suspend / Unsuspend, etc.) unchanged.
- Do not change the table wrapper's `overflow-x: auto`.
- The trigger must remain usable on touch / small screens. If it is currently hover-only, make it always visible below the existing mobile breakpoint.

### Other usages

Search `src/` for other dropdowns or popovers rendered inside an overflow container (e.g. Manage suppliers). List them and ask me before migrating any.

### Verification

- Open the menu on the last row → it flips upward, the table gains no scrollbar, and the menu is fully visible
- Open the menu on the first row → opens below
- Escape closes the menu and focus returns to the trigger; outside click closes it; scrolling the page or the table closes it
- Selecting an item closes the menu and calls the handler once
- Only one menu is open at a time
- At phone width with the table scrolled horizontally → the menu is unclipped and aligned to its trigger
- Keyboard: Tab reaches the trigger, Enter/Space opens the menu, and the items are focusable

---

## Stage 21b: Show/hide password toggle (frontend)

### `src/components/PasswordInput.jsx` (new)

- `forwardRef` component; passes through all `<input>` props except `type`.
- Internal `visible` state, default `false`; input `type` switches between `"password"` and `"text"`.
- Toggle: `<button type="button">` (must never submit the form), absolutely positioned inside the field on the right.
  - lucide-react `Eye` / `EyeOff` icons
  - `aria-label` "Show password" / "Hide password"
  - `aria-pressed={visible}`
  - visible `:focus-visible` outline
- Right padding on the input so text never runs under the icon.
- `autoCapitalize="none"`, `autoCorrect="off"`, `spellCheck={false}`.
- Hide Edge's native reveal button (`input::-ms-reveal { display: none; }`) so there aren't two toggles.
- Each instance toggles independently.

### Replace every password field

- `grep -rn 'type="password"' src/` and replace each match with `PasswordInput`, keeping all existing props, validation and error display.
- Expected locations: Login, Register, Forgot/Reset password, Change password (current, new, confirm), and the password re-entry in Change email. Report any extra matches, or any of these that are missing.
- `autoComplete`:
  - `"current-password"` for Login and any "current password" field
  - `"new-password"` for Register, Reset, and any new/confirm field
- OTP fields are not password fields; leave them unchanged.

### Verification

- Every password field listed above has a toggle
- Clicking the toggle reveals and hides the value, does not submit the form, and does not clear the value
- Toggling one field does not affect any other
- The toggle is reachable by Tab and works with Enter/Space; its `aria-label` updates when toggled
- The icon doesn't overlap the text at phone width
- Existing validation errors still render correctly
- `grep` finds no remaining raw `type="password"` outside `PasswordInput.jsx`

---

### Tests (Vitest)

Every Verification bullet in 21a and 21b that doesn't need a real browser is a required test case:

- Menu: portal rendering, flip logic (mock `getBoundingClientRect` / `innerHeight`), and every close path
- Password input: type switching, no submit on toggle, independence between fields, and ARIA attributes

List the visual and phone-width checks in your summary for manual verification. If `frontend/` has no test setup yet, stop and tell me what you would add before adding it.

Do not modify application code to make a test pass.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry for this stage.

# Stage 22: Active View Controls Navigation (frontend)

> **Scope**: `frontend/` only. The requester/courier toggle (Stages 11 and 16f) decides which
> pages the user sees. In requester view the main page is the Suppliers page; in courier view it
> is the Find errands page. The Landing page is removed.
>
> No backend changes. This stage reuses the existing `active_view` column,
> `PUT /users/me/active-view`, and `activeView` on `POST /auth/login` and `GET /users/me`.
>
> Backlog refs: F5.2.2.
>
> The read-and-report step for this stage (22a) is done; the decisions below incorporate your
> report.
>
> **Before starting:** read the current code, not just this file. If any `[DECIDE]` placeholder
> remains, or anything below disagrees with the code, stop and ask me.
>
> **Ground rules:** the Stage 16 ground rules apply:
>
> - Work in `frontend/` only; never touch `foc-mockup/`.
> - Do not modify `src/realtime/orderSocket.js`, `src/data/users.js`,
>   `src/components/DemoControls.jsx` or `AI-NOTES.md`.
> - List every file outside user-service screens that you touched.
>
> This stage changes the Landing, Suppliers, My activity, Find errands, Chat and admin supplier
> pages, and puts Suppliers, supplier detail, Find errands and the admin supplier pages behind
> login. Confirm the owners of
> those pages have agreed before starting.

### Design decisions

#### Which pages each view shows (logged-in users)

| View           | Pages                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Requester only | Suppliers (`/suppliers`, main page), supplier detail (`/suppliers/:id`), request form (`/requests/new` and `/requests/:id/edit`), My errands (`/my-errands`) |
| Courier only   | Find errands (`/requests`, main page), My deliveries (`/my-deliveries`)                                                                                      |
| Both views     | Chat, Credits (`/wallet`), Account, and the admin pages (`/admin/suppliers*`, `/admin/users`)                                                                |

Any page found that is not in this table → stop and ask me which view it belongs to.

#### Behaviour

| Rule                        | Value                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend                     | No changes                                                                                                                                                                                                                                                                                                                  |
| Source of the current view  | `AuthContext.user.activeView` (unchanged from 16f)                                                                                                                                                                                                                                                                          |
| Page-to-view list           | One shared list in code. Every route, the nav bar and the blocked-page check all read from it.                                                                                                                                                                                                                              |
| Landing page                | Removed. Delete `Landing.jsx` and anything only it uses (components, styles, tests).                                                                                                                                                                                                                                        |
| `/` (home)                  | Redirects: logged in → the current view's main page (`/suppliers` or `/requests`); logged out → `/login`. The FoC logo, the post-login fallback and the Forbidden page's home link all keep pointing at `/`.                                                                                                                |
| My activity                 | Split into two pages: My errands at `/my-errands` (requester only) and My deliveries at `/my-deliveries` (courier only). The `/activity` route is removed. Links that went to `/activity` from the request form (after posting or editing) go to `/my-errands`.                                                             |
| Nav bar (logged in)         | Shows only the pages of the current view, plus the pages shown in both views. The other view's links are hidden. In requester view the nav shows "My errands"; in courier view it shows "My deliveries".                                                                                                                    |
| Nav bar (logged out)        | No page links. Only Log in and Register.                                                                                                                                                                                                                                                                                    |
| Logged-out visitors         | Can open only `/login`, `/register` and `/forgot-password`. Every other page, including Suppliers, supplier detail, Find errands and the admin supplier pages, is behind `RequireAuth`, which sends them to `/login` and remembers the page (existing Stage 16 behaviour). The blocked-page message is never shown to them. |
| Opening another view's page | Shown in place; the URL is unchanged. Message: "This is only available in `<view>` mode", where `<view>` is the view that page belongs to. Two buttons: one switches to that view (staying on the page, which then renders normally), and one goes to the current view's main page (Suppliers or Find errands).             |
| Toggling the view           | Optimistic, revert and toast on failure (unchanged from 16f). The user stays on the current page. If that page belongs only to the other view, the blocked-page message above is shown.                                                                                                                                     |
| New users                   | Start in requester view (the existing schema default, unchanged). The saved view persists across sessions as before (F5.2.2).                                                                                                                                                                                               |
| Landing after login         | Unchanged from Stage 16: the page the user was sent away from, else `/`. If that page belongs only to the other view, the blocked-page message above is shown.                                                                                                                                                              |
| Find errands empty state    | Remove the "Post an errand" button. Heading: "No errands available". Text: "Check back in a bit."                                                                                                                                                                                                                           |
| Chat back arrow (mobile)    | Goes back to the previous page instead of the fixed `/activity` link. When there is no previous in-app page (e.g. the chat was opened directly by URL or in a new tab), it goes to the current view's main page (Suppliers or Find errands).                                                                                |
| Notifications               | Not implemented yet; out of scope for this stage. See "Notes for later".                                                                                                                                                                                                                                                    |

### Watch for

- `/` must not redirect until session restore has finished (`AuthContext` status is no longer `loading`). Otherwise a logged-in courier is briefly sent to `/suppliers`.
- The blocked-page check runs only when the status is `authenticated`.

---

## Stage 22b: Implementation

Implement the design decisions above exactly as written. Do not choose behaviour for any case they do not cover. Ask instead.

### Verification

Logged in:

- Requester view: the nav shows Suppliers and My errands (plus the shared pages), not Find errands or My deliveries
- Courier view: the nav shows Find errands and My deliveries (plus the shared pages), not Suppliers or My errands
- `/` redirects to `/suppliers` in requester view and `/requests` in courier view, with no flash of the wrong page during session restore
- The FoC logo goes to the current view's main page
- Chat, Credits, Account and the admin pages open normally in both views
- Admin pages stay visible in both views (for admins)
- Opening a courier-only page in requester view (typed URL, back button) → blocked-page message, URL unchanged, saying "courier mode"; and the reverse for requester-only pages
- `/requests/:id/edit` in courier view → blocked-page message
- Blocked page, switch button → the view switches, the user stays on the page, and the page renders
- Blocked page, main-page button → goes to the current view's main page without changing the view
- Toggle on a page in both views → the user stays on that page
- Toggle on a page belonging only to the old view → the user stays on it and sees the blocked-page message
- Toggle failure (user-service stopped) → the view reverts, a toast is shown, and the nav matches the reverted view
- `/my-errands` and `/my-deliveries` each show their half of the old My activity page; `/activity` no longer exists
- Posting or editing an errand → lands on `/my-errands`
- Find errands' empty state has no "Post an errand" button and reads "No errands available" / "Check back in a bit."
- Chat back arrow → returns to the page the chat was opened from
- Chat opened directly by URL or in a new tab → back arrow goes to the current view's main page
- New user → starts in requester view and sees Suppliers
- Logged out on a courier-only page, logged in with a saved requester view → after login, back on that page with the blocked-page message saying "courier mode"
- Reload, or log in on another browser → same view and same set of pages as before

Logged out:

- `/` redirects to `/login`
- `/login`, `/register` and `/forgot-password` open normally
- Every other page (Suppliers, supplier detail, Find errands, request form, My errands, My deliveries, Chat, Credits, Account, admin pages) redirects to `/login`; after logging in, the user lands back on that page (or sees the blocked-page message if it belongs to the other view)
- The nav shows no page links, only Log in and Register
- No blocked-page message appears anywhere

General:

- `Landing.jsx` and anything only it used are gone; nothing imports them
- No files under `user-service/` changed

### Tests (Vitest)

Write the tests in this stage, following the Stage 7 ground rules and layout. Every Verification bullet above that does not need a real browser is a required test case. If `frontend/` has no test setup yet, stop and tell me what you would add before adding it. Do not modify application code to make a test pass.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry for this stage.

### Notes for later (do not implement now)

- **Notifications**: when they are implemented, decide what a notification linking to a page in the other view does (e.g. a "your errand was accepted" notification received while in courier view). Add its page to the page-to-view list.
- **My errands / My deliveries data fetching**: My activity loads both halves in one fetch. Whether each new page fetches only its own half is pending the order-service owners' reply. Until then, keep the existing fetch behaviour.

### Backlog edit (for the team to make in `docs/FoC-ProductBacklog.md`)

- **F5.2.2**: TODO (team): wording describing what the active view now controls. Not needed to implement this stage.

# Stage 23: Session Lifetime and Expiry Warning (NFR4)

> **Scope**: `user-service` and `frontend`.
>
> - 23a: sessions get a fixed absolute lifetime of 30 days from login, and both token TTL env vars get bounds
> - 23b: login and refresh responses tell the frontend how long the session has left
> - 23c: the frontend shows a banner 10 minutes before the 30-day expiry
>
> There is no idle timeout.
>
> Backlog refs: NFR4.1.2 (changed), NFR4.2.1 (reworded), NFR4.1.1 (dropped).
>
> This supersedes the 7-day refresh token lifetime in Stage 1 (stack) and Stage 4c (login).
>
> **Before starting:** read the current code, not just this file. If anything below disagrees
> with the code, stop and ask me. Implement one sub-stage at a time and wait for my
> confirmation before the next.

### Design decisions (already made, do not change)

**Session lifetime**

| Rule                                | Value                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Session lifetime                    | 30 days, fixed from login. Not a sliding window: no activity or `POST /auth/refresh` call extends it. Refresh tokens are still not rotated.                                          |
| `REFRESH_TOKEN_TTL_DAYS`            | `30` in `.env`, `.env.example` and `.env.test`. Bounds 1–30 inclusive.                                                                                                               |
| `ACCESS_TOKEN_TTL_MINUTES`          | Unchanged at `15`. Bounds 1–15 inclusive.                                                                                                                                            |
| Access-token tail                   | Accepted. An access token issued just before the refresh token expires stays valid for up to `ACCESS_TOKEN_TTL_MINUTES` after it, so the real maximum is about 30 days + 15 minutes. |
| Idle timeout (NFR4.1.1)             | Not implemented. Dropped from scope.                                                                                                                                                 |
| Out-of-bounds values                | The app exits at startup with a clear error naming the variable and the allowed range, through the existing env-validation error path                                                |
| Existing tests that hardcode 7 days | Report them and stop. Do not change them.                                                                                                                                            |

**Expiry warning**

| Rule                  | Value                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| What it warns about   | The 30-day absolute expiry only                                                                                                                        |
| Data from the server  | Seconds left until the refresh token's `expires_at`, in a field named `sessionTimeLeftSeconds`                                                         |
| Responses carrying it | `POST /auth/login` and `POST /auth/refresh` (session restore on page load already goes through refresh)                                                |
| Lead time             | 10 minutes before expiry                                                                                                                               |
| Display               | A banner, not dismissible. It stays until the user is signed out.                                                                                      |
| Banner action         | A "Log in again" button: logs out now and goes to `/login`, so the user starts a fresh 30-day session                                                  |
| At expiry             | No special handling. The user is signed out at the next refresh, as today (up to ~15 minutes after the 30-day mark, because of the access-token tail). |
| Extend option         | None. The 30 days cannot be extended.                                                                                                                  |

---

## Stage 23a: 30-Day Lifetime and TTL Bounds

### Changes to already-implemented code

| #   | File                             | Change                                                                              |
| --- | -------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | `user-service/src/config.ts`     | Add bounds to `REFRESH_TOKEN_TTL_DAYS` (1–30) and `ACCESS_TOKEN_TTL_MINUTES` (1–15) |
| 2   | `user-service/.env`, `.env.test` | `REFRESH_TOKEN_TTL_DAYS=30`                                                         |
| 3   | `user-service/.env.example`      | `REFRESH_TOKEN_TTL_DAYS=30`, and a range comment on both TTL lines                  |

### Update `user-service/src/config.ts`

- `REFRESH_TOKEN_TTL_DAYS`: keep `z.coerce.number().int().positive()` and add the bound 1–30 inclusive
- `ACCESS_TOKEN_TTL_MINUTES`: same, with the bound 1–15 inclusive
- Reuse the existing error-reporting path for out-of-bounds values. Do not add a new one.
- Change nothing else in `config.ts`.

### Update the env files

`.env` and `.env.test`: set `REFRESH_TOKEN_TTL_DAYS=30`. Change nothing else.

`.env.example`: set `REFRESH_TOKEN_TTL_DAYS=30` and add the allowed range as a comment on each TTL line. Change nothing else.

```env
ACCESS_TOKEN_TTL_MINUTES=15   # 1–15
REFRESH_TOKEN_TTL_DAYS=30     # 1–30
```

Check that `config.ts` still parses these lines with the comments on them (no comment text in the value). If it does not, stop and tell me.

### Check before finishing (report only, do not change)

- **Refresh cookie `Max-Age`:** confirm it is derived from `config.jwt.refreshTokenTtlDays`, not a hardcoded 7 days. If it is hardcoded, stop and tell me.
- **Other hardcoded 7-day values:** search `user-service/` and `frontend/` for any other place that assumes a 7-day session (code, comments, user-facing text). List them; do not change them.
- **Docs:** list any place in `user-service/docs/` or the root `README.md` that states the 7-day lifetime. Do not edit them; I will decide.
- **Tests:** run the full suite after the change. List every test that fails because it hardcodes 7 days, with file and line, and stop. If a test fails for any other reason, also stop and report it.

### Verification

- `REFRESH_TOKEN_TTL_DAYS=0` and `=31` → app exits with a clear error naming the variable and the 1–30 range
- `ACCESS_TOKEN_TTL_MINUTES=0` and `=16` → app exits with a clear error naming the variable and the 1–15 range
- `REFRESH_TOKEN_TTL_DAYS=1` and `=30`, `ACCESS_TOKEN_TTL_MINUTES=1` and `=15` → accepted
- A non-integer value for either → still rejected
- The new `.env`, `.env.example` and `.env.test` values → accepted, and a `.env` copied from `.env.example` starts the service cleanly
- A new login → the `refresh_tokens` row has `expires_at - created_at` = 30 days, and the refresh cookie's `Max-Age` is 30 days
- `POST /auth/refresh` does not change `expires_at`
- A refresh token with `expires_at` backdated to the past → `POST /auth/refresh` returns `401 INVALID_REFRESH_TOKEN`

### Tests (Vitest)

Follow the Stage 7 ground rules.

- For the config bounds, follow the existing config-validation tests (child process, assert exit code and stderr). Every bound and boundary bullet above is a required test case.
- The remaining bullets are likely already covered by existing tests once `.env.test` is 30. Where they are, do not duplicate them. Where they aren't, add them.
- Do not modify application code to make a test pass, and do not change tests that hardcode 7 days (see "Check before finishing").

---

## Stage 23b: `sessionTimeLeftSeconds` on Login and Refresh

### Changes to already-implemented code

| #   | File                                                      | Change                                                                        |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | `src/services/auth.service.ts` (`login`, `refresh`)       | Return `sessionTimeLeftSeconds` alongside the existing return values          |
| 2   | `src/controllers/auth.controller.ts` (`login`, `refresh`) | Include it in the response body                                               |
| 3   | `src/db/queries/tokens.queries.ts`                        | Return the seconds left, computed in SQL, where `login` and `refresh` need it |
| 4   | Existing tests                                            | Update assertions on the exact login and refresh response shape (see Tests)   |

### Response shapes

- `POST /auth/login` → `200` with `{ accessToken, user: { id, username, email, role, activeView }, sessionTimeLeftSeconds }`. The `user` object is unchanged.
- `POST /auth/refresh` → `200` with `{ accessToken, sessionTimeLeftSeconds }`

`sessionTimeLeftSeconds` is a top-level field, not inside `user`.

### How it is computed

- Seconds from now until the refresh token's `expires_at`, whole seconds, rounded down, never negative
- Computed in SQL against the database clock (convention 5), e.g. from `expires_at - clock_timestamp()`. Never `Date.now()`.
- In `login`: from the refresh token row just created by `createRefreshToken` (inside the existing transaction)
- In `refresh`: from the locked token row, after all existing checks pass
- Add the value to the existing queries' `RETURNING` / `SELECT` lists rather than adding a separate query, where that is possible. Tell me what you chose.

Nothing else about `login` or `refresh` changes: checks, check order, locking and error codes stay as they are.

### Verification

- `POST /auth/login` → body includes `sessionTimeLeftSeconds` ≈ 30 days in seconds (2,592,000), and the `user` object is unchanged
- `POST /auth/refresh` right after login → `sessionTimeLeftSeconds` ≈ the login value minus the elapsed time
- Backdate `expires_at` to 5 minutes from now → `POST /auth/refresh` returns `sessionTimeLeftSeconds` ≈ 300
- `POST /auth/refresh` does not change `expires_at`
- Every existing login and refresh error case returns exactly as before (no `sessionTimeLeftSeconds` on errors)

### Tests (Vitest)

Follow the Stage 7 ground rules. Every Verification bullet above is a required test case.

Existing tests that assert the exact login or refresh response body (e.g. `toEqual({ accessToken })`) will need the new field: update only those response-shape assertions, as in Stage 15c. If a test fails for any other reason, stop and report it. Do not modify application code to make a test pass.

---

## Stage 23c: Expiry Warning Banner — Frontend

### Ground rules

Same as Stage 16:

- Work in `frontend/` only; never touch `foc-mockup/`
- Do not modify `src/realtime/orderSocket.js`, `src/data/users.js`, `src/components/DemoControls.jsx` or `AI-NOTES.md`
- Auth state stays in `AuthContext`; network calls go through `src/api/http.js`
- Reuse the existing banner component (`FormBanner` or whatever 16b settled on) and the existing text conventions
- React 18, JSX, no new libraries
- List every file you touched outside the files named below

### What to build

- **Read the value:** whenever a login or refresh response arrives (login, session restore, the proactive refresh, refresh-after-401), read `sessionTimeLeftSeconds` and store a local deadline in `AuthContext`, measured with a monotonic clock (`performance.now()`) so a wrong or changed device clock has no effect.
- **Show the banner:** while authenticated, once the deadline is 10 minutes or less away, show a banner at the top of every page. It cannot be dismissed. Each tab works this out from its own refresh responses; no cross-tab coordination is needed.
- **Lead time:** a named constant (10 minutes) at the top of the file that uses it. No new env var.
- **Banner text:** add it in the same place and style as the existing user-facing text. It must not promise an exact sign-out time, since the actual sign-out happens at the next refresh (see "At expiry"). Put the text in your summary so I can review it.
- **"Log in again" button:** calls the existing `AuthContext.logout()`, i.e. the same as the TopNav logout (explicit logout: no return to `from`).
- **At expiry:** nothing new. The existing refresh-failure path handles it.
- **On logout:** clear the deadline and any timer, so the banner never appears while logged out or carries over to the next login.

### Verification

- After login, no banner
- Backdate `expires_at` (backend) to 15 minutes from now, then reload → no banner; after 5 minutes → banner appears
- Backdate to 5 minutes from now, then reload → banner appears immediately
- The banner has no dismiss control and stays across page navigation
- "Log in again" → logged out and on `/login`; logging in → no banner (fresh 30 days)
- Changing the device clock does not make the banner appear or disappear
- Two tabs open → both show the banner when their deadline is reached
- Logged out → no banner, no timers left running
- When the session actually expires, the existing refresh-failure path signs the user out as before

### Tests (Vitest)

Follow the Stage 7 ground rules. Mock the network layer and use Vitest fake timers. Every Verification bullet above that does not need a real browser or backend is a required test case. If `frontend/` has no test setup yet, stop and tell me what you would add before adding it. Do not modify application code to make a test pass.

---

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry per sub-stage.

### Backlog edit (for the team to make in `docs/FoC-ProductBacklog.md`)

- **NFR4.1.1** (30-minute inactivity timeout): dropped. Note it as a deliberate scope change.
- **NFR4.1.2**: change "7 days" to "30 days", and note that the lifetime is fixed from login (not from last activity) and that an access token can outlive it by up to `ACCESS_TOKEN_TTL_MINUTES`.
- **NFR4.2.1**: reword from "notify the user 1 minute before their session expires due to inactivity and provide an option to extend it" to a non-dismissible banner 10 minutes before the 30-day session expiry, with an option to log in again (the session cannot be extended).

# Stage 24: Admin User History Page (F5.3.2)

> **Scope**: Frontend only (`frontend/`). An admin or super admin opens a user from
> `/admin/users`, sees that user's profile and a paginated list of their orders, and opens
> any order to see its full details and credit transactions. No user-service, order-service,
> credit-service or supplier-service changes.
>
> Backlog refs: F5.3.2.
>
> **Before starting:** if any `[DECIDE]` placeholder remains anywhere in this stage, stop and
> ask me. Do not pick a value yourself. Read the current code first. Where it disagrees with
> this file, follow the code and tell me.
>
> **Ground rules:** same as Stage 16 (work in `frontend/` only, never `foc-mockup/`; do not
> modify `src/realtime/orderSocket.js`, `src/data/users.js`, `src/components/DemoControls.jsx`
> or `AI-NOTES.md`; React 18, JSX, react-router-dom, Context API, Tailwind, lucide-react,
> native `fetch` via `src/api/http.js`; no new state or form libraries). List every file
> outside this page's own files that you touched.

### Backend contracts (already built and merged on main; do not change)

**Credit service** — `GET /credits/transactions/all?requestId=<uuid>`

- Admin and super admin only (bearer token).
- Params are camelCase (`userId`, `requestId`, `cursor`). Unknown keys are silently ignored, so use the names exactly. A dropped or misspelt `requestId` returns everyone's transactions with no error.
- Response: `{ transactions: [...], nextCursor: string | null }`. Envelope is camelCase; **rows are snake_case**: `transaction_id`, `transaction_type`, `originating_user_id`, `destination_user_id`, `amount`, `created_at`, `request_id`.
- Types: `allocation`, `reservation`, `transfer`, `release`. Row layout by type: reservation and release have `originating_user_id` only (the requester); transfer has originator (requester) and destination (courier); allocation has destination only and no `request_id` (allocations never appear on this page).
- 20 per page, newest first. Stop paging when `nextCursor` is `null`. Never construct a cursor. An unknown `requestId` returns `200` with an empty array.
- Errors use `{ error: { code, message } }`: `400 INVALID_CURSOR`, `400 INVALID_REQUEST_BODY`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `503 IDENTITY_PROVIDER_UNAVAILABLE`. Note this differs from user-service's `{ message, code }`; check how `http.js` and `errorMessages.js` read error codes.

**Order service**

- `GET /orders/admin/users/:userId?page=N` — admin and super admin only. `page` defaults to 1. Unknown query params return `400`. Response: `{ totalCount, currentPage, pageSize: 10, totalPages, orders: [{ order, role }] }`. `order` has every persisted field (`id`, `requesterId`, `supplierId`, `description`, `deliveryLocationId`, `credits`, `completeBy`, `additionalDetails`, `courierId`, `status`, `createdAt`, `updatedAt`, `acceptedAt`, `deliveredAt`, `creditReleasedAt`, `version`). `role` is `requester` or `courier` relative to `:userId`. All statuses (`pending`, `open`, `accepted`, `picked_up`, `delivered`, `completed`, `cancelled`, `expired`, `failed`), newest first. A page past the end returns an empty array with the real count. The endpoint calls user-service itself to check the user exists.
- Errors are `{ message }` only, with no `code`, so tell them apart by HTTP status: `400` bad id/page/param, `401`, `403`, `404` user not found, `503` user-service unavailable.
- `GET /orders/:id` — returns the bare order object. Admins can fetch any order. A missing order and a non-viewable one both return `404 { message: 'Order not found.' }`.

**User service** — `GET /users/:id` (admin) → `{ id, username, email, status, role, activeView, createdAt, updatedAt }`, any status; `404 USER_NOT_FOUND`. `GET /users/public?ids=a,b,c` (1–50 ids) → `{ users: [{ id, username }] }`; unknown ids are omitted.

**Supplier service** — `GET /api/v1/suppliers/:id` (numeric id, any authenticated role); no batch form. Location names come from the full list at `GET /api/v1/suppliers/reference/location`, looked up client-side.

Existing frontend helpers to reuse (read them first; do not rewrite): `useUserName`, `useSupplier`, `useLocationNames` in `src/api/lookups.js`; `resolveUserNames` in `src/api/credits.js`; `Pager` and `useApiNotice` in `src/components/ApiNotice.jsx`; `EmptyState`, `Forbidden`, and the toast and banner components from Stage 16.

### Design decisions (already made, do not change)

| Rule                         | Value                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access                       | Admin and super admin see the same pages. Both can view any user. Routes use `RequireAuth` + `RequireRole minimum="admin"`.                                                                                                                                                                                                |
| Routes                       | User page `/admin/user-transactions/:userId`. Order page `/admin/user-transactions/:userId/:requestId`. Both load fully on a direct URL or reload.                                                                                                                                                                         |
| Entry point                  | In `/admin/users`, clicking a user's row opens that user's page. The existing three-dot row menu keeps working and must not trigger the row click.                                                                                                                                                                         |
| Back links                   | "← Back to users" on the user page. "← Back to user" on the order page.                                                                                                                                                                                                                                                    |
| User page layout             | Profile at the top, then a paginated list of order summaries.                                                                                                                                                                                                                                                              |
| Profile fields               | `id`, `username`, `email`, `status`, `role`, `createdAt`, `updatedAt`.                                                                                                                                                                                                                                                     |
| Profile actions              | Suspend/unsuspend and promote/demote buttons, with the same behaviour as `/admin/users`: same allowed-actions table, same confirmation dialog, same toasts, refetch on a stale-state error. The profile updates from the action's response.                                                                                |
| Unknown user                 | If the profile call returns `404`, the whole page shows "user not found" (not just the profile section).                                                                                                                                                                                                                   |
| Order summaries              | Truncated: no description and no transactions. Shows the order's credits. Shows the viewed user's role (`requester` / `courier`) as a label beside the username. All statuses are shown.                                                                                                                                   |
| Summary fields               | user summary - email (masked), status, role, credits; order summary - request ID, requestor, supplier, credits for the transaction, courier, status                                                                                                                                                                        |
| Pagination                   | Page-number, 10 per page, via `Pager`, using `totalPages`. The current page number is kept in the URL, so a reload keeps the page. `page` — the query param name.                                                                                                                                                          |
| Filtering                    | Role (requester/courier) and status. The backend has no such params, so filtering is **client-side, within the current page of 10 only**. A page can therefore show fewer than 10 orders, or none, while other pages still match. The UI must say the filter applies to the current page. No search and no sorting.        |
| Click an order               | Navigates to the order page.                                                                                                                                                                                                                                                                                               |
| Order page                   | Loads the order with `GET /orders/:id`. Shows every field: order id (the request id), requester, supplier, delivery location, credits, completeBy, description, additionalDetails, courier, status, and all datetimes (`createdAt`, `updatedAt`, `acceptedAt`, `deliveredAt`, `creditReleasedAt`). `version` is not shown. |
| Order not involving the user | If the order's requester and courier are both not `:userId`, show "Order not found" (also shown when `GET /orders/:id` returns `404`).                                                                                                                                                                                     |
| Transactions                 | Fetched once per order page load via `?requestId=<order id>`. Fields shown: transaction id, type, originating user, destination user, amount, created at. Paged with `nextCursor`; stop when it is `null`. No allocations.                                                                                                 |
| Credits colour and sign      | Red/green with a `+` or `−`. For reservation and release, don't put it as `+` or `-` or red or green - just put the amount held. only for transfer then have colour and sign.                                                                                                                                              |
| Names                        | Usernames for requester, courier and transaction parties; supplier name; delivery location name, via the existing helpers.                                                                                                                                                                                                 |
| Name fallbacks               | Existing ones: shortened UUID for a missing username, "Location <id>" for a missing location. Missing supplier name: "Supplier <id>" (same pattern as location).                                                                                                                                                           |
| Dates                        | Whatever the frontend already uses.                                                                                                                                                                                                                                                                                        |
| Empty states                 | An order with no transactions shows "no transactions". A user with no orders shows an empty-state message.                                                                                                                                                                                                                 |
| Section failures             | Only the failed section shows an error and a retry button; the rest of the page still renders.                                                                                                                                                                                                                             |

### Sub-stages

**18a — API modules.** Add the admin calls to the existing API modules, following their style: user orders (`/orders/admin/users/:userId`) in `src/api/orders.js`; transactions by `requestId` in `src/api/credits.js`; the profile call (`GET /users/:id`) in `src/api/users.js` if it isn't there. Confirm how each service's error shape reaches the pages, and report any mismatch before building pages on top.

**18b — User page.** Profile, action buttons, order summaries, pagination and filters, per the table above.

**18c — Order page.** The order, and its transactions, per the table above.

**18d — Entry point and routes.** Add both routes behind the guards. Make rows in `/admin/users` open the user page.

### Verification

- Click a row in `/admin/users` → the user page opens; the three-dot menu still opens without navigating.
- A direct URL or reload of either page works, and the page number survives a reload.
- Non-admin → the 403 view (URL unchanged). Logged out → `/login`, then back.
- A nonexistent user id → whole page "user not found". A malformed user id → the same view.
- A user with no orders → empty state. A page past the last page → empty state, with "Page X of Y" still correct.
- Role and status filters change which of the current page's orders show; the UI says it applies to this page only.
- The order page shows all listed fields and the transactions; an order with no transactions shows the empty message.
- An order that doesn't involve the user in the URL → "Order not found". A nonexistent order id → "Order not found".
- Credits show with the colour and sign you decided.
- Stop credit-service → only the transactions section errors, with a retry button that works. Stop order-service → only the orders section errors. Stop supplier-service or user-service → names fall back, the page doesn't break.
- Suspend, unsuspend, promote and demote from the user page behave as on `/admin/users`, and the profile updates without a reload.

### Tests (Vitest)

Write the tests in this stage, with the existing Vitest + `@testing-library/react`, `jest-dom` and `user-event` setup. Mocking the API modules or `fetch` is allowed. Every Verification bullet that doesn't need a running backend is a required test case. Do not modify application code to make a test pass. Report any failure that isn't a test problem.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry for this stage.

# Stage 25: OTP "Attempts Exceeded" Dead-End Fix (backend + frontend)

> **Scope**: `user-service` and `frontend/`. Never touch `foc-mockup/`.
> Read the current code before writing anything. Where it disagrees with this file, follow the code and tell me.
> Do not implement test cases before the implementation is done.

## The bug

A user enters 5 wrong codes and then submits a 6th. The 5th wrong guess gives no warning (plain `400 INVALID_OTP`), so the user types again, even the correct code, and the 6th submit returns `429 OTP_ATTEMPTS_EXCEEDED` ("request a new code"). Four things go wrong:

0. The user is not told the code is dead when it dies (on the 5th failed attempt), only on the next submit, which is rejected even if the code is correct.

1. The OTP boxes keep the old digits and stay enabled, even though that code can never work again. The frontend only clears them on `INVALID_OTP`.
2. The resend cooldown is counted from when the current OTP was **created** (60 s), not from the wrong guesses. If the user burns 5 guesses quickly, resend is still inside the cooldown. It returns `429 OTP_RESEND_COOLDOWN` with `Retry-After` of about 30, and nothing is sent.
3. The page does not know about the cooldown until the user clicks resend and fails, so the "request a new code" message points at a button that cannot work yet.

## Design decisions (already made, do not change)

| Topic                | Decision                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cooldown rule        | Unchanged. The resend cooldown still starts when the latest OTP was created. Resend limit, 5 guesses per OTP and `requestOtp` are not touched.                                                                                                                                                                                                                                                           |
| How the UI learns it | The backend tells it. `OTP_ATTEMPTS_EXCEEDED` responses carry a `Retry-After` header: the seconds until a resend is allowed, computed on the DB clock. `0` means resend is allowed now. The frontend does not track its own send time.                                                                                                                                                                   |
| Frontend on exceeded | Clear the boxes, disable them, show the error, and start the resend countdown straight away (or enable resend at once if the value is `0`).                                                                                                                                                                                                                                                              |
| After a good resend  | Boxes are re-enabled, cleared and the first one is focused. The error is removed.                                                                                                                                                                                                                                                                                                                        |
| Scope of the UI fix  | Every page with an OTP step: register, forgot password, change email, change password. Use the shared components so the behaviour is the same everywhere.                                                                                                                                                                                                                                                |
| Expired code (UI)    | On `OTP_EXPIRED`, clear the boxes and refocus the first one, the same as `INVALID_OTP`. Resend is available at once (the 60 s cooldown always ends before the 10-minute lifetime), so no countdown is started.                                                                                                                                                                                           |
| Expired code (count) | A guess against an expired code is treated exactly like a wrong guess: it adds 1 to that OTP's `attempts_count`. Failures 1 to 4 return `OTP_EXPIRED` (wrong codes return `INVALID_OTP`).                                                                                                                                                                                                                |
| Tell on the 5th      | The **5th failed attempt** (wrong or expired) is the one that uses the code up, so it returns `429 OTP_ATTEMPTS_EXCEEDED` itself, with the `Retry-After` header, instead of `INVALID_OTP` / `OTP_EXPIRED`. Any later submit on that code also returns `OTP_ATTEMPTS_EXCEEDED`. The limit stays at 5 guesses per code. A **correct** code on the 5th attempt still succeeds, because only failures count. |
| Check order          | The attempts check runs **before** the expiry check. An expired code with the count at the max returns `OTP_ATTEMPTS_EXCEEDED` with `Retry-After: 0` (the cooldown is long over), so the UI disables the boxes and enables resend at once.                                                                                                                                                               |

## Stage 25a: Backend — `Retry-After` on `OTP_ATTEMPTS_EXCEEDED`

Files: `src/services/otp.service.ts` (and `src/db/queries/otp.queries.ts` if the latest-OTP query needs another column).

- In `checkOtp`, step 3 (`attempts_count >= max_attempts`) already has the latest OTP row and `db_now` from `findLatestOtp`. Compute
  `retryAfterSeconds = max(0, ceil(seconds between db_now and created_at + config.otp.resendCooldownSeconds))`.
  Do the arithmetic in SQL with `clock_timestamp()`, or from the `db_now` already returned. **Do not use `Date.now()`** (convention 5).
- Throw `AppError(429, 'Too many incorrect attempts. Please request a new OTP.', 'OTP_ATTEMPTS_EXCEEDED', retryAfterSeconds)`, using the same optional `retryAfterSeconds` field that `OTP_RESEND_COOLDOWN` and `ACCOUNT_LOCKED` use.
- Make sure the global error handler emits `Retry-After` for a value of `0`. If it currently checks truthiness, change it to check `!== undefined`. Check that this doesn't change the other codes: `OTP_RESEND_COOLDOWN` is always above 0 and `ACCOUNT_LOCKED` is always above 0.
- This covers every purpose automatically because they all go through `checkOtp`. Confirm that each verify path (`verify-otp` registration/forgot-password, change email, change password, reset-password) lets the error through unchanged. Report any that catches and rewraps it.
- Put the `retryAfterSeconds` calculation in one small helper, because 25c also needs it for the 5th failed attempt. Both paths must give the same value.
- The body stays `{ message, code }`. The wrong-guess path still returns `{ ok: false }` and throws after the commit (see 25c for the 5th failed attempt).

## Stage 25c: Backend — count guesses against an expired code

Files: `src/services/otp.service.ts`, `src/db/queries/otp.queries.ts`, and every caller of `checkOtp`.

- In `checkOtp`, step 2 (`expires_at` has passed) must call `incrementAttempts` and then **return** `{ ok: false, reason: 'expired' }` instead of throwing. Throwing inside `withTransaction` would roll the increment back (convention 4). The wrong-guess path returns `{ ok: false, reason: 'invalid' }`. The caller throws after the transaction commits: `INVALID_OTP` for `'invalid'`, `OTP_EXPIRED` (same 400 and message as now) for `'expired'`.
- Do not copy the branching into each caller. Add one small shared helper (for example `throwOtpFailure(result)`) in `otp.service.ts` and use it at every call site. **Before changing anything, list every call site** (registration verify, forgot-password verify and reset, change email, change password, any admin-action use) and tell me if one of them handles the failure differently.
- New order of checks: missing/consumed row → `INVALID_OTP`; attempts used up → `OTP_ATTEMPTS_EXCEEDED`; expired → count it and return `OTP_EXPIRED`; otherwise compare. The attempts check moves above the expiry check, so an expired code whose count is at the max returns `OTP_ATTEMPTS_EXCEEDED` (with the 25a `Retry-After`, which is `0` here). Report any caller or test that relied on the old order.
- **Tell on the 5th failed attempt.** `incrementAttempts` already returns the new count. If the new count has reached `max_attempts`, `checkOtp` must still **return** (not throw), as `{ ok: false, reason, exhausted: true, retryAfterSeconds }`, where `retryAfterSeconds` comes from the 25a helper using the DB clock inside the same transaction. The increment commits first. The shared `throwOtpFailure` helper then throws `AppError(429, ..., 'OTP_ATTEMPTS_EXCEEDED', retryAfterSeconds)` when `exhausted` is true, and `INVALID_OTP` / `OTP_EXPIRED` otherwise. A correct code never reaches the increment, so it is not affected.
- Existing tests and fixtures that expect `400 INVALID_OTP` on the 5th wrong guess (for example the "5 wrong OTPs" cases from Stages 5 to 12) will now see `429 OTP_ATTEMPTS_EXCEEDED` on the 5th. Update those expectations, list them in your summary, and do not change application code to make them pass.
- `attempts_count` is a `SMALLINT`, and repeated guesses against an expired code would otherwise keep incrementing it. Make `incrementAttempts` stop at `max_attempts` (for example `LEAST(attempts_count + 1, max_attempts)`) so it cannot overflow or go past the max. This is safe for the wrong-guess path too, which never reaches the increment once the count is at the max.
- No account-level lockout counts OTP guesses (Stage 18 locks on passwords only), so this changes only the per-OTP `attempts_count`. Do not add anything to the Stage 18 counters.

## Stage 25b: Frontend

Read `frontend/` first (`OtpInput.jsx`, `ResendButton.jsx`, `errorMessages.js`, `src/api/http.js`, and the pages with an OTP step) and **report how `Retry-After` currently reaches `ResendButton`** before changing anything. Then:

- `src/api/http.js`: make sure the thrown error exposes `retryAfterSeconds` (parsed from the header, `undefined` if missing) for every `429`, not only the resend endpoint. If it already does, change nothing.
- `OtpInput.jsx`: the parent must be able to (a) clear and refocus (exists), and (b) set the input to a disabled "dead" state that keeps the boxes empty. Reuse the existing `disabled` prop if it fits. Don't add a new prop for something the current props can do.
- `ResendButton.jsx`: it must accept a way to start (or restart) the countdown from a value supplied by the parent, e.g. an `initialCooldown` / `startCooldown(seconds)` handle. `0` means enabled immediately. Keep the existing behaviour for `OTP_RESEND_COOLDOWN` and `OTP_RESEND_LIMIT`.
- On `OTP_ATTEMPTS_EXCEEDED` (in each OTP page, including when it arrives as the response to the 5th failed attempt): clear the boxes, disable them, show the mapped error, and start the resend countdown from `err.retryAfterSeconds ?? 0`.
- On a successful resend (`OTP_SENT`): clear the error, re-enable the boxes, clear them and focus the first.
- On `OTP_EXPIRED` (in each OTP page): clear the boxes and refocus the first one, as for `INVALID_OTP`. Keep them enabled. Show the mapped error. Resend is available straight away, so do not start a countdown. If resend still returns `OTP_RESEND_COOLDOWN`, handle it as described below.
- On `OTP_RESEND_LIMIT`: boxes stay disabled, show the limit text, no countdown (unchanged).
- If resend itself returns `OTP_RESEND_COOLDOWN` (a race between the two clocks): keep the boxes disabled and restart the countdown from the new `Retry-After`.
- `errorMessages.js`: change the text for `OTP_ATTEMPTS_EXCEEDED` so it no longer promises something that can't happen yet. It should say the code is no longer valid and that the user can request a new one when the button is available. Show me the old and new text in your summary.
- Registration arrived-from-login flow and the forgot-password step 3 fallback ("back to step 2 with the error"): the step 2 state must also start with the boxes disabled and the countdown running when it is entered with `OTP_ATTEMPTS_EXCEEDED`.

## Verification

- Register, enter wrong codes: the first 4 return `400 INVALID_OTP` with the boxes cleared. The **5th** returns `429 OTP_ATTEMPTS_EXCEEDED` **with a `Retry-After` header** of roughly the time left (within the first 60 s). The boxes clear and disable, and the resend button shows the same countdown. `attempts_count` is 5 in the DB.
- A correct code on the 5th attempt (after 4 wrong ones) succeeds.
- After the 5th failure, submitting the correct code (e.g. through the API) still returns `429 OTP_ATTEMPTS_EXCEEDED`.
- Same flow, but backdate the OTP `created_at` by more than 60 s first: the response has `Retry-After: 0`, boxes are disabled, and resend is enabled immediately.
- When the countdown ends, clicking resend sends a new code, the boxes re-enable and clear, and the new code works. The old code returns `INVALID_OTP`.
- After 5 resends the limit text shows, boxes stay disabled, no countdown (unchanged).
- Expired code: backdate `expires_at`, submit any 6 digits. The response is `400 OTP_EXPIRED`, the OTP's `attempts_count` goes up by 1 and is persisted (check the DB), and the boxes clear with focus on the first. Resend works immediately.
- Submit against an expired code: submits 1 to 4 return `OTP_EXPIRED` with the boxes cleared. The 5th returns `429 OTP_ATTEMPTS_EXCEEDED` with `Retry-After: 0`, the boxes disable, and resend is enabled at once. Later submits keep returning `OTP_ATTEMPTS_EXCEEDED`, `attempts_count` stays at `max_attempts`, and there is no `SMALLINT` error.
- Mixed: 3 wrong guesses, expire the code, the next guess returns `OTP_EXPIRED` (4th failure), and the one after that returns `OTP_ATTEMPTS_EXCEEDED` (5th failure).
- A new code issued after expiry starts at `attempts_count = 0` and accepts the correct code.
- Forgot password step 3 with an expired code: back at step 2 with the expiry error and cleared boxes.
- Repeat for forgot password, change email and change password.
- Reload the page after being locked out, then enter any code. The same header is returned and the UI shows the correct remaining time.
- Existing responses are unchanged: `OTP_RESEND_COOLDOWN`, `OTP_RESEND_LIMIT` and `ACCOUNT_LOCKED` still carry their `Retry-After`. `INVALID_OTP` still clears and refocuses the boxes.

## Tests

Backend (Vitest, real Postgres, following the Stage 7 ground rules) and frontend (Vitest + Testing Library). Do not modify application code to make a test pass. Report any failure that isn't a test problem.

**1. Edit the existing tests first.** Search `tests/` and the frontend tests for every case that depends on the old behaviour, and update its expectations. At least look for:

- Any test that submits wrong OTPs in a loop, or checks `attempts_count`, `max_attempts`, `INVALID_OTP` or `OTP_ATTEMPTS_EXCEEDED`. This covers registration `verify-otp`, forgot-password `verify-otp` and `reset-password`, change email and change password. The old pattern "5 wrong OTPs, then the correct OTP → `429 OTP_ATTEMPTS_EXCEEDED`" becomes "4 wrong OTPs → `400 INVALID_OTP` each; the 5th wrong OTP → `429 OTP_ATTEMPTS_EXCEEDED` with a `Retry-After` header; the correct OTP afterwards → `429 OTP_ATTEMPTS_EXCEEDED`; the account, email or password is unchanged".
- Any test that submits an expired OTP and expects `OTP_EXPIRED`. It should still pass for a first or early failure. Add the new checks that `attempts_count` goes up and is persisted, and, if the test loops, that the 5th failure returns `OTP_ATTEMPTS_EXCEEDED`.
- Any test that depends on the check order (expired before attempts used up). It now runs the other way round.
- Frontend tests for `OtpInput`, `ResendButton`, the register, forgot-password, change-email and change-password pages, and `errorMessages.js`: the `OTP_ATTEMPTS_EXCEEDED` handling, the clearing of boxes on `INVALID_OTP`, and the changed message text. Add the `OTP_EXPIRED` clearing.

Keep each assertion as strict as it was. Change the expected values, not the strength of the checks. List every test file and case you changed in your summary.

**2. Then add cases** for every Verification bullet above that doesn't need a real browser. Use fake timers for the countdown.

## Notes for the summary

- List any place you deviated from this file and why.
- Say which `checkOtp` call sites you changed for 25c and whether any needed more than the shared helper.
- List the existing tests and fixtures you updated because the 5th wrong guess now returns `429 OTP_ATTEMPTS_EXCEEDED`.

## AI logging

Same as earlier stages: header comment on every file created **or modified**, and a usage-log entry per sub-stage (25a, 25b, 25c) in the existing format.

# Stage 26: Admin Audit Log (NFR3.2.2)

> **Scope**: `user-service`, `frontend`, and one line each in `frontend/vite.config.js` and `frontend/nginx/default.conf`.
>
> - 26a: audit table, append-only trigger, config of reason presets
> - 26b: reason required on every high-risk admin action; audit row written in the same transaction as the change
> - 26c: unmask becomes a `POST` with a reason; the `[UNMASK EMAIL]` console lines are removed
> - 26d: `GET /admin/audit-logs`
> - 26e: frontend (reason dialogs, audit log page, nav link, proxy entry)
>
> Backlog refs: NFR3.2.2. NFR3.2.1 (OTP before high-risk actions) is dropped.
>
> This supersedes the console logging of unmask attempts in Stage 20 (including its denied-attempt lines and the "log failure fails the unmask" rule, which now applies to the audit insert).
>
> **Before starting:** read the current code, not just this file. If anything below disagrees with the code, stop and ask me. Implement one sub-stage at a time and wait for my confirmation before the next.
>
> **Verify first (report only, do not change anything):**
>
> 1. What `POST /users/:id/unlock` currently does when the target is not login-locked.
> 2. Whether any production proxy or reverse-proxy config (nginx, Caddy, compose) has its own path rules. List the prefixes it forwards.
> 3. Every existing test that asserts on the `[UNMASK EMAIL]` console lines or on `GET /users/:id/full-email`.

### Design decisions (already made, do not change)

**What is audited**

| Rule                  | Value                                                                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audited actions       | Suspend, unsuspend, promote, demote, unmask email, unlock                                                                                                                                 |
| Actions not audited   | Viewing the log, `GET /users`, `GET /users/:id`, every other read                                                                                                                         |
| Credit adjustment     | Not in this stage. See "Notes for later".                                                                                                                                                 |
| When a row is written | Only when the action actually succeeds. A suspend that changes status writes a row; an unmask that returns the email writes a row.                                                        |
| No-op requests        | No row. Same as today: `200`, unchanged user.                                                                                                                                             |
| Rejected requests     | No row and no console line: `authenticate` / `authorize` failures, business-rule rejections (`SUPER_ADMIN_IMMUTABLE`, `FORBIDDEN`, `422`s, `404`, `400`).                                 |
| Same transaction      | The audit insert runs with the same `client` inside the same `withTransaction` as the change. If the insert fails, the change rolls back and the request fails with `500 INTERNAL_ERROR`. |
| Unmask                | There is no state change. The audit insert is done first; the email is returned only after the insert succeeds. If the insert throws, `500 INTERNAL_ERROR` and the email is not returned. |
| Timestamp             | Database clock (`clock_timestamp()` written in SQL), never `Date.now()`                                                                                                                   |
| Retention             | Rows are kept indefinitely                                                                                                                                                                |

**Table**

| Rule              | Value                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name              | `admin_audit_log`                                                                                                                                                   |
| Enum              | `audit_action_enum`: `USER_PROMOTE`, `USER_DEMOTE`, `USER_SUSPEND`, `USER_UNSUSPEND`, `EMAIL_UNMASK`, `USER_UNLOCK` (same safe-creation pattern as the other enums) |
| `id`              | UUID, primary key, `gen_random_uuid()`                                                                                                                              |
| `created_at`      | TIMESTAMPTZ NOT NULL, `DEFAULT clock_timestamp()`                                                                                                                   |
| `actor_id`        | UUID NOT NULL. **No foreign key.**                                                                                                                                  |
| `action`          | `audit_action_enum` NOT NULL                                                                                                                                        |
| `target_id`       | UUID NOT NULL. **No foreign key.**                                                                                                                                  |
| `before`          | JSONB, nullable                                                                                                                                                     |
| `after`           | JSONB, nullable                                                                                                                                                     |
| `reason`          | TEXT NOT NULL                                                                                                                                                       |
| `user_agent`      | TEXT, nullable (`-` is not stored; a missing header is NULL)                                                                                                        |
| `request_id`      | Not included                                                                                                                                                        |
| No FK, no cascade | Deleting a user (e.g. `deleteStalePendingUsers`) never touches audit rows                                                                                           |
| Indexes           | `(created_at DESC)`, `(actor_id)`, `(target_id)`, `(action)`                                                                                                        |

**Append-only (enforced in the database)**

- A `BEFORE UPDATE OR DELETE` row trigger on `admin_audit_log` that raises an exception.
- A `BEFORE TRUNCATE` statement trigger that raises an exception.
- Trigger only. The app keeps connecting as `postgres`; no new DB role. Accepted: a superuser or the table owner can disable the triggers.
- The application has no update or delete query for this table.

**`before` / `after`** (only changed fields, JSONB)

| Action           | `before`                  | `after`                   |
| ---------------- | ------------------------- | ------------------------- |
| `USER_SUSPEND`   | `{"status": "active"}`    | `{"status": "suspended"}` |
| `USER_UNSUSPEND` | `{"status": "suspended"}` | `{"status": "active"}`    |
| `USER_PROMOTE`   | `{"role": "user"}`        | `{"role": "admin"}`       |
| `USER_DEMOTE`    | `{"role": "admin"}`       | `{"role": "user"}`        |
| `USER_UNLOCK`    | `{"isLocked": true}`      | `{"isLocked": false}`     |
| `EMAIL_UNMASK`   | `NULL`                    | `NULL`                    |

The email (masked or full) is never stored anywhere in the audit row.

**Unlock behaviour (option A)**

- Unlock acts only on a user who is currently login-locked, using the same definition of `isLocked` as `GET /users` (Stage 18).
- If the target is not login-locked, it is a no-op: `200`, unchanged user, no audit row, and nothing is cleared (including OTP send blocks).
- When it does unlock, it clears the login lock, resets login escalation, and clears OTP send blocks and escalation for all three purposes, as in Stage 18. Only the login lock appears in `before`/`after`.
- Permission rules unchanged from Stage 18.

**Reasons**

> **Amendment (2026-11-06):** unlock and email-unmask no longer require a reason. Only
> `USER_SUSPEND` / `USER_UNSUSPEND` (status endpoint) and `USER_PROMOTE` / `USER_DEMOTE` (role
> endpoint) do. `POST /users/:id/unlock` and `POST /users/:id/full-email` take no body; the
> stored audit `reason` for these two actions is a fixed `"N/A"`.

| Rule                 | Value                                                                                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required             | Every audited endpoint requires a reason in the request body                                                                                                                                                                                                    |
| Request body         | `{ "reason": "<CODE>" }`, or `{ "reason": "OTHER", "otherReason": "<free text>" }`                                                                                                                                                                              |
| `otherReason`        | Required when `reason` is `OTHER`, rejected (unexpected field) otherwise. Trimmed. Length 10–500 after trimming.                                                                                                                                                |
| Allowed codes        | Per action, from the table below. A code that is valid for a different action is rejected.                                                                                                                                                                      |
| Stored value         | The code alone (e.g. `FRAUD_OR_SCAM`), or `OTHER: <trimmed free text>`                                                                                                                                                                                          |
| Validation timing    | At the controller (Zod `.strict()`), before any DB call, so an invalid or missing reason is `400 VALIDATION_ERROR` even if the request would have been a no-op                                                                                                  |
| Action chosen from   | Status endpoint: target status `suspended` → `USER_SUSPEND`, `active` → `USER_UNSUSPEND`. Role endpoint: `admin` → `USER_PROMOTE`, `user` → `USER_DEMOTE`. The reason codes validated are those for that action.                                                |
| Zod messages         | Existing style: required → `"Reason is required"`, type → `"Reason must be a string"`, invalid code → `"Invalid reason"`, `otherReason` missing → `"Details are required when the reason is Other"`, length → `"Details must be between 10 and 500 characters"` |
| Where the lists live | One constant in the backend (authoritative) and one in the frontend. They must match; note this in the usage log.                                                                                                                                               |

Preset codes:

| Action           | Codes                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `USER_SUSPEND`   | `FRAUD_OR_SCAM` (fake errands, payment fraud, scamming other users), `HARASSMENT` (abusive messages or behaviour toward other users), `REPEATED_NO_SHOW` (accepting errands and not completing them, repeatedly), `POLICY_VIOLATION` (prohibited items or services, terms of use breach), `SUSPECTED_COMPROMISE` (account appears hijacked; protective suspension), `USER_REQUEST` (user asked to deactivate temporarily), `OTHER` |
| `USER_UNSUSPEND` | `APPEAL_ACCEPTED` (user appealed and the review found in their favour), `SUSPENSION_PERIOD_ENDED` (a time-boxed suspension is complete), `ISSUE_RESOLVED` (e.g. a compromised account is secured, or a dispute is settled), `SUSPENDED_IN_ERROR` (wrong user or mistaken report), `USER_REQUEST` (user asked to reactivate after a self-requested suspension), `OTHER`                                                             |
| `USER_PROMOTE`   | `APPOINTED_MODERATOR` (approved addition to the admin or moderation team), `TEAM_MEMBER_ONBOARDING` (project or ops team member needs admin access), `TEMPORARY_COVERAGE` (covering for another admin; pair with a planned demote), `OTHER`                                                                                                                                                                                        |
| `USER_DEMOTE`    | `ROLE_ENDED` (left the team or term finished), `TEMPORARY_ACCESS_EXPIRED` (the coverage period is over), `MISCONDUCT` (misuse of admin privileges), `SUSPECTED_COMPROMISE` (admin account may be compromised), `LEAST_PRIVILEGE_REVIEW` (access review found admin isn't needed), `OTHER`                                                                                                                                          |
| `EMAIL_UNMASK`   | None — unmask no longer collects a reason (amendment above)                                                                                                                                                                                                                                                                                                                                                                        |
| `USER_UNLOCK`    | None — unlock no longer collects a reason (amendment above)                                                                                                                                                                                                                                                                                                                                                                        |

**Viewing the log**

| Rule                | Value                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Endpoint            | `GET /admin/audit-logs`, behind `authenticate` + `authorize('admin')`                                                                                                                                                                                                                                                                                   |
| Who sees what       | Admin and super admin see the same rows. No masking.                                                                                                                                                                                                                                                                                                    |
| Pagination          | Same as `GET /users`: offset, `page` 1-based, fixed page size 50 (a constant), no `pageSize` param, page past the end → `200` with empty `logs` and a correct `total`                                                                                                                                                                                   |
| Response            | `{ logs, page, pageSize, total, totalPages }`                                                                                                                                                                                                                                                                                                           |
| Log entry fields    | `id`, `createdAt`, `actorId`, `actorUsername`, `action`, `targetId`, `targetUsername`, `before`, `after`, `reason`, `userAgent`                                                                                                                                                                                                                         |
| Usernames           | Joined from `users` on `actor_id` / `target_id` (LEFT JOIN). If the user no longer exists, the username is `null`; the frontend shows "user deleted".                                                                                                                                                                                                   |
| Filters             | `actor` (username substring), `target` (username substring), `action` (repeatable param: `?action=USER_SUSPEND&action=USER_UNLOCK`), `reasonCode`, `from`, `to`                                                                                                                                                                                         |
| `actor` / `target`  | Lowercased, substring match on the joined username, escaped like Stage 15b. A deleted user has no username, so cannot match.                                                                                                                                                                                                                            |
| `reasonCode`        | Matches the code part of the stored reason: `reason = $code`, or for `OTHER`, `reason LIKE 'OTHER: %'` (escaped). One value.                                                                                                                                                                                                                            |
| `from` / `to`       | ISO 8601 timestamps, inclusive, compared to `created_at`. `from` after `to` → `400 VALIDATION_ERROR`.                                                                                                                                                                                                                                                   |
| Sort                | `sortDir` only (`asc` / `desc`), always on `created_at`, default `desc`, with `id` as tie-breaker. No `sortBy` param.                                                                                                                                                                                                                                   |
| Validation          | Zod `.strict()` on `req.query`, existing message style, unknown param → `"Request contains unexpected fields"`. Invalid `action` value → `"Action must be one of ..."`. Invalid `reasonCode` → `"Invalid reason code"`. Invalid dates → `"From must be a valid date"` / `"To must be a valid date"`. A repeated param on a single-value filter → `400`. |
| SQL safety          | All values are bound parameters. `sortDir` goes through a fixed whitelist.                                                                                                                                                                                                                                                                              |
| Auditing the viewer | None                                                                                                                                                                                                                                                                                                                                                    |
| Frontend path       | The API is `/admin/audit-logs`; the page is `/admin/logs`. They must stay different.                                                                                                                                                                                                                                                                    |

---

## Changes to already-implemented code

| #   | File                                                                                                                | Change                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/db/init.sql`                                                                                                   | `audit_action_enum`, `admin_audit_log` table, indexes, the three triggers. Existing dev volumes need `docker compose down -v`.                                                                                                         |
| 2   | `src/db/queries/auditLog.queries.ts` (new)                                                                          | `insertAuditLog`, `listAuditLogsPage`                                                                                                                                                                                                  |
| 3   | `src/services/users.service.ts`                                                                                     | `changeUserStatus`, `changeUserRole`, unlock and `getFullEmail` take `reason` and `userAgent` and write the audit row (see 26b, 26c)                                                                                                   |
| 4   | `src/controllers/users.controller.ts`                                                                               | Validate `reason` / `otherReason` on the status, role, unlock and full-email handlers                                                                                                                                                  |
| 5   | `src/routes/users.routes.ts`                                                                                        | `GET /:id/full-email` → `POST /:id/full-email`                                                                                                                                                                                         |
| 6   | `src/services/users.service.ts` (`getFullEmail`)                                                                    | Remove all `[UNMASK EMAIL]` `console.log` / `console.error` lines and the code that existed only to produce them (actor lookup for the log line, DB-clock read for the log line)                                                       |
| 7   | `src/routes/auditLog.routes.ts`, `src/controllers/auditLog.controller.ts`, `src/services/auditLog.service.ts` (new) | `GET /admin/audit-logs`                                                                                                                                                                                                                |
| 8   | `src/app.ts`                                                                                                        | Mount the audit log router at `/admin/audit-logs`                                                                                                                                                                                      |
| 9   | Existing tests                                                                                                      | Update tests for the new request bodies and the `POST` unmask route, and delete tests that assert on `[UNMASK EMAIL]` console lines. Do not change what they otherwise assert. If a test fails for another reason, stop and report it. |
| 10  | `frontend/vite.config.js`, `frontend/nginx/default.conf`                                                            | Add `"/admin/audit-logs"` to both the dev proxy and the prod nginx config, pointing at the user service (same target as `/auth` and `/users` in each). Add nothing for `/admin` as a whole. Done in 26e.                               |
| 11  | `frontend/src/api/users.js`, `frontend/src/api/auditLog.js` (new), `frontend/src/api/errorMessages.js`              | New request bodies, `POST` unmask, `listAuditLogs`; text for any new codes                                                                                                                                                             |
| 12  | `frontend/src/pages/AdminUsers.jsx`                                                                                 | Reason dialog on every audited action; unmask asks for a reason on every eye click                                                                                                                                                     |
| 13  | `frontend/src/pages/AdminLogs.jsx` (new), `App.jsx`, nav bar                                                        | `/admin/logs` page, linked from the nav bar                                                                                                                                                                                            |

---

## Stage 26a: Schema

### Update `src/db/init.sql`

- Add the enum, table, indexes and triggers from the decisions above.
- Trigger function raises an exception with a clear message (e.g. `admin_audit_log is append-only`).
- `init.sql` only runs on a fresh volume. Remind me to reset with `docker compose down -v`, and note that `globalSetup.ts` rebuilds the test database from `init.sql`.

### Create `src/db/queries/auditLog.queries.ts`

- `insertAuditLog({ actorId, action, targetId, before, after, reason, userAgent }, db)`: `db` required (transaction-only). `created_at` from `clock_timestamp()`.
- `listAuditLogsPage(...)` is added in 26d.

### Verification

- `\d admin_audit_log` shows the columns, no foreign keys, and the indexes
- `\dT+ audit_action_enum` shows the six values
- `UPDATE`, `DELETE` and `TRUNCATE` on the table each fail with the trigger's message
- Deleting a user who appears as `actor_id` or `target_id` succeeds and leaves the audit rows unchanged

---

## Stage 26b: Reasons and Audit Rows for Status, Role and Unlock

### Backend

- Add the reason validation (controller) and the preset lists (one backend constant) as specified above.
- In `changeUserStatus`, `changeUserRole` and the unlock service function, after the change succeeds and **inside the same `withTransaction`**, call `insertAuditLog` with the same `client`:
  - `actorId` from `req.user.user_id`, `userAgent` from `req.get('user-agent')` (NULL if missing)
  - `before` / `after` per the table above
  - `reason` as the stored value
- No-op paths return before the insert (no row).
- Rejections happen before the insert (no row).
- Unlock follows "Unlock behaviour (option A)" above. If your Verify-first report shows unlock currently acts on non-locked users, change it to the no-op and tell me.
- Nothing else about these functions changes: locking, lock order, token revocation and error codes stay as they are.

### Verification

- Suspend / unsuspend / promote / demote / unlock each succeed with a valid reason → one audit row with the right `action`, `actor_id`, `target_id`, `before`, `after`, `reason`, `user_agent`
- `OTHER` with `otherReason` → `reason` stored as `OTHER: <trimmed text>`; `otherReason` of 9 characters or 501 characters → `400`, and exactly 10 and 500 are accepted
- Missing `reason`, non-string `reason`, a code from a different action, `OTHER` without `otherReason`, `otherReason` with a non-`OTHER` code, and an extra field → `400 VALIDATION_ERROR` with the right message, no change, no row
- Invalid reason on a request that would have been a no-op → still `400`
- No-op (already suspended, already active, already that role, unlock on a user who is not login-locked) → `200`, unchanged user, no row, nothing cleared
- Each existing rejection (`SUPER_ADMIN_IMMUTABLE`, admin vs admin `FORBIDDEN`, pending target `422`, suspended/pending role `422`, `404`, `401`, `403`) → no row
- Unlock of a locked user → login lock cleared, OTP send blocks cleared, one row with `{"isLocked": true}` → `{"isLocked": false}`
- Force `insertAuditLog` to throw → `500 INTERNAL_ERROR`, and the status / role / lock change and any token revocation are rolled back
- The audit row is committed in the same transaction as the change (a failed change leaves no row)
- Two concurrent status changes on the same user with different statuses → no deadlock, no `500`, exactly one row per change that actually changed state
- `created_at` comes from the database clock

---

## Stage 26c: Unmask as `POST` with a Reason

> **Amendment (2026-11-06):** unmask no longer requires a reason (see "Reasons" amendment
> above). `POST /users/:id/full-email` takes no body; the stored audit `reason` is a fixed
> `"N/A"`.

### Backend

- `POST /users/:id/full-email` replaces `GET /users/:id/full-email`. No request body. The route stays behind `authenticate` + `authorize('admin')` and must not be shadowed by `/:id` routes.
- Stage 20 rules still apply: `:id` Zod `.uuid()` check, `404 USER_NOT_FOUND`, `403 FORBIDDEN` for a super admin target (including a super admin targeting themself), an admin may unmask themself, pending and suspended targets can be unmasked.
- On success: `insertAuditLog` (`EMAIL_UNMASK`, `before` and `after` NULL, reason `"N/A"`, the user agent) in a transaction, then return `200 { email }`. If the insert throws → `500 INTERNAL_ERROR`, no email.
- Remove every `[UNMASK EMAIL]` console line. Rejected unmask attempts write nothing.

### Verification

- Admin on a user, a pending user, a suspended user, another admin → `200 { email }` with the real email, and one `EMAIL_UNMASK` row each, `before` and `after` NULL, `reason` `"N/A"`
- Super admin unmasking a user and an admin → `200` and a row
- Any caller targeting the super admin → `403 FORBIDDEN`, no row; unknown UUID → `404`, no row; non-UUID → `400`, no row
- An unexpected field in the body → `400`, no row, no email
- Regular user → `403`; no token → `401`; no rows
- Admin unmasking their own ID → `200` and a row; super admin on their own ID → `403`, no row
- Force `insertAuditLog` to throw → `500 INTERNAL_ERROR`, email not returned
- `GET /users/:id/full-email` no longer exists (`404`)
- No audit row, response or console line contains the email, masked or full
- No `[UNMASK EMAIL]` console output is produced in any case

---

## Stage 26d: `GET /admin/audit-logs`

### Backend

- `listAuditLogsPage({ actor, target, actions, reasonCode, from, to, sortDir, limit, offset }, db = pool)` in `auditLog.queries.ts`: returns `{ rows, total }`, same `WHERE` for the count as for the rows, LEFT JOINs to `users` for both usernames.
- `listAuditLogs(query)` in `auditLog.service.ts`: `PAGE_SIZE = 50`, offset from `page`, returns `{ logs, page, pageSize, total, totalPages }` with the entry fields from the decisions table.
- Controller: Zod `.strict()` on `req.query` per the decisions table. `page` follows Stage 15b (`"Page must be a positive integer"`).
- Route behind `authenticate` + `authorize('admin')`, mounted at `/admin/audit-logs`.

### Verification

- No params → `200`, `{ logs, page: 1, pageSize: 50, total, totalPages }`, newest first
- More than 50 rows: `page=2` continues with no overlap or gap; a page past the end → `200`, `logs: []`, correct `total`
- `page=0`, `-1`, `abc`, `1.5` → `400`, `"Page must be a positive integer"`
- `actor` and `target` substring matches on usernames (case-insensitive input); `%` and `_` are matched literally
- `action` with one and with several values; an invalid value → `400`
- `reasonCode=FRAUD_OR_SCAM` matches that code; `reasonCode=OTHER` matches rows stored as `OTHER: ...`; an invalid code → `400`
- `from` / `to` inclusive on both ends; `from` after `to` → `400`; invalid dates → `400`
- All filters combined → only rows matching every one
- `sortDir=asc` → oldest first; `sortBy=anything` → `400` (unexpected field)
- A row whose actor or target has been deleted → still listed, username `null`
- Unknown param → `400`, `"Request contains unexpected fields"`
- Admin and super admin both `200` with the same rows; regular user → `403`; no token → `401`
- No row is written by viewing the log
- Entries contain no email (masked or full) and no password hash

---

## Stage 26e: Frontend

### Ground rules

Same as Stage 16: work in `frontend/` only (plus nothing under `foc-mockup/`), do not modify `src/realtime/orderSocket.js`, `src/data/users.js`, `src/components/DemoControls.jsx` or `AI-NOTES.md`, reuse existing components (toast, `FormBanner`, `FieldError`, confirmation dialog, `ActionMenu`), no new libraries. List every file you touched outside the files named in the changes table.

### Reason dialog (`AdminUsers.jsx`)

> **Amendment (2026-11-06):** Unlock keeps a plain confirmation dialog with no reason picker
> (same as before this stage). Only Suspend, Unsuspend, Promote and Demote use the reason
> dialog described below.

- Every audited status/role action (Suspend, Unsuspend, Promote, Demote) opens a dialog that combines the existing confirmation with a reason picker: a dropdown of that action's preset codes (display text from the descriptions in the table above) and, when `OTHER` is selected, a text area for details (10–500 characters, with a live character count and an inline error).
- Confirm is disabled until a code is chosen and, for `OTHER`, the details are valid.
- The dialog names the user and the action, as the existing confirmation does.
- The request sends `{ reason }` or `{ reason: 'OTHER', otherReason }`.
- The frontend still collects the reason when the action turns out to be a no-op; the response is `200` as before and nothing else changes in the UI.
- The preset lists are a frontend constant that must match the backend's.

### Unmask

> **Amendment (2026-11-06):** unmask no longer asks for a reason. The eye click calls
> `POST /users/:id/full-email` directly, with no confirmation/reason dialog.

- Every eye click that would unmask calls `POST /users/:id/full-email` directly (no dialog).
- Re-masking (click again, or after 60 seconds) is unchanged and sends no request.
- The rest of the Stage 20b behaviour is unchanged (own row and super admin rows have no eye, refetch re-masks every row, failure toast).

### `src/pages/AdminLogs.jsx` at `/admin/logs`

- Behind `RequireAuth` + `RequireRole minimum="admin"`. Linked from the nav bar for admins in both views (same visibility as the other admin pages). Label: "Audit log".
- Table columns: time, actor, action, target, reason, before → after, user agent.
- Actor and target show the username; `null` shows "user deleted".
- Filters: actor (username substring box, 300 ms debounce), target (same), action (multi-select), reason code (single select), from/to date-time pickers. Empty filters are omitted from the request.
- Sort: click the time header to flip direction. Default newest first.
- Pagination: prev/next and "Page X of Y" from `totalPages`; changing a filter or sort resets to page 1. Empty state when there are no rows.
- Read-only: no row actions, no edit, no delete.
- Failure → toast via `errorMessages.js`.
- Works at phone width.

### `vite.config.js` and `nginx/default.conf`

Add `"/admin/audit-logs"` to both the dev proxy (`vite.config.js`) and the prod nginx config (`frontend/nginx/default.conf`), each with the same target as `/auth` and `/users` in that file. Do not add `/admin`, and do not add anything that would catch `/admin/logs`, `/admin/users` or `/admin/suppliers*`.

### Verification

- Each action's dialog shows only its own preset codes; Confirm stays disabled until valid; `OTHER` shows the details box with a live count and enforces 10–500
- Cancelling any dialog sends no request
- Suspend, unsuspend, promote, demote, unlock and unmask each send the right body
- No-op action still collects a reason and returns normally, with the row unchanged
- Unmask asks for a reason on every click, including a second unmask of the same row
- Reloading `/admin/users`, `/admin/suppliers` and `/admin/logs` all load the React app; the audit log page's data loads through the proxy
- Admin and super admin see "Audit log" in the nav in both views; a regular user does not and gets the 403 view at `/admin/logs`
- Each filter and sort changes the request params; combinations AND together; page past the end shows the empty state
- A deleted user shows "user deleted"
- Failure (user-service stopped) → toast
- Phone-width viewport works

---

### Tests (Vitest)

Write the tests in this stage, following the Stage 7 ground rules and layout (real Postgres, query/service/controller tests mirroring `src/`, concurrency cases in `tests/concurrency/`). Stage 7's exclusions do not apply here. Every Verification bullet in 26a–26e that does not need a real browser is a required test case:

- Include the trigger tests (`UPDATE`, `DELETE`, `TRUNCATE` each rejected) and the "user deleted, rows survive" test.
- Include rollback tests that force the audit insert to fail.
- Include the concurrent status-change case.
- Frontend tests: dialog validation, request bodies, unmask asks every click, audit log page filters and sort params, "user deleted" rendering, nav visibility. Mock the network layer. If `frontend/` has no test setup yet, stop and tell me what you would add before adding it.
- List the visual and phone-width checks in your summary for manual verification.

Do not modify application code to make a test pass.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry per sub-stage. Note in the usage log that the backend and frontend preset lists must match.

### Notes for later (do not implement now)

- **Credit adjustment** is a high-risk action but there is no endpoint yet, and credit-service is Wee Jean's. When it is implemented, add an `action` value for it and decide how credit-service writes to this table (it cannot reach `user-db` today).
- Nothing in this stage logs rejected attempts. If that is needed later, it needs a design of its own.

### Backlog edit (for the team to make in `docs/FoC-ProductBacklog.md`)

- **NFR3.2.1** (secondary OTP before high-risk admin actions): dropped. Note it as a deliberate scope change.
- **NFR3.2.2**: reword to: successful high-risk admin actions (suspend, unsuspend, promote, demote, unlock, email unmask) are recorded in an append-only audit table with actor, target, before/after, a required reason and the user agent, and are viewable by admins at `/admin/logs`. Rejected attempts and no-ops are not recorded.
- **NFR3.1.2** / **NFR3.1.3**: as noted in Stage 20, plus: unmasking now requires a reason, on every click.

# Stage 27: Admin Elevation (OTP) for High-Risk Admin Actions (NFR3.2.1)

> **Scope**: `user-service`, `frontend`, and one line per new route in `frontend/vite.config.js`
> and `frontend/nginx/default.conf`. Before an admin can suspend/unsuspend or promote/demote a
> user, they must "elevate privileges": verify an OTP sent to their own email. Verification gives
> a short-lived, per-device elevation token, sent on later requests in the `Elevated-Token` header.
>
> - 27a: admin OTP routes and the elevation token
> - 27b: enforcing elevation on the status and role endpoints
> - 27c: frontend (Elevate privileges button and timer, OTP modal, flow with the Stage 26 reason dialog, token kept in `sessionStorage`)
>
> Backlog refs: NFR3.2.1. This restores NFR3.2.1, which Stage 26 recorded as dropped.
>
> **Depends on Stage 26 (landed):** the `reason` / `otherReason` fields, the preset reason codes, the
> audit table and the reason dialog already exist. This stage does not change them. Unlock and
> unmask email carry no reason (Stage 26 amendment) and need no elevation.
>
> **Not in this stage:** a Content-Security-Policy. It applies to the whole frontend and gets its own later stage. Until then, do not add CSP headers or meta tags.
>
> **Before starting:** read the current code, not just this file. If any `[DECIDE]` placeholder
> remains, or anything below disagrees with the code, stop and ask me. Do not pick a value
> yourself. Implement one sub-stage at a time and wait for my confirmation before the next.
>
> **Ground rules:** conventions 1–8 at the top of this file and the Stage 4d lock-order rule apply.
> The Stage 16 frontend ground rules apply to 27c (work in `frontend/` only; never touch
> `foc-mockup/`; do not modify `src/realtime/orderSocket.js`, `src/data/users.js`,
> `src/components/DemoControls.jsx` or `AI-NOTES.md`; reuse `OtpInput`, `ResendButton`,
> `errorMessages.js`, toasts and banners; no new libraries; list every file touched outside the
> changes table).

### Design decisions (already made, do not change)

#### Which actions, which callers

| Rule                        | Value                                                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actions that need elevation | Suspend / unsuspend (`PUT /users/:id/status`) and promote / demote (`PUT /users/:id/role`)                                                                                             |
| Actions that do not         | Unlock, unmask email, every `GET`. Credit adjustments are not part of this stage.                                                                                                      |
| Callers                     | Admin and super admin                                                                                                                                                                  |
| No-op requests              | Do not need elevation (the no-op paths return before the elevation check)                                                                                                              |
| Check order                 | Elevation is checked **last**: Zod validation (including the Stage 26 reason) → lock → role restrictions → pending/suspended rules → no-op → **elevation check** → write and audit row |
| Failed elevation            | Rejected before any write: no change, no audit row (Stage 26: rejected requests write nothing)                                                                                         |

#### OTP

| Rule               | Value                                                                                                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API-facing purpose | `admin_action` → DB enum `'Admin Action'`. Every admin OTP route takes a `purpose` field with a single-value enum (`admin_action`); anything else → `400 VALIDATION_ERROR`, `"Invalid purpose"`.                                                                                             |
| Sent to            | The acting admin's own registered email                                                                                                                                                                                                                                                      |
| Sending            | Through `requestOtp`, never `issueOtp` directly. The 60 s cooldown, the resend window (`config.otp.resendWindowMinutes`), the per-OTP guess limit (5) and the Stage 18 escalating send block (1 h, 4 h, 24 h) all apply. Stage 18 covered three purposes; this extends it to `Admin Action`. |
| Lockout            | Wrong admin OTP guesses do **not** count toward the login lockout. They use the per-OTP guess counter only.                                                                                                                                                                                  |
| Escalation reset   | A successful verify resets this purpose's send escalation level, as for the other purposes                                                                                                                                                                                                   |
| Verify             | Consuming (the OTP is used up on a correct code)                                                                                                                                                                                                                                             |
| Email              | Same shape as the other purposes (OTP + expiry, no links). Subject: `Your FoC admin privileges elevation verification code`                                                                                                                                                                  |
| Retries / logging  | Inherited from Stage 19 (`issueOtp`)                                                                                                                                                                                                                                                         |
| Sending the code   | By a "Send code" button the admin clicks. The OTP modal does **not** send a code when it opens.                                                                                                                                                                                              |

#### Elevation token (per device)

| Rule                                | Value                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mechanism                           | A short-lived elevation token. The 15-minute window lives in the token, so it is per device, not per account.                                                                                                                                                                                                                                                               |
| Algorithm and format                | RS256, same key and `kid` handling as the access token. Claims: `sub`, `role`, `sid`, `iat`, `exp`. JWT header `typ` is `ep+JWT`.                                                                                                                                                                                                                                           |
| Token types                         | Access tokens now carry header `typ: at+JWT`. Ported now with no grace period (no active users). `verifyAccessToken` accepts only `at+JWT`; the elevation verifier accepts only `ep+JWT`. Each rejects the other's tokens and plain `JWT`.                                                                                                                                  |
| `sid` (device binding)              | `sid` is the `refresh_tokens.id` of the login the token belongs to. It stays the same for the whole login because refresh tokens are not rotated. **Both** the access token and the elevation token carry it. The elevation check requires the elevation token's `sub` and `sid` to equal the caller's access-token `sub` and `sid`. A mismatch → `403 ELEVATION_REQUIRED`. |
| Lifetime                            | Follows the other TTLs: an env var in `.env`, `.env.example`, `.env.test` and `config.ts`, with bounds like the access-token TTL. Name `ELEVATION_TOKEN_TTL_MINUTES`, value `15`, bounds 1–15.                                                                                                                                                                              |
| Sent on requests                    | `Elevated-Token` request header                                                                                                                                                                                                                                                                                                                                             |
| `admin_action_allowed_until` column | Dropped. Nothing is added to the `users` table.                                                                                                                                                                                                                                                                                                                             |
| Returned by verify                  | `200 { elevationToken }`. No other fields. The client decodes `exp` for the timer, as it does for the access token.                                                                                                                                                                                                                                                         |
| Client storage                      | `sessionStorage` (per tab; survives a reload in the same tab; a new tab starts with none). This is the one exception to the Stage 23 rule that auth tokens never go in storage; that rule still holds for the access token. No backend hydration is needed.                                                                                                                 |
| On load                             | The frontend reads the stored token, decodes `exp`, removes it if expired, and shows the timer if still valid. The server is the authority: a rejected token (`ELEVATION_REQUIRED`) is also removed from storage.                                                                                                                                                           |
| Logout                              | The frontend removes the stored token on logout, and on any forced logout that clears auth state (including the forced re-login after a password change).                                                                                                                                                                                                                   |
| Ends early when                     | Only at `exp`. Follows the access token: no revocation. Logout, password change, forgot-password reset, role change and suspension do not end the window early on the server (only the frontend clears its stored copy on logout).                                                                                                                                          |
| Re-verify while active              | Rejected (see errors). The three admin OTP routes read the `Elevated-Token` header; a valid token for the caller (`sub` and `sid` match) → `409 ALREADY_ELEVATED`. The frontend sends the header on these three calls when it holds a token.                                                                                                                                |

#### Endpoints (new, under `/admin/`)

All three: `authenticate` + `authorize('admin')`, Zod `.strict()`, `asyncHandler`.

| Route                    | Body               | Success                                                                                    |
| ------------------------ | ------------------ | ------------------------------------------------------------------------------------------ |
| `POST /admin/send-otp`   | `{ purpose }`      | `200 { message: 'A verification code has been sent to your email', code: 'OTP_SENT' }`     |
| `POST /admin/verify-otp` | `{ otp, purpose }` | `200 { elevationToken }`                                                                   |
| `POST /admin/resend-otp` | `{ purpose }`      | `200 { message: 'A new verification code has been sent to your email', code: 'OTP_SENT' }` |

- Success messages follow the existing OTP routes.
- `otp` format check in the service layer, as everywhere: `^\d{6}$` → `400 VALIDATION_ERROR`, `"OTP must be a 6-digit code"`.
- `resend-otp` with no pending admin OTP → `400 NO_PENDING_OTP`, `"No pending verification found"` (pending = latest `Admin Action` OTP row exists and is not consumed, as in Stage 12d).
- These paths sit under `/admin/`, where frontend pages live. Each needs its own exact entry in `vite.config.js` and `nginx/default.conf`, as `/admin/audit-logs` got in Stage 26. Do not add `/admin` as a whole.
- CORS: no code change is planned. `cors({ origin, credentials: true })` has no `allowedHeaders`, so it allows whatever headers a cross-origin preflight asks for, and the frontend reaches the service through the Vite proxy and nginx (same-origin). Verify by sending a request with `Elevated-Token` through the dev proxy and through nginx and confirming the header arrives in the service. If it does not arrive anywhere, stop and tell me what you found.

#### Errors

| Case                                                    | Response                                                                                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status/role change with no valid `Elevated-Token`       | `403 ELEVATION_REQUIRED`, `"Verify your identity to perform this action."`. Covers missing, invalid and expired tokens, all with the same code.                                          |
| `send-otp`, `verify-otp` or `resend-otp` while elevated | `409 ALREADY_ELEVATED`, `"Admin actions are already unlocked."`                                                                                                                          |
| Wrong, expired, attempts exceeded, cooldown, limit      | Existing codes reused: `INVALID_OTP`, `OTP_EXPIRED`, `OTP_ATTEMPTS_EXCEEDED`, `OTP_RESEND_COOLDOWN` (with `Retry-After`), `OTP_RESEND_LIMIT` (level-matched message, with `Retry-After`) |

#### Frontend flow (`/admin/users` only)

| Rule                                              | Value                                                                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Elevate button                                    | "Elevate privileges", on `/admin/users` only. Disabled while elevated. A timer sits beside it (a new component).            |
| Greyed-out items                                  | None. Suspend/unsuspend and promote/demote are always clickable.                                                            |
| Click an action, not elevated                     | The OTP modal opens. After a successful verify, the Stage 26 reason dialog opens, then the request is submitted.            |
| Click an action, elevated                         | The Stage 26 reason dialog opens straight away                                                                              |
| Click "Elevate privileges"                        | The OTP modal opens. After a successful verify, nothing else runs.                                                          |
| OTP modal                                         | Opens with a "Send code" button. Nothing is sent until the admin clicks it.                                                 |
| Window expires                                    | The timer disappears and the button is enabled again. The next high-risk click opens the OTP modal.                         |
| `ELEVATION_REQUIRED` after the reason was entered | The OTP modal opens; after verifying, the reason already entered is kept and the request is retried through the same dialog |
| Cooldown                                          | Resend disabled with a countdown from `Retry-After`                                                                         |
| Limit                                             | Text only, level-matched ("about an hour" / "about 4 hours" / "about a day"), no countdown                                  |
| Error text                                        | Add `ELEVATION_REQUIRED` and `ALREADY_ELEVATED` to `errorMessages.js`, with the display type for each                       |

---

## Changes to already-implemented code

| #   | File                                                                                                          | Change                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `.env`, `.env.example`, `.env.test`, `src/config.ts`                                                          | Elevation token TTL env var with bounds (name and bounds to confirm above)                                                                                                                                                                                                                                |
| 2   | `src/utils/jwt.ts`, `src/middleware/authenticate.ts`, `src/types/express.d.ts`                                | Sign the access token with header `typ: at+JWT` and a `sid` claim; `verifyAccessToken` returns `sid` too and rejects any other `typ`. Add sign/verify for the elevation token (`ep+JWT`, claims `sub`, `role`, `sid`, `iat`, `exp`). `req.user` gains `sid`.                                              |
| 2a  | `src/services/auth.service.ts` (`login`, `refresh`), `src/db/queries/tokens.queries.ts`                       | Pass the `refresh_tokens.id` of the login into the access token as `sid`. Verify first that `createRefreshToken` returns the row id, and that `refresh` has the id of the locked row. Report what you find. Other services only read `sub` and `role`; check that the JWKS consumers ignore extra claims. |
| 2b  | Existing auth tests that decode or build access tokens                                                        | Update only the token fixtures and decode assertions (`typ`, `sid`). If a test fails for another reason, stop and report it.                                                                                                                                                                              |
| 3   | `src/services/email.service.ts`                                                                               | Add an `Admin Action` entry to the purpose map, subject `Your FoC admin privileges elevation verification code`                                                                                                                                                                                           |
| 4   | `src/services/otp.service.ts` (`requestOtp`) and the verify path                                              | Apply the Stage 18 escalating send block to `Admin Action`; a successful verify resets its level                                                                                                                                                                                                          |
| 5   | New route, controller and service files for the three admin OTP routes                                        | Follow the existing file naming, as the audit-log files did. Mount in `src/app.ts`.                                                                                                                                                                                                                       |
| 6   | `src/controllers/users.controller.ts`, `src/services/users.service.ts` (`changeUserStatus`, `changeUserRole`) | The controller reads the `Elevated-Token` header and passes it down; the service checks it at the "last" position in the transaction, before the write and the audit row                                                                                                                                  |
| 7   | `frontend/src/` (new small storage helper), `AuthContext` logout and forced-logout paths                      | Read, write and remove the elevation token in `sessionStorage`; remove it on logout and forced logout. Reword the Stage 23 manual check "no access token in storage" so it names the access token only.                                                                                                   |
| 8   | `src/utils/errors` or the existing `AppError` usage                                                           | New codes `ELEVATION_REQUIRED` and `ALREADY_ELEVATED` thrown as `AppError`                                                                                                                                                                                                                                |
| 9   | Existing tests                                                                                                | Status and role tests need a valid elevation token fixture. Update only those fixtures. If a test fails for another reason, stop and report it.                                                                                                                                                           |
| 10  | `frontend/vite.config.js`, `frontend/nginx/default.conf`                                                      | Exact entries for `/admin/send-otp`, `/admin/verify-otp`, `/admin/resend-otp`, same target as `/auth` and `/users`                                                                                                                                                                                        |
| 11  | `frontend/src/api/` (new admin OTP functions), `src/api/http.js`                                              | Add the three calls; attach `Elevated-Token` on the status and role calls when elevated                                                                                                                                                                                                                   |
| 12  | `frontend/src/pages/AdminUsers.jsx`, new elevate timer component, `errorMessages.js`                          | Elevate button and timer, OTP modal, retry flow with the kept reason                                                                                                                                                                                                                                      |

---

## Stage 27a: Admin OTP Routes and Elevation Token

### Verification

- Admin and super admin can `send-otp`, `verify-otp` and `resend-otp`; a regular user gets `403 FORBIDDEN`; no token → `401 UNAUTHORIZED`
- `purpose` other than `admin_action` → `400 VALIDATION_ERROR`, `"Invalid purpose"`; an extra field → `400`, `"Request contains unexpected fields"`
- `otp` not 6 digits → `400 VALIDATION_ERROR`, `"OTP must be a 6-digit code"`
- The code is sent to the acting admin's own email; the email subject is `Your FoC admin privileges elevation verification code`
- Correct code → an elevation token is returned and works; the same code again → `400 INVALID_OTP`
- The token is RS256, carries `sub`, `role`, `iat`, `exp`, and expires after the configured TTL
- Wrong code → `400 INVALID_OTP`, attempt persisted; 5 wrong codes → `429 OTP_ATTEMPTS_EXCEEDED`; expired → `400 OTP_EXPIRED`
- Wrong admin OTPs do not affect the login lockout counter
- Resend inside 60 s → `429 OTP_RESEND_COOLDOWN` with `Retry-After`; after the cap → `429 OTP_RESEND_LIMIT` with a level-matched message and `Retry-After`; the block escalates 1 h, 4 h, 24 h and does not mix with other purposes
- A successful verify resets this purpose's escalation level
- `send-otp`, `verify-otp` and `resend-otp` while elevated → `409 ALREADY_ELEVATED`
- Email send failure → `503 EMAIL_SEND_FAILED`, rolled back, Stage 19 retries apply
- Two concurrent `verify-otp` with the correct code → one success, one `400 INVALID_OTP`
- Elevation on one device does not elevate another device of the same admin
- Access tokens carry header `typ: at+JWT` and a `sid` claim equal to the login's `refresh_tokens.id`; `sid` is the same after a refresh of the same login
- The elevation token is rejected as an access token, and an access token (or a plain `JWT`) is rejected as an elevation token
- An elevation token from one login is rejected for a different login of the same admin (`sid` mismatch) and for a different admin (`sub` mismatch)
- Out-of-bounds TTL values exit at startup with a clear error naming the variable and range (as in Stage 23a)
- `resend-otp` with no pending admin OTP (none, or the latest is consumed) → `400 NO_PENDING_OTP`, `"No pending verification found"`
- A valid elevation token in `Elevated-Token` on `send-otp`, `verify-otp` or `resend-otp` → `409 ALREADY_ELEVATED`; an invalid or expired one does not block sending
- Logout, password change, reset, role change and suspension do not make an unexpired elevation token fail (it expires at `exp`)
- A request with `Elevated-Token` reaches the service through the Vite proxy and through nginx (CORS check; report the result)

---

## Stage 27b: Enforcing Elevation on Status and Role Changes

### Verification

- Suspend/unsuspend and promote/demote with no `Elevated-Token`, an invalid token, or an expired token → `403 ELEVATION_REQUIRED`, no change, no audit row
- The same calls with a valid token and a valid Stage 26 reason → `200` as before, with the audit row from Stage 26
- Elevation is checked after the existing checks: a self-targeting, super-admin, admin-vs-admin, pending or suspended-target request returns its existing error first, not `ELEVATION_REQUIRED`
- No-op status and role requests still return `200` unchanged without elevation
- An invalid or missing reason still returns `400` first (Zod runs before everything)
- Unlock and unmask email work without elevation
- Concurrent status/role calls keep the Stage 9/10 behaviour (no deadlock, no `500`)
- A token issued to one admin does not elevate a different admin (`sub` mismatch), and a token from another login of the same admin does not elevate this one (`sid` mismatch)

---

## Stage 27c: Frontend

### Verification

- Elevate button and timer appear only on `/admin/users`; the button is disabled while elevated
- Clicking an action while not elevated opens the OTP modal, then the reason dialog after a correct code, then submits
- Clicking an action while elevated opens the reason dialog straight away
- Clicking "Elevate privileges" and verifying runs no action
- The OTP modal sends nothing until "Send code" is clicked; closing and reopening the modal sends nothing
- Timer counts down, disappears at zero, and the button is enabled again; the next action click opens the OTP modal
- `ELEVATION_REQUIRED` after the reason was entered → OTP modal opens, and after verifying the reason is still filled in
- Resend cooldown shows a countdown; the limit state shows level-matched text with no countdown
- Wrong code shows the error and clears the boxes; attempts exceeded points at resend
- `ALREADY_ELEVATED` is shown as a toast and the button state corrects itself
- The token is stored in `sessionStorage` after verify; reload mid-window in the same tab → the timer shows the correct remaining time from the stored token's `exp`; a new tab starts without elevation
- An expired stored token is removed on load; a token rejected with `ELEVATION_REQUIRED` is removed
- Logout and forced logout (including after a password change) remove the stored token
- The access token is still not in `localStorage` or `sessionStorage` (check DevTools); only the elevation token is
- The three admin OTP calls send `Elevated-Token` when a token is held
- Success updates the row and shows a toast; failure shows a toast and refetches
- Reloading `/admin/users`, `/admin/logs` and `/admin/suppliers` still loads the React app; the three admin OTP calls go through the proxy
- Phone-width viewport: modals, button and timer are usable

---

### Tests (Vitest)

Follow the Stage 7 ground rules: real Postgres, the existing mocking policy (mock `sendOtpEmail` to capture the OTP), tests under `tests/` mirroring `src/`, concurrency tests in `tests/concurrency/`. Every Verification bullet in 27a, 27b and 27c that does not need a real browser is a required test case. Simulate time by backdating, or with fake timers on the frontend. Existing status and role tests need an elevation fixture: update only those. Frontend tests mock the network layer and use the existing setup. List the visual and phone-width checks in your summary for manual verification. Do not modify application code to make a test pass.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry per sub-stage.

### Backlog edit (for the team to make in `docs/FoC-ProductBacklog.md`)

- **NFR3.2.1:** reword to: suspend/unsuspend and promote/demote require the admin to elevate privileges first (OTP to their own email, 15-minute per-device window). Direct credit balance adjustments are dropped. Undo the "dropped" note added for Stage 26.

# Stage 28: Scheduled Errands — Claude Code Implementation Instructions

> **How to use this file**: Read and implement ONE stage at a time. After each stage, stop, verify the checklist, and wait for my confirmation. Do not implement future stages speculatively.
>
> Every `[DECIDE]` placeholder is mine to fill. If one remains in the stage you are about to implement, stop and ask me. Do not pick a value yourself.

## AI Usage Logging

After each stage, generate for me to copy into `/ai/usage-log.md`:

```
## <date> — Scheduled Errands Stage <n>: <name>

**Tool:** Claude Code (claude-sonnet-5)
**Scope:** Implementation code

**What I prompted:**
<brief summary>

**What it produced:**
<files created/modified>

**What I kept/changed/rejected:**
<leave blank>
```

Add this header comment to every file you create or modify:

```
// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: <date>
// <DD/MM/YYYY>: <scope> <n>
// Author review: <leave blank for me to fill in>
```

## Ground rules

1. Read the current code first, not just this file. Where they disagree, follow the code and tell me.
2. Read the existing `OrderRequest` model in `order-service/prisma/schema.prisma` BEFORE designing the series table. Copy its order fields (names, types, validation) rather than inventing new ones. Read `order-service/AGENTS.md` and obey it.
3. Do not edit supplier-service except in Stage 3a (as a PR, not merged). George and Wen Xi have approved my edits to `queue/tasks.ts` and `credit-jobs.ts` (the chat payload) and the series section in `MyErrands.jsx`; edit those files only as this file describes. Do not change the credit-reservation failure path (`pending → failed` via the credit worker) or any normal-order behaviour, except where a stage says so.
4. Follow existing conventions: `{ message }` error bodies, `ErrorCode`/`ErrorMessage` in `constants/errors.ts`, `statusFor` in `orders.controller.ts`, hand-written validators, ESM `.js` imports, Prisma migrations named `YYYYMMDDHHMMSS_description` via `npm run db:migrate`, `startScheduledTask` for schedulers, time-dependent functions take `now: Date`.
5. Do not add tests unless the stage says so. Each stage below does say so: write tests in the same stage.
6. When done, list every deviation from this file and why.

## Design decisions (made by me, do not change)

### Model

| Rule                                      | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Location                                  | Inside order-service                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Tables                                    | New `order_series`; `requests` gains nullable `seriesId` (FK → `order_series.id`, `ON DELETE SET NULL`) and nullable `failureReason`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Series order fields                       | Same as `OrderRequest` (supplier, description, delivery location, delivery details, credits, additional details). `completeBy` is replaced by `durationMinutes`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Rule                                      | RRULE stored as plain text in the series row. End condition (`UNTIL` / `COUNT` / never) lives inside the RRULE. Library: `rrule` (npm), backend and frontend                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Start                                     | Stored start (DTSTART) on the series                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Next fire                                 | `nextFireAt` stored on the series row, indexed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Retry state                               | New nullable columns on the series row, all null when nothing is retrying: `currentOccurrenceAt` Timestamptz(3) (the scheduled time being retried), `retryType` enum (`user_service_unreachable`, `supplier_service_unreachable`, `supplier_closed`), `attemptCount` Int, `nextRetryAt` Timestamptz(3). Names and enum values follow the existing `OrderRequest` conventions (camelCase, `At` suffix, lowercase snake enum values); check them against the real model and tell me before migrating if any differ. While an occurrence is retrying, the next occurrence's fire time is computed from the RRULE when needed, not stored |
| Series status                             | `active` / `inactive` (pause = inactive). Deleting a series deletes the row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Finished series                           | Deleted by the worker only when the rule has no next occurrence (`nextFireAt` is null) AND no retry is in progress. A one-time errand (`COUNT=1`) has a null `nextFireAt` straight after firing, so it must not be deleted while its retry is running                                                                                                                                                                                                                                                                                                                                                                                 |
| One-time errand                           | A series with `COUNT=1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Timezone                                  | Singapore time. Recurrence follows iOS Calendar: every day/week/month/year plus custom (see Stage 6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Month without the day (5th weekday, 31st) | Skipped for that month (RFC 5545)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Limits                                    | None per user                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### completeBy

| Rule                          | Value                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage                       | Series stores `durationMinutes`. Each occurrence's `completeBy` = scheduled fire time + duration (counted from the SCHEDULED time, not the actual post time)                                                                                                                                                                                                               |
| Max duration                  | 24 hours (1440 minutes)                                                                                                                                                                                                                                                                                                                                                    |
| Frontend                      | User picks a date and time; frontend converts to minutes. Date picker prevents completeBy ≤ post time, so no backend rule for it                                                                                                                                                                                                                                           |
| No deadline                   | Not possible. George and Wen Xi are making `completeBy` default to 24 hours instead of NULL for all orders (new FR), so every occurrence has a deadline. If `durationMinutes` is omitted on a series: `[DECIDE: default 1440 or required; waiting for George's completeBy change]`. Do NOT build on George's completeBy default until it is merged: read the code as it is |
| Max duration on normal orders | `[ON HOLD]`: George said "default", not "cap". Confirm whether normal orders also have a 24h maximum                                                                                                                                                                                                                                                                       |

### API (all under `/orders`, registered BEFORE `/:id`; param named `:seriesId`, so controller does its own UUID check)

| Endpoint                              | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /orders/series`                 | `201`. Body: order fields, `rrule`, `durationMinutes`, `startAt` (ISO) and/or `startNow` (boolean). `startNow` wins if both. Neither → `400 MISSING_START_TIME`. Does NOT check supplier/location at create time                                                                                                                                                                                                           |
| `GET /orders/series/mine`             | `{ ok: true, series }`. No pagination. Includes paused series; a one-time series shows until it posts. Each series includes the next 3 upcoming dates (computed from the rule) and a count of its orders in `pending` + `open`. Retry state and `nextFireAt` are NOT exposed                                                                                                                                               |
| `GET /orders/series/:seriesId`        | Bare series object, same extra fields                                                                                                                                                                                                                                                                                                                                                                                      |
| `PATCH /orders/series/:seriesId/edit` | `200`. Validates only fields sent. All fields editable, including `credits`. `status` (`active`/`inactive`) may be sent together with other fields. Edits affect future occurrences only. Count restarts (DTSTART reset to the edit time) only when the RRULE or its count limit changes. Resume computes `nextFireAt` from the resume time (missed occurrences during a pause are dropped). Optimistic lock via `version` |
| `DELETE /orders/series/:seriesId`     | `200 { ok: true }`. Sets `seriesId` null on posted orders (FK). Stops any retry in progress (see Failures)                                                                                                                                                                                                                                                                                                                 |
| Access                                | Owner only; anyone else → `403 FORBIDDEN`                                                                                                                                                                                                                                                                                                                                                                                  |
| Error shape                           | `{ message }`                                                                                                                                                                                                                                                                                                                                                                                                              |

### Error codes

`SERIES_NOT_FOUND` (404, also for malformed series id), `SERIES_CONFLICT` (409), `INVALID_RULE`, `MISSING_RULE`, `INVALID_DURATION`, `INVALID_START`, `MISSING_START_TIME`, `INVALID_STATUS` (reused for a bad `status` in an edit), `FORBIDDEN`, `INVALID_SERVICE_KEY` (401, handled inline), `INVALID_USER` (pending user), `INVALID_USER_ID` (user not found), `USER_SERVICE_UNAVAILABLE`, `SUPPLIER_NOT_FOUND`, `SUPPLIER_SERVICE_UNAVAILABLE`. Add `404` for `SERIES_NOT_FOUND` and `409` for `SERIES_CONFLICT` in `statusFor`; everything else falls to 400 as today.

### Firing and failures

| Rule                                 | Value                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheduler                            | New 1-second scheduler, `concurrency: 1`, via `startScheduledTask`, in `worker.ts`                                                                                                                                                                                                                                                                                                                          |
| Exactly once                         | Claim a due series with `updateMany` guarded by `version` (like `orders.service.ts`); `count === 0` → skip                                                                                                                                                                                                                                                                                                  |
| Posting                              | Each occurrence is created through the normal create path (status `pending`, outbox `credit_reserve`). Set status explicitly. Credits are reserved only when the occurrence posts                                                                                                                                                                                                                           |
| Credit failure after posting         | Normal order flow (`failed`). Do not touch                                                                                                                                                                                                                                                                                                                                                                  |
| Late                                 | Never dropped for lateness alone. If posted > 1 minute after its scheduled time, add a "posted late" note in the order chat after the order reaches `open` (covers worker-down and supplier-closed)                                                                                                                                                                                                         |
| completeBy already past at fire time | Skip this occurrence (one time only), `failed` row, notice. Series continues to the next occurrence                                                                                                                                                                                                                                                                                                         |
| Catch-up after downtime              | Each missed occurrence is judged on its own `completeBy`                                                                                                                                                                                                                                                                                                                                                    |
| Next fire (design B)                 | `nextFireAt` (nullable) advances to the next occurrence, computed from the RRULE, as soon as an occurrence is picked up, including when it goes into retry. A retry is driven by `currentOccurrenceAt` and `nextRetryAt`. The worker looks for series where `nextFireAt <= now` OR `nextRetryAt <= now`. When an occurrence is skipped or fails, just clear the retry columns; `nextFireAt` needs no change |
| One retry slot per series            | If the next occurrence becomes due while a retry is still active, drop the retry (`failed` row + notice) and start the new occurrence                                                                                                                                                                                                                                                                       |

#### Fire-time checks, in order

1. **User** — `GET {USER_ORDER_SERVICE_URL}/users/worker/:id` with header `User-Order-Service-Key` (secret `USER_ORDER_SERVICE_API_KEY`). Response `{ status, lockedUntil }`.
2. **Supplier** — existing `supplierExists` / `locationExists` in `suppliers.client.ts`, reused with header `Supplier-Order-Service-Key` (secret `SUPPLIER_ORDER_SERVICE_API_KEY`) in place of the user's token. Client also returns a closed flag and the next opening time.

| Outcome                                                                        | Action                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User `suspended`                                                               | Drop now, `failed` row, notice                                                                                                                                                                                                   |
| User locked (`lockedUntil` in the future, compared with order-service's clock) | Drop now, `failed` row, notice                                                                                                                                                                                                   |
| User `pending`                                                                 | Drop now, `INVALID_USER`                                                                                                                                                                                                         |
| User not found (404)                                                           | Drop now, `INVALID_USER_ID`                                                                                                                                                                                                      |
| Supplier/location not found (inactive or deleted)                              | Drop now, `failed` row, notice                                                                                                                                                                                                   |
| Supplier has empty `openingHours`                                              | Fail, `failed` row, notice                                                                                                                                                                                                       |
| Supplier closed now                                                            | Retry at the next opening time if before `completeBy`; otherwise `failed` row + notice. Re-check the USER on every such retry. If the next opening is after the next occurrence's fire time, drop the current one now and inform |
| User-service unreachable                                                       | Retry with backoff (Stage 19 shape: up to 4 attempts, waits capped 1/2/4 s with full jitter, 3 s per call, 30 s overall deadline). Exhausted → `failed` row + notice                                                             |
| Supplier-service unreachable                                                   | Same backoff. Do NOT re-check the user on these retries. Notify only when exhausted                                                                                                                                              |
| Series edited, paused or deleted while retrying                                | Stop the retry, `failed` row, notice. Delete handler creates the row and notice in the same step (the series row, and its retry state, disappears)                                                                               |
| First failure of any kind (except supplier unreachable)                        | Notice on the first failure                                                                                                                                                                                                      |

#### Next opening time (computed in order-service from supplier `openingHours`)

`day` 1–7 = Mon–Sun, 8 = open 24/7. `open`/`close` are `"HH:MM"` 24h, Singapore time (UTC+8), `close` exclusive. Overnight is `open > close`; the early-morning half belongs to the next day. A `00:00`/`23:59` pair on the current day means always open. No row for a day = closed that day. At most one window per day. Ignore the `is_24h` column.

### Failed rows

| Rule                                     | Value                                                                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Insert                                   | Directly into `requests` with `status = 'failed'`, `failureReason` set, no credit reservation, no outbox row, no chat conversation, no socket event      |
| Only series outcomes set `failureReason` | Credit-reservation failures keep it null                                                                                                                 |
| Visibility                               | `GET /orders/mine` also returns `failed` rows that have a `failureReason`. Credit failures stay hidden                                                   |
| Frontend                                 | Add a `failed` chip and `STATUS_LABELS`; include `failed` in the `ACTIVE`/`CLOSED` lists in `activityShared.jsx`; show the reason. No "Open chat" button |

### Notifications

All FAILURE and SKIP notices (no order chat exists for them) go through ONE function, `notifySeriesEvent({ userId, messageId, message })`. Wen Xi's system chat is merged (PR #170). It calls chat-service `POST /chat/send-system-notification` with body `{ orderId: null, recipient: userId, messageId, message }` (`recipient` is required when `orderId` is null), header `X-Service-Key` = `CHAT_SERVICE_API_KEY` (already in order-service config). `messageId` is a caller-generated UUID and is the idempotency key: same key + same payload → `200`, conflicting payload → `409`. The system conversation is created lazily by chat-service. Message text is free text (no length cap enforced). Do not send an order id or a series id.

Order-service's chat path currently cannot send orderless notices: `ChatNotificationPayload` (`queue/tasks.ts:144-148`) requires a non-null `orderId` and has no `recipient`, and the worker validator (`credit-jobs.ts:212-215`) enforces it. Decided: extend the existing `chat_notification` payload with a nullable `orderId` (null, not 0: chat-service validates a UUID or null) and a `recipient`, and update the validator. Send through the existing outbox/BullMQ path, in the same transaction as the failed-row insert, like the current chat tasks. This edits George and Wen Xi's files; they have approved it. Generate `messageId` once when the notice is created, so every retry reuses it.

The notice carries the user id, the text and an idempotency key only. No order id, no series id.

KNOWN ISSUE (leave a code comment saying so): the late note is sent after the order reaches `open`. If credit reservation fails, the order never opens and the late note is lost.

The LATE note is separate: it is NOT sent through `notifySeriesEvent` or the system chat. It goes in the normal order chat via the existing `chat_notification` outbox task, after the order reaches `open` (the order has a conversation by then).

---

## Stage a: Schema and migration (order-service)

- Read the `OrderRequest` model first. Add `OrderSeries` and the two `requests` columns. Retry state columns as in the design table.
- Index `nextFireAt` (+ status). One migration, named per convention.
- `listMyOrders` filter change (include failed with `failureReason`) goes in Stage 5.

**Verify**: migration applies on a fresh DB; deleting a series sets `seriesId` null on its orders.
**Tests**: real-DB tests for the FK behaviour.

## Stage b: User-service worker endpoint

- `GET /users/worker/:id`, behind a new service-key middleware (header `User-Order-Service-Key`, secret `USER_ORDER_SERVICE_API_KEY`, add to `config.ts` Zod schema, `.env.example`, `.env`, `.env.test`). Compare with the existing `hashesMatch`. Bad key → `401 INVALID_SERVICE_KEY`.
- Register BEFORE `GET /:id` and `GET /:id/full-email` in `users.routes.ts`. No `authenticate`/`authorize`.
- Returns `{ status, lockedUntil }` only. No email, no other fields. Unknown user → `404 USER_NOT_FOUND`; non-UUID → `400 VALIDATION_ERROR`, "Invalid user ID". Pending users are returned with `status: 'pending'`.
- Keep user-service conventions (Zod `.strict()`, `asyncHandler`, camelCase responses).

**Tests**: key missing/wrong/right, locked, suspended, pending, unknown, non-UUID, route order.

## Stage c1: supplier-service service-key access (PR for Congchen to review)

supplier-service is Congchen's. This stage is the ONLY one that touches it. Work on a new branch, open a PR against the main branch, and do not merge. Read `supplier-service/AGENTS.md` (if it exists), `SupplierServiceArchitecture.md`, the existing auth middleware (JWT + `requireRole`), the config/env loading, the error response shape and the test setup BEFORE changing anything, and follow them. supplier-service uses MySQL with raw queries, not Prisma.

Behaviour (from me):

- `GET /api/v1/suppliers/:id` and `GET /api/v1/suppliers/reference/location` also accept a service key as an alternative to a user JWT.
- Header `Supplier-Order-Service-Key`; secret env variable `SUPPLIER_ORDER_SERVICE_API_KEY`, validated in the existing config loader and added to `.env.example`, the compose env, and the test env. Same value as order-service's.
- Compare with a constant-time comparison.
- Valid key → request proceeds with no user token and no role check, on these two routes only.
- Key present but wrong, and no valid JWT → `401` with `INVALID_SERVICE_KEY` (use the service's existing error shape; tell me if it has no `code` field).
- No key → the existing JWT behaviour, unchanged. A valid JWT still works even if a wrong key is also sent
- No other route accepts the key. No change to responses, queries or data. Do not touch `is_24h`, seed scripts or the load-test seed.

**Tests** (the service's existing runner): valid key on both routes; wrong key with and without a JWT; no key with a valid JWT (unchanged); no key and no JWT; the key on another route is rejected; the secret is never logged.

**Verify**: both routes work with the key and no token; existing tests still pass. Give me the PR description text, listing exactly what changed, for Congchen to review. I will tell him the PR is open.

## Stage c2: order-service supplier client

- `suppliers.client.ts`: add the key path for the worker, reusing `supplierExists` and `locationExists` with `Supplier-Order-Service-Key` (secret `SUPPLIER_ORDER_SERVICE_API_KEY`, in config, `.env.example` and the test env) where the user's token was. Parse `openingHours`/`isOpen` from the response (today only the status is read). Return the existing `found` / `not_found` / `unavailable` plus a closed flag and the next opening time per the rules above, and handle an empty `openingHours` list as a failure. Congchen confirmed the hours format described above, and said every Store should have hours rows ("iirc", so unverified): while in supplier-service for Stage 3a, check whether Store creation can produce zero hours rows and tell me what you find. Keep the existing user-token behaviour for normal orders untouched.

**Tests**: next-opening-time with fixtures for overnight, closed days, day 8, `00:00`/`23:59`, empty list, the current time at the exact open and close minutes; client result mapping (mock fetch).

## Stage d: User client (order-service)

- `user.client.ts`, env `USER_ORDER_SERVICE_URL`, `USER_ORDER_SERVICE_API_KEY`. Results `found` / `not_found` / `unavailable` plus `status` and `lockedUntil`. 3 s timeout.

**Tests**: mock fetch for each result.

## Stage e: Series API and failed rows

- Routes, controller, service, validators, error codes per the tables. Mirror `createOrder`/`editOrder` patterns.
- Delete: count and stop-retry behaviour as specified.
- Failed-row insert helper (direct insert). `listMyOrders` change.
- `notifySeriesEvent` (see Notifications). Message wording per outcome: draft it and show me before use.

**Tests**: every endpoint, ownership, validation codes, edit semantics (count reset, resume), startNow/startAt rules, `statusFor` mapping.

## Stage f: Worker

- Scheduler, claim, fire-time checks, retry, late note, finished-series deletion, skip rules, all per the tables.
- Pass `now: Date` to every time-dependent function.

**Tests**: pass fixed `Date`s. Cover each outcome row, exactly-once under two concurrent claims, catch-up, skip, late note threshold, retry stops on edit/pause/delete.

## Stage g: Frontend

- Revive and extend the commented-out "Schedule for later" stub in `CreateRequest.jsx` (George agreed). Remove or replace the dead `postAt` remnants in `data/requests.js` and the unused `postAtLabel`.
- Recurrence picker (iOS-style): every day / week / month / year, plus custom: daily every x days; weekly every x weeks on chosen days; monthly every x months on a date or the first/second/third/fourth/fifth/last Mon–Sun, day, weekday or weekend day; yearly every x years in chosen months on the first…last weekday/day/weekday/weekend day. End: on date, after N, never. Add `rrule` to `frontend/package.json`.
- Date/time picker (none exists). completeBy picked as date+time, sent as `durationMinutes` (max 1440).
- No separate schedules page, path or nav link. Add a "Scheduled" section at the top of "My errands" (`MyErrands.jsx`), above "Active now". It lists the user's series (paused ones included; a one-time series shows until it posts) with status, rule summary and next 3 dates, and pause/resume/edit/delete actions. Pause/edit/delete show a reminder with the count of pending+open orders that stay unaffected. Orders posted from a series show a "from series" tag (from `seriesId`; it disappears once the series is deleted). George and Wen Xi have approved this section and the failed chip in `MyErrands.jsx`/`activityShared.jsx`.
- Series edit form: reuse `CreateRequest.jsx` in a series mode (same form as creating a series). It needs a route: tell me the path you propose before adding it, and it must not start with /auth, /users, /credits, /orders, /api/v1 or /socket.io (check vite.config).
- `api/series.js` mirroring `api/orders.js`; error texts for the new codes.
- Failed chip and reason in `MyErrands.jsx`/`activityShared.jsx`.

**Tests**: Vitest + RTL, `vi.useFakeTimers()` where needed; picker output → RRULE, schedules page actions, reminder text, failed chip.

---

## After the last stage

List every deviation, and every `[DECIDE]`/`[ON HOLD]` that was still open when you implemented.

# User Service — Claude Code Implementation Instructions

> **How to use this file**: Read and implement ONE stage at a time. After completing each stage, stop, verify the checklist, and wait for confirmation from me before proceeding to the next stage. Do not implement future stages speculatively.

## AI Usage Logging

After completing each stage, generate the following for me to copy into `/ai/usage-log.md`:

\```

## <date> — Stage <n>: <stage name>

**Tool:** Claude Code (claude-sonnet-5)
**Scope:** Implementation code

**What I prompted:**
<brief summary of the stage instructions given>

**What it produced:**
<list of files created/modified>

**What I kept/changed/rejected:**
<leave blank for me to fill in after review>
\```

Also add this header comment to every file you create:

\```
// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: <date>
// <DD/MM/YYYY>: <scope> <n>
// Author review: <leave blank for me to fill in>
// <DD/MM/YYYY>: <scope> <n>
// Author review: <leave blank for me to fill in>
\```

---

## Context

You are implementing the **User Service** for a campus errand platform (FoC) built on a microservices architecture. This service handles everything user-related: registration, login, OTP verification, JWT auth, RBAC, and profile management.

CLAUDE NOTE
Before implementing this stage, read the current code, not just instructions.md. Several
fixes were made after the instructions were written, and the file has not been updated.
Where the two disagree, follow the codebase and tell me about the difference.

Conventions established in the code (keep them):

1. Emails and usernames are lowercased at the Zod boundary. Emails are also trimmed.
   Use the shared emailField and usernameField in auth.controller.ts for every new schema.
   A login identifier is lowercased whole.
2. Locking: use withTransaction plus SELECT ... FOR UPDATE, and pass `client` to EVERY query
   inside it. Never use the pool inside a transaction, because it deadlocks. AFTER the lock
   is granted, re-check the row that lockUserById returns (null, or status changed). The
   pre-lock read can be stale.
3. A single-row state change (logout, consume OTP, activate user) should be a conditional
   UPDATE ... WHERE <expected state>, checking rowCount. Do not read, check, then write.
4. Wrong OTP guesses must persist: return { ok: false } from checkOtp and throw only after
   the transaction commits, or the rollback undoes the increment.
5. Time comes from the database clock. Write expiries as NOW() + make_interval(...) in SQL.
   Compare against clock_timestamp() AS db_now. Do not use Date.now() for OTPs or refresh
   tokens (JWT iat/exp is the only exception).
6. deleteStalePendingUsers uses FOR UPDATE SKIP LOCKED, so rows in use are not deleted.
7. Queries take db: Queryable = pool. Queries used only inside transactions may make it required.
8. The super admin bootstrap uses ON CONFLICT DO NOTHING plus a re-check.

Watch for these when implementing:

- forgot-password must go through the same lock, cooldown and resend limit as resend-otp.
  Otherwise it is an unlimited email spammer, and each call kills the victim's live OTP.
- Resend/cooldown counts need a per-flow window (for example the last hour, or since the last
  successful use). An all-time count permanently locks users out of password reset.
- Anything that changes a password, suspends a user or resets a password must revoke ALL that
  user's refresh tokens in the SAME transaction as the change (revokeAllRefreshTokensForUser
  with a db param).
- A login racing a reset or suspend can issue a refresh token after the revoke. Handle it.
- Do not add new test cases unless I ask. Existing tests may need fixtures updated.
- Rate limiting and account lockout (NFR1, NFR2) are deferred to week 10. Do not add them now,
  but do not build anything that assumes they never exist.

When done, list any place where you deviated from instructions.md and why.

Also, don't implement test cases first.

## Product Backlog — User Service (F1–F5, NFR1–NFR4)

### F1 — User Registration

- **F1.1.1** (High, Recess) Reject usernames that are already in use.
- **F1.1.2** (High, Recess) Reject emails that are not in a valid format (must contain @ and domain).
- **F1.1.3** (High, Recess) Reject emails that are already registered to another account.
- **F1.1.4** (High, Recess) Reject passwords that don't contain at least 8 characters, one uppercase, one lowercase, one digit, and one special character.
- **F1.1.5** (High, Week 7) Send an OTP to the provided email and only complete registration after the OTP is verified.
- **F1.1.6** (High, Week 7) Allow requesting a new OTP email 60 seconds after the previous one, up to 5 times.
- **F1.1.7** (High, Week 7) Invalidate the OTP after one use OR after 10 minutes OR after a new OTP is generated, whichever comes first.
- **F1.1.8** (High, Week 7) Reserve the username and email during the OTP period to prevent duplicates.
- **F1.2.1** (High, Recess) Store passwords as salted hashes.

### F2 — Login / Logout

- **F2.1.1** (High, Recess) Accept login attempts where username/email and password match a registered account.
- **F2.1.2** (High, Recess) Reject login attempts where they don't match.
- **F2.1.3** (High, Recess) Authenticate subsequent requests from a logged-in user without re-entering credentials for the session duration.
- **F2.2.1** (High, Week 7) Users who have logged out must log in again to access the app.
- **F2.3.1** (High, Week 7) Allow other services to verify a user's identity and role from their active session.

### F3 — Password Reset ("Forgot Password")

- **F3.1.1** (High, Week 7) If the email matches a registered email, send an OTP before permitting password change.
- **F3.1.2** (High, Week 7) If the email does not match, do not send an OTP.
- **F3.1.3** (High, Week 7) Reject the new password if it doesn't meet F1.1.4 complexity rules.
- **F3.1.4** (High, Week 7) Invalidate the OTP after one use or 10 minutes or a new OTP generated, whichever comes first.

### F4 — Viewing and Updating Profile Information

- **F4.1.1** (Med, Week 10) Allow users to view their username and registered email.
- **F4.2.1** (Med, Week 10) Reject a new email if already in use, same as old email, or fails F1.1.2 complexity rules.
- **F4.2.2** (Med, Week 10) Require password re-entry; reject the email change if it doesn't match the current password.
- **F4.2.3** (Med, Week 10) Send an OTP to the new email and require entry before allowing the change.
- **F4.2.4** (Med, Week 10) Allow requesting a new OTP email 60 seconds after the previous one, up to 5 times.
- **F4.2.5** (Med, Week 10) Invalidate the OTP after one use or 10 minutes or a new OTP generated, whichever comes first.
- **F4.2.6** (Med, Week 10) Use the existing email for all communications/authentication until OTP verification completes.
- **F4.3.1** (Med, Week 10) Require password re-entry; reject the password change if it doesn't match the current password.
- **F4.3.2** (Med, Week 10) Send an OTP to the registered email and require entry before allowing the password change.
- **F4.3.3** (Med, Week 10) Reject the new password if it fails F1.1.4 complexity rules, or is identical to the old password.
- **F4.3.4** (Low, Week 10) Invalidate any active sessions on other devices after a successful password change.
- **F4.4.1** (Med, Week 10) Reject a new username if already in use by another user or identical to the old username.

### F5 — Role Management

- **F5.1.1** (High, Week 7) Enforce administrative privilege separation across user/administrator/super administrator.
- **F5.1.2** (High, Week 7) On startup, if no super administrator exists, bootstrap one using pre-configured system credentials.
- **F5.1.3** (High, Week 7) Prevent registration of an administrator account via public registration endpoints.
- **F5.1.4** (High, Week 7) Prevent a standard user from modifying the role of any user (including themself).
- **F5.1.5** (High, Week 7) Prevent an administrator from modifying the role of any user (including themself).
- **F5.1.6** (High, Week 7) Allow a super administrator to modify the role of any other user (excluding themself) to administrator or standard user.
- **F5.2.1** (High, Week 7) All users can post and fulfill errands without restriction.
- **F5.2.2** (High, Week 7) Persist the user's last active view (requestor/courier) across sessions.
- **F5.3.1** (High, Week 7) Allow administrators to view all users.
- **F5.3.2** (High, Week 7) Allow administrators to view transaction details of individual users.
- **F5.3.3** (High, Week 7) Allow administrators to suspend/unsuspend individual users.

### NFR1 — Brute-Force Protection

- **NFR1.1** Automatically lock an account for 1 hour after 5 consecutive failed login or OTP attempts within a 15-minute window.
- **NFR1.1.1** (Med, Week 10) Upon lock, dispatch a security notification email with an unlock link within 60 seconds.

### NFR2 — Timely OTP Delivery

- **NFR2.1** Dispatch the OTP email within 1 minute of the triggering event.
- **NFR2.1.1** (Med, Week 10) Retry failed OTP email attempts up to 3 times.
- **NFR2.1.2** (Med, Week 10) Log any OTP email delivery failures for monitoring.

### NFR3 — Additional Auth & Data Masking for Sensitive Info

- **NFR3.1.1** (Med, Week 10) Mask sensitive user fields (e.g. email addresses) by default across all standard admin views.
- **NFR3.1.2** (Med, Week 10) Require secondary OTP verification before unmasking sensitive user fields.
- **NFR3.1.3** (Med, Week 10) Unmasked info remains visible for max 15 minutes before automatically re-masking.
- **NFR3.2.1** (Med, Week 10) Require secondary OTP verification prior to high-risk admin actions (e.g. manual suspension, direct credit adjustments).
- **NFR3.2.2** (Med, Week 10) Record all secondary OTP verification attempts and high-risk admin actions in an audit log.

### NFR4 — Session Support

- **NFR4.1.1** (High, Week 8) Automatically invalidate a session after 30 minutes of inactivity, requiring re-authentication.
- **NFR4.1.2** (High, Week 8) Automatically invalidate a session after 7 days since last login, requiring re-authentication. _(labeled "NFR4.1." in the source — likely a typo for NFR4.1.2)_
- **NFR4.2.1** (High, Week 8) Notify the user 1 minute before session expiry due to inactivity, with an option to extend.

## Stage 1: Project Scaffold

Set up the below files and directory structure.

### Stack:

- Runtime: Node.js (Express) - TypeScript
- Database: PostgreSQL + pg (raw pg, no ORM or query builder)
- Containerisation: Docker + Docker Compose
- Frontend: React Vite (already partially implemented — do not touch it unless instructed)
- Auth: RS256 JWT (access token 15 min, refresh token 7 days stored as SHA-256 hash in DB)
- Password hashing: bcrypt (work factor 10)
- OTP/token hashing: SHA-256
- Email handing: Nodemailer
- Crypto handling: Node's build in crypto
- Request body validation: Zod
- Test runner: Vitest
- Linter: ESLint
- Formatter: Prettier

### Given repo structure (single-repo, one folder per microservice):

```
/
├── foc-mockup/    ← this is my frontend, already exists, do not modify
├── user-service/  ← you are building this
├── compose.yaml    ← top-level, to be created/extended
├── data           ← supplier seed data
└── ...            ← other services are here
```

### User service structure

user-service/
├── src/
├── keys/
├── Dockerfile ← already there
├── package.json
├── tsconfig.json
├── .env.example
├── .env ← gitignored
└── .gitignore

src/
├── routes/
├── controllers/
├── middleware/
├── services/
├── db/
│ ├── pool.ts
│ ├── init.sql
│ └── queries/
├── utils/
├── config.ts
└── app.ts

````

### Set up `package.json`

Create `user-service/package.json`:

```json
{
  "name": "user-service",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/app.ts",
    "dev": "nodemon -L --watch src --ext ts,json --exec tsx src/app.ts",
    "build": "tsc",
    "test": "vitest",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "dependencies": {
    "bcrypt": "^6.0.0",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.5",
    "express": "^4.21.2",
    "jsonwebtoken": "^9.0.2",
    "nodemailer": "^10.0.10",
    "pg": "^8.13.1",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.17.0",
    "@types/bcrypt": "^5.0.2",
    "@types/cookie-parser": "^1.4.7",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^20.11.0",
    "@types/nodemailer": "^6.4.17",
    "@types/pg": "^8.11.10",
    "eslint": "^9.17.0",
    "nodemon": "^3.1.9",
    "prettier": "^3.4.2",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "typescript-eslint": "^8.19.0",
    "vitest": "^1.6.0"
  }
}
````

### Set up `.env.example`

Create `user-service/.env.example`:

```env
# Server
PORT=3001
NODE_ENV=development

# PostgreSQL
DB_HOST=user-db
DB_PORT=5432
DB_NAME=user_service
DB_USER=postgres
DB_PASSWORD=postgres

# JWT (RS256)
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem
ACCESS_TOKEN_TTL_MINUTES=15
REFRESH_TOKEN_TTL_DAYS=7

# Email (Nodemailer)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

### Set up `keys`

- Create `user-service/keys/`
- Generate an RS256 key pair and place them here

### Set up `.gitignore`

- Create `user-service/.gitignore` and add `keys/` in

### Set up app.ts

- Create a barebones app.ts stub in `/src/`

### Set up tsconfig.json

- Create a tsconfig.json in `/user-service/`

```
{
  "compilerOptions": {
    "target": "es2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,

    "rootDir": "./src",
    "outDir": "./dist",
    "sourceMap": true,


    "allowJs": true,
    "resolveJsonModule": true,
    "moduleDetection": "force",
    "isolatedModules": true,
    "verbatimModuleSyntax": true,

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  },
  "include": ["src/**/*"]
}
```

### Verification

- Run `npm install` inside `user-service/` and confirm it completes without errors
- Confirm `keys/private.pem` and `keys/public.pem` exist

## Stage 2: Databaset setup

### Stage 2a: Write the schema

Create the SQL schema file `user-service/src/db/init.sql` with the following requirements:

- Create enums safely using DO $$ BEGIN ... EXCEPTION WHEN duplicate_object blocks:
  - `status_enum`: 'active', 'suspended'
  - `role_enum`: 'user', 'admin', 'super admin'
  - `purpose_enum`: 'Registration', 'Forgot Password', 'Change Email', 'Change Password', 'Admin Action'
- Create table using IF NOT EXISTS:

  ```
  CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status status_enum NOT NULL DEFAULT 'active',
  role role_enum NOT NULL DEFAULT 'user'
  );

  CREATE TABLE IF NOT EXISTS users_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  otp_hash CHAR(64) NOT NULL,
  new_email VARCHAR(255),
  purpose purpose_enum NOT NULL,
  attempts_count SMALLINT NOT NULL DEFAULT 0,
  max_attempts SMALLINT NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ```

### Stage 2b: Set up `config.ts`

Create `user-service/src/config.ts`:

- Load and validate all environment variables using Zod at startup
- If any required variable is missing, log a clear error and exit immediately
- Export a single structured `config` object grouped by concern (db, jwt, email, etc.)
- All other files in the project must import env vars from here, never from `process.env` directly

### Stage 2c: Set up connection pool

Create `user-service/src/db/pool.ts`:

- Export a single `pg.Pool` instance
- All connection config must come from `config.ts`, never from `process.env` directly

### Verification

- Remove a required env var from `.env` and confirm it crashes with a clear error message

## Stage 3: Docker Setup

### Stage 3a: Dockerfile

Modify the existing `user-service/Dockerfile`:

- Let's have a multi-stage Dockerfile - one stage for dev (FROM image AS dev) and one stage for prod (FROM image AS prod)
  - Dev stage: runs nodemon -L src/app.ts via tsx
  - Prod stage: compiles TypeScript first (tsc), then runs node dist/app.js

- Base image: `node:24-alpine`
- Working directory: `/app`
- Install dependencies from `package.json`
- Copy source files
- Expose port 3001

### Stage 3b: Docker Compose

Populate the existing `compose.yaml` at the repo root:

- A `user-db` service:
  - Image: `postgres:16-alpine`
  - Container name: `foc-user-db`
  - Healthcheck using `pg_isready`
  - Mount `./user-service/src/db/init.sql` into `/docker-entrypoint-initdb.d/` so the schema is applied on first run
  - Named volume for data persistence
- A `user-service` service:
  - Built from `./user-service/Dockerfile`, specify `target: dev`
  - Container name: `foc-user-service`
  - Depends on `user-db` being healthy before starting
  - Load all env vars using `env_file: ./user-service/.env`
  - Mount `./user-service/src:/app/src` for live code reloading
  - Mount `./user-service/keys:/app/keys` for JWT key access

### Stage 3c: .env files

- Create `user-service/.env` by copying `.env.example` as-is, remind user (with a comment) to fill in the SMTP details.
- Add `user-service/.env` to `.gitignore`

### Verification

- Run `docker compose up --build` and confirm both containers start cleanly
- Connect to the DB and verify all tables and enums exist:

```bash
  docker exec -it foc-user-db psql -U postgres -d user_service -c "\dt"
  docker exec -it foc-user-db psql -U postgres -d user_service -c "\dT"
```

## Stage 4: Core Auth

> Users are immediately active upon registration. OTP verification is added in Stage 5 — at that point, registration will require OTP before the account is activated. For now, registration creates an active account directly.

---

### Stage 4a: App Setup + Middleware

#### Dependencies

Add `cookie-parser` and its types to `package.json`:

```json
"cookie-parser": "^1.x"
"@types/cookie-parser": "^1.x"
```

#### Update `app.ts`

- Register `cookie-parser` middleware
- Register `express.json()` middleware if not already present
- Mount auth router at `/auth`

#### Create `src/utils/hash.ts`

- Export a `sha256(input: string): string` function using Node's built-in `crypto`

#### Create `src/utils/jwt.ts`

- jwt.ts has a single exported function, e.g. verifyAccessToken(token: string): { user_id: string, role: string }.
- It should call jwt.verify(token, publicKey, { algorithms: ['RS256'] }) and return { user_id, role }.

#### Create `src/middleware/authenticate.ts`

- Extract Bearer token from `Authorization` header
- Call verifyAccessToken(token) from jwt.ts
- If it succeeds, attach `{ user_id, role }` to `req.user`
- Reject with `401` and `{ message: 'Unauthorized', code: 'UNAUTHORIZED' }` if invalid or missing
- Also, add `src/types/express.d.ts` declaring `Express.Request.user?: { user_id: string; role: string }` via global declaration merging

#### Create `src/routes/auth.routes.ts`

- Set up an Express router
- Export it — handlers will be added in later sub-stages

#### Create `src/utils/AppError.ts`

A custom error class for known application errors:

- Constructor takes `status: number`, `message: string`, `code: string`
- Extends the built-in `Error` class

#### Create `src/utils/asyncHandler.ts`

A wrapper that automatically catches errors from async controller functions and passes them to Express's error handler via `next(err)` — eliminates the need for try/catch in every controller.

#### Update `app.ts`

Add a global error handler as the **last** middleware registered:

- If the error is an `AppError`, return `{ message, code }` with the appropriate status code
  If the error is a ZodError: return 400. If any issue has code unrecognized_keys, set message to "Request contains unexpected fields"; otherwise use the first issue's message. code: 'VALIDATION_ERROR'.
- If the error is a SyntaxError with err.type === 'entity.parse.failed' (malformed JSON body from express.json()): return 400 with { message: 'Malformed JSON body', code: 'VALIDATION_ERROR' }.
- Otherwise: log the error and return 500 with { message: 'Internal server error', code: 'INTERNAL_ERROR' }.

#### Create `src/utils/cookies.ts`

- Export a `REFRESH_COOKIE_OPTIONS` constant: `{ httpOnly: true, secure: ..., sameSite: 'lax' }`
- Both `login` (sets the cookie, with `maxAge`) and `logout` (clears it) must import and reuse this constant — never duplicate the options literally in two places

#### Cors

- Add the `cors` package (`^2.x`) to `user-service/package.json`. In `app.ts`, register `cors({ origin: '<frontend dev URL, e.g. http://localhost:5173>', credentials: true })`.

#### General requirements (add to existing list)

- All Zod schemas must use `.strict()` to reject requests containing fields not defined in the schema
- All controllers must be wrapped with `asyncHandler` — no try/catch in controllers
- All known errors (duplicate username, invalid credentials etc.) must be thrown as `AppError` from the service layer
- The global error handler in `app.ts` is the single place that converts errors to HTTP responses
- Since `tsconfig.json` uses `"module": "NodeNext"`, all relative imports throughout the project must include the explicit `.js` extension (e.g. `import { sha256 } from '../utils/hash.js'`), even though the source files are `.ts`
- Query functions returning a user row (findByUsername, findByEmail, findById) return the full row, including password_hash. Callers must never return, log, or spread the full user object directly — always destructure only the needed fields. password_hash must never leave the service layer.

#### Verification

- `app.ts` compiles and starts without errors inside Docker
- A request with no token → `401`
- A request with an expired or tampered-signature token → `401`
- A request with a malformed JSON body → `400`
- A request with an extra / unrecognised field in an otherwise valid body → `400`: `"Request contains unexpected fields"`

---

### Stage 4b: Registration

#### Create `src/db/queries/users.queries.ts`

Implement the following query functions:

- `createUser({ username, email, passwordHash })` — inserts into `users` table
  - In authService.register(), wrap the userQueries.createUser() call in a try/catch. If the caught error has code === '23505' (Postgres unique violation), inspect err.constraint: if it includes username, throw AppError(409, 'Username already in use', 'USERNAME_TAKEN'); if it includes email, throw AppError(409, 'Email already in use', 'EMAIL_TAKEN'). Re-throw any other error unchanged.
- `findByUsername(username)` — returns user or null
- `findByEmail(email)` — returns user or null
- `findById(userId)` - returns user or null

#### Create `src/services/auth.service.ts`

Implement `register({ username, email, password })`:

- Validate username format: min 3 chars, max 255 chars, no spaces, no special characters
- Validate email format: must contain @ and valid domain
- Validate password complexity: min 8 chars, at least one uppercase, one lowercase, one digit, one special character
- If any format validation fails → throw `AppError(400, '...', 'VALIDATION_ERROR')`
  - Username: "Username must contain between 3 and 255 chars and have no spaces or special characters."
  - Email: "Please enter a valid email"
  - Password: "Password must contain at least 8 characters, with at least one uppercase, one lowercase, one digit and one special character. "
- Check username not already in use → call `userQueries.findByUsername()`, throw `AppError(409, 'Username already in use', 'USERNAME_TAKEN')`
- Check email not already in use → call `userQueries.findByEmail()`, throw `AppError(409, 'Email already in use', 'EMAIL_TAKEN')`
- Hash password with bcrypt (work factor 10)
- Call `userQueries.createUser()` to insert into `users` table with `status = 'active'`, `role = 'user'`

#### Create `src/controllers/auth.controller.ts`

- Wrap controller with asyncHandler
  Implement `register` handler:

Validate request body with Zod (use custom messages instead of Zod's own defaults) — check only presence, type, and extra fields; all format/complexity rules stay in the service layer:

- username: required error "Username is required", type error "Username must be a string"
- email: required error "Email is required", type error "Email must be a string"
- password: required error "Password is required", type error "Password must be a string"

**Normalisation (applied in the Zod schema, so the service and DB only ever see normalised values):**

- `email`: trim, then lowercase. Define it once as a shared `emailField` in `auth.controller.ts` and reuse it in every schema that takes an email (register, verify-otp, resend-otp, and any later stage).
- `username`: lowercase only. Do **not** trim, so a leading or trailing space still fails the "no spaces" rule in the service layer.
- Usernames and emails are stored lowercase, so lookups are effectively case-insensitive.

Use .strict() to reject requests containing fields not defined in the schema above. The resulting unrecognized_keys error is handled by the global error handler set up in Stage 4a (message: "Request contains unexpected fields") — no additional handling needed in this controller.

- Call `authService.register()`
- Return `201` with `{ message: 'User registered successfully', code: 'REGISTER_SUCCESS' }`

#### Wire up route

Add to `auth.routes.ts`:

```ts
router.post("/register", authController.register);
```

#### Verification

- `POST /auth/register` with valid body → 201, user appears in DB with hashed password (superseded by stage 5d: reponse is `201_OTP_SENT`, account starts `pending`)
- `POST /auth/register` with duplicate username → 409 USERNAME_TAKEN
- `POST /auth/register` with duplicate email → 409 EMAIL_TAKEN
- `POST /auth/register` with weak password → 400 VALIDATION_ERROR
- `POST /auth/register` with invalid email format → 400 VALIDATION_ERROR
- `POST /auth/register` with username less than 3 chars → 400 VALIDATION_ERROR
- `POST /auth/register` with username containing spaces → 400 VALIDATION_ERROR
- `POST /auth/register` with a field missing entirely (e.g. no password key) → 400 VALIDATION_ERROR, message "Password is required"
- `POST /auth/register` with a field of the wrong type (e.g. password: 12345) → 400 VALIDATION_ERROR, message "Password must be a string"
- `POST /auth/register` with an extra/unrecognized field (e.g. role: 'admin' included in the body) → 400 VALIDATION_ERROR, message "Request contains unexpected fields"
- `POST /auth/register` with malformed JSON body (not valid JSON at all) → 400 VALIDATION_ERROR, message "Malformed JSON body"
- Fire two `POST /auth/register` requests with the same username near-simultaneously → confirm one succeeds 201 and the other returns 409 USERNAME_TAKEN (not 500)

---

### Stage 4c: Login + Tokens

#### Create `src/db/queries/tokens.queries.ts`

Implement the following query functions:

- `createRefreshToken({ userId, tokenHash, ttlDays, userAgent, ipAddress })` — inserts into `refresh_tokens` table, with `expires_at = NOW() + make_interval(days => $ttl)` computed in SQL (see the clock rule in Stage 5c)
- `findRefreshToken(tokenHash)` — returns token row (plus `clock_timestamp() AS db_now`) or null
- `lockRefreshToken(tokenHash, db)` — `SELECT *, clock_timestamp() AS db_now ... FOR UPDATE`, returns the token row (plus `db_now`) or null
- `revokeRefreshToken(tokenHash, db)` — sets `is_revoked = true`, `revoked_at = now`

All token queries take an optional last parameter `db: Queryable = pool`, like the user queries, so they can run inside a transaction.

#### Update `src/services/auth.service.ts`

Implement `login({ identifier, password }, userAgent, ipAddress)`:

- Look up user by username or email using `identifier`
- Reject if not found → throw `401` with `{ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }`
- Reject if password doesn't match bcrypt hash → throw `401` with same error
- Reject if `status = 'suspended'` → throw `403` with `{ message: 'Account suspended', code: 'ACCOUNT_SUSPENDED' }`
- Issue RS256 access token (15 min TTL) with claims `{ sub: user.id, role: user.role }` using private key from `config.ts`
- Generate refresh token: 32 cryptographically random bytes (hex string) using Node's built-in `crypto`
- Store SHA-256 hash of refresh token in `refresh_tokens` table with `expires_at = now + 7 days`
- **Race-safety:** verify the password before locking (bcrypt is slow), then create the refresh token inside `withTransaction`: `locked = lockUserById(user.id, client)`; if `locked` is null or `locked.password_hash !== user.password_hash` → `401 INVALID_CREDENTIALS` (the password changed while logging in); if `locked.status` is `'suspended'` → `403 ACCOUNT_SUSPENDED`; otherwise `createRefreshToken(..., client)`. Take the role for the access token from `locked`. Without this, a login that verified the old password can create a refresh token _after_ a password reset has revoked all of them. (Added in Stage 6, see "Changes to already-implemented code".)
- Return `{ accessToken, refreshToken, user: { id, username, email, role } }`

#### Update `src/controllers/auth.controller.ts`

Implement `login` handler - accepts both username / email AND password

Validate request body with Zod (use custom messages instead of Zod's own defaults) — check only presence, type, and extra fields; all format/complexity rules stay in the service layer:

- identifier: required error "Username/Email is required", type error "Username/Email must be a string"
- password: required error "Password is required", type error "Password must be a string"
- `identifier` is trimmed and lowercased whole (usernames and emails are both stored lowercase).

Use .strict() to reject requests containing fields not defined in the schema above. The resulting unrecognized_keys error is handled by the global error handler set up in Stage 4a (message: "Request contains unexpected fields") — no additional handling needed in this controller.

- Call `authService.login()`
- Set refresh token as the settings specified in `src/utils/cookies.ts`.
- Return `200` with `{ accessToken, user: { id, username, email, role } }`

Error responses:

- `401`: `{ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }`
- `403`: `{ message: 'Account suspended', code: 'ACCOUNT_SUSPENDED' }`

#### Wire up route

Add to `auth.routes.ts`:

```ts
router.post("/login", authController.login);
```

#### Verification

- `POST /auth/login` with valid credentials → `200`, access token in body, refresh token cookie set
- `POST /auth/login` with wrong password → `401`
- `POST /auth/login` with unknown identifier → `401`
- `POST /auth/login` with suspended account → `403`
- Confirm refresh token hash appears in `refresh_tokens` table in DB
- `POST /auth/login` using the registered email as `identifier` → `200`, succeeds
- `POST /auth/login` using the registered username as `identifier` → `200`, succeeds
- `POST /auth/login` with a field missing entirely (e.g. no `identifier`) → `400` `VALIDATION_ERROR`, message `"Username/Email is required"`
- `POST /auth/login` with a field of the wrong type (e.g. `identifier: 12345`) → `400` `VALIDATION_ERROR`, message `"Username/Email must be a string"`
- `POST /auth/login` with an extra/unrecognized field → `400` `VALIDATION_ERROR`, message `"Request contains unexpected fields"`
- Decode the returned access token (e.g. jwt.io or a script) → confirm claims are `{ sub: <user id>, role: <user role> }`, algorithm `RS256`, `exp` ≈ 15 min out

---

### Stage 4d: Logout + Refresh

#### Update `src/services/auth.service.ts`

Implement `logout(refreshToken)`:

- Hash refresh token with SHA-256
- Run everything inside `withTransaction`, so two concurrent logouts with the same cookie cannot both succeed:
  - Look up the token with `lockRefreshToken(tokenHash, client)`, which is `SELECT ... FOR UPDATE` on `refresh_tokens`, so a second request waits and then sees the first one's committed result
  - If not found or already revoked → throw `401` with `{ message: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' }`
  - Set `is_revoked = true`, `revoked_at = now` using the same `client`

Implement `refresh(refreshToken)`:

- Hash refresh token with SHA-256
- `findRefreshToken(tokenHash)` as a plain, unlocked read. This is a cheap early exit and it gives the `user_id`: if not found, revoked, or expired (compare `expires_at` against the row's `db_now`, not `Date.now()`) → throw `401` with `{ message: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' }`
- Then, inside `withTransaction`, lock and re-check. **Lock order matters: user row first, then token row.**
  1. `lockedUser = lockUserById(tokenRow.user_id, client)`. If null → `401 INVALID_REFRESH_TOKEN`
  2. `lockedToken = lockRefreshToken(tokenHash, client)`. If null, revoked, or expired (compare against its `db_now`) → `401 INVALID_REFRESH_TOKEN`
  3. If `lockedUser.status` is `'suspended'` → `AppError(403, 'Account suspended', 'ACCOUNT_SUSPENDED')` instead of issuing a new token
  4. Issue the new RS256 access token (15 min TTL) from `lockedUser.id` and the freshly-locked `lockedUser.role` (not any cached role), so a role change (e.g. promotion) takes effect on the next refresh rather than only after re-login
- Return `{ accessToken }`

**Why the locks:** without them, a refresh already in flight can mint an access token after a logout, password reset, or suspension has committed. With them, a refresh either finishes before that action or waits and then sees the revoked token (`401`). An access token issued earlier still lives out its 15 minutes.

**Lock ordering rule (whole service):** whenever a transaction locks both a user row and refresh-token rows, lock the **user row first**. Reset-password (user, then its tokens), login and refresh all follow it. Locking a token first and the user second could deadlock against reset-password, and the caller would get a 500. Logout locks only the token row, so it cannot form a cycle.

#### Update `src/controllers/auth.controller.ts`

Implement `logout` handler. It does **not** use the `authenticate` middleware: the refresh cookie is the credential, so logout still works after the access token has expired (otherwise an expired access token blocks logout, the refresh token stays valid, and the browser's silent refresh logs the user straight back in):

- Extract refresh token from `req.cookies.refreshToken`. If the cookie is missing → `401 INVALID_REFRESH_TOKEN`
- Call `authService.logout()`
- Clear the `refreshToken` cookie (with settings from `src/utils/cookies.ts`)
- Return `200` with `{ message: 'Logged out successfully', code: 'LOGOUT_SUCCESS' }`

Logout revokes only the refresh token in the cookie (that device's session). The access token is stateless and stays valid until it expires.

Implement `refresh` handler:

- Extract refresh token from `req.cookies.refreshToken`
- Call `authService.refresh()`
- Return `200` with `{ accessToken }`

#### Wire up routes

Add to `auth.routes.ts`:

```ts
router.post("/logout", authController.logout);
router.post("/refresh", authController.refresh);
```

#### Verification

- `POST /auth/logout` with a valid refresh cookie → `200`, cookie cleared, token revoked in DB, whether or not an `Authorization` header is sent (including an expired access token)
- `POST /auth/logout` without a `refreshToken` cookie → `401 INVALID_REFRESH_TOKEN`
- `POST /auth/refresh` with valid cookie → `200`, new access token returned
- `POST /auth/refresh` after logout → `401`
- `POST /auth/refresh` with expired refresh token → `401`
- `POST /auth/logout` with a valid access token but a missing/garbage `refreshToken` cookie → `401 INVALID_REFRESH_TOKEN`
- `POST /auth/logout` with a valid access token but an already-revoked `refreshToken` cookie → `401 INVALID_REFRESH_TOKEN`
- Fire several `POST /auth/logout` requests at once with the same access token and cookie → exactly one `200`, the rest `401 INVALID_REFRESH_TOKEN`
- Suspend the user in the DB directly (`UPDATE users SET status = 'suspended' WHERE ...`), then `POST /auth/refresh` with their still-valid, non-expired, non-revoked cookie → `403 ACCOUNT_SUSPENDED`, no new access token issued
- Promote the user in the DB directly (`UPDATE users SET role = 'admin' WHERE ...`), then `POST /auth/refresh` with a valid cookie → `200`, decode the new access token and confirm its `role` claim reflects `'admin'`, not the stale role from the original login
- `POST /auth/refresh` with a `refreshToken` cookie that never existed (random hex string, never issued) → `401 INVALID_REFRESH_TOKEN`
- Run `POST /auth/refresh` in a loop while `POST /auth/logout` runs with the same cookie → once logout has returned `200`, every refresh that starts afterwards returns `401 INVALID_REFRESH_TOKEN`
- Run `POST /auth/refresh` and `POST /auth/reset-password` concurrently several times (Stage 6d) → no deadlock errors: no `500` responses and no `deadlock detected` in the service logs

---

### Stage 4e: Inter-Service Verify + Super Admin Bootstrap

#### GET /auth/verify

Add to `src/controllers/auth.controller.ts`:

Implement `verify` handler:

- Extract the Bearer token from the Authorization header
- Call the verifyAccessToken(token) util from src/utils/jwt.ts (created in Stage 4a)
- On success, return 200 with { user_id, role } from the verified claims
- Reject with `401` and `{ message: 'Invalid token', code: 'INVALID_TOKEN' }` if invalid or missing or expired

Add to `auth.routes.ts`:

```ts
router.get("/verify", authController.verify);
```

#### Super admin bootstrap

Add the following to `.env.example` and `.env`:

```env
# Super Admin Bootstrap
SUPER_ADMIN_USERNAME=superadmin
SUPER_ADMIN_EMAIL=superadmin@foc.com
SUPER_ADMIN_PASSWORD=
```

On app startup in `app.ts`:

- Check if a user with `role = 'super admin'` exists in the `users` table
- If not, create one using `SUPER_ADMIN_USERNAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` from `config.ts`
- Password must meet the same complexity rules as regular registration
- Log a clear message when bootstrap creates the super admin
- Skip silently if super admin already exists

**Race-safe creation:** the check-then-create must tolerate two instances starting at once, and a configured username or email that already belongs to a regular user.

- Insert with `INSERT ... ON CONFLICT DO NOTHING RETURNING *`. `createSuperAdmin` returns the new row, or nothing if the insert was skipped.
- Lowercase (and trim) the configured username and email before inserting, like every other username and email.
- If the insert was skipped, run the super admin check again:
  - A super admin now exists → another instance created it; continue silently.
  - Still none → the configured username or email belongs to a non-super-admin account; throw a clear error, for example `SUPER_ADMIN_USERNAME or SUPER_ADMIN_EMAIL is already used by a non-super-admin account.`

- In app.ts, ensure the super admin bootstrap check completes (await it) before calling app.listen().
- In config.ts's Zod schema, SUPER_ADMIN_PASSWORD must use .min(1) (or equivalent) rather than a bare .string().

Add super admin credentials to `config.ts` Zod schema.

#### Verification

- `GET /auth/verify` with valid access token → `200`, returns `{ user_id, role }`
- `GET /auth/verify` with invalid token → `401`
- `GET /auth/verify` with expired token → `401`
- Confirm super admin exists in DB on first startup:

```bash
  docker exec -it foc-user-db psql -U postgres -d user_service -c "SELECT username, role FROM users;"
```

- Restart containers and confirm super admin is not duplicated
- Configure `SUPER_ADMIN_USERNAME` to a username already held by a regular user (on a DB that has no super admin) → the app exits with the clear error message, not a raw Postgres unique-violation
- `GET /auth/verify` with no `Authorization` header at all → `401 INVALID_TOKEN`
- `GET /auth/verify` with a well-formed but wrong-signature token (e.g. signed with a different key pair) → `401 INVALID_TOKEN`
- Take one valid access token, confirm it's accepted by both an `authenticate`-protected route and by `GET /auth/verify` (logout no longer uses `authenticate`, so no route uses it until `GET /users/me` in a later stage; until then check this with a temporary protected test route, or defer it) — confirms both call sites agree, since they share `verifyAccessToken`

## Stage 5: OTP Flow (Send, Verify, Resend)

> **Scope**: This stage builds the generic OTP infrastructure (generation, hashing, email delivery, verification, resend) and wires it up for the **Registration** purpose only. Forgot Password, Change Email, Change Password and Admin Action are wired in later stages, so the service layer must take `purpose` as a parameter, but the public endpoints only accept `registration` for now.
>
> Registration changes from "instant active account" (Stage 4b) to "pending account, active only after OTP verification".
>
> Backlog refs: F1.1.5, F1.1.6, F1.1.7, F1.1.8.

### Design decisions (already made, do not change)

| Rule                       | Value                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| OTP format                 | 6 digits, numeric, cryptographically random (`crypto.randomInt`), zero-padded                                             |
| OTP storage                | SHA-256 hash in `users_otps.otp_hash`, never the plaintext                                                                |
| OTP lifetime               | 10 minutes from creation                                                                                                  |
| Single use                 | Consumed on successful verification (`consumed_at` set)                                                                   |
| New OTP invalidates old    | Generating a new OTP sets `consumed_at` on all of that user's still-active OTPs for the same purpose                      |
| Wrong-guess limit          | `max_attempts` = 5 per OTP (DB default). Once `attempts_count` reaches the max, that OTP is dead and the user must resend |
| Resend cooldown            | 60 seconds since the previous OTP was created                                                                             |
| Resend limit               | 5 resends per registration (i.e. at most 6 OTP rows per user for `Registration`)                                          |
| Username/email reservation | The pending user row itself holds the username and email until the latest OTP expires                                     |
| Registration `new_email`   | `NULL` (only used by Change Email later)                                                                                  |

---

### Stage 5a: Schema, Config, Utilities

#### Update `src/db/init.sql`

- Add `'pending'` to `status_enum`: `('pending', 'active', 'suspended')`
- Keep the `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object` wrapper
- Note: `init.sql` only runs on a fresh DB volume. After this change, reset the dev DB with `docker compose down -v` (dev data only) so the enum is recreated. Remind me of this in your summary.

#### Update `.env.example` and `.env`

```env
# OTP
OTP_TTL_MINUTES=10
OTP_RESEND_COOLDOWN_SECONDS=60
OTP_MAX_RESENDS=5
OTP_RESEND_WINDOW_MINUTES=60
```

#### Update `src/config.ts`

- Add the four OTP vars to the Zod schema (coerce to numbers, positive integers) and expose them as `config.otp = { ttlMinutes, resendCooldownSeconds, maxResends, resendWindowMinutes }`. `resendWindowMinutes` is the rolling window used to count resends for purposes other than registration (see `countOtps` in Stage 5c).
- SMTP vars (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) may be empty **only when** `NODE_ENV=development`. In any other environment they are required and the app must exit with a clear error, as before.

#### Update `src/utils/hash.ts`

- Add `hashesMatch(a: string, b: string): boolean` using `crypto.timingSafeEqual` on the two hex digests (return `false` if lengths differ, never throw)

#### Create `src/utils/otp.ts`

- `generateOtp(): string` — `crypto.randomInt(0, 1_000_000)` padded to 6 digits with leading zeros. Do not use `Math.random`.

#### Create `src/db/transaction.ts`

Some operations in this stage involve several database steps that must succeed or fail together (e.g. creating a pending user _and_ its OTP). This file provides a helper for that.

**`withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T>`**

A transaction has to run on a single connection, so this helper:

1. Borrows one connection from the pool.
2. Runs `BEGIN`, then calls `fn(client)`. All queries inside `fn` must use this `client`, not the pool.
3. If `fn` finishes normally, runs `COMMIT` and returns its result.
4. If `fn` throws, runs `ROLLBACK` to undo everything, then rethrows the same error so the global error handler still sees it.
5. Always returns the connection to the pool in a `finally` block, whether it succeeded or failed. A leaked connection will eventually make the whole service hang.

**`Queryable` type: `pg.Pool | pg.PoolClient`**

Both the pool and a checked-out client have a `.query()` method. Exporting this type lets each query function accept either one, so it works on its own (using the pool) or inside a transaction (using the transaction's client).

#### Update `src/db/queries/users.queries.ts`

All query functions now accept an optional last parameter `db: Queryable = pool` so they can run inside a transaction. Existing callers keep working unchanged.

- `createUser({ username, email, passwordHash, status })` — `status` is now a parameter (`'pending' | 'active'`). Update the Stage 4b caller and the super admin bootstrap to pass it explicitly (bootstrap passes `'active'`).
- `lockUserById(userId, db)` — `SELECT ... FOR UPDATE`, returns the row or null
- `activateUser(userId, db)` — sets `status = 'active'`, `updated_at = NOW()` **only where `status = 'pending'`**; returns whether a row was updated
- `deleteStalePendingUsers({ username, email }, db)` — a single statement:

```sql
DELETE FROM users
WHERE id IN (
  SELECT id FROM users
  WHERE status = 'pending'
    AND (username = $1 OR email = $2)
    AND NOT EXISTS (
      SELECT 1 FROM users_otps o
      WHERE o.user_id = users.id AND o.expires_at > NOW()
    )
  FOR UPDATE SKIP LOCKED
);
```

`FOR UPDATE SKIP LOCKED` matters: a row that a verify or resend has locked is skipped instead of waited on. Without it, the delete waits for the lock and then deletes the row even though the resend just gave it a live OTP. The skipped row is then seen as taken, and the register request returns `USERNAME_TAKEN` or `EMAIL_TAKEN`.

Cascade deletes the stale OTP rows. This is how an expired reservation is released.

#### Verification

- `docker compose down -v && docker compose up --build` starts cleanly
- `\dT+ status_enum` shows `pending`, `active`, `suspended`
- App still boots with SMTP vars empty in development
- Temporarily set `NODE_ENV=production` with empty SMTP vars → app exits with a clear error naming the missing variables (revert afterwards)
- `generateOtp()` never returns a string that isn't exactly 6 digits (quick Vitest unit test: 10,000 iterations, regex `^\d{6}$`)

---

### Stage 5b: Email Service

#### Create `src/services/email.service.ts`

- Create one Nodemailer transport from `config.email`
- Export `sendOtpEmail({ to, otp, purpose }: { to: string; otp: string; purpose: string }): Promise<void>`
- Subject and body wording come from a small `purpose → { subject, intro }` map. For now only `Registration` is needed: subject `"Your FoC verification code"`.
- Send both `text` and `html` bodies. Body contains the OTP and the expiry (`config.otp.ttlMinutes` minutes). No links.
- The function **throws** on send failure. Callers decide what to do (see 5d/5e).
- Development fallback: if `NODE_ENV=development` and `SMTP_HOST` is empty, do not attempt SMTP. Log `[DEV EMAIL] to=<to> purpose=<purpose> otp=<otp>` to the console instead. This branch must be unreachable in any other environment.
- Never log the OTP anywhere else.

#### Verification

- With SMTP empty in development, calling the function prints the dev log line
- With real SMTP credentials filled in, an email arrives at a real inbox with the correct code and expiry text

---

### Stage 5c: OTP Queries + Service

#### Create `src/db/queries/otp.queries.ts`

All functions take `db: Queryable` as the last parameter.

- `createOtp({ userId, otpHash, purpose, newEmail, ttlMinutes }, db)` — inserts into `users_otps`, with `expires_at = NOW() + make_interval(mins => $ttl)` computed in SQL
- `invalidateActiveOtps(userId, purpose, db)` — `UPDATE users_otps SET consumed_at = NOW() WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`
- `findLatestOtp(userId, purpose, db)` — most recent row by `created_at` (any state), plus `clock_timestamp() AS db_now`, or null
- `countOtps(userId, purpose, db, sinceMinutes?)` — number of rows for that user and purpose (used for the resend limit).
  - Without `sinceMinutes` it counts **all** rows. Registration deliberately calls it this way (5 resends per registration, per F1.1.6), because the flow ends when the last OTP expires and the user can register again. Do not route the registration resend through `requestOtp` (Stage 6a) without keeping this behaviour.
  - With `sinceMinutes` it counts only rows with `created_at > clock_timestamp() - sinceMinutes`. Purposes that can be requested repeatedly over an account's lifetime (forgot password, change email, change password, admin action) pass `config.otp.resendWindowMinutes`, so the limit is per rolling window and a user is never locked out permanently.
- `incrementAttempts(otpId, db)` — `attempts_count = attempts_count + 1`, returns the new count
- `consumeOtp(otpId, db)` — `SET consumed_at = NOW() WHERE id = $1 AND consumed_at IS NULL`, returns whether a row was updated

**Clock rule (applies to the whole service):** the database owns time. Write expiries in SQL (`NOW() + make_interval(...)`). For "has it expired?" and cooldown checks, compare against the `db_now` returned by the query (`clock_timestamp()`), never `Date.now()`. Use `clock_timestamp()` rather than `NOW()` for these reads, because `NOW()` is frozen at the start of the transaction and would be stale after waiting on a row lock. JWT `iat`/`exp` are the only exception, since they are set by the JWT library.

#### Create `src/services/otp.service.ts`

This layer is purpose-agnostic and knows nothing about HTTP.

- `issueOtp({ userId, email, purpose, newEmail? }, db)`:
  1. `invalidateActiveOtps`
  2. `generateOtp()`, then `sha256` it
  3. `createOtp` with `ttlMinutes: config.otp.ttlMinutes` (the database computes the expiry)
  4. `sendOtpEmail` (sent to `newEmail ?? email`)
  5. If sending throws, log the error (without the OTP) and throw `AppError(503, 'Unable to send verification email. Please try again.', 'EMAIL_SEND_FAILED')`
  - Callers run this inside `withTransaction`, so a send failure rolls back the new OTP (and any invalidation of the previous one).

- `checkOtp({ userId, purpose, otp }, db)` — must be called inside a transaction that already holds the user row lock:
  1. `findLatestOtp`. If null, or `consumed_at` is set → `AppError(400, 'Invalid or expired OTP', 'INVALID_OTP')`
  2. If `expires_at` has passed → `AppError(400, 'OTP has expired. Please request a new one.', 'OTP_EXPIRED')`
  3. If `attempts_count >= max_attempts` → `AppError(429, 'Too many incorrect attempts. Please request a new OTP.', 'OTP_ATTEMPTS_EXCEEDED')`
  4. Compare `sha256(otp)` to `otp_hash` with `hashesMatch`
  5. On mismatch: `incrementAttempts`, then return `{ ok: false }` (do **not** throw inside the transaction, see the warning below)
  6. On match: `consumeOtp`. If it returns false, treat as `INVALID_OTP`. Return `{ ok: true }`.

> **Warning: the attempt increment must survive.** If the wrong-guess path throws inside `withTransaction`, the `ROLLBACK` will undo the `incrementAttempts` and the attempt limit becomes bypassable. `checkOtp` returns `{ ok: false }`, the transaction commits, and only then does the caller throw `AppError(400, 'Invalid or expired OTP', 'INVALID_OTP')`.

#### Verification

- Unit-test `checkOtp`'s branching with a stubbed `db` where practical (Vitest); at minimum verify manually via 5e

---

### Stage 5d: Registration Now Creates a Pending Account

#### Update `authService.register()` in `src/services/auth.service.ts`

Keep all existing format validation (username, email, password) and error messages unchanged. Replace the persistence part with a single `withTransaction`:

1. `deleteStalePendingUsers({ username, email })`
2. Existing duplicate checks: `findByUsername` then `findByEmail`, throwing `USERNAME_TAKEN` / `EMAIL_TAKEN` (409) as before. A live pending user (unexpired OTP) counts as taken, which is the F1.1.8 reservation.
3. Hash the password with bcrypt (work factor 10)
4. `createUser({ ..., status: 'pending' })`, keeping the existing `23505` catch → `USERNAME_TAKEN` / `EMAIL_TAKEN` mapping (this still covers the concurrent-register race)
5. `issueOtp({ userId, email, purpose: 'Registration' })`

If any of the 5 steps fails, the transaction rolls back and no pending user remains.

#### Update `register` in `src/controllers/auth.controller.ts`

- Request validation unchanged
- Return `201` with `{ message: 'Verification code sent to your email', code: 'OTP_SENT' }`

#### Update `authService.login()`

- After the password check succeeds, if `status = 'pending'` → `AppError(403, 'Account not verified', 'ACCOUNT_NOT_VERIFIED')`
- Keep the order: not found / wrong password (401) first, then pending (403), then suspended (403). This prevents revealing account state to someone who doesn't know the password.

#### Verification

- `POST /auth/register` valid body → `201 OTP_SENT`, user row exists with `status = 'pending'`, one `users_otps` row exists with `purpose = 'Registration'`, `otp_hash` is 64 hex chars, `expires_at` ≈ 10 min out, `new_email` is NULL
- Dev console shows the OTP (or a real email arrives if SMTP is configured)
- `POST /auth/login` with the pending account's correct credentials → `403 ACCOUNT_NOT_VERIFIED`
- `POST /auth/login` with the pending account and a wrong password → `401 INVALID_CREDENTIALS`
- `POST /auth/register` again with the same username/email while the OTP is still live → `409 USERNAME_TAKEN` / `EMAIL_TAKEN`
- Set the pending user's OTP `expires_at` to the past in the DB, then register again with the same username and email → `201`, and the old pending row is gone (only one row for that username)
- Force an email failure (e.g. temporarily break the transport) → `503 EMAIL_SEND_FAILED`, and no pending user or OTP row is left behind
- Concurrent duplicate registration test from Stage 4b still returns one `201` and one `409`, never `500`
- Existing super admin bootstrap still works (creates an `active` super admin)

---

### Stage 5e: Verify OTP + Resend OTP Endpoints

Both endpoints are **public** (no `authenticate`). The API-facing `purpose` value is lowercase (`'registration'`); map it to the DB enum value (`'Registration'`) in one place. Only `'registration'` is accepted for now; extend the Zod enum in later stages.

#### Request validation (Zod, `.strict()`, custom messages, presence/type/extra-fields only)

`POST /auth/verify-otp`:

- email: required "Email is required", type "Email must be a string" (use the shared `emailField`: trimmed and lowercased)
- otp: required "OTP is required", type "OTP must be a string"
- purpose: required "Purpose is required", type "Purpose must be a string", not in the allowed list → "Invalid purpose"

`POST /auth/resend-otp`:

- email and purpose as above (no `otp`)

Format rule stays in the service layer: `otp` must match `^\d{6}$`, else `AppError(400, 'OTP must be a 6-digit code', 'VALIDATION_ERROR')`.

#### `authService.verifyRegistrationOtp({ email, otp })`

Inside `withTransaction`:

1. Look up the user by email. If none, or `status !== 'pending'` → `INVALID_OTP` (same generic error, do not reveal which case)
2. `locked = lockUserById(user.id)` (serialises concurrent verify/resend for this user). **Re-check after the lock:** if `locked` is null or `locked.status !== 'pending'` → `INVALID_OTP`. The status read in step 1 can be stale, because another request may have changed the row while this one waited for the lock.
3. `checkOtp(...)`
4. If `{ ok: true }` → `activateUser(user.id)`; if it returns false, treat as `INVALID_OTP`
5. Commit, then: if `{ ok: false }` → throw `AppError(400, 'Invalid or expired OTP', 'INVALID_OTP')`
6. On success return nothing sensitive

> Leave a `// TODO(credit-service): emit user-registered event here` comment at the activation point. Do not implement it (F19.1.1 is a later stage).

#### `authService.resendRegistrationOtp({ email })`

Inside `withTransaction`:

1. Look up the user by email. If none or not `pending` → `AppError(400, 'No pending registration found', 'NO_PENDING_REGISTRATION')`
2. `locked = lockUserById(user.id)`. **Re-check after the lock:** if `locked` is null or `locked.status !== 'pending'` → `AppError(400, 'No pending registration found', 'NO_PENDING_REGISTRATION')`. The status read in step 1 can be stale, because another request may have changed the row while this one waited for the lock.
3. `countOtps(user.id, 'Registration')`. If `count - 1 >= config.otp.maxResends` → `AppError(429, 'Maximum OTP resends reached. Please try registering again in about 10 minutes.', 'OTP_RESEND_LIMIT')`. No `Retry-After` here. The 10 minutes is the OTP lifetime (`OTP_TTL_MINUTES`): the pending registration holds the username and email until its latest OTP expires, and registering again earlier returns `USERNAME_TAKEN` / `EMAIL_TAKEN`. If you change `OTP_TTL_MINUTES`, update this message.
4. `findLatestOtp`. If `created_at + cooldown > db_now` → `AppError(429, 'Please wait before requesting another OTP', 'OTP_RESEND_COOLDOWN')`, and set a `Retry-After` header (seconds remaining, about 60). To set the header, attach an optional `retryAfterSeconds` field to `AppError` and have the global error handler emit the header when present. The JSON body stays `{ message, code }`.
5. `issueOtp(...)` (this invalidates the previous OTP and sends the email)

> **Frontend behaviour for registration:** during the first 5 resends, disable the resend button and show a countdown from `Retry-After` ("try again in 60 seconds"). When `OTP_RESEND_LIMIT` is returned, disable resend and show the message ("try registering again in about 10 minutes"); there is no countdown.

#### Controllers in `src/controllers/auth.controller.ts`

- `verifyOtp` → `200` with `{ message: 'Registration complete. You can now log in.', code: 'REGISTER_SUCCESS' }`. No tokens are issued; the user logs in normally afterwards.
- `resendOtp` → `200` with `{ message: 'A new verification code has been sent to your email', code: 'OTP_SENT' }`
- Both wrapped in `asyncHandler`, no try/catch

#### Wire up routes in `auth.routes.ts`

```ts
router.post("/verify-otp", authController.verifyOtp);
router.post("/resend-otp", authController.resendOtp);
```

#### Verification

Happy path:

- Register → `POST /auth/verify-otp` with the correct OTP → `200 REGISTER_SUCCESS`, user `status = 'active'`, OTP row has `consumed_at` set
- Login with the now-active account → `200`

OTP rules:

- Re-submitting the same (already used) OTP → `400 INVALID_OTP`
- Wrong OTP → `400 INVALID_OTP`, `attempts_count` incremented **and persisted** (check the DB after the request)
- 5 wrong OTPs, then the correct OTP → `429 OTP_ATTEMPTS_EXCEEDED`; account stays `pending`
- Expired OTP (set `expires_at` to the past) with the correct code → `400 OTP_EXPIRED`
- Resend, then use the **old** OTP → `400 INVALID_OTP` (old one was invalidated); the **new** OTP works
- OTP `12345` (5 digits) or `abcdef` → `400 VALIDATION_ERROR`, message `"OTP must be a 6-digit code"`
- Unknown email → `400 INVALID_OTP`; already-active email → `400 INVALID_OTP`

Resend rules:

- Resend immediately after registering → `429 OTP_RESEND_COOLDOWN` with a `Retry-After` header
- Resend after 60 seconds (or after backdating `created_at` in the DB) → `200 OTP_SENT`, previous OTP row now has `consumed_at`
- After 5 successful resends (backdate `created_at` between each), the 6th resend → `429 OTP_RESEND_LIMIT`
- Resend for an unknown email or already-active account → `400 NO_PENDING_REGISTRATION`
- Resend when the SMTP send fails → `503 EMAIL_SEND_FAILED`, and the previous OTP is still valid (rolled back)

Validation:

- Missing `otp` → `400 VALIDATION_ERROR`, `"OTP is required"`
- `otp: 123456` (number) → `400 VALIDATION_ERROR`, `"OTP must be a string"`
- `purpose: "forgot password"` → `400 VALIDATION_ERROR`, `"Invalid purpose"`
- Extra field → `400 VALIDATION_ERROR`, `"Request contains unexpected fields"`

Concurrency:

- Fire two `POST /auth/verify-otp` with the correct OTP near-simultaneously → exactly one `200`, the other `400 INVALID_OTP`, user is active exactly once
- Fire two `POST /auth/resend-otp` near-simultaneously (cooldown backdated) → one `200` and one `429`, and only one active (unconsumed) OTP row exists afterwards

---

### Notes for Later Stages (do not implement now)

- `GET /users` (admin) must exclude `status = 'pending'` users
- Forgot Password, Change Email, Change Password and Admin Action reuse `issueOtp` / `checkOtp` and extend the `purpose` enum in the Zod schemas; authenticated purposes will need `authenticate` on their own routes
- Resend-limit counting for those purposes uses the rolling window (`config.otp.resendWindowMinutes`) via `requestOtp`. Only registration counts all rows, because a user only ever has one registration flow.
- NFR2 (email retry ×3 + delivery-failure logging) and NFR1 (lockout after repeated failed OTP attempts) are Week 10 items
- A periodic cleanup of expired pending users is optional; `deleteStalePendingUsers` already reclaims them lazily on re-registration
- Frontend: the register response changed (`201 OTP_SENT`, no active session) and two new endpoints exist; the OTP entry screen is a separate frontend task

> **Superseded by Stage 9:** the "GET /users must exclude pending users" note above no longer holds — Stage 9 shows all users regardless of status, including pending ones.

# Stage 6: Forgot Password Flow

> **Scope**: This stage adds the Forgot Password flow (F3.1), reusing the generic OTP
> infrastructure built in Stage 5 (`issueOtp`, `checkOtp`, `otp.queries.ts`,
> `email.service.ts`). It extends the `purpose` handling in the existing `verify-otp` and
> `resend-otp` endpoints rather than creating parallel ones, and adds one new endpoint:
> `POST /auth/reset-password`.
>
> Backlog refs: F3.1.1, F3.1.2, F3.1.3, F3.1.4.

### Design decisions (already made, do not change)

- **API-facing purpose string** — `forgot_password` maps to the DB enum value `'Forgot Password'`
- **Unknown email** — `forgot-password` and `resend-otp` (purpose `forgot_password`) return `404 EMAIL_NOT_FOUND` and send no OTP (F3.1.2). Hiding which emails are registered is deliberately not a goal for this flow, since registration already reveals it.
- **Throttling is reported, not hidden** — a throttled request gets a real `429`: `OTP_RESEND_COOLDOWN` for the first 5 resends (with a `Retry-After` header, about 60 seconds), and `OTP_RESEND_LIMIT` once the limit is reached, with the message "try again in about an hour" (no `Retry-After`; it matches the default `resendWindowMinutes` of 60)
- **OTP verification is two-step** — `verify-otp` checks the code without consuming it; `reset-password` does the real, consuming check
- **`checkOtp` change** — add an optional `consume` param, defaulting to `true`, so existing callers (registration) are unaffected
- **On successful reset** — set the new password hash, then revoke all of that user's refresh tokens (logs them out everywhere)
- **Account status** — reset works for active and suspended accounts; it doesn't change status. A **pending** (unverified) account gets `403 ACCOUNT_NOT_VERIFIED` from forgot-password, resend, verify and reset: it cannot log in anyway, so a reset would do nothing useful, and a forgot-password OTP on a pending row would keep its username and email reserved for longer (the stale-user cleanup treats any live OTP as a reason to keep the row).
- **New password validation** — reuses the same complexity rule and error message as registration
- **Resend/cooldown/attempt limits** — reuse the OTP infrastructure and config from Stage 5, except that the resend count uses the rolling window (`config.otp.resendWindowMinutes`) instead of counting all rows

---

## Changes to already-implemented code (do these first)

Stage 6 needs the following changes to code that earlier stages already built. Each is specified in detail in the stage named.

> Status (2026-09-26): all nine changes below are implemented. Row 5's controller half was completed in 6c (verify-otp) and 6e (resend-otp).

| #   | File                                                                                                | Change                                                                                                                                                                                                                                                                       | Where specified |
| --- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | `.env.example`, `.env`, `src/config.ts`                                                             | Add `OTP_RESEND_WINDOW_MINUTES=60` to the env files, the Zod schema, and `config.otp.resendWindowMinutes`                                                                                                                                                                    | Stage 5a        |
| 2   | `src/db/queries/otp.queries.ts`                                                                     | `countOtps(userId, purpose, db, sinceMinutes?)`: without `sinceMinutes` it counts all rows (registration, unchanged); with it, only rows created within that many minutes (compared against `clock_timestamp()`)                                                             | Stage 5c        |
| 3   | `src/services/otp.service.ts`                                                                       | `checkOtp` gets an optional `consume` parameter, default `true`; when `false`, skip `consumeOtp` but still increment attempts on a wrong guess                                                                                                                               | Stage 6a        |
| 4   | `src/services/email.service.ts`                                                                     | Add a `Forgot Password` entry to the purpose map (subject "Your FoC password reset code")                                                                                                                                                                                    | Stage 6a        |
| 5   | `src/controllers/auth.controller.ts`                                                                | Extend the purpose map (`PURPOSE_MAP`) and the Zod `purpose` enum for `verify-otp` and `resend-otp` with `forgot_password` → `'Forgot Password'`, and add the dispatch case in `verifyOtp` and `resendOtp`                                                                   | Stage 6c, 6e    |
| 6   | `src/services/auth.service.ts` (`login`)                                                            | Create the refresh token inside `withTransaction` after locking the user, and re-check the password hash and status on the locked row (see the race-safety bullet in Stage 4c)                                                                                               | Stage 4c        |
| 7   | `src/services/auth.service.ts` (`resendRegistrationOtp`)                                            | Change the limit message text to `'Maximum OTP resends reached. Please try registering again in about 10 minutes.'`. Nothing else about registration changes.                                                                                                                | Stage 5e        |
| 8   | `src/services/auth.service.ts` (`refresh`), `src/db/queries/tokens.queries.ts` (`lockRefreshToken`) | `refresh` runs in `withTransaction`: plain early-exit read, then lock the user row, then lock the token row (`lockRefreshToken`), re-check revoked/expired/suspended on the locked rows, and issue the token from the locked user. `lockRefreshToken` also returns `db_now`. | Stage 4d        |
| 9   | `src/routes/auth.routes.ts`                                                                         | Remove `authenticate` from `POST /auth/logout`: `router.post('/logout', authController.logout)`. The handler already reads the refresh cookie, so nothing else changes. `authenticate` then has no consumers until `GET /users/me` (Stage 7).                                | Stage 4d        |

New code (not changes to existing code): `requestOtp` in `otp.service.ts`, `revokeAllRefreshTokensForUser` in `tokens.queries.ts`, `updatePasswordHash` in `users.queries.ts`, and the new service functions and controllers in 6b–6e.

---

## Stage 6a: `checkOtp` Consume Flag + Email Template

### Update `src/services/otp.service.ts`

Change `checkOtp`'s signature to accept an optional `consume` parameter, default `true`:

```ts
checkOtp({ userId, purpose, otp }, db, consume: boolean = true)
```

- Steps 1–4 (find latest OTP, check expiry, check attempts, compare hash) are unchanged.
- Step 5 (wrong guess): unchanged — always `incrementAttempts`, return `{ ok: false }`, regardless of `consume`.
- Step 6 (correct guess):
  - If `consume` is `true` (the default): unchanged — call `consumeOtp`. If it returns `false`, treat as `INVALID_OTP`. Return `{ ok: true }`.
  - If `consume` is `false`: **do not** call `consumeOtp`. Just return `{ ok: true }`.

All existing callers (registration's `verifyRegistrationOtp`) keep working unchanged since they don't pass the third argument.

### Add `requestOtp` to `src/services/otp.service.ts`

`issueOtp` sends an email unconditionally, so calling it directly from an endpoint lets a caller spam an address and repeatedly invalidate a user's live OTP. **Any endpoint that sends an OTP must go through `requestOtp`, never `issueOtp` directly** (forgot-password, resend, and later change email, change password and admin action).

`requestOtp({ userId, email, purpose, newEmail? }, db)` — must be called inside `withTransaction`:

1. `locked = lockUserById(userId, db)`. If `locked` is null (deleted while waiting) → return `{ status: 'no-user' }`. If `locked.status === 'pending'` → return `{ status: 'not-verified' }` (a pending account never gets OTPs through `requestOtp`; registration has its own resend).
2. Resend limit: `countOtps(userId, purpose, db, config.otp.resendWindowMinutes)` (rolling window). If `count - 1 >= config.otp.maxResends` → return `{ status: 'throttled', reason: 'limit' }`.
3. Cooldown: `findLatestOtp(userId, purpose, db)`. If `created_at + config.otp.resendCooldownSeconds > db_now` → return `{ status: 'throttled', reason: 'cooldown', retryAfterSeconds }`, where `retryAfterSeconds` is the time until the next resend is allowed.
4. Otherwise `issueOtp(...)` and return `{ status: 'sent' }`. `EMAIL_SEND_FAILED` from `issueOtp` propagates unchanged.

When throttled, **nothing is sent and the existing OTP is not invalidated**. `requestOtp` only reports what happened; each caller decides how to react. Forgot-password and its resend turn `throttled` into a real `429` (`OTP_RESEND_COOLDOWN` with `Retry-After`, or `OTP_RESEND_LIMIT`).

### Update `src/services/email.service.ts`

Add an entry to the `purpose → { subject, intro }` map for `Forgot Password`:

- Subject: `"Your FoC password reset code"`
- Body: same shape as the registration email (OTP + expiry from `config.otp.ttlMinutes`), no links, dev-log fallback unchanged

### Verification

- No behavior change for the existing registration flow: re-run Stage 5e's happy-path and wrong-OTP tests, confirm they still pass unmodified
- The `consume: false` behaviour is verified through the endpoints in Stage 6c (the OTP row's `consumed_at` stays `NULL` after `verify-otp`, and wrong guesses still increment `attempts_count`). Vitest unit tests for Stage 6 are deferred.
- `requestOtp` when throttled (inside the cooldown, or at the resend limit) → returns `throttled`, no email is sent, and the previous OTP row's `consumed_at` is still `NULL`

---

## Stage 6b: `POST /auth/forgot-password`

### Update `src/services/auth.service.ts`

Implement `forgotPassword({ email })`, inside `withTransaction`:

- `findByEmail(email)`. If no user found → `AppError(404, 'Email not found', 'EMAIL_NOT_FOUND')` (no OTP sent). If the user is `pending` → `AppError(403, 'Account not verified. Please finish registration first.', 'ACCOUNT_NOT_VERIFIED')` (cheap early exit; `requestOtp` re-checks after the lock)
- If found → `requestOtp({ userId: user.id, email, purpose: 'Forgot Password' }, client)` (see Stage 6a) and map its result:
  - `sent` → return normally
  - `throttled` with `reason: 'cooldown'` → `AppError(429, 'Please wait before requesting another OTP', 'OTP_RESEND_COOLDOWN', retryAfterSeconds)` (about 60 seconds)
  - `throttled` with `reason: 'limit'` → `AppError(429, 'Maximum OTP resends reached. Please try again in about an hour.', 'OTP_RESEND_LIMIT')`
  - `no-user` → `AppError(404, 'Email not found', 'EMAIL_NOT_FOUND')`
  - `not-verified` → `AppError(403, 'Account not verified. Please finish registration first.', 'ACCOUNT_NOT_VERIFIED')`
- `EMAIL_SEND_FAILED` from `requestOtp` propagates as `503`

### Update `src/controllers/auth.controller.ts`

Implement `forgotPassword` handler:

Validate request body with Zod (`.strict()`, custom messages, presence/type/extra-fields only):

- `email`: required `"Email is required"`, type `"Email must be a string"` (use the shared `emailField`: trimmed and lowercased)

- Call `authService.forgotPassword()`
- Return `200` with `{ message: 'A reset code has been sent to your email', code: 'OTP_SENT' }`

### Wire up route

Add to `auth.routes.ts`:

```ts
router.post("/forgot-password", authController.forgotPassword);
```

### Verification

- `POST /auth/forgot-password` with a registered email → `200 OTP_SENT`, one `users_otps` row created with `purpose = 'Forgot Password'`, dev console shows the OTP
- `POST /auth/forgot-password` twice in a row for a registered email → the second returns `429 OTP_RESEND_COOLDOWN` with a `Retry-After` header; only one `users_otps` row exists and the first OTP is still valid
- Two concurrent `POST /auth/forgot-password` for the same email → exactly one `200`, the other `429`, and exactly one OTP row created
- `POST /auth/forgot-password` after the resend limit is reached (backdate `created_at` between requests) → `429 OTP_RESEND_LIMIT` with the message "try again in about an hour"; no new row, no email
- `POST /auth/forgot-password` with an unregistered email → `404 EMAIL_NOT_FOUND`, no `users_otps` row created
- `POST /auth/forgot-password` with the email of a still-pending (unverified) registration → `403 ACCOUNT_NOT_VERIFIED`, no `Forgot Password` OTP row created
- `POST /auth/forgot-password` with a missing/wrong-type `email` field → `400 VALIDATION_ERROR` as usual
- `POST /auth/forgot-password` with an extra field → `400 VALIDATION_ERROR`, `"Request contains unexpected fields"`
- Force an email-send failure for a registered email → `503 EMAIL_SEND_FAILED`

---

## Stage 6c: `verify-otp` — Forgot Password Purpose

This extends the existing `verify-otp` endpoint from Stage 5e rather than adding a new route.

### Update Zod schema in `src/controllers/auth.controller.ts`

Extend the `purpose` enum for `POST /auth/verify-otp` to accept `'registration'` (existing) and `'forgot_password'` (new). Same error message pattern: not in the allowed list → `"Invalid purpose"`.

### Update `src/services/auth.service.ts`

Implement `verifyForgotPasswordOtp({ email, otp })`:

Inside `withTransaction`:

1. `findByEmail(email)`. If none → `AppError(404, 'Email not found', 'EMAIL_NOT_FOUND')`. If the user is `pending` → `AppError(403, 'Account not verified. Please finish registration first.', 'ACCOUNT_NOT_VERIFIED')`.
2. `locked = lockUserById(user.id)`. If `locked` is null (the row was deleted while waiting) → `EMAIL_NOT_FOUND`. If `locked.status === 'pending'` → `ACCOUNT_NOT_VERIFIED`. Suspended accounts are allowed.
3. `checkOtp({ userId: user.id, purpose: 'Forgot Password', otp }, client, /* consume */ false)`
4. Commit, then: if `{ ok: false }` → throw `AppError(400, 'Invalid or expired OTP', 'INVALID_OTP')`
5. On success, return nothing sensitive — **no state change happens here**, this call only validates

> Note the same warning from Stage 5c applies: the wrong-guess path must not throw inside the transaction, or the attempt increment gets rolled back and the limit becomes bypassable.

### Update the `verifyOtp` controller

Dispatch on `purpose`:

- `'registration'` → existing `authService.verifyRegistrationOtp()` call, unchanged, returns `{ message: 'Registration complete. You can now log in.', code: 'REGISTER_SUCCESS' }`
- `'forgot_password'` → new `authService.verifyForgotPasswordOtp()` call, returns `200` with `{ message: 'Code verified. You can now set a new password.', code: 'OTP_VERIFIED' }`

### Verification

- `POST /auth/verify-otp` with the correct forgot-password OTP → `200 OTP_VERIFIED`, and the OTP row's `consumed_at` is still `NULL` afterward (confirm in DB)
- Re-submitting the same correct OTP again → still `200 OTP_VERIFIED` (not yet consumed, so it's still valid) — confirm this is the intended behavior, not a bug
- Wrong OTP → `400 INVALID_OTP`, `attempts_count` incremented and persisted
- 5 wrong OTPs → `429 OTP_ATTEMPTS_EXCEEDED`
- Expired OTP with the correct code → `400 OTP_EXPIRED`
- Unknown email → `404 EMAIL_NOT_FOUND`
- Email of a still-pending (unverified) registration → `403 ACCOUNT_NOT_VERIFIED`
- `purpose: "forgot password"` (with a space, wrong format) → `400 VALIDATION_ERROR`, `"Invalid purpose"`

---

## Stage 6d: `POST /auth/reset-password`

### Create query in `src/db/queries/tokens.queries.ts`

- `revokeAllRefreshTokensForUser(userId, db)` — `UPDATE refresh_tokens SET is_revoked = true, revoked_at = NOW() WHERE user_id = $1 AND is_revoked = false`

### Update `src/services/auth.service.ts`

Implement `resetPassword({ email, otp, newPassword })`:

- Validate `newPassword` complexity using the same rule and message as registration → `AppError(400, '...', 'VALIDATION_ERROR')` if it fails
- Validate `otp` matches `^\d{6}$` → `AppError(400, 'OTP must be a 6-digit code', 'VALIDATION_ERROR')` if not

Inside `withTransaction`:

1. `findByEmail(email)`. If none → `AppError(404, 'Email not found', 'EMAIL_NOT_FOUND')`. If the user is `pending` → `AppError(403, 'Account not verified. Please finish registration first.', 'ACCOUNT_NOT_VERIFIED')`.
2. `locked = lockUserById(user.id)`. If `locked` is null (the row was deleted while waiting) → `EMAIL_NOT_FOUND`. If `locked.status === 'pending'` → `ACCOUNT_NOT_VERIFIED`. Suspended accounts are allowed.
3. `checkOtp({ userId: user.id, purpose: 'Forgot Password', otp }, client)` — **default consuming check**, this is the real gate
4. If `{ ok: true }`:
   - Hash `newPassword` with bcrypt (work factor 10)
   - Update `users.password_hash` for this user
   - `revokeAllRefreshTokensForUser(user.id, client)`
5. Commit, then: if `{ ok: false }` → throw `AppError(400, 'Invalid or expired OTP', 'INVALID_OTP')`

You'll need a new query function for the password update — add `updatePasswordHash(userId, passwordHash, db)` to `users.queries.ts` if it doesn't already exist.

### Update `src/controllers/auth.controller.ts`

Implement `resetPassword` handler:

Validate request body with Zod (`.strict()`, custom messages, presence/type/extra-fields only — format/complexity rules stay in the service layer):

- `email`: required `"Email is required"`, type `"Email must be a string"` (use the shared `emailField`: trimmed and lowercased)
- `otp`: required `"OTP is required"`, type `"OTP must be a string"`
- `newPassword`: required `"New password is required"`, type `"New password must be a string"`

- Call `authService.resetPassword()`
- Return `200` with `{ message: 'Password reset successful. Please log in with your new password.', code: 'PASSWORD_RESET_SUCCESS' }`

### Wire up route

Add to `auth.routes.ts`:

```ts
router.post("/reset-password", authController.resetPassword);
```

### Verification

Happy path:

- `forgot-password` → `verify-otp {purpose: forgot_password}` (optional, doesn't consume) → `reset-password` with the correct OTP → `200 PASSWORD_RESET_SUCCESS`, password hash changed in DB, all that user's `refresh_tokens` rows now have `is_revoked = true`
- Login with the new password → `200`
- Login with the old password → `401 INVALID_CREDENTIALS`
- A previously-issued access token for this user is still valid until it naturally expires (only refresh tokens are revoked) — confirm this is the intended behavior

OTP rules (same shape as Stage 5e, now on `reset-password` instead of `verify-otp`):

- Wrong OTP → `400 INVALID_OTP`, attempt incremented and persisted
- 5 wrong OTPs, then the correct one → `429 OTP_ATTEMPTS_EXCEEDED`, password unchanged
- Expired OTP with the correct code → `400 OTP_EXPIRED`
- Re-using an already-consumed OTP (call `reset-password` twice with the same code) → second call → `400 INVALID_OTP`
- Calling `reset-password` directly, skipping `verify-otp` entirely, with a correct OTP → `200 PASSWORD_RESET_SUCCESS` (confirms `verify-otp` is optional UX, not a required gate)
- Unknown email → `404 EMAIL_NOT_FOUND`
- Email of a still-pending (unverified) registration → `403 ACCOUNT_NOT_VERIFIED`

Validation:

- Weak `newPassword` → `400 VALIDATION_ERROR` with the standard password-complexity message
- `otp` not 6 digits → `400 VALIDATION_ERROR`, `"OTP must be a 6-digit code"`
- Missing `newPassword` → `400 VALIDATION_ERROR`, `"New password is required"`
- Extra field → `400 VALIDATION_ERROR`, `"Request contains unexpected fields"`

Concurrency:

- Fire two `POST /auth/reset-password` with the correct OTP near-simultaneously → exactly one `200`, the other `400 INVALID_OTP`, password changed exactly once
- Run several `POST /auth/login` requests with the **old** password in a loop while calling `reset-password` → after the reset, no non-revoked refresh token exists for that user that was created by an old-password login

---

## Stage 6e: `resend-otp` — Forgot Password Purpose

This extends the existing `resend-otp` endpoint from Stage 5e.

### Update Zod schema in `src/controllers/auth.controller.ts`

Extend the `purpose` enum for `POST /auth/resend-otp` to accept `'forgot_password'` alongside `'registration'`.

### Update `src/services/auth.service.ts`

Implement `resendForgotPasswordOtp({ email })`. It is the same operation as `forgotPassword` (both request a fresh OTP through `requestOtp`), so implement it once and call it from both:

- `findByEmail(email)`, then `requestOtp(...)` inside `withTransaction`, with the same result mapping as Stage 6b: unknown email or `no-user` → `404 EMAIL_NOT_FOUND`; pending account or `not-verified` → `403 ACCOUNT_NOT_VERIFIED`; `throttled` → `429 OTP_RESEND_COOLDOWN` (with `Retry-After`) or `429 OTP_RESEND_LIMIT`; `sent` → return normally.

### Update the `resendOtp` controller

Dispatch on `purpose`, same pattern as `verifyOtp`:

- `'registration'` → existing `authService.resendRegistrationOtp()`, unchanged
- `'forgot_password'` → new `authService.resendForgotPasswordOtp()`

Both return `200` with `{ message: 'A new verification code has been sent to your email', code: 'OTP_SENT' }` on success. For `forgot_password`, an unknown email returns `404 EMAIL_NOT_FOUND`, and a throttled request returns a real `429`.

### Verification

- Resend for a registered email, immediately after `forgot-password` → `429 OTP_RESEND_COOLDOWN` with a `Retry-After` header (seconds until the next resend is allowed)
- Resend for a registered email, after the cooldown → `200 OTP_SENT`, previous OTP row now has `consumed_at` set
- After 5 successful resends inside the window, the 6th → `429 OTP_RESEND_LIMIT` (message: try again in about an hour)
- Once the oldest OTP is older than `resendWindowMinutes`, resend works again (the limit is not permanent)
- Resend for an unregistered email → `404 EMAIL_NOT_FOUND`, no DB row created
- Resend for a still-pending (unverified) registration → `403 ACCOUNT_NOT_VERIFIED`, no `Forgot Password` OTP row created

- Extra/wrong-type fields → same `400 VALIDATION_ERROR` pattern as before

---

### Notes for Later Stages (do not implement now)

- Every endpoint that sends an OTP (change email, change password, admin action, and any future one) must call `requestOtp`, never `issueOtp` directly. Without it, a logged-in user could use `PUT /users/me/email` to email any address without limit.
- Frontend for forgot-password: for the first 5 resends, disable the resend button with a countdown from `Retry-After` ("try again in 60 seconds"). On `OTP_RESEND_LIMIT`, disable resend and show "try again in about an hour" (no countdown).
- Change Email and Change Password reuse the same `issueOtp`/`checkOtp` pair, but don't need the `consume` flag — their `PUT /users/me/...` endpoints already know the new value (new email / new password) before the OTP is even sent, so it's natural for them to store it on the pending user/OTP state and let `verify-otp` finalize directly in one step, the same way registration does. Confirm this design when we get there rather than assuming it carries over unchanged.
- Admin Action's OTP purpose will need its own finalize shape (likely: the pending action's target and effect stored somewhere before the OTP is sent) — not yet designed.
- Lock ordering: any transaction that locks both a user row and refresh-token rows locks the user row first (see the lock ordering rule in Stage 4d). Suspend and change-password must follow it too.
- Suspending a user (admin) and changing a password (F4.3.4) must revoke all of the user's refresh tokens in the same locked transaction as the change; the login check added in Stage 4c (re-verify hash and status after locking) is what stops a concurrent login from issuing a token afterwards.
- NFR1 (account lockout after repeated failed attempts) is a Week 10 item and separate from the per-OTP `max_attempts` limit already built.

## Stage 7: Comprehensive Test Suite (For Stage 1-6)

> **How to use this stage**: This supersedes the earlier instruction "Do not add
> new test cases unless I ask" — this stage is that ask. It covers everything
> built in Stages 1–6 (scaffold through Forgot Password). Do not write
> implementation code changes as part of this stage — see the rules below.

### Ground rules

1. **Read the current codebase first**, not just this file. Where the code and
   this file disagree, follow the code and tell me about the difference (same
   rule as every other stage).
2. **Do not make any design decisions, choose behavior for unclear cases, or
   pick an interpretation when this file is ambiguous.** If you're about to
   write a test and the correct expected behavior isn't clearly specified
   anywhere (in this file, the product backlog, or the working docs), stop and
   ask me instead of guessing. A wrong guess here becomes a de facto spec that
   later work gets held to — that's worse than an unanswered question.
3. **Do not modify application code to make a test pass.** If a test reveals a
   real deviation from something this file specifies, report it as a separate
   finding — do not fix it, and do not write the test to assert the buggy
   behavior as correct.
4. **Do not test for the absence of deferred features.** NFR1 (lockout), NFR2
   (email retry/delivery logging), and rate limiting generally are Week 10
   items per this file's own notes. Don't write tests asserting they don't
   exist yet — that breaks the day they land — and don't write tests for their
   behavior since they aren't built.
5. Before writing any tests, produce a list of every point you found unclear
   or unspecified, as a separate deliverable — not buried in code comments.
   Wait for my answers on anything you're genuinely unsure about rather than
   picking a reasonable-sounding default.

### Test stack

- **Vitest** for the runner and assertions (already the project's choice).
- **Supertest** for HTTP-level tests against the Express app — add it and its
  types to `package.json` devDependencies.
- **A real Postgres instance for integration tests — do not mock `pg`.** Most
  of what this file cares about (`SELECT ... FOR UPDATE`, `FOR UPDATE SKIP
LOCKED`, transaction rollback on wrong OTP guesses, lock ordering to avoid
  deadlocks, `clock_timestamp()` vs `NOW()`) is database behavior that a
  mocked pool cannot validate. Set up a dedicated test database (or schema),
  apply `init.sql` fresh, and truncate the relevant tables in
  `beforeEach`/`afterEach`.
- Reserve mocked-`pg` unit tests for pure logic with no locking or
  transactions involved — `hash.ts`, `otp.ts`'s digit-format check, `jwt.ts`
  claim shape, and Zod schema validation in isolation.
- For tests that need to manipulate DB state directly (expire an OTP, backdate
  `created_at`, suspend a user, promote a role), write small SQL test helpers
  rather than going through the API — several of this file's own verification
  steps already describe doing this manually.
- Structure test files to mirror the source tree, not the build stages.
  Co-locate each test file next to the source it covers, with `describe`
  blocks per function/route and further nesting for edge cases where a
  function has several (happy path, expiry handling, attempt limiting, etc.):
  - `controllers/auth.controller.test.ts` — one `describe` per route handler
    (register, login, logout, refresh, forgotPassword, resetPassword)
  - `services/auth.service.test.ts` — one `describe` per exported function
  - `services/otp.service.test.ts` — verify, resend, generate (whichever
    exist as separate functions)
  - `services/email.service.test.ts`
  - `services/bootstrap.service.test.ts`
  - `middleware/authenticate.test.ts` — inter-service token verification
  - `db/queries/users.queries.test.ts`, `otp.queries.test.ts`,
    `tokens.queries.test.ts` — integration tests against the real test DB
  - `utils/hash.test.ts`, `jwt.test.ts`, `otp.test.ts` — pure-logic unit
    tests, mocked `pg` where relevant (per the mocking rule above)
    Keep a separate top-level `concurrency/` folder for the cross-cutting
    race-condition tests (these show up across login, register, verify-otp,
    resend-otp, logout, refresh, and reset-password, and are easiest to review
    together) — do not duplicate a concurrency case inside its
    controller/service test file just because it's _about_ that function.

### Infrastructure

- **App/server split**: split `app.ts` into a pure `app` export (Express app
  only, no `bootstrapSuperAdmin()` call, no `.listen()`) and a new
  `server.ts` that imports `app`, runs the bootstrap, then listens. Nothing that
  currently imports `app.ts` for its side effects should break; check for any such
  imports and update them to use `server.ts` instead.
- **Test database**: a second database on the existing `user-db` Postgres
  instance (e.g. `user_service_test`), not a new container. Add a one-time
  setup script that runs the existing `init.sql` against it, so the test
  schema can never drift from the real schema. Reuse `user-db`'s existing
  credentials; only `DB_NAME` differs.
- **Env vars**: a committed `.env.test` (no real secrets — dummy SMTP, dummy
  super-admin password, test DB name), loaded via a Vitest setup file
  (`dotenv.config({ path: '.env.test' })`), wired in through
  `vitest.config.ts`'s `setupFiles`.
- **JWT keys**: generate a throwaway RS256 key pair at test-setup time
  (`crypto.generateKeyPairSync`) rather than relying on the gitignored
  `keys/` folder, which won't exist on a fresh clone or in CI. Write to a
  temp path and point the key-path env vars at it.
- **Parallelism**: set `fileParallelism: false` in `vitest.config.ts`. Tests
  share one DB and truncate between runs, so sequential execution is the
  safe default.
- **Location**: tests live in `user-service/tests/`, sibling to `src/`, with
  `tests/concurrency/` for the cross-cutting race-condition suite. Since
  `tsconfig.json` only includes `src/**/*`, this keeps test files out of
  `tsc` and the prod Docker build with no tsconfig changes needed.
- Add `vitest.config.ts` at `user-service/` root, `supertest` and its
  `@types` to `package.json` devDependencies, and a `"test"` script already
  exists (`vitest`) — confirm it picks up the new config and test location.

### Mocking policy

- **Email**: mock `sendOtpEmail` (or the nodemailer transport) with `vi.mock`
  for both OTP capture and forced-failure (503/rollback) tests. This is
  exempt from the "no mocking `pg`" rule — that rule is specifically about
  locking/transaction correctness, which only real Postgres can validate.
  Prefer mocking the function directly over spying on the dev-fallback
  `console.log` — the console log is a logging implementation detail, not a
  stable test seam.
- **Config (bootstrap tests only)**: `vi.mock` the config module is
  permitted for the single test file covering "configured super-admin
  username/email already belongs to a regular user," since it needs
  different config values than the rest of the suite. Keep this mock scoped
  to that file.

### Manual-only verification bullets

- `npm install`, `docker compose up --build`, `\dT+ status_enum` inspection,
  and "keys exist" checks are infra/tooling, not application behavior — leave
  these manual. List them in the traceability table as "manual — not
  automated" rather than omitting them.
- The two config-validation exit cases (missing required env var; empty SMTP
  vars with `NODE_ENV=production`) are real application logic in `config.ts`
  and should be automated by spawning it as a child process with a modified
  env and asserting on exit code and stderr content.

### Temporary protected route

For Stage 4e's cross-check between `authenticate` middleware and
`GET /auth/verify` against the same token, mount a throwaway Express route
inside the test file itself. Do not add anything to `app.ts`/`server.ts` for
this.

### Concurrency test parameters

Define shared constants once (e.g. `CONCURRENT_REQUESTS`, in a test-helpers
file) and reuse them across the `concurrency/` suite rather than varying
per-test. Start with a small number sufficient to reliably trigger the race
(e.g. 5 concurrent requests) and a modest loop count for sustained-race tests
(e.g. 20 iterations); adjust only if a specific test proves flaky.

### Traceability table

- Items that are partially built (e.g. F5.1.1, F5.1.4–F5.1.6, F2.2.1,
  F2.3.1, NFR4) are listed as **partial**, with a one-line note of what's
  covered by tests so far and what isn't — not excluded from the table.
- Items not yet built at all (F4, F5.3) are listed as **not yet
  implemented** — not omitted.
- The table lives in `user-service/tests/TRACEABILITY.md`, not in chat, since
  it needs to be revisited as later stages land.

### Coverage

Treat every bullet under every stage's **Verification** section (Stages 1
through 6, including the "Changes to already-implemented code" table in
Stage 6) as a required test case, not a suggestion — that list already
enumerates the edge cases and alternative workflows this file cares about most:
duplicate username/email races, OTP wrong-guess persistence across rollback,
resend cooldown/limit boundaries (including the rolling-window vs all-time
distinction between registration and forgot-password), lock-ordering deadlock
checks between `refresh` and `reset-password`, stale-pending-user cleanup with
`SKIP LOCKED`, suspended/pending account interactions with login/refresh,
role-claim freshness after promotion, and the "confirm this is intended, not a
bug" notes (e.g. non-consuming `verify-otp` for forgot-password being
re-submittable, an old access token surviving a password reset).

### Stage 7 changes to reverse or review before deployment

Changes made for the test suite that affect how the service is run. The first two must be undone before any real deployment.

- **`compose.yaml`, `user-db` `ports: - "5434:5432"` (REVERSE):** publishes the database on the host so Vitest can reach it. Remove the `ports:` block (and its TEMPORARY comment) before deploying, so the database is only reachable inside the compose network.
- **`user_service_test` database on the `user-db` instance (REVIEW):** `tests/setup/globalSetup.ts` drops and recreates it on every test run. It refuses to touch any database whose name does not end in `_test`. Do not run the suite against a deployed database, and drop `user_service_test` if it exists there.
- **`.env.test` (no action):** committed, dummy values only. It must never hold real credentials.
- **`app.ts` / `server.ts` split (KEEP):** `app.ts` now only builds and exports the Express app. `src/server.ts` runs the super admin bootstrap and calls `listen()`. The `start` and `dev` scripts in `package.json` and the prod `CMD` in `Dockerfile` (`node dist/server.js`) were updated to match. This is not meant to be reversed.

### Deliverables

1. The test files

# Stage 8: RBAC Middleware

> **Scope**: This stage builds the authorization layer only — the `authorize` middleware
> itself. It has no consumers yet; Stages 9 and 10 are where it actually gets wired onto
> routes. No DB changes in this stage.
>
> Backlog refs: supports F5.1.1, F5.1.4, F5.1.5, F5.1.6 (enforcement mechanism only —
> the actual endpoints these protect are Stages 9–10).

### Design decisions (already made, do not change)

| Rule                     | Value                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role check style         | Minimum-role (`authorize('admin')` = "admin or higher"), not an explicit per-route list                                                                                                                                                                                                                 |
| Role ordering            | `user` (0) < `admin` (1) < `super admin` (2)                                                                                                                                                                                                                                                            |
| Stale role claims        | A role change (promotion or demotion) does **not** invalidate an already-issued access token. The token rides out its remaining life (up to 15 min) on the old role — identical to how a suspension is handled today. Enforcement catches up at the next `refresh` call, not immediately.               |
| Refresh-token revocation | A role change revokes **all** of the target user's refresh tokens in the same transaction as the change (same treatment `resetPassword` and suspend already give). This doesn't shrink the 15-minute window above — it only stops the old role from being extended indefinitely via repeated refreshes. |

### Create `src/middleware/authorize.ts`

- Export a rank table:

```ts
const ROLE_RANK: Record<string, number> = {
  user: 0,
  admin: 1,
  "super admin": 2,
};
```

- Export `authorize(minimumRole: string)` — a middleware **factory**. Calling
  `authorize('admin')` returns an Express middleware function; it does not itself take
  `(req, res, next)`.
- The returned middleware:
  1. Reads `req.user` (set by `authenticate`, which must run first in the chain).
  2. If `req.user` is missing (defensive — `authorize` used on a route without
     `authenticate` ahead of it), reject with `401` and
     `{ message: 'Unauthorized', code: 'UNAUTHORIZED' }`, matching `authenticate`'s own
     shape. Do not treat this as a `403` — the caller was never authenticated at all.
  3. Otherwise compare `ROLE_RANK[req.user.role] >= ROLE_RANK[minimumRole]`.
  4. If the check passes, call `next()`.
  5. If it fails, reject with `403` and
     `{ message: 'Forbidden', code: 'FORBIDDEN' }`.
- Usage pattern (for reference — not implemented until Stage 9/10):

```ts
router.get("/users", authenticate, authorize("admin"), usersController.list);
router.put(
  "/users/:id/role",
  authenticate,
  authorize("super admin"),
  usersController.changeRole,
);
```

### Verification

- Unit test (Vitest, no DB, no Express app needed): for each of the 6 (caller role ×
  required role) combinations that matter — `user`→`user`, `user`→`admin`,
  `admin`→`user`, `admin`→`admin`, `admin`→`super admin`, `super admin`→`admin` — confirm
  `next()` is called or not, as expected, by passing a fake `req`/`res`/`next`.
- `authorize('admin')` with no `req.user` set at all → `401 UNAUTHORIZED`, `next()` never
  called.
- Confirm `authorize` throws no errors of its own — it only ever calls `next()` or
  responds directly; it should not need `asyncHandler` (no async work, no DB call).

### Tests (Vitest)

Write the Vitest tests for this stage, following the Stage 7 ground rules and layout
(`tests/middleware/authorize.test.ts`). Every bullet under Verification above is a required test
case. Do not modify application code to make a test pass.

---

# Stage 9: Admin Endpoints — View Users, Suspend/Unsuspend

> **Scope**: `GET /users`, `GET /users/:id`, `PUT /users/:id/status`. All three require
> `authenticate` + `authorize('admin')`.
>
> Backlog refs: F5.3.1, F5.3.3.

### Design decisions (already made, do not change)

| Rule                               | Value                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /users` response shape        | `{ users: [...] }` (wrapped, not a bare array)                                                                                                                                                                                                                                                                 |
| Fields returned per user           | Every column except `password_hash` — `id, username, email, status, role, created_at, updated_at`                                                                                                                                                                                                              |
| Pending users                      | `GET /users` and `GET /users/:id` both return users **regardless of status, including `pending`**. The `status` field in the response is how a caller tells a pending (unverified) registration apart from a real account — no separate flag needed.                                                           |
| `GET /users/:id` — not found       | `404` with `{ message: 'User not found', code: 'USER_NOT_FOUND' }`                                                                                                                                                                                                                                             |
| `GET /users/:id` — malformed `:id` | `400` with message `"Invalid user ID"`, code `VALIDATION_ERROR` — enforced via a Zod `.uuid()` check on `req.params.id` at the controller (same convention as every other validation in this codebase), before any DB call                                                                                     |
| `PUT /users/:id/status` body       | `{ status: 'active' \| 'suspended' }`                                                                                                                                                                                                                                                                          |
| Suspend side-effect                | Revokes **all** of the target user's refresh tokens in the same transaction (already required by the general rule from Stage 4: "anything that... suspends a user... must revoke ALL that user's refresh tokens in the SAME transaction as the change")                                                        |
| Unsuspend side-effect              | None beyond the status flip — no tokens to revoke, there's nothing live to reactivate                                                                                                                                                                                                                          |
| Locking                            | `withTransaction` + `lockUserById` + re-check-after-lock, same pattern as every other state-changing operation in this service                                                                                                                                                                                 |
| Target role restriction            | An `admin` caller may only suspend/unsuspend a target with `role = 'user'`. A `super admin` caller may suspend/unsuspend a `user` or `admin` target, but not another `super admin`.                                                                                                                            |
| Error codes for role restrictions  | Any caller targeting a `super admin` (including a super admin targeting one) → `403 SUPER_ADMIN_IMMUTABLE`. An `admin` caller targeting an `admin` → `403 FORBIDDEN`.                                                                                                                                          |
| Pending target                     | The status of a `pending` user cannot be changed through this endpoint, to either `suspended` or `active`. A pending account only becomes active through OTP verification. Responds `422 CANNOT_CHANGE_STATUS_PENDING_USER`, message `'Cannot change the status of a pending user'`, for either target status. |
| No-op requests                     | If the target is already in the requested status, this is a success, not an error: return `200` with the unchanged user, and skip both the DB write and the token revocation                                                                                                                                   |
| Service file location              | `listUsers`, `getUserById`, `changeUserStatus` (and Stage 10's `changeUserRole`) live in a new `src/services/users.service.ts`, not `auth.service.ts` — matching how `otp.service.ts` and `email.service.ts` were already split out from `auth.service.ts`                                                     |
| Naming (query vs. service)         | The query function stays `updateUserStatus` (matches the SQL operation). The service function that calls it is `changeUserStatus`, to avoid two different-layer functions sharing one name (same split for Stage 10's `updateUserRole` query vs. `changeUserRole` service)                                     |

### Add to `src/db/queries/users.queries.ts`

- `listAllUsers(db)` — `SELECT * FROM users ORDER BY created_at DESC`. (Named `listAllUsers`, not `listActiveUsers` — it returns every status, including `pending` and `suspended`, so a name implying an "active" filter would be misleading.)
- `updateUserStatus(userId, status, db)` — `UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, run inside the transaction against the locked row

### Create `src/services/users.service.ts`

Implement `listUsers()`:

- Call `listAllUsers()`, strip `password_hash` from every row before returning

Implement `getUserById(id)`:

- `findById(id)`. If none → `AppError(404, 'User not found', 'USER_NOT_FOUND')`
- Strip `password_hash`, return the rest
- (UUID format is already validated at the controller before this function is called — no need to re-check here)

Implement `changeUserStatus(requestorRole, targetId, status)`:
Inside `withTransaction`:

1. `locked = lockUserById(targetId, client)`. If null → `AppError(404, 'User not found', 'USER_NOT_FOUND')`
2. Target-role restriction, checked before anything else:
   - If `locked.role === 'super admin'` → `AppError(403, 'Cannot modify a super administrator', 'SUPER_ADMIN_IMMUTABLE')` (whoever the caller is)
   - If `locked.role === 'admin' && requestorRole === 'admin'` → `AppError(403, 'Only a super admin may suspend an admin', 'FORBIDDEN')`
3. Pending target: if `locked.status === 'pending'` → reject; the status of a pending user cannot be changed → `AppError(422, 'Cannot change the status of a pending user', 'CANNOT_CHANGE_STATUS_PENDING_USER')`
4. No-op check: if `locked.status === status` → return `locked` (minus `password_hash`) as-is, no write, no revocation
5. `updateUserStatus(locked.id, status, client)`
6. If `status === 'suspended'` → `revokeAllRefreshTokensForUser(locked.id, client)` (already built in Stage 6d)
7. Return the updated row, `password_hash` stripped

### Controllers in a new `src/controllers/users.controller.ts`

- `list` → `asyncHandler`, calls `usersService.listUsers()`, returns `200` with `{ users: [...] }`
- `getById` → validate `req.params.id` with a Zod schema (`z.object({ id: z.string().uuid('Invalid user ID') })`), then calls `usersService.getUserById(id)`, returns `200` with the user object. A failed `.uuid()` check produces a `ZodError`, which the global error handler already turns into `400 VALIDATION_ERROR` with that message — no manual `400` handling needed here.
- `updateStatus` → validate `req.params.id` the same way as `getById`, validate the body with Zod (`.strict()`, `status` enum of `['active', 'suspended']`, custom messages matching your existing style: required → `"Status is required"`, type → `"Status must be a string"`, invalid enum value → `"Status must be 'active' or 'suspended'"`), then calls `usersService.changeUserStatus(req.user.role, req.params.id, status)`, returns `200` with the updated user object

### Create `src/routes/users.routes.ts`

```ts
router.get("/", authenticate, authorize("admin"), usersController.list);
router.get("/:id", authenticate, authorize("admin"), usersController.getById);
router.put(
  "/:id/status",
  authenticate,
  authorize("admin"),
  usersController.updateStatus,
);
```

Mount at `/users` in `app.ts`.

### Verification

- `GET /users` as a regular user → `403 FORBIDDEN`
- `GET /users` as an admin → `200`, `{ users: [...] }`, no `password_hash` field on any entry, includes a `pending` account (mid-registration, OTP not yet verified) alongside `active`/`suspended` ones, distinguishable via its `status` field
- `GET /users` with no `Authorization` header → `401 UNAUTHORIZED`
- `GET /users/:id` with a valid existing ID → `200`, full user minus `password_hash`
- `GET /users/:id` on a pending user's ID → `200`, returns the user with `status: 'pending'`
- `GET /users/:id` on a suspended user's ID → `200`, returns the user with `status: 'suspended'`
- `GET /users/:id` with a well-formed UUID that doesn't exist → `404 USER_NOT_FOUND`
- `GET /users/:id` with a non-UUID string (e.g. `abc123`) → `400 VALIDATION_ERROR`, `"Invalid user ID"`
- `PUT /users/:id/status {status: 'suspended'}` on an active user → `200`, user's status is `suspended` in DB, all their `refresh_tokens` rows now `is_revoked = true`
- `PUT /users/:id/status {status: 'active'}` on a suspended user → `200`, status flips back, no token rows touched by this call
- `PUT /users/:id/status {status: 'pending'}` → `400 VALIDATION_ERROR` (not a valid target)
- `PUT /users/:id/status` as a regular user → `403 FORBIDDEN`
- `PUT /users/:id/status` on a nonexistent ID → `404 USER_NOT_FOUND`
- Admin suspends a plain user → `200`
- Admin suspends an admin → `403 FORBIDDEN`
- Admin suspends the super admin → `403 SUPER_ADMIN_IMMUTABLE`
- Super admin suspends a plain user → `200`
- Super admin suspends an admin → `200`
- Super admin attempts to suspend the super admin account → `403 SUPER_ADMIN_IMMUTABLE`
- `PUT /users/:id/status {status: 'suspended'}` on a `pending` user → `422 CANNOT_CHANGE_STATUS_PENDING_USER`, user stays `pending`
- `PUT /users/:id/status {status: 'active'}` on a `pending` user → `422 CANNOT_CHANGE_STATUS_PENDING_USER`, user stays `pending`, not activated
- Suspend an already-suspended user → `200`, unchanged user returned, `updated_at` unchanged, no new revocation activity, none of the tokens' `revoked_at` timestamps change
- Unsuspend an already-active user → `200`, unchanged user returned, `updated_at` unchanged, no new revocation activity
- Suspend a user, then attempt `POST /auth/refresh` with their pre-suspension refresh cookie → `401` (revoked) — confirms this endpoint reuses the same revocation your reset-password flow already relies on
- Two concurrent `PUT /users/:id/status` calls on the same user (different target statuses) → no deadlock, no `500`, exactly one status wins, reflects normal lock-then-write serialization

### Tests (Vitest)

Write the Vitest tests for this stage, following the Stage 7 ground rules, real-Postgres
approach and layout (query tests, service tests, controller/HTTP tests, and the concurrent-status
case in `tests/concurrency/`). Every bullet under Verification above is a required test case.
Do not modify application code to make a test pass.

---

# Stage 10: Super Admin — Promote / Demote

> **Scope**: `PUT /users/:id/role`. Requires `authenticate` + `authorize('super admin')`.
> Backlog refs: F5.1.6.

### Design decisions (already made, do not change)

| Rule                     | Value                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Body                     | `{ role: 'admin' \| 'user' }` — `super admin` is never a valid value here (it's assigned only by bootstrap, never by this endpoint)                                                                                                                                                                                     |
| Self-targeting           | Rejected — a super admin cannot change their own role via this endpoint                                                                                                                                                                                                                                                 |
| Target is a super admin  | Rejected — a super admin account can never be modified through this endpoint (there is exactly one, created by bootstrap)                                                                                                                                                                                               |
| Target is not active     | Rejected — the role of a `pending` or `suspended` user cannot be changed; only an `active` target is allowed. `pending` → `422 CANNOT_CHANGE_ROLE_PENDING_USER` (`'Cannot change the role of a pending user'`); `suspended` → `422 CANNOT_CHANGE_ROLE_SUSPENDED_USER` (`'Cannot change the role of a suspended user'`). |
| Refresh-token revocation | A successful role change revokes **all** of the target user's refresh tokens in the same transaction (same as suspend)                                                                                                                                                                                                  |
| No-op requests           | If the target already has the requested role, this is a success, not an error: return `200` with the unchanged user, and skip both the DB write and the token revocation                                                                                                                                                |
| Locking                  | `withTransaction` + `lockUserById` + re-check-after-lock                                                                                                                                                                                                                                                                |
| `:id` validation         | Same as Stage 9 — Zod `.uuid()` at the controller: `400 VALIDATION_ERROR` for a malformed UUID, `404 USER_NOT_FOUND` for a well-formed one that doesn't exist                                                                                                                                                           |
| Service/query naming     | Query function `updateUserRole` (in `users.queries.ts`); service function `changeUserRole` (in `users.service.ts`) — same split as Stage 9's status functions                                                                                                                                                           |

### Add to `src/db/queries/users.queries.ts`

- `updateUserRole(userId, role, db)` — `UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, run inside the transaction against the locked row

### Add to `src/services/users.service.ts`

Implement `changeUserRole(requesterId, targetId, newRole)`:

- If `targetId === requesterId` → `AppError(403, 'Cannot modify your own role', 'SELF_ROLE_CHANGE')`

Inside `withTransaction`:

1. `locked = lockUserById(targetId, client)`. If null → `AppError(404, 'User not found', 'USER_NOT_FOUND')`
2. If `locked.role === 'super admin'` → `AppError(403, 'Cannot modify a super administrator', 'SUPER_ADMIN_IMMUTABLE')`
3. Non-active target: the role of a non-active user cannot be changed.
   - If `locked.status === 'pending'` → `AppError(422, 'Cannot change the role of a pending user', 'CANNOT_CHANGE_ROLE_PENDING_USER')`
   - If `locked.status === 'suspended'` → `AppError(422, 'Cannot change the role of a suspended user', 'CANNOT_CHANGE_ROLE_SUSPENDED_USER')`
     This is checked before the no-op case, so a non-active user is rejected even if `newRole` equals their current role.
4. No-op check: if `locked.role === newRole` → return `locked` (minus `password_hash`) as-is, no write, no revocation
5. `updateUserRole(locked.id, newRole, client)`
6. `revokeAllRefreshTokensForUser(locked.id, client)`
7. Return the updated row, `password_hash` stripped

### Controller

`changeRole` in `users.controller.ts` → `asyncHandler`, validate `req.params.id` with the same Zod `.uuid()` schema as Stage 9 (`400 VALIDATION_ERROR`, `"Invalid user ID"` if not), validate body with Zod (`.strict()`, `role` enum of `['admin', 'user']`, custom messages: required → `"Role is required"`, type → `"Role must be a string"`, invalid enum → `"Role must be 'admin' or 'user'"`), read the requester's own ID off `req.user.user_id`, call `usersService.changeUserRole()`, return `200` with the updated user object.

### Wire up route

```ts
router.put(
  "/:id/role",
  authenticate,
  authorize("super admin"),
  usersController.changeRole,
);
```

### Verification

- `PUT /users/:id/role {role: 'admin'}` on a regular user, as super admin → `200`, role updated, all their refresh tokens revoked
- `PUT /users/:id/role {role: 'user'}` on an admin, as super admin → `200`, demoted, tokens revoked
- Same call as a regular admin (not super admin) → `403 FORBIDDEN` (blocked by `authorize`, never reaches the handler — confirms F5.1.5 is satisfied by the middleware alone)
- Same call as a regular user → `403 FORBIDDEN`
- Super admin targets their own ID → `403 SELF_ROLE_CHANGE`
- Super admin targets the bootstrap super-admin account's own ID (if somehow not caught by the self-check, e.g. a second super admin existed) → `403 SUPER_ADMIN_IMMUTABLE`
- `{role: 'super admin'}` in the body → `400 VALIDATION_ERROR`, `"Role must be 'admin' or 'user'"`
- Nonexistent target ID → `404 USER_NOT_FOUND`
- Non-UUID target ID → `400 VALIDATION_ERROR`, `"Invalid user ID"`
- Promote a user to admin, then that user's _pre-promotion_ access token (still `role: user`) hits an admin-only route within its remaining lifetime → still rejected with `403` (expected — a promotion also doesn't take effect until refresh, same as the stale-claim rule from Stage 8); after they `refresh`, the new token carries `role: admin` and the same route succeeds
- Demote an admin, then within the old token's remaining lifetime, hit an admin route → still succeeds (expected, matches Stage 8's documented tradeoff); attempt `POST /auth/refresh` with their old refresh cookie → `401` (revoked), forcing re-login rather than a quiet demotion
- `PUT /users/:id/role` on a `pending` user → `422 CANNOT_CHANGE_ROLE_PENDING_USER`, role unchanged
- `PUT /users/:id/role` on a `suspended` user → `422 CANNOT_CHANGE_ROLE_SUSPENDED_USER`, role unchanged, no token rows touched
- Two concurrent `PUT /users/:id/role` calls on the same target with different roles → no deadlock, no `500`, exactly one role wins
- Promote an admin to admin again → `200`, unchanged user, no refresh tokens revoked
- Demote a user to user again → `200`, unchanged user, no refresh tokens revoked

### Tests (Vitest)

Write the Vitest tests for this stage, following the Stage 7 ground rules, real-Postgres
approach and layout (with the concurrent-role case in `tests/concurrency/`). Every bullet under
Verification above is a required test case. Do not modify application code to make a test pass.

# Stage 11: Requester/Courier Toggle

> **Scope**: `PUT /users/me/active-view`. Requires `authenticate` only — any logged-in user can toggle their own view; no role restriction, since F5.2.1 already establishes every user can act as both requester and courier without restriction.
>
> Backlog refs: F5.2.2.

### Design decisions (already made, do not change)

| Rule                        | Value                                                                                                                                                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enum values                 | `'requester'` \| `'courier'`                                                                                                                                                                                                                                          |
| Default                     | `'requester'` — for both new users (schema default) and existing rows (migration backfill)                                                                                                                                                                            |
| Column                      | `active_view` on the `users` table, new `active_view_enum` type                                                                                                                                                                                                       |
| Route location              | New `src/routes/me.routes.ts`, mounted at `/users/me`                                                                                                                                                                                                                 |
| Controller/service location | New `src/controllers/me.controller.ts` and `src/services/me.service.ts` — self-service concerns, kept separate from admin's `users.controller.ts` / `users.service.ts`. Stage 12's profile endpoints (view/change own username, email, password) will also live here. |
| Endpoint shape              | One endpoint only: `PUT /users/me/active-view`. No separate `GET` — the frontend gets the current value from the `user` object already returned by `login` (this stage adds `activeView` to that object)                                                              |
| Locking                     | None needed — this is a single-column update with no dependent side effects (no token revocation, no other rows affected), so a plain conditional `UPDATE` is enough; it doesn't need `withTransaction` + `lockUserById` the way suspend/role-change do               |
| Authorization scope         | No cross-service exposure — `activeView` doesn't gate what a user can do (F5.2.1 already allows all actions to all users), so it isn't added to the JWT claims or to `GET /auth/verify`. It's a display preference only the owning user's own frontend ever reads.    |

### Update `src/db/init.sql`

Add a new enum, using the same safe-creation pattern as the existing enums:

```sql
DO $$ BEGIN
  CREATE TYPE active_view_enum AS ENUM ('requester', 'courier');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
```

Add the column to the `users` table:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS active_view active_view_enum NOT NULL DEFAULT 'requester';
```

`init.sql` only applies to a fresh DB volume — if you're adding this to an existing dev database, either reset with `docker compose down -v` (dev data only, same as the Stage 5a pattern) or run the `ALTER TABLE` manually against the running container. Remind me which applies when you report back.

### Update `src/db/queries/users.queries.ts`

- `updateActiveView(userId, activeView, db)` — `UPDATE users SET active_view = $2, updated_at = NOW() WHERE id = $1 RETURNING *`

### Create `src/services/me.service.ts`

Implement `changeActiveView(userId, activeView)`:

- `updateActiveView(userId, activeView)` — no lock, no transaction, no existing-value check (unlike Stage 9/10's status/role changes, there's no "invalid transition" here — a user can always freely switch between the two values, and there's no side effect to make atomic with the write)
- If the query returns no row (user was deleted concurrently — unlikely but possible), throw `AppError(404, 'User not found', 'USER_NOT_FOUND')`
- Strip `password_hash`, return the rest

### Create `src/controllers/me.controller.ts`

Implement `updateActiveView`:

- `asyncHandler`-wrapped
- Validate body with Zod (`.strict()`, custom messages matching your existing style): `activeView` required → `"Active view is required"`, type → `"Active view must be a string"`, invalid enum value → `"Active view must be 'requester' or 'courier'"`
- Read the caller's own ID off `req.user.user_id` (never take an ID from the request body — this endpoint only ever modifies the caller's own row)
- Call `meService.changeActiveView(req.user.user_id, activeView)`
- Return `200` with the updated user object

### Create `src/routes/me.routes.ts`

```ts
router.put("/active-view", authenticate, meController.updateActiveView);
```

### Update `app.ts`

Mount `meRouter` at `/users/me` **before** `usersRouter` at `/users`:

```ts
app.use("/users/me", meRouter);
app.use("/users", usersRouter);
```

This order is required — if `usersRouter` (with its `GET /:id` route from Stage 9) is registered first, a request to `/users/me` would be matched by `/:id` with `id = 'me'`, fail the UUID validation, and never reach `meRouter` at all.

---

## Change to already-implemented code

| #   | File                                     | Change                                                                                                                           | Where specified         |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1   | `src/services/auth.service.ts` (`login`) | Add `activeView` to the returned `user` object: `{ id, username, email, role, activeView }`. No other change to `login`'s logic. | Stage 4c (return shape) |

### Verification

- `PUT /users/me/active-view {activeView: 'courier'}` while authenticated → `200`, updated user object returned with `active_view: 'courier'` (same DB-row shape as `GET /users/:id`, snake_case — not `activeView`, which is only `login`'s response shape), `active_view` column updated in DB
- `PUT /users/me/active-view {activeView: 'requester'}` on a user already set to `'requester'` → `200`, unchanged (this doesn't need a special no-op branch like Stage 9/10 — an unconditional `UPDATE` to the same value is harmless and still returns `200` correctly)
- `PUT /users/me/active-view` with no `Authorization` header → `401 UNAUTHORIZED`
- `PUT /users/me/active-view {activeView: 'admin'}` (not a valid enum value) → `400 VALIDATION_ERROR`, `"Active view must be 'requester' or 'courier'"`
- Missing `activeView` field → `400 VALIDATION_ERROR`, `"Active view is required"`
- `activeView: 123` (wrong type) → `400 VALIDATION_ERROR`, `"Active view must be a string"`
- Extra field in the body → `400 VALIDATION_ERROR`, `"Request contains unexpected fields"`
- A newly registered-and-verified user, before ever calling this endpoint → their `active_view` is `'requester'` by default (schema default, not a manual insert)
- `POST /auth/login` response now includes `activeView` in the `user` object, reflecting whatever was last set (or the default, if never changed)
- Request to `/users/me` (no further path segment) → `meRouter` has no `GET` route, so this falls through to `usersRouter`'s `GET /:id` with `id = 'me'`, which is expected and not a mount-order bug: no token → `401 UNAUTHORIZED`; regular user → `403 FORBIDDEN` (blocked by `authorize('admin')`); admin → `400 VALIDATION_ERROR`, `"Invalid user ID"` (the UUID check rejects `'me'`). `PUT /users/me/active-view` still reaches `meRouter`, because it is mounted first — that's what the mount order actually guards.
- Two concurrent `PUT /users/me/active-view` calls with different values from the same user → no deadlock (there's no lock to deadlock on), last write wins, no `500`

## Stage 11b: Test Suite — Requester/Courier Toggle

> **Scope**: Vitest tests for Stage 11 only (`PUT /users/me/active-view`, the `activeView`
> addition to `login`'s response, and the `active_view` column/enum).

Follow the same ground rules, test stack, and mocking policy established in Stage 7 (read the
current codebase first, not just this file; do not invent behavior for anything unclear — list
it and ask instead of guessing; do not modify application code to make a test pass; use the
real test Postgres instance for anything involving the DB, mocked `pg` only for pure logic with
no DB/transaction involved).

### What to test

Treat every bullet in Stage 11's own **Verification** section as a required test case:

- Successful toggle to `'courier'` and to `'requester'`, confirming both the response body and
  the `active_view` column in the DB
- The "set to the same value it already has" case — confirm this returns `200` normally, since
  Stage 11 deliberately has no no-op short-circuit (unlike Stage 9/10's status/role changes)
- Missing `Authorization` header → `401`
- Invalid enum value, missing field, wrong type, and unrecognized extra field → the four
  `400 VALIDATION_ERROR` cases, each with its exact message
- A newly registered-and-activated user defaults to `'requester'` without ever calling this
  endpoint
- `POST /auth/login`'s response now includes `activeView` in the `user` object
- Two concurrent `PUT /users/me/active-view` calls with different values from the same user →
  no deadlock, no `500` (there's no lock here, so this is really just confirming the endpoint
  doesn't blow up under concurrent writes, not testing any serialization guarantee)

### One thing NOT to test here

Do not write a test asserting what `GET /users/me` currently does (falling through to
`usersRouter`'s `GET /:id`, producing `403` for a regular user or `400` for an admin). That
behavior is a known, temporary gap that Stage 12 closes by giving `meRouter` its own route for
the bare path — a test asserting today's fallthrough would immediately become false, and
contradict Stage 12's own tests, the moment that stage lands. If you think this gap needs
documenting somewhere, note it in your unclear-points list rather than encoding it as a test.

### Deliverables

1. The test file(s) for Stage 11, placed to mirror the source tree per Stage 7's convention
   (e.g. `tests/controllers/me.controller.test.ts`, `tests/services/me.service.test.ts`)

## Stage 12: Profile Management (View, Change Username / Email / Password)

> **Scope**: `GET /users/me`, `PUT /users/me/username`, `PUT /users/me/email`, `PUT /users/me/password`, `POST /users/me/confirm-password-change`, plus two new authenticated OTP routes: `POST /users/me/verify-otp`, `POST /users/me/resend-otp`. `/auth/verify-otp` and `/auth/resend-otp` are untouched — still public, still only `registration` | `forgot_password`.
>
> Backlog refs: F4.1, F4.2, F4.3, F4.4.

### Design decisions (already made, do not change)

| Rule                                         | Value                                                                                                                                                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /users/me` response                     | `{ username, email }` only                                                                                                                                                                                                                                                           |
| Username change                              | `PUT /users/me/username` — no password re-entry, no OTP                                                                                                                                                                                                                              |
| Username validation                          | Same format rule as registration (min 3, max 255, no spaces/special chars). Same as current → `409 USERNAME_UNCHANGED`. Taken by another account → `409 USERNAME_TAKEN` (reuses registration's code)                                                                                 |
| Email change — API-facing purpose            | `change_email` → DB enum `'Change Email'`                                                                                                                                                                                                                                            |
| Email change flow                            | One-step, like registration: `PUT /users/me/email` (current password + newEmail) issues an OTP to the NEW email, stored as `users_otps.new_email`; `POST /users/me/verify-otp {purpose: change_email}` finalizes directly, writing `users.email`                                     |
| Email validation                             | Same format rule as registration. Same as current → `409 EMAIL_UNCHANGED`. Taken by another account → `409 EMAIL_TAKEN`                                                                                                                                                              |
| Old email stays authoritative until verified | F4.2.6 — `users.email` untouched until the OTP is verified                                                                                                                                                                                                                           |
| Password change — API-facing purpose         | `change_password` → DB enum `'Change Password'`                                                                                                                                                                                                                                      |
| Password change flow                         | Two calls, nothing pending stored server-side: `PUT /users/me/password` (current password + newPassword — validated, NOT persisted) issues an OTP to the CURRENT/registered email; `POST /users/me/confirm-password-change {otp, newPassword}` re-supplies and applies `newPassword` |
| New password validation                      | Same complexity rule as registration. Identical to current password → `400 PASSWORD_UNCHANGED`                                                                                                                                                                                       |
| Password re-entry check (both flows)         | `bcrypt.compare` against the current password hash — verified on an unlocked read first (bcrypt is slow), then re-verified against the locked row inside the transaction, same race-safety pattern as `login`                                                                        |
| Successful password change side-effect       | Revoke ALL of that user's refresh tokens in the same transaction (F4.3.4)                                                                                                                                                                                                            |
| Successful email/username change side-effect | None                                                                                                                                                                                                                                                                                 |
| Route split for OTP endpoints                | `/auth/verify-otp` / `/auth/resend-otp` stay PUBLIC, purposes `registration` \| `forgot_password` only. Two NEW, AUTHENTICATED routes: `POST /users/me/verify-otp` (purpose `change_email` only) and `POST /users/me/resend-otp` (purposes `change_email`, `change_password`)        |
| Why password-change has no verify-otp entry  | Its OTP is checked and consumed only inside `confirm-password-change` — `/users/me/verify-otp`'s purpose enum has just `change_email` for now                                                                                                                                        |
| Resending a change-email OTP                 | `/users/me/resend-otp {purpose: change_email}` resends to the SAME pending `new_email`, read off the latest OTP row — the client does not repeat it                                                                                                                                  |
| Locking                                      | `withTransaction` + `lockUserById`, same pattern as every other state-changing operation                                                                                                                                                                                             |
| Concurrent duplicate username/email          | Same `23505` → mapped-error pattern as registration                                                                                                                                                                                                                                  |
| Service file location                        | All new functions live in `src/services/me.service.ts` (created in Stage 11) — not `auth.service.ts` or `users.service.ts`                                                                                                                                                           |

No changes to already-implemented code are needed for this stage — everything below is additions only.

---

### Stage 12a: `GET /users/me`

#### Add to `src/services/me.service.ts`

`getOwnProfile(userId)`:

- `findById(userId)`. If none → `AppError(404, 'User not found', 'USER_NOT_FOUND')`
- Return `{ username: user.username, email: user.email }` — nothing else, not just `password_hash` stripped

#### Add to `src/controllers/me.controller.ts`

`getProfile` — `asyncHandler`, calls `meService.getOwnProfile(req.user.user_id)`, returns `200` with the object directly (not wrapped in `{ user: ... }`).

#### Add to `src/routes/me.routes.ts`

```ts
router.get("/", authenticate, meController.getProfile);
```

#### Verification

- `GET /users/me` while authenticated → `200`, `{ username, email }`, no other fields
- `GET /users/me` with no `Authorization` header → `401 UNAUTHORIZED`

---

### Stage 12b: Change Username

#### Add to `src/db/queries/users.queries.ts`

`updateUsername(userId, username, db)` — `UPDATE users SET username = $2, updated_at = NOW() WHERE id = $1 RETURNING *`

#### Add to `src/services/me.service.ts`

`changeUsername(userId, newUsername)`:

- Validate format (same rule/message as registration's username) → `400 VALIDATION_ERROR`

Inside `withTransaction`:

1. `locked = lockUserById(userId, client)`. If null → `404 USER_NOT_FOUND`
2. If `newUsername === locked.username` → `AppError(409, 'New username must be different from your current username', 'USERNAME_UNCHANGED')`
3. `existing = findByUsername(newUsername, client)`. If `existing && existing.id !== userId` → `AppError(409, 'Username already in use', 'USERNAME_TAKEN')`
4. `updateUsername(locked.id, newUsername, client)` — wrap in try/catch for `23505` → same `USERNAME_TAKEN` mapping as registration (covers the concurrent race)
5. Return `{ username: updated.username, email: updated.email }`

#### Add to `src/controllers/me.controller.ts`

`changeUsername` — Zod (`.strict()`): `newUsername` required "New username is required", type "New username must be a string", lowercased-only (not trimmed, same as registration's username field). Calls `meService.changeUsername()`, returns `200` with the returned profile object.

#### Add to `src/routes/me.routes.ts`

```ts
router.put("/username", authenticate, meController.changeUsername);
```

#### Verification

- Valid new username → `200`, `{ username: <new>, email }`, DB row updated
- Same as current username → `409 USERNAME_UNCHANGED`
- Username belonging to another account → `409 USERNAME_TAKEN`
- Invalid format (too short / spaces / special chars) → `400 VALIDATION_ERROR`
- Missing/extra/wrong-type fields → standard `400 VALIDATION_ERROR` pattern
- No `Authorization` header → `401 UNAUTHORIZED`
- Two concurrent `PUT /users/me/username` requests from two different accounts both targeting the same new username → exactly one `200`, the other `409 USERNAME_TAKEN`, never `500`

---

### Stage 12c: Change Email — Initiate

#### Update `src/services/email.service.ts`

Add a `Change Email` entry to the purpose map: subject `"Confirm your new FoC email address"`, same body shape as the others.

#### Add to `src/services/me.service.ts`

`initiateEmailChange(userId, { currentPassword, newEmail })`:

- Validate `newEmail` format (same rule as registration) → `400 VALIDATION_ERROR`
- Unlocked read: `user = findById(userId)`. `bcrypt.compare(currentPassword, user.password_hash)`; mismatch → `AppError(401, 'Current password is incorrect', 'INVALID_PASSWORD')`
- If `newEmail === user.email` → `AppError(409, 'New email must be different from your current email', 'EMAIL_UNCHANGED')`
- `existing = findByEmail(newEmail)`. If `existing && existing.id !== userId` → `AppError(409, 'Email already in use', 'EMAIL_TAKEN')`

Inside `withTransaction`:

1. `locked = lockUserById(userId, client)`. If null → `404 USER_NOT_FOUND`
2. Re-verify `currentPassword` against `locked.password_hash` (race-safety) → `401 INVALID_PASSWORD` on mismatch
3. Re-check `newEmail` against `locked.email` and re-query `findByEmail(newEmail, client)` for the same two conditions (closes the gap between the unlocked read and the lock)
4. `requestOtp({ userId, email: locked.email, purpose: 'Change Email', newEmail }, client)`
5. Map the result the same way `forgotPassword` does: `sent` → success; `throttled` (cooldown/limit) → `429 OTP_RESEND_COOLDOWN` / `429 OTP_RESEND_LIMIT`; `EMAIL_SEND_FAILED` propagates as `503`

#### Add to `src/controllers/me.controller.ts`

`changeEmail` (`PUT /users/me/email`) — Zod (`.strict()`): `currentPassword` required "Current password is required"/string; `newEmail` uses the shared `emailField`. Returns `200` with `{ message: 'Verification code sent to your new email', code: 'OTP_SENT' }`.

#### Add to `src/routes/me.routes.ts`

```ts
router.put("/email", authenticate, meController.changeEmail);
```

#### Verification

- Correct current password + valid new unused email → `200 OTP_SENT`, `users_otps` row with `purpose = 'Change Email'`, `new_email` set, dev console/inbox shows the OTP
- Wrong current password → `401 INVALID_PASSWORD`, no OTP row created
- `newEmail` same as current → `409 EMAIL_UNCHANGED`
- `newEmail` already registered to another account → `409 EMAIL_TAKEN`, no OTP row created
- Immediately repeating the request → `429 OTP_RESEND_COOLDOWN` with `Retry-After`
- After the resend limit (backdate `created_at`) → `429 OTP_RESEND_LIMIT`
- SMTP send forced to fail → `503 EMAIL_SEND_FAILED`, rolled back cleanly
- No `Authorization` header → `401 UNAUTHORIZED`

---

### Stage 12d: `/users/me/verify-otp` and `/users/me/resend-otp`

#### Add to `src/db/queries/users.queries.ts`

`updateEmail(userId, email, db)` — `UPDATE users SET email = $2, updated_at = NOW() WHERE id = $1 RETURNING *`

#### Add to `src/services/me.service.ts`

`verifyEmailChangeOtp(userId, otp)`:

Inside `withTransaction`:

1. `locked = lockUserById(userId, client)`. If null → `404 USER_NOT_FOUND`
2. `pending = findLatestOtp(userId, 'Change Email', client)`. If none → `AppError(400, 'Invalid or expired OTP', 'INVALID_OTP')`
3. `checkOtp({ userId, purpose: 'Change Email', otp }, client)` — default consuming
4. If `{ ok: true }`: `updateEmail(locked.id, pending.new_email, client)`, wrapped in try/catch for `23505` → `AppError(409, 'Email already in use', 'EMAIL_TAKEN')` (someone else took it in the meantime — the whole transaction, including the OTP consumption, rolls back, so the OTP is still usable if the user picks a different email)
5. Commit; if `{ ok: false }` → `400 INVALID_OTP`

`resendChangeEmailOtp(userId)`:

Inside `withTransaction`:

1. `locked = lockUserById(userId, client)`. If null → `404 USER_NOT_FOUND`
2. `pending = findLatestOtp(userId, 'Change Email', client)`. If none, or `consumed_at` is set → `AppError(400, 'No pending email change found', 'NO_PENDING_EMAIL_CHANGE')`
3. `requestOtp({ userId, email: locked.email, purpose: 'Change Email', newEmail: pending.new_email }, client)`
4. Map result same as Stage 12c (cooldown/limit/sent/email-fail)

`resendChangePasswordOtp(userId)`:

Inside `withTransaction`:

1. `locked = lockUserById(userId, client)`. If null → `404 USER_NOT_FOUND`
2. `pending = findLatestOtp(userId, 'Change Password', client)`. If none or `consumed_at` is set → `AppError(400, 'No pending password change found', 'NO_PENDING_PASSWORD_CHANGE')`
3. `requestOtp({ userId, email: locked.email, purpose: 'Change Password' }, client)`
4. Map result same as above

#### Add to `src/controllers/me.controller.ts`

- `verifyOtp` — Zod (`.strict()`): `otp` required/string; `purpose` enum `['change_email']` only, "Invalid purpose" for anything else. Dispatches (currently only one case) to `verifyEmailChangeOtp`. Returns `200` with `{ message: 'Email updated successfully', code: 'EMAIL_CHANGE_SUCCESS' }`.
- `resendOtp` — Zod (`.strict()`): `purpose` enum `['change_email', 'change_password']`. Dispatches to `resendChangeEmailOtp` or `resendChangePasswordOtp`. Both return `200` with `{ message: 'A new verification code has been sent to your email', code: 'OTP_SENT' }`.
- Both read the user id from `req.user.user_id` — neither accepts an `email` field.

#### Add to `src/routes/me.routes.ts`

```ts
router.post("/verify-otp", authenticate, meController.verifyOtp);
router.post("/resend-otp", authenticate, meController.resendOtp);
```

#### Verification

- Correct OTP for a pending email change → `200 EMAIL_CHANGE_SUCCESS`, `users.email` updated, OTP row `consumed_at` set
- Wrong OTP → `400 INVALID_OTP`, `attempts_count` incremented and persisted
- 5 wrong OTPs → `429 OTP_ATTEMPTS_EXCEEDED`, email unchanged
- Expired OTP with correct code → `400 OTP_EXPIRED`
- `purpose: 'change_password'` sent to `/users/me/verify-otp` → `400 VALIDATION_ERROR`, `"Invalid purpose"`
- Someone else registers the pending `new_email` first, then the original user submits the correct OTP → `409 EMAIL_TAKEN`, OTP still valid afterward (not consumed)
- Resend for change_email → `200 OTP_SENT`, same `new_email` reused, previous OTP row's `consumed_at` set
- Resend for change_email with no pending change → `400 NO_PENDING_EMAIL_CHANGE`
- Resend for change_password with no pending change → `400 NO_PENDING_PASSWORD_CHANGE`
- Both routes with no `Authorization` header → `401 UNAUTHORIZED`
- `POST /auth/verify-otp` and `POST /auth/resend-otp` (the original public ones) still reject `change_email`/`change_password` as an invalid purpose — confirms the two purpose sets stayed separate

---

### Stage 12e: Change Password — Initiate + Confirm

#### Add to `src/services/me.service.ts`

`initiatePasswordChange(userId, { currentPassword, newPassword })`:

- Validate `newPassword` complexity (registration rule) → `400 VALIDATION_ERROR`
- Unlocked read: `user = findById(userId)`. `bcrypt.compare(currentPassword, user.password_hash)`; mismatch → `401 INVALID_PASSWORD`
- `bcrypt.compare(newPassword, user.password_hash)` — if true → `AppError(400, 'New password must be different from your current password', 'PASSWORD_UNCHANGED')`

Inside `withTransaction`:

1. `locked = lockUserById(userId, client)`. If null → `404 USER_NOT_FOUND`
2. Re-verify `currentPassword` against `locked.password_hash` → `401 INVALID_PASSWORD` on mismatch
3. `requestOtp({ userId, email: locked.email, purpose: 'Change Password' }, client)`
4. Map result (cooldown/limit/sent/email-fail), same pattern as 12c

`newPassword` is validated here but never written anywhere — it's discarded once this call returns.

`confirmPasswordChange(userId, { otp, newPassword })`:

- Validate `newPassword` complexity → `400 VALIDATION_ERROR`
- Validate `otp` matches `^\d{6}$` → `400 VALIDATION_ERROR`, `"OTP must be a 6-digit code"`

Inside `withTransaction`:

1. `locked = lockUserById(userId, client)`. If null → `404 USER_NOT_FOUND`
2. `bcrypt.compare(newPassword, locked.password_hash)` — if true → `400 PASSWORD_UNCHANGED` (re-checked here in case the password changed between initiate and confirm)
3. `checkOtp({ userId, purpose: 'Change Password', otp }, client)` — default consuming
4. If `{ ok: true }`: hash `newPassword` (bcrypt, work factor 10), `updatePasswordHash(locked.id, hash, client)`, `revokeAllRefreshTokensForUser(locked.id, client)`
5. Commit; if `{ ok: false }` → `400 INVALID_OTP`

#### Add to `src/controllers/me.controller.ts`

- `changePassword` (`PUT /users/me/password`) — Zod (`.strict()`): `currentPassword`, `newPassword` required/string, same message style as `reset-password`. Returns `200` with `{ message: 'Verification code sent to your email', code: 'OTP_SENT' }`.
- `confirmPasswordChange` (`POST /users/me/confirm-password-change`) — Zod (`.strict()`): `otp`, `newPassword` required/string. Returns `200` with `{ message: 'Password changed successfully. Please log in again on other devices.', code: 'PASSWORD_CHANGE_SUCCESS' }`.

#### Add to `src/routes/me.routes.ts`

```ts
router.put("/password", authenticate, meController.changePassword);
router.post(
  "/confirm-password-change",
  authenticate,
  meController.confirmPasswordChange,
);
```

#### Verification

Happy path:

- Correct current password + valid new password → `200 OTP_SENT` → `confirm-password-change` with correct OTP → `200 PASSWORD_CHANGE_SUCCESS`, hash updated, all refresh tokens revoked
- Login with new password → `200`; login with old password → `401 INVALID_CREDENTIALS`
- A previously-issued access token stays valid until it naturally expires (only refresh tokens revoked)

Validation / errors:

- Wrong current password at initiate → `401 INVALID_PASSWORD`, no OTP sent
- `newPassword` same as current at initiate → `400 PASSWORD_UNCHANGED`
- Weak `newPassword` at either step → `400 VALIDATION_ERROR`
- Wrong OTP at confirm → `400 INVALID_OTP`, attempt persisted
- 5 wrong OTPs → `429 OTP_ATTEMPTS_EXCEEDED`, password unchanged
- Expired OTP → `400 OTP_EXPIRED`
- Re-submitting an already-consumed OTP → `400 INVALID_OTP`
- `confirm-password-change` with a different `newPassword` than what was validated at initiate → succeeds with whatever was sent to confirm (confirms initiate's validation was advisory/early-feedback only, not authoritative — note this is intended, not a bug)
- No `Authorization` header on either route → `401 UNAUTHORIZED`

Concurrency:

- Two concurrent `confirm-password-change` calls with the correct OTP → exactly one `200`, the other `400 INVALID_OTP`, password changed once

## Stage 13: Auth Distribution — JWKS Instead of `GET /auth/verify`

> **Scope**: Replace the current inter-service auth pattern — `supplier-service` (and, going
> forward, `order-service` and `credit-service`) calling `GET /auth/verify` on `user-service`
> for every request — with each consuming service verifying the access token itself, locally,
> against `user-service`'s public key. `user-service` publishes its public key(s) at a JWKS
> endpoint instead of answering a per-request verify call. This stage only covers `user-service`
> (signing/publishing side) and a guide for implementers; it does not implement verification
> inside `order-service`, `supplier-service`, or `credit-service` — see Stage 13d.
>
> This supersedes the auth pattern documented in `SupplierServiceArchitecture.md §7` and
> `SupplierServiceSpec.md`. **Scope correction (2026-10-17):** those two docs are _not_ updated
> as part of this stage — the user-service owner only touches `user-service` and this file;
> updating the supplier-service docs is left to that service's own owner.

### Design decisions (already made, do not change)

| Rule                                     | Value                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signing algorithm                        | RS256, unchanged. `user-service` keeps signing with its private key; nothing about `signAccessToken`'s claims changes.                                                                                                                                                                                                                               |
| Key pair for this stage                  | Reuse the existing `user-service/keys/private.pem` / `public.pem` (RSA-2048) as the first key published via JWKS. No new key pair is generated for this stage.                                                                                                                                                                                       |
| Distribution mechanism                   | JWKS. `user-service` exposes its public key(s) at a new, unauthenticated endpoint; consuming services fetch and cache them instead of calling an endpoint per request.                                                                                                                                                                               |
| JWKS endpoint                            | `GET /auth/.well-known/jwks.json` on `user-service`, mounted on the existing `/auth` router. Public, no `authenticate` middleware. Returns `{ keys: [...] }`, standard JWK format (RFC 7517).                                                                                                                                                        |
| Token claims                             | Unchanged (`sub` → `user_id`, `role`). No `aud` claim. The only addition is `kid` in the **JWT header** (not the payload), identifying which key signed the token.                                                                                                                                                                                   |
| Key rotation mechanism                   | Smooth transfer via JWKS: when rotating, the new key's public half is published under a new `kid` and signing cuts over to it; the just-retired key's public half stays published under its own `kid` (as the "previous" key) until its most recently issued tokens (max lifetime: `ACCESS_TOKEN_TTL_MINUTES`) have all expired, then it is dropped. |
| Key/kid configuration                    | One set of env vars per key, not a keystore file. Current signing key: `JWT_KEY_ID`, `JWT_PRIVATE_KEY_PATH`, `JWT_PUBLIC_KEY_PATH` (the last two already exist). Previous key, set only during a rotation overlap window: `JWT_PREVIOUS_KEY_ID`, `JWT_PREVIOUS_PUBLIC_KEY_PATH` (optional; no private key needed for a retired key).                 |
| Access token lifetime                    | Unchanged — `ACCESS_TOKEN_TTL_MINUTES` (currently 15). Not part of this stage.                                                                                                                                                                                                                                                                       |
| Cutover                                  | Instant/hard cutover. `GET /auth/verify` is removed in this stage, not deprecated alongside the new endpoint. There is no dual-support window at the API level (the key-rotation overlap above is a separate, narrower concept — it overlaps _keys_ in the JWKS, not _verification methods_).                                                        |
| Services in scope for consuming the JWKS | `order-service`, `supplier-service`, `credit-service` — all three.                                                                                                                                                                                                                                                                                   |
| Who implements the consuming side        | Not this stage. Stage 13d is a guide only; each service's own implementer writes and owns their verification code.                                                                                                                                                                                                                                   |

---

### Stage 13a: Per-Key Config + Signing/Verification by `kid`

#### Add to `user-service/src/config.ts`

- `JWT_KEY_ID` (required) — the `kid` for the current signing key.
- `JWT_PREVIOUS_KEY_ID` (optional) and `JWT_PREVIOUS_PUBLIC_KEY_PATH` (optional) — set together
  only during a rotation overlap window; both absent otherwise.
- Expose these under `config.jwt` alongside the existing `privateKeyPath` / `publicKeyPath`.

#### Change `user-service/src/utils/jwt.ts`

- Load the current key as `{ kid: config.jwt.keyId, privateKey, publicKey }` from the existing
  paths.
- If both `JWT_PREVIOUS_KEY_ID` and `JWT_PREVIOUS_PUBLIC_KEY_PATH` are set, also load a previous
  key as `{ kid, publicKey }` (no private key).
- `signAccessToken` — same claims as today; add the `keyid` sign option (`jsonwebtoken`'s
  built-in way of setting the JWT header's `kid`) set to the current key's `kid`.
- `verifyAccessToken` — decode the token's header first to read `kid`, look it up against the
  known keys (current, and previous if loaded), and verify with whichever key's public half
  matches. An unknown or missing `kid` is treated as an invalid token (same `401` behavior as
  any other verification failure today — no new error shape).
- Add `getJwks()` — returns `{ keys: [...] }`: for each known public key, export it as a JWK
  (Node's `crypto.createPublicKey(pem).export({ format: 'jwk' })` already yields `{ kty, n, e }`
  for an RSA key — no extra dependency needed) and add `kid`, `use: 'sig'`, `alg: 'RS256'`.

#### Verification

- A token signed by the current key verifies and its `kid` round-trips through `getJwks()`'s
  output.
- A token with no `kid` header, or a `kid` that matches neither known key, fails verification
  the same way a bad-signature token does today.
- With `JWT_PREVIOUS_KEY_ID` / `JWT_PREVIOUS_PUBLIC_KEY_PATH` unset (the normal case), `getJwks()`
  returns exactly one key.

---

### Stage 13b: JWKS Endpoint

#### Add to `user-service/src/controllers/auth.controller.ts`

- `jwks` — `asyncHandler`, no auth check, calls `getJwks()` and returns `200` with its result
  directly.

#### Add to `user-service/src/routes/auth.routes.ts`

```ts
router.get("/.well-known/jwks.json", authController.jwks);
```

#### Remove from `user-service/src/routes/auth.routes.ts` and `auth.controller.ts`

- `router.get('/verify', authController.verify)` and the `verify` controller itself (Stage 13c
  covers the knock-on test/doc updates this removal needs).

#### Verification

- `GET /auth/.well-known/jwks.json` requires no `Authorization` header and returns `200` with
  the current key in JWK format.
- `GET /auth/verify` no longer exists (`404`).

---

### Stage 13c: Remove `GET /auth/verify` — Tests and Docs

#### `user-service` tests

- `tests/controllers/auth.controller.test.ts` — remove the `describe('GET /auth/verify', ...)`
  block. The two unrelated tests that reuse `GET /auth/verify` purely as a "is this access token
  still valid" check (one under `POST /auth/logout`, one under password reset) need a different
  authenticated route to check against instead — `GET /users/me` already exists and is
  `authenticate`-protected.
- `tests/middleware/authenticate.test.ts` — remove the
  `describe('authenticate and GET /auth/verify agree on the same token', ...)` block (the thing
  it was cross-checking against no longer exists).
- Add coverage for the new behavior: the JWKS endpoint's shape and public-access, and
  `verifyAccessToken`/`signAccessToken` round-tripping by `kid` (Stage 13a's verification bullets
  above, as actual test cases).

#### Docs

**Scope correction (2026-10-17):** out of scope for this stage. `supplier-service/SupplierServiceArchitecture.md §7`
and `supplier-service/SupplierServiceSpec.md` still describe calling `GET /auth/verify`; the
user-service owner does not touch them — the user is notifying the supplier-service owner
directly to update them, pointing at the JWKS flow and the Stage 13d guide. (Root `README.md`
was checked and has no such contract-description prose to update — only historical Log-index
rows mentioning the old endpoint, which stay as-is.)

---

### Stage 13d: Guide for `order-service` / `supplier-service` / `credit-service` Implementers

This is documentation, not implementation — write a guide (not code) for whoever implements
token verification in each of the three consuming services. It must cover, at minimum:

- Fetching the JWKS from `GET {USER_SERVICE_URL}/auth/.well-known/jwks.json`.
- Caching keys by `kid` and a reasonable refetch strategy for a `kid` not currently in the
  cache (so key rotation doesn't require restarting every consuming service).
- Verifying the token's signature (RS256) against the matched key, and reading `sub` → `user_id`
  and `role` off the verified payload — the same two fields `GET /auth/verify` used to return.
- Rejecting with `401` on a missing/invalid/unverifiable token, consistent with how
  `user-service`'s own `authenticate` middleware already behaves.
- Noting that `supplier-service/src/middleware/authenticate.ts` currently calls the
  now-removed `GET /auth/verify` and must be rewritten by its implementer following this guide —
  this stage does not rewrite it.

Each service's own implementer writes and owns that service's verification code; this guide
only tells them how, per the decisions in this stage.

- Running `POST /auth/login` with the OLD password in a loop while the reset completes → no non-revoked refresh token survives from an old-password login after the change commits

# Stage 14: Initial Credit Allocation via Transactional Outbox

> **Scope**: When a user becomes active, user-service tells credit-service to allocate their
> initial credits. The request is recorded in an outbox table in `user-db` in the **same
> transaction** as the activation, and a relay running inside user-service delivers it to
> credit-service's `POST /credits/allocate` over HTTP, retrying on failure. Credit-service's side
> is already built and is not touched in this stage.
>
> Activation points covered: registration OTP verification (`verifyRegistrationOtp`) and the
> super admin bootstrap (when it actually creates the super admin).
>
> Backlog refs: F19.1.1 (allocation itself is credit-service's; this stage triggers it). D3 Parts 2–3.
>
> **Before starting:** if any `[DECIDE]` placeholder remains anywhere in this stage, stop and ask
> me. Do not pick a value yourself.

### Design decisions (already made, do not change)

| Rule                    | Value                                                                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport               | HTTP. `POST {CREDIT_SERVICE_URL}/credits/allocate`, JSON body `{ "userId": "<uuid>" }`. No message broker.                                                                                                       |
| Credit-service contract | `201` = allocated. `409 ALREADY_ALLOCATED` = already allocated, nothing granted. Credit dedupes on `userId` only. No service-to-service auth. No `Idempotency-Key` or other custom header is sent.               |
| Durability              | Transactional outbox: the outbox row is inserted with the same `client` and in the same `withTransaction` as the activation (or the super admin insert). Both commit or neither does.                            |
| Relay location          | Inside user-service. Started from `server.ts` after the super admin bootstrap. `app.ts` must not start it (tests import `app`).                                                                                  |
| Poll interval           | 1 second between passes                                                                                                                                                                                          |
| Batch size              | 5 rows per group; a pass repeats groups until no row is due (see "Delivery within a pass")                                                                                                                       |
| Request timeout         | 3 seconds per call                                                                                                                                                                                               |
| Claiming                | None. Two relays may deliver the same row; Credit's `409` makes that harmless. Do not add `FOR UPDATE SKIP LOCKED`, a claim column, or any other claiming mechanism.                                             |
| Max attempts            | 10 failed attempts, then the row is `dead`                                                                                                                                                                       |
| Backoff                 | Exponential with full jitter (see "Backoff" below)                                                                                                                                                               |
| Dead rows               | Kept. Recovered only by the replay script (Stage 14e).                                                                                                                                                           |
| Sent rows               | Kept with `status = 'sent'`, never deleted                                                                                                                                                                       |
| Observability           | The outbox row is the record: `status`, `attempts`, `last_error`, `updated_at`. No per-attempt log lines. The only console output is `console.error` when a whole relay pass fails (e.g. `user-db` unreachable). |
| Super admin             | Gets credits. Bootstrap inserts an outbox row only when it actually created the super admin.                                                                                                                     |
| Already-active users    | Ignored. No backfill.                                                                                                                                                                                            |
| Config                  | `CREDIT_SERVICE_URL` is an env var. Every other value in this table is a constant in code.                                                                                                                       |

### Outcome → action

| Outcome of a delivery attempt                                                                                            | Action                                                             |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Any `2xx` (including `201`)                                                                                              | `sent`                                                             |
| `409`                                                                                                                    | `sent`                                                             |
| `400`, `401`, `403`, `404`, `500`                                                                                        | `dead` immediately (`attempts` incremented, `last_error` recorded) |
| `429`, and any `5xx` other than `500` (e.g. `502`, `503`, `504`)                                                         | Retry with backoff; `dead` once `attempts` reaches 10              |
| Timeout (3 s) or network error (`ECONNREFUSED`, `ENOTFOUND`, `ECONNRESET`, etc.)                                         | Retry with backoff; `dead` once `attempts` reaches 10              |
| `408`, `425` (may resolve on their own)                                                                                  | Retry with backoff; `dead` once `attempts` reaches 10              |
| Any other status not listed above, including every other `3xx` and `4xx` (won't resolve without a code or config change) | `dead` immediately (`attempts` incremented, `last_error` recorded) |

`last_error` format:

- HTTP response: `HTTP <status>` followed by the response body's `code` if the body is JSON and has one, e.g. `HTTP 500 BALANCE_INVARIANT_VIOLATION`. Never store the full response body.
- Timeout: `TIMEOUT`
- Network error: `NETWORK <error code>`, e.g. `NETWORK ECONNREFUSED`

### Backoff

`attempts` counts failed attempts. After the n-th failed attempt (n = the new `attempts` value):

- If n ≥ 10 → `status = 'dead'`
- Otherwise → `next_attempt_at = clock_timestamp() + (random() × min(300, 1 × 2^(n−1))) seconds`

So the caps on the wait are 1, 2, 4, …, 256 seconds, and the actual wait is a random value between 0 and the cap. Compute this in SQL (clock rule: the database owns time), not with `Date.now()` or `Math.random()`. A row whose wait has passed is picked up by the next group, in the same pass or the next one.

### Delivery within a pass

A pass works through the backlog in groups of 5:

1. `findDueCreditAllocations(5)`
2. If it returns no rows, the pass ends.
3. Otherwise, send all of the returned rows concurrently, wait until every request has settled (`Promise.allSettled`, so one failure never stops the others' results from being recorded), and record each result.
4. Go back to step 1 immediately. There is no 1-second wait between groups.

A pass ends only when no row is due. Rows still waiting out their backoff are not due, so they don't keep the pass going; a row whose wait expires during the pass is picked up by a later group in the same pass. Each group takes at most 3 s (the request timeout).

Passes never overlap within one process: schedule the next pass 1 second after the current pass finishes (chained `setTimeout`), not with `setInterval`.

---

## Changes to already-implemented code (do these as part of the sub-stages below)

| #   | File                                                     | Change                                                                                                                                              | Where specified |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | `src/db/init.sql`                                        | New `outbox_status_enum` and `credit_allocation_outbox` table                                                                                       | Stage 14a       |
| 2   | `.env.example`, `.env`, `.env.test`, `src/config.ts`     | Add `CREDIT_SERVICE_URL`                                                                                                                            | Stage 14a       |
| 3   | `src/services/auth.service.ts` (`verifyRegistrationOtp`) | Insert the outbox row after `activateUser` succeeds, same `client`. Replace the `// TODO(credit-service): emit user-registered event here` comment. | Stage 14d       |
| 4   | Super admin bootstrap                                    | Run `createSuperAdmin` and the outbox insert in one `withTransaction`; insert the outbox row only if `createSuperAdmin` returned a row              | Stage 14d       |
| 5   | `src/server.ts`                                          | Start the relay after the bootstrap                                                                                                                 | Stage 14c       |
| 6   | `package.json`                                           | Add the `outbox:replay` script                                                                                                                      | Stage 14e       |

---

## Stage 14a: Schema + Config

### Update `src/db/init.sql`

Add, using the same safe-creation pattern as the existing enums:

```sql
DO $$ BEGIN
  CREATE TYPE outbox_status_enum AS ENUM ('pending', 'sent', 'dead');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS credit_allocation_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status outbox_status_enum NOT NULL DEFAULT 'pending',
  attempts SMALLINT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`init.sql` only runs on a fresh volume. Remind me in your summary to reset with `docker compose down -v` (dev data only), and that the test database is rebuilt from `init.sql` by `globalSetup.ts`.

### Update `.env.example`, `.env`, `.env.test`

```env
# Credit service
CREDIT_SERVICE_URL=http://credit-service:3003
```

In `.env.test` use `http://localhost:3003` (no test calls it yet).

### Update `src/config.ts`

- Add `CREDIT_SERVICE_URL` to the Zod schema as a required URL string.
- Expose it as `config.creditService.url`.
- Strip a trailing slash if present, so `${url}/credits/allocate` is always well-formed.

### Verification

- `docker compose down -v && docker compose up --build` starts cleanly
- `\d credit_allocation_outbox` shows the table; `\dT+ outbox_status_enum` shows `pending`, `sent`, `dead`
- Remove `CREDIT_SERVICE_URL` from `.env` → the app exits with a clear error naming it (revert afterwards)

---

## Stage 14b: Outbox Queries

### Create `src/db/queries/creditOutbox.queries.ts`

All functions take `db: Queryable` as the last parameter (default `pool` where the function is not transaction-only).

- `insertCreditAllocation(userId, db)` — `INSERT INTO credit_allocation_outbox (user_id) VALUES ($1) RETURNING id`. Transaction-only: `db` is required.
- `findDueCreditAllocations(limit, db = pool)` — rows with `status = 'pending' AND next_attempt_at <= clock_timestamp()`, ordered by `next_attempt_at, created_at`, `LIMIT $1`. Plain read, no locking (see Claiming).
- `markCreditAllocationSent(id, db = pool)` — `SET status = 'sent', updated_at = NOW() WHERE id = $1 AND status = 'pending'`. Returns whether a row was updated.
- `markCreditAllocationDead(id, lastError, db = pool)` — `SET status = 'dead', attempts = attempts + 1, last_error = $2, updated_at = NOW() WHERE id = $1 AND status = 'pending'`. Returns whether a row was updated.
- `recordCreditAllocationFailure(id, lastError, { maxAttempts, baseDelaySeconds, maxDelaySeconds }, db = pool)` — one conditional `UPDATE ... WHERE id = $1 AND status = 'pending'` that:
  - sets `attempts = attempts + 1`, `last_error = $2`, `updated_at = NOW()`
  - sets `status = 'dead'` if `attempts + 1 >= maxAttempts`, else leaves it `'pending'`
  - when still pending, sets `next_attempt_at = clock_timestamp() + make_interval(secs => random() * LEAST(maxDelaySeconds, baseDelaySeconds * power(2, attempts)))`. In an `UPDATE`, `attempts` on the right-hand side is the **old** value (n − 1), which gives the 2^(n−1) cap from the Backoff section.

  Returns whether a row was updated. `maxAttempts`, `baseDelaySeconds` and `maxDelaySeconds` are passed as query parameters from the relay's constants, not hard-coded in the SQL.

- `replayDeadCreditAllocations(ids: string[] | null, db = pool)` — `SET status = 'pending', attempts = 0, next_attempt_at = NOW(), updated_at = NOW() WHERE status = 'dead'` and, when `ids` is not null, `AND id = ANY($1)`. Leave `last_error` unchanged. `RETURNING id`.

Every state change is a conditional `UPDATE ... WHERE status = '<expected>'` (convention 3), so a relay can never move a row out of `sent` or `dead`.

### Verification

- Covered through 14c–14e.

---

## Stage 14c: The Relay

### Create `src/services/creditOutbox.relay.ts`

Constants at the top of the file:

```ts
const POLL_INTERVAL_MS = 1000;
const BATCH_SIZE = 5;
const REQUEST_TIMEOUT_MS = 3000;
const MAX_ATTEMPTS = 10;
const BASE_DELAY_SECONDS = 1;
const MAX_DELAY_SECONDS = 300;
```

**`classifyResponseStatus(status: number)`** — pure function, no I/O. Returns `'sent' | 'dead' | 'retry'` per the Outcome → action table. Keep it separate so it can be unit-tested later.

**`deliverCreditAllocation(userId)`**:

- Sends the request:

  ```ts
  fetch(`${config.creditService.url}/credits/allocate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  ```

- Returns `{ action: 'sent' | 'dead' | 'retry', error?: string }`, where `error` follows the `last_error` format
- A timeout → `retry`, `TIMEOUT`. Any other thrown network error → `retry`, `NETWORK <code>` (use the error's `cause.code` if present, else `UNKNOWN`)
- Read the response body only to extract `code` for `last_error`. If the body isn't JSON, ignore it. Never store or log the body.

**One pass**: follows "Delivery within a pass" (groups of `BATCH_SIZE`, sent concurrently, repeated until no row is due). For each result in a group:

- `sent` → `markCreditAllocationSent`; `dead` → `markCreditAllocationDead`; `retry` → `recordCreditAllocationFailure` (passing `MAX_ATTEMPTS`, `BASE_DELAY_SECONDS`, `MAX_DELAY_SECONDS`)
- A `false` return from any of these (row no longer pending, e.g. another relay already handled it) is not an error. Skip it.

**`startCreditOutboxRelay(): { stop(): Promise<void> }`**:

- Runs a pass, then schedules the next one `POLL_INTERVAL_MS` after the pass finishes
- If a pass throws (e.g. `user-db` unreachable), `console.error` a single line with the error message (no user data, no response bodies) and continue with the next scheduled pass. The relay must never crash the process.
- `stop()` cancels the next scheduled pass and resolves once any in-flight pass finishes

### Update `src/server.ts`

- After the super admin bootstrap completes, call `startCreditOutboxRelay()`.
- If `server.ts` already handles shutdown signals, call `stop()` there. If it doesn't, do not add signal handling in this stage; tell me instead.
- `app.ts` must not import or start the relay.

### Verification

- With credit-service running: a pending row becomes `sent` within about a second, and credit-service shows a balance for that user
- With credit-service stopped (`docker compose stop credit-service`): the row stays `pending`, `attempts` goes up over time, `last_error` shows a `NETWORK ...` error, and `next_attempt_at` moves further out roughly as described in Backoff. Start credit-service again → the row becomes `sent` at its next due attempt
- Backdate `next_attempt_at` between attempts to speed it up: after the 10th failed attempt the row is `dead`, and the relay stops picking it up
- Insert more than 5 due rows at once (e.g. several pending rows via SQL for existing users) → they are delivered in groups of at most 5 within a single pass, with no 1-second gap between groups
- Set `CREDIT_SERVICE_URL=http://credit-service:3003/nonexistent` → credit-service returns `404` → the row goes straight to `dead` with `attempts = 1` and `last_error` starting `HTTP 404` (revert afterwards)
- Manually set a `sent` row back to `pending` → the relay delivers it again, credit-service returns `409`, the row becomes `sent`, and the user's balance is unchanged
- While credit-service is down, the rest of user-service (login, register, etc.) responds normally
- Stop `user-db` while user-service is running → one `console.error` line per failed pass, no crash; restart `user-db` → the relay resumes on its own

---

## Stage 14d: Wire Into Activation and Bootstrap

### Update `verifyRegistrationOtp` in `src/services/auth.service.ts`

- In the existing `withTransaction`, immediately after `activateUser(user.id, client)` returns `true`, call `insertCreditAllocation(user.id, client)`.
- Remove the `// TODO(credit-service): emit user-registered event here` comment.
- Nothing else in the function changes. In particular, the response does not wait for credit-service: verification succeeds even if credit-service is down.

### Update the super admin bootstrap

- Wrap `createSuperAdmin` and the outbox insert in one `withTransaction`, passing `client` to both.
- Insert the outbox row only if `createSuperAdmin` returned a row (the insert was not skipped by `ON CONFLICT DO NOTHING`).
- The existing "insert was skipped → re-check whether a super admin exists" logic is unchanged.
- An already-existing super admin gets no outbox row (no backfill).

### Verification

- Register → verify OTP → `200 REGISTER_SUCCESS`; one `credit_allocation_outbox` row for that user, created in the same transaction; it becomes `sent` and credit-service shows a 20-credit balance
- A failing verify (wrong OTP, expired OTP, attempts exceeded) creates no outbox row
- Two concurrent correct `verify-otp` requests → exactly one outbox row (only one activation succeeds)
- `docker compose down -v && docker compose up --build` → exactly one outbox row for the super admin, which becomes `sent`
- Restart the containers without `-v` → no new outbox row for the super admin
- With credit-service stopped, registration verification still returns `200 REGISTER_SUCCESS`

---

## Stage 14e: Replay Script

### Create `src/scripts/replayCreditOutbox.ts`

Usage:

```bash
npm run outbox:replay -- <outbox-id> [<outbox-id> ...]
npm run outbox:replay -- --all-dead
```

- No arguments, or an argument that is neither `--all-dead` nor a UUID → print usage and exit `1`
- Calls `replayDeadCreditAllocations` (with the IDs, or `null` for `--all-dead`)
- Prints the IDs that were reset. For explicit IDs, also prints the ones that were not reset (not found, or not `dead`). Only `dead` rows are ever reset.
- Ends the pool before exiting; exit `0` on success

### Update `package.json`

```json
"outbox:replay": "tsx src/scripts/replayCreditOutbox.ts"
```

Run it in dev with `docker exec -it foc-user-service npm run outbox:replay -- --all-dead`.

### Verification

- A `dead` row replayed by ID → `status = 'pending'`, `attempts = 0`, `last_error` unchanged; the relay then delivers it
- `--all-dead` resets every `dead` row and nothing else
- Replaying the ID of a `sent` or `pending` row → reported as not reset, row unchanged
- No arguments or an invalid ID → usage message, exit code `1`

---

### Tests

Deferred to the end-of-project test stage. Do not write tests in this stage.

# Stage 15: User Service Changes for Frontend Integration

> **Scope**: Backend changes the frontend needs. They are made before any frontend work:
>
> - `GET /users/me` also returns `activeView`
> - `GET /users` becomes paginated, searchable, filterable and sortable
> - every user-service JSON response uses camelCase keys
>
> DB columns stay snake_case.
>
> Backlog refs: F4.1.1, F5.2.2, F5.3.1.
>
> **Before starting:** if any `[DECIDE]` placeholder remains anywhere in Stages 15–16, stop and ask me. Do not pick a value yourself.

### Design decisions (already made, do not change)

| Rule                        | Value                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Response key convention     | camelCase for every JSON response from user-service. DB columns stay snake_case. Mapping happens in the service layer, in one place.                   |
| Consumers of user responses | The frontend is the only consumer. No other service reads user-service response bodies, so this is not a breaking change for other services.           |
| `GET /users/me`             | Returns `{ username, email, activeView }`                                                                                                              |
| `GET /users` change         | Changed in place (no new endpoint). The old bare `{ users: [...] }` shape is replaced.                                                                 |
| Pagination                  | Offset-based, `page` is 1-based, page size fixed at 50 (a constant, not a query param). A page past the end returns `200` with an empty `users` array. |
| Total count                 | Returned, so the frontend can show the total number of pages                                                                                           |
| Search                      | Two separate params: `username` (substring match) and `email` (exact match). Combined with AND.                                                        |
| Filters                     | `status` and `role`, each optional, combined with search using AND                                                                                     |
| Sort                        | `sortBy` one of `username`, `email`, `createdAt`; `sortDir` one of `asc`, `desc`. Not sortable by status or role. Default: `createdAt` `desc`.         |
| Query param names           | `page`, `username`, `email`, `status`, `role`, `sortBy`, `sortDir`                                                                                     |
| Pending users               | Still included (Stage 9 rule unchanged); `status` filter can isolate them                                                                              |

---

## Changes to already-implemented code

| #   | File                                                                   | Change                                                                                                                                | Where specified |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | `src/services/me.service.ts` (`getOwnProfile`)                         | Also return `activeView`                                                                                                              | Stage 15a       |
| 2   | `src/db/queries/users.queries.ts` (`listAllUsers`)                     | Replaced by a paginated, filtered query plus a count                                                                                  | Stage 15b       |
| 3   | `src/services/users.service.ts`, `src/controllers/users.controller.ts` | `listUsers` takes the query params and returns the paginated shape                                                                    | Stage 15b       |
| 4   | Every service function that returns a user row                         | Return the camelCase response shape via one shared mapper instead of a `password_hash`-stripped DB row                                | Stage 15c       |
| 5   | Existing tests                                                         | Update assertions that expect snake_case keys or the old `GET /users` shape. These are fixture/assertion updates, not new test cases. | Stage 15c       |

---

## Stage 15a: `activeView` on `GET /users/me`

### Update `src/services/me.service.ts`

`getOwnProfile(userId)` returns `{ username, email, activeView }`, where `activeView` comes from `user.active_view`. Nothing else changes.

### Verification

- `GET /users/me` → `200`, `{ username, email, activeView }`, no other fields
- After `PUT /users/me/active-view {activeView: 'courier'}`, `GET /users/me` returns `activeView: 'courier'`

---

## Stage 15b: Paginated `GET /users`

### Update `src/db/queries/users.queries.ts`

Replace `listAllUsers` with `listUsersPage({ usernameContains, email, status, role, sortBy, sortDir, limit, offset }, db = pool)`:

- Returns `{ rows, total }`. `total` counts **every** row matching the filters, ignoring `limit`/`offset`. Use the same `WHERE` clause for the count as for the rows: either a separate `COUNT(*)` query or `COUNT(*) OVER()`. If you use the window form, an empty page (past the end) still needs a correct `total`, so run a separate count when no rows come back.
- `usernameContains`: `username LIKE '%' || $n || '%' ESCAPE '\'`, with `\`, `%` and `_` in the input escaped first, so user input is matched literally. Usernames are stored lowercase, and the controller lowercases the input.
- `email`: exact `email = $n`
- `status`, `role`: exact match
- All values are bound parameters. `sortBy` and `sortDir` are **never** interpolated from input: map them through a fixed whitelist (`username` → `username`, `email` → `email`, `createdAt` → `created_at`; `asc`/`desc` → `ASC`/`DESC`).
- Order by the chosen column, then `id` (same direction) as a tie-breaker
- `LIMIT $limit OFFSET $offset`

### Update `src/services/users.service.ts`

`listUsers({ page, username, email, status, role, sortBy, sortDir })`:

- `PAGE_SIZE = 50` constant at the top of the file
- `offset = (page - 1) * PAGE_SIZE`
- Calls `listUsersPage`, maps each row with the Stage 15c mapper
- Returns `{ users, page, pageSize: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) }`

### Update `src/controllers/users.controller.ts` (`list`)

Validate `req.query` with Zod (`.strict()`, so an unknown param → `"Request contains unexpected fields"` via the global handler), messages in the existing style:

- `page`: optional, default `1`, coerced to an integer ≥ 1 → `"Page must be a positive integer"`
- `username`: optional string, lowercased (not trimmed, consistent with `usernameField`); empty string treated as absent → type error `"Username must be a string"`
- `email`: optional string, trimmed and lowercased (same normalisation as `emailField`, but optional); empty string treated as absent → type error `"Email must be a string"`
- `status`: optional, one of `pending`, `active`, `suspended` → `"Status must be 'pending', 'active' or 'suspended'"`
- `role`: optional, one of `user`, `admin`, `super admin` → `"Role must be 'user', 'admin' or 'super admin'"`
- `sortBy`: optional, one of `username`, `email`, `createdAt` → `"sortBy must be 'username', 'email' or 'createdAt'"`
- `sortDir`: optional, one of `asc`, `desc` → `"sortDir must be 'asc' or 'desc'"`. When absent: `desc` if `sortBy` is absent or `createdAt`, otherwise `asc`.
- A repeated param (Express turns `?status=a&status=b` into an array) fails the string type check → `400 VALIDATION_ERROR`

Return `200` with the service result.

### Verification

- `GET /users` (no params) → `200`, `{ users, page: 1, pageSize: 50, total, totalPages }`, sorted by `createdAt` desc
- With more than 50 users: `page=2` returns the next rows with no overlap or gap versus `page=1`
- `page` past the last page → `200`, `users: []`, `total` still correct
- `page=0`, `page=-1`, `page=abc`, `page=1.5` → `400 VALIDATION_ERROR`, `"Page must be a positive integer"`
- `username=ali` matches `alice` and `malik`; `username=%` matches only usernames that literally contain `%` (none, given the username format rule)
- `email=Alice@Example.com` matches `alice@example.com` exactly; `email=alice` matches nothing
- `username` + `email` + `status` + `role` combined → only rows matching all of them
- `status=pending` returns pending users
- `role=super admin` (URL-encoded) returns the super admin
- `sortBy=username&sortDir=asc` → alphabetical; `sortBy=status` → `400 VALIDATION_ERROR`
- Unknown param (e.g. `?foo=1`) → `400 VALIDATION_ERROR`, `"Request contains unexpected fields"`
- Regular user → `403 FORBIDDEN`; no token → `401 UNAUTHORIZED` (unchanged)
- No `password_hash` (or `passwordHash`) on any entry

---

## Stage 15c: camelCase Responses

### Create `src/services/userResponse.ts`

`toUserResponse(row)` returns `{ id, username, email, status, role, activeView, createdAt, updatedAt }` from a DB user row. It must never include the password hash. Every service function that currently returns a user row with `password_hash` stripped uses this mapper instead (at least `listUsers`, `getUserById`, `changeUserStatus`, `changeUserRole`, `changeActiveView`, including their no-op return paths).

### Sweep the rest of the service

Search every controller and service for any other response body with a snake_case key and convert it. Leave these alone:

- the JWKS response (its keys are fixed by RFC 7517)
- JWT claims (`sub`, `role`)
- error bodies (already `{ message, code }`)

List every response you changed in your summary.

### Update existing tests

Update assertions that expect snake_case keys (e.g. `active_view`, `created_at`) or the old `GET /users` shape. Do not add new test cases. If an existing test now fails for a reason other than key naming or the response shape, stop and report it instead of changing it.

### Verification

- `GET /users/:id`, `PUT /users/:id/status`, `PUT /users/:id/role`, `PUT /users/me/active-view` all return `{ id, username, email, status, role, activeView, createdAt, updatedAt }`
- The no-op paths of status and role changes return the same shape
- `POST /auth/login`'s `user` object is unchanged (`{ id, username, email, role, activeView }`)
- The full existing test suite passes after the assertion updates

---

# Stage 16: Frontend — User Service Integration

> **Scope**: Wire `frontend/` to user-service:
>
> - shared auth plumbing
> - login, registration (with OTP) and forgot password as pages
> - the `/account` page
> - the requester/courier toggle
> - admin user management
>
> Backlog refs: F1, F2, F3, F4, F5.1, F5.2.2, F5.3.1, F5.3.3.
>
> **Ground rules for every sub-stage:**
>
> - Work in `frontend/` only. Never touch `foc-mockup/`.
> - Read the current code before changing it. Where it disagrees with this file, follow the code and tell me.
> - Do not modify `src/realtime/orderSocket.js`, `src/data/users.js`, `src/components/DemoControls.jsx` or `AI-NOTES.md`. If you think one of them needs a change, stop and tell me why.
> - Do not change other teammates' pages except where a sub-stage says to (e.g. reading auth state). List every file outside user-service screens you touched.
> - React 18, JSX (no TypeScript), react-router-dom, Context API, Tailwind, lucide-react, native `fetch` through `src/api/http.js`. Do not add React Query, Redux, axios or a form library.
> - No tests in this stage (see the end of this file).

### Design decisions (already made, do not change)

| Rule                              | Value                                                                                                                                                                                                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend access                    | Relative same-origin paths through the existing Vite dev proxy (`/auth`, `/users` → user-service). No `VITE_*` URL in the browser bundle.                                                                                                                                                    |
| Access token                      | In memory only (never `localStorage`/`sessionStorage`). Attached as `Bearer` to every backend call, including supplier, order and credit.                                                                                                                                                    |
| Refresh                           | Both: refresh-on-401-and-retry (exists in `http.js`) and proactive refresh before expiry. Concurrent callers share one in-flight refresh (exists in `http.js`).                                                                                                                              |
| Auth state                        | A new `src/context/AuthContext.jsx`, separate from `DemoContext`                                                                                                                                                                                                                             |
| API modules                       | `src/api/auth.js` (auth/OTP/reset), new `src/api/profile.js` (`/users/me/*`), new `src/api/users.js` (admin `/users*`)                                                                                                                                                                       |
| Session restore                   | On load: `POST /auth/refresh`, decode the JWT for `id` and `role`, `GET /users/me` for `username`, `email`, `activeView`                                                                                                                                                                     |
| Pages, not modals                 | Login, registration, forgot password are pages. `LoginModal` is replaced.                                                                                                                                                                                                                    |
| Paths                             | `/login`, `/register` (one page: form step → OTP step), `/forgot-password` (one page: email → OTP → new password), `/account`, `/admin/users`. No frontend path may start with `/auth`, `/users`, `/credits`, `/orders`, `/api/v1` or `/socket.io` (the dev proxy would catch it on reload). |
| Landing after login               | The page the user was sent away from, else home. Same for every role.                                                                                                                                                                                                                        |
| Not logged in on a protected page | Redirect to `/login`, remembering the page                                                                                                                                                                                                                                                   |
| Wrong role                        | Admin links hidden from non-admins. Opening an admin URL anyway shows a 403 "Not authorised" view **in place** (URL unchanged).                                                                                                                                                              |
| Logout                            | Clear all client auth state even if `POST /auth/logout` fails, then go to `/login`                                                                                                                                                                                                           |
| Refresh failure                   | Same as logout (clear, go to `/login`)                                                                                                                                                                                                                                                       |
| Client validation                 | Mirror backend format rules (username, email, password complexity, 6-digit OTP) for instant feedback; the backend still enforces them                                                                                                                                                        |
| Error display                     | Inline under the field for field-specific errors; banner at the top of the form for whole-form errors (e.g. invalid credentials, account suspended); toast for background errors (e.g. failed view toggle)                                                                                   |
| Error text                        | The frontend maps backend `code` → its own text from one central map, with consistent phrasing. Backend `message` is not shown verbatim.                                                                                                                                                     |
| OTP input                         | 6 boxes, digits only, auto-advance, backspace moves back, pasting a 6-digit code fills all boxes, auto-submits when all 6 are filled. On a wrong code: clear and refocus the first box.                                                                                                      |
| Resend                            | During cooldown: disable resend with a countdown from `Retry-After`. On `OTP_RESEND_LIMIT`: disable resend, show the limit text, no countdown.                                                                                                                                               |
| Unverified login                  | `ACCOUNT_NOT_VERIFIED` from login → go to `/register` at the OTP step (see 16c)                                                                                                                                                                                                              |
| Register `409`                    | Show the taken error plus a hint: "Already signed up? Log in to finish verifying" linking to `/login`                                                                                                                                                                                        |
| Forgot password OTP               | Checked with `verify-otp` (`forgot_password`) before the new-password step is shown                                                                                                                                                                                                          |
| `/account`                        | Sections for profile view, change username, change email, change password                                                                                                                                                                                                                    |
| Active-view toggle                | Optimistic: update UI immediately, call `PUT /users/me/active-view`, revert and toast on failure                                                                                                                                                                                             |
| Admin row actions                 | A three-dot menu on each row, shown on hover: promote/demote and suspend/unsuspend. Each action asks for confirmation first. Promote/demote hidden from plain admins.                                                                                                                        |

### AI logging

Same as earlier stages: header comment on every file created **or modified**, and a usage-log entry per sub-stage in the existing format. JSX/JS files use `//` comments at the top of the file.

---

## Stage 16a: Read and Report (no code changes)

Read `frontend/` before writing anything. Read `AI-NOTES.md` for context but do not edit it. Then report the following and **stop and wait for my answers**:

1. **Admin supplier pages**: their route paths in `App.jsx`, and how a user reaches them (nav link, landing-page link, typed URL only). I will tell you where the Admin link goes and how it reaches `/admin/users`.
2. **`DemoContext` session consumers**: every file that reads session or auth state (`session`, `role`, `isAdmin`, login/logout functions, the local `role` `useState('requester')`) from `DemoContext`, and what each one reads. I will tell you how those consumers move to `AuthContext`.
3. **`http.js`**: confirm how the in-memory token, shared in-flight refresh and 401-retry work today, and where a proactive refresh and a "refresh failed → logged out" hook would attach.
4. **`LoginModal.jsx`**: every place that opens it.
5. **Home**: which route is home.
6. **Routes**: any existing frontend route that starts with a proxied prefix (`/auth`, `/users`, `/credits`, `/orders`, `/api/v1`, `/socket.io`).
7. **Toasts/banners**: any existing toast, banner or notice component (e.g. `ApiNotice.jsx`) that should be reused instead of building a new one.

---

## Stage 16b: Shared Auth Plumbing

### `src/context/AuthContext.jsx`

- Holds `user` (`{ id, role, username, email, activeView }`) and a status (`loading` | `authenticated` | `anonymous`)
- On mount: session restore (see decisions table). While restoring, protected routes render nothing (or a spinner), not a redirect.
- Exposes `login(identifier, password)`, `logout()`, `setActiveView(...)`, and a way for other sub-stages to update `username`/`email` after a profile change
- Consumers move off `DemoContext` exactly as I specified in my answer to 16a item 2

### `src/api/http.js`

- **Proactive refresh**: after each new access token, schedule a refresh 60 seconds before its `exp` (read from the decoded token). Reuse the existing shared in-flight refresh. Cancel the timer on logout.
- **Refresh failure** (proactive or after a 401): notify `AuthContext`, which clears state and goes to `/login`, remembering the current page
- Keep the existing in-flight GET de-duplication and 401-retry unchanged

### Route guards (in or next to `App.jsx`)

- `RequireAuth`: anonymous → `<Navigate to="/login" state={{ from: location }} replace />`
- `RequireRole minimum="admin"`: same rank order as the backend (`user` < `admin` < `super admin`); below it → render `<Forbidden />` in place

### Components

- `src/components/Forbidden.jsx`: "Not authorised" view with a link home
- `src/components/Toast.jsx` + a small toast provider (or reuse what 16a item 7 found)
- `src/components/FormBanner.jsx`: whole-form error/success banner
- `src/components/FieldError.jsx`: inline field error
- `src/components/OtpInput.jsx`: the 6-box input from the decisions table. Props: `onComplete(code)`, `disabled`, and a way for the parent to clear and refocus it after a wrong code.
- `src/components/ResendButton.jsx`: handles the cooldown countdown (`Retry-After`) and the limit state
- `src/utils/validation.js`: client-side mirrors of the backend rules (same regexes/limits as `auth.service.ts`)
- `src/api/errorMessages.js`: one map from backend `code` → frontend text, plus which display type (field / banner / toast) each code uses by default. Cover every code user-service can return to the frontend. Put the full map in your summary so I can review the phrasing.

### `/login` page

- `src/pages/Login.jsx`: identifier + password, links to `/register` and `/forgot-password`
- Success → `state.from` or home
- `INVALID_CREDENTIALS`, `ACCOUNT_SUSPENDED` → banner
- `ACCOUNT_NOT_VERIFIED`:
  ```js
  if (err.code === "ACCOUNT_NOT_VERIFIED") {
    navigate("/register", {
      state: {
        step: "otp",
        email: identifier.includes("@") ? identifier : null,
      },
    });
    return;
  }
  ```
- Shows a success banner when arriving with one in router state (from 16c/16d)
- Replace every place that opened `LoginModal` with navigation to `/login`. Delete `LoginModal.jsx` once nothing uses it.

### Logout

The TopNav logout button calls `AuthContext.logout()`: call `POST /auth/logout`, then clear state and go to `/login` whether or not the call succeeded. Do not redirect to a "from" page after an explicit logout.

### Verification

- Reload while logged in → still logged in; `username`, `email`, `role`, `activeView` populated
- No access token in `localStorage`/`sessionStorage` (check DevTools)
- Wait (or shorten the TTL in dev) → a proactive refresh happens before expiry, no 401 seen by pages
- Revoke the refresh token in the DB → the next refresh fails → `/login`
- Open `/account` logged out → `/login` → log in → back on `/account`
- Regular user opens `/admin/users` → 403 view, URL unchanged, no Admin link in nav
- Logout with user-service stopped → still lands on `/login` with state cleared
- Login with a pending account via email → `/register` OTP step with email filled; via username → OTP step with an email field
- Supplier/order/credit calls still carry the `Bearer` token

---

## Stage 16c: Registration (`/register`)

`src/pages/Register.jsx`, one page with two steps. Starts at the step given in `location.state.step`, default `form`.

**Form step**:

- `username`, `email`, `password` with client validation → `POST /auth/register`
- On `201` → OTP step, carrying the email
- `USERNAME_TAKEN` / `EMAIL_TAKEN` → inline on that field, plus the "Already signed up? Log in to finish verifying" hint linking to `/login`

**OTP step**:

- If no email was carried in (arrived from login with a username), show an email field above the boxes. Resend and verify are disabled until it's filled.
- When arrived from login (`state.step === 'otp'`): show a clear **"Send a new code"** button at the top, since the original code has probably expired. Do not send automatically.
- `OtpInput` → `POST /auth/verify-otp` (`purpose: 'registration'`)
- `ResendButton` → `POST /auth/resend-otp` (`purpose: 'registration'`)
- Success → `/login` with a success banner
- `INVALID_OTP` → clear boxes, inline error
- `OTP_EXPIRED`, `OTP_ATTEMPTS_EXCEEDED` → error pointing at resend
- `NO_PENDING_REGISTRATION` on resend → banner

### Verification

- Full happy path: register → OTP (dev console) → login works
- Wrong code → boxes clear, attempts persist (DB)
- Pasting a 6-digit code fills and submits
- Non-digits can't be typed
- Resend immediately → countdown from `Retry-After`; 6th resend → limit text, no countdown
- Register again with the same username within 10 minutes → `USERNAME_TAKEN` inline + hint
- Abandon at OTP, later log in with correct credentials → lands on the OTP step; "Send a new code" → new code works
- Same via username → email field shown, works once filled

---

## Stage 16d: Forgot Password (`/forgot-password`)

`src/pages/ForgotPassword.jsx`, one page, three steps. The email and verified OTP are kept in component state only; a reload restarts at the email step.

1. **Email** → `POST /auth/forgot-password`
   - `EMAIL_NOT_FOUND` → inline
   - `ACCOUNT_NOT_VERIFIED` → banner
   - Cooldown/limit → resend-style messaging
2. **OTP** → `OtpInput` → `POST /auth/verify-otp` (`purpose: 'forgot_password'`, non-consuming)
   - Success → step 3
   - Resend via `POST /auth/resend-otp` (`purpose: 'forgot_password'`). Limit text says "about an hour".
3. **New password** (client complexity check) → `POST /auth/reset-password` with email, OTP, new password
   - Success → `/login` with a success banner
   - `INVALID_OTP` / `OTP_EXPIRED` / `OTP_ATTEMPTS_EXCEEDED` here (e.g. the code expired between steps) → back to step 2 with the error

### Verification

- Happy path end to end; old password then fails at login
- Wrong code at step 2 never shows step 3
- Expire the OTP in the DB while on step 3 → submit → back at step 2 with the expiry error
- Reload mid-flow → back at step 1

---

## Stage 16e: Account Page (`/account`)

`src/pages/Account.jsx` behind `RequireAuth`, linked from the nav. Calls go through `src/api/profile.js`.

- **Profile**: `username`, `email` from `AuthContext` (`GET /users/me` already loaded)
- **Change username**: `PUT /users/me/username`
  - `USERNAME_UNCHANGED` / `USERNAME_TAKEN` → inline
  - Success → update `AuthContext`, success banner in the section
- **Change email**: current password + new email → `PUT /users/me/email` → OTP shown inline in the same section → `POST /users/me/verify-otp` (`change_email`)
  - Resend: `POST /users/me/resend-otp` (`change_email`)
  - `INVALID_PASSWORD` → inline on current password
  - `EMAIL_UNCHANGED` / `EMAIL_TAKEN` → inline on new email
  - Success → update `AuthContext`
- **Change password**: current + new password → `PUT /users/me/password` → OTP inline → `POST /users/me/confirm-password-change` with the OTP and the **same** new password, kept in component state from the first step so the user doesn't retype it
  - Resend: `POST /users/me/resend-otp` (`change_password`)
  - `PASSWORD_UNCHANGED` → inline
- **After a successful password change**: the backend revokes **all** of the user's refresh tokens, including this browser's. Decided: immediate forced re-login. Right after the success response, clear all client auth state (same as `AuthContext.logout()`'s state-clearing, but skip the `POST /auth/logout` call since the refresh token is already revoked) and redirect to `/login` with a banner telling the user to sign in again with their new password. Do not wait for the next proactive refresh to catch this.

### Verification

- Each section's happy path; the nav and profile show new values without a reload
- Each inline error above
- OTP cooldown and limit behave as in 16c
- Password change → immediately redirected to `/login` with the "sign in again" banner, not left on `/account` until the next refresh fails

---

## Stage 16f: Requester/Courier Toggle

- The toggle reads `AuthContext.user.activeView`
- On change: update immediately, call `PUT /users/me/active-view`. On failure, revert and show a toast.
- Anything that previously read the local `role` state in `DemoContext` reads `activeView` from `AuthContext`, as specified in my 16a answer
- Gabriel will adjust `TopNav.jsx` layout if needed; keep TopNav changes minimal and list them

### Verification

- Toggle → UI changes instantly; the DB column updates
- Reload → the same view persists
- Stop user-service, toggle → UI reverts, toast shown
- Log in on another browser → same view

---

## Stage 16g: Admin User Management (`/admin/users`)

`src/pages/AdminUsers.jsx` behind `RequireAuth` + `RequireRole minimum="admin"`. Reached as I specified in my 16a answer. Calls go through `src/api/users.js`.

- **Table columns**: username, email, status, role, created (date)
- **Search**: two boxes, username (substring) and email (exact), 300 ms debounce, AND-combined. Empty boxes are omitted from the query.
- **Filters**: status (pending/active/suspended/any), role (user/admin/super admin/any)
- **Sort**: click the username, email or created header to sort; click again to flip direction. Status and role headers are not sortable. Default: created, newest first.
- **Pagination**: 50 per page, prev/next plus "Page X of Y" from `totalPages`. Changing search, filter or sort resets to page 1.
- **Row actions**: a three-dot menu, visible on row hover; always visible on touch / small screens. It shows only the actions the backend would allow:

| Caller      | Target row                  | Suspend / Unsuspend    | Promote / Demote                 |
| ----------- | --------------------------- | ---------------------- | -------------------------------- |
| admin       | user (active/suspended)     | shown                  | hidden                           |
| admin       | admin, super admin, own row | hidden                 | hidden                           |
| super admin | user or admin (active)      | shown                  | Promote if user, Demote if admin |
| super admin | user or admin (suspended)   | shown                  | hidden (backend `422`)           |
| any         | pending row                 | hidden (backend `422`) | hidden (backend `422`)           |
| any         | super admin row, own row    | no menu                | no menu                          |

If a row has no allowed actions, show no menu.

- **Confirmation**: each action opens a confirmation dialog naming the user and the action
- **Action results**: success → update the row from the response, success toast. Error (including a stale-state `403`/`422` from a race) → toast, then refetch the current page.

### Verification

- Admin and super admin each see exactly the actions in the table above
- Plain user → 403 view
- Search, filters and sort each change the request params and results; combinations AND together
- Page past the end (e.g. after a filter shrinks results) shows an empty state, and "Page X of Y" stays correct
- Suspend → the row shows suspended; that user's next refresh fails (logged out)
- Promote → the row shows admin
- Menu works on a phone-width viewport with no hover

---

## After Stage 16

### Deviations

List every place where you deviated from this file and why.

### Reminder: tests still owed

Tests have not been written for:

- Stage 14 (outbox, relay, replay script)
- Stage 15 (paginated `GET /users`, camelCase responses, `activeView` on `/users/me`)
- Stage 16 (frontend)

Also check every other stage for gaps against its Verification list. Write these in the end-of-project test stage, following the Stage 7 ground rules.

### Kept in view (not in this stage)

- **NFR4** (session inactivity timeout, 7-day limit, expiry warning). Design notes so far:
  - server-side enforcement
  - activity = scroll, touch and API calls, shared across tabs via BroadcastChannel
  - 1-minute warning configured in the frontend, 30-minute timeout in the backend
  - user-service never sees other services' API calls, so the frontend must report activity to it (endpoint and reporting rate still undecided)
- **F5.3.2**: an admin user-detail page with a user's credit transactions and their orders. Needs a credit-service endpoint, and order data.
- **NFR3** masking: emails are shown unmasked in the admin list for now.
- **`orderSocket.js`**: may need to disconnect on logout and use refreshed tokens. Flag it to the order-service owner if so.

# Stage 17: Local Setup Script

> **Scope**: One script that prepares a fresh checkout of `user-service` to run: creates `.env`,
> fills in a generated `SUPER_ADMIN_PASSWORD`, and generates the RS256 keypair. Run on the host
> with `npm run setup`. Part 1 of `user-service/docs/user-service-instructions.md` is updated to
> point at it, and the missing usage-log record of the doc rename is added.
>
> This is local-dev tooling only. It is never run in AWS or CI deployments: there, the private key
> and `SUPER_ADMIN_PASSWORD` come from Secrets Manager.
>
> **Before starting:** read the current code, not just this file. If any `[DECIDE]` placeholder
> remains, or anything below disagrees with the code, stop and ask me.

### Design decisions (already made, do not change)

| Rule                    | Value                                                                                                                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language / runner       | TypeScript, run with `tsx`, on the host (not inside a container)                                                                                                                                                                              |
| File                    | `user-service/src/scripts/setupLocalDev.ts` (same folder as `replayCreditOutbox.ts`)                                                                                                                                                          |
| npm script              | `"setup": "tsx src/scripts/setupLocalDev.ts"`, so it runs as `npm run setup` (and `npm run setup -- --force`)                                                                                                                                 |
| `.env`                  | If `user-service/.env` does not exist, copy `.env.example` to `.env`. An existing `.env` is never replaced; only the specific lines below are changed.                                                                                        |
| `SUPER_ADMIN_PASSWORD`  | If blank or missing in `.env`, generate one, write it into `.env`, and print it to the terminal once. If already set, leave it unchanged and do not print it.                                                                                 |
| Password generation     | 24 characters, CSPRNG only (`crypto.randomInt`; never `Math.random`). One character from each class (lowercase, uppercase, digit, special), the remaining 20 from the combined set, then a Fisher–Yates shuffle driven by `crypto.randomInt`. |
| Special characters      | `[DECIDE]` — the allowed set, e.g. `!@%^*-_+.~`. Must contain no `#`, `$`, quotes, backslash or whitespace (they break `.env` parsing or Compose interpolation).                                                                              |
| Password rule           | Imported, not copied: the script checks every generated password against the existing `PASSWORD_REGEX` and throws if it does not match                                                                                                        |
| Keys                    | RSA-2048 via `crypto.generateKeyPairSync`. Private key PEM (PKCS#8) → `keys/private.pem` with file mode `0600`; public key PEM (SPKI) → `keys/public.pem`. Create `keys/` if missing.                                                         |
| When keys are generated | If either `private.pem` or `public.pem` is missing, regenerate **both**. If both exist, skip unless `--force` is passed.                                                                                                                      |
| `--force`               | Applies to the keys and `JWT_KEY_ID` only. It never touches `SUPER_ADMIN_PASSWORD` or any other `.env` value.                                                                                                                                 |
| `JWT_KEY_ID`            | Whenever keys are generated (first run or `--force`), set `JWT_KEY_ID` in `.env` to the current UTC time to the second, ISO 8601 without milliseconds: `YYYY-MM-DDTHH:MM:SSZ` (e.g. `2026-11-04T01:48:30Z`). Unchanged when keys are skipped. |
| Editing `.env`          | Replace only the matching `KEY=...` line, preserving every other line and comment. If the key's line is absent (stale `.env`), append it.                                                                                                     |
| Never printed or logged | The private key. The password is printed exactly once, only when it was just generated.                                                                                                                                                       |
| Arguments               | No arguments, or exactly `--force`. Anything else → print usage, exit `1`.                                                                                                                                                                    |

### Watch for

- **`config.ts` exits at import time** when `.env` is missing or incomplete, which is exactly the state this script runs in. The script must not import `config.ts`, `pool.ts`, or any module that imports them, directly or transitively. If `PASSWORD_REGEX` is only exported from a module that pulls in `config.ts`, **stop and tell me** — moving it is a code change I need to approve.
- The script runs from the host, so all paths must resolve relative to the `user-service/` directory (e.g. via `import.meta.url`), not the shell's working directory.
- Write the key files before updating `JWT_KEY_ID` in `.env`.

### Script output

Print a short summary of what was done:

- `.env`: created from `.env.example` / already existed
- `SUPER_ADMIN_PASSWORD`: generated (followed by the password, once) / already set
- Keys: generated (with the new `JWT_KEY_ID`) / already exist, skipped (with a hint that `--force` regenerates them)

After `--force`, also print that tokens signed with the old key are no longer valid, and that other running services (credit, supplier) should be restarted so they pick up the new key.

### Update `package.json`

Add the `setup` script above.

### Update `user-service/docs/user-service-instructions.md`

- Replace Part 1's manual steps 1–3 (copy `.env`, set `SUPER_ADMIN_PASSWORD`, openssl keypair) with: `cd user-service && npm install && npm run setup`, then a short description of what the script does, that it is safe to re-run, and what `--force` does.
- Keep steps 4 (SMTP / `TEST_USER_*`) and 5 (start the stack). Renumber as needed.
- Part 2 is unchanged.
- Add a dated entry to the file's AI disclosure header.

### Usage log: the doc rename

On 2026-10-22 the guide was created and merged as `user-service/docs/local-dev-setup.md`, but was committed as `user-service/docs/user-service-instructions.md` (commit `862f88b`). The log entries say `local-dev-setup.md`.

- First check whether `ai/usage-log.md` already records the rename (search for `user-service-instructions`). If it does, tell me and skip the next step.
- Otherwise append a new entry recording that `local-dev-setup.md` was renamed to `user-service-instructions.md` before it was committed, so the two 2026-10-22 entries refer to the file now at the new path. Do **not** edit earlier entries; the log is append-only.
- Add the matching README Log index row, as with every log entry.

### Verification

- Fresh state (no `.env`, no `keys/`): `npm run setup` → `.env` created, `SUPER_ADMIN_PASSWORD` filled and printed, both keys created, `private.pem` mode is `600`, `JWT_KEY_ID` is a UTC timestamp in the required format
- `docker compose up --build` then starts `user-service` cleanly, the super admin can log in with the printed password, and `GET /auth/.well-known/jwks.json` shows the new `kid`
- Run `npm run setup` again → nothing changes: same password (not printed), same keys, same `JWT_KEY_ID`
- Delete only `public.pem` → both keys regenerated, `JWT_KEY_ID` updated
- `npm run setup -- --force` → new keys, new `JWT_KEY_ID`, `SUPER_ADMIN_PASSWORD` unchanged; the old access token is rejected after restart
- Existing `.env` with a blank `SUPER_ADMIN_PASSWORD` → only that line changes; every other line and comment is identical
- Existing `.env` missing the `JWT_KEY_ID` line entirely → line appended when keys are generated
- `npm run setup -- --foo` → usage, exit `1`
- Runs on a fresh clone where `.env` is absent without hitting the `config.ts` validation exit

### Tests (Vitest)

Write the tests in this stage, following the Stage 7 ground rules and layout. Every bullet under Verification above that does not need Docker is a required test case. To make the script testable, structure it so the logic takes the target directory as a parameter and the CLI entry point passes `user-service/`; tests run against a temp directory. Also cover the password generator directly: over 10,000 runs every password is 24 characters, matches `PASSWORD_REGEX`, and uses only allowed characters. Do not modify other application code to make a test pass.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry for this stage.

## Stage 18: Account Lockout and OTP Send Escalation (NFR1.1)

**Scope:** `user-service` (backend) and `frontend` (the Stage 16 pages that show these errors). NFR1.1.1 (unlock email) is **deferred** and not part of this stage.

Every decision in the table below was made by the team.

### Design decisions (already made, do not change)

#### Login lockout

| Topic                    | Decision                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What counts as a failure | Every password attempt goes to the **same** counter: a wrong password on `POST /auth/login`, and a wrong current password (`INVALID_PASSWORD`) on `PUT /users/me/email` and `PUT /users/me/password`.                                                                                                                           |
| What does not count      | An identifier that matches no account (there is nothing to lock). Any attempt on a `pending` or `suspended` account, whether the password is right or wrong.                                                                                                                                                                    |
| Threshold                | 5 failures within 15 minutes, measured from the **first** failure in the window.                                                                                                                                                                                                                                                |
| Lock length              | Escalates each time the threshold is hit: **1 h**, then **4 h**, then **24 h** (capped at 24 h).                                                                                                                                                                                                                                |
| Check order              | The lock check runs **before** the password check. A locked account gets the lock error whatever password is sent.                                                                                                                                                                                                              |
| Requests during a lock   | Rejected with the lock error. They are not counted and do not extend the lock.                                                                                                                                                                                                                                                  |
| What a lock blocks       | Login, and the current-password check on `PUT /users/me/email` and `PUT /users/me/password` (both rejected with `ACCOUNT_LOCKED`). Existing refresh tokens are **not** revoked.                                                                                                                                                 |
| What resets everything   | A successful login, a correct current password on `PUT /users/me/email` or `PUT /users/me/password`, or an admin unlock. Each clears the failure count, the window and the escalation level.                                                                                                                                    |
| Escalation reset         | The login lock has its own quiet window, separate from the OTP side. The level drops back to the start if 24 h pass after the last time the threshold was hit without it being hit again.                                                                                                                                       |
| Response                 | `429`, code `ACCOUNT_LOCKED`, message following the existing style, e.g. "Too many failed login attempts. Please try again in about an hour." / "…about 4 hours." / "…about a day.", with a `Retry-After` header carrying the exact seconds remaining.                                                                          |
| Who can be locked        | Any account, including super admin.                                                                                                                                                                                                                                                                                             |
| Suspend interaction      | A locked account can be suspended. Unsuspending does **not** clear a lock.                                                                                                                                                                                                                                                      |
| Storage                  | Columns on `users`: `login_failed_attempts`, `login_failure_window_start`, `login_locked_until`, `login_lock_level`. No separate "last locked at" column: the time the threshold was last hit is derived as `login_locked_until` minus the lock length for the current `login_lock_level`, and used for the quiet-window reset. |

#### OTP send escalation (forgot password, change email, change password)

| Topic                  | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-OTP guess limit    | Unchanged: 5 wrong guesses per OTP, then `OTP_ATTEMPTS_EXCEEDED`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Send cap               | Unchanged: 5 resends, counted per user **per purpose** over the existing rolling 60-minute window. The 60 s cooldown is unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Block length           | Escalates each time the cap is hit: **1 h**, then **4 h**, then **24 h** (capped at 24 h). The counting window does **not** grow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| What a block covers    | Sending only. Verifying an OTP that was already sent still works.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Escalation reset       | Two events reset the level: (a) a successful consuming verify for that purpose (`reset-password` for forgot password, `verify-otp` with `change_email`, `confirm-password-change`); `verify-otp` with `forgot_password` does **not** reset it. (b) 24 h passing after the last time the cap was hit without it being hit again.                                                                                                                                                                                                                                                                                                     |
| Response               | Unchanged code `OTP_RESEND_LIMIT`, existing message format, with the duration wording matching the level ("about an hour" / "about 4 hours" / "about a day"). Adds a `Retry-After` header with the exact seconds remaining.                                                                                                                                                                                                                                                                                                                                                                                                         |
| Per-target-address cap | None.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Storage                | New columns on `users_otps`: `send_escalation_level` and `send_blocked_until`. When the cap is hit, the new level and block-end time are written onto the **latest existing row** for that user and purpose (no new row is created). The current level and block are read from that latest row. When a later send creates a new row, `send_escalation_level` and `send_blocked_until` are **copied forward** from the previous latest row. No separate "last capped at" column: the time the cap was last hit is derived as `send_blocked_until` minus the block length for the current level, and used for the quiet-window reset. |
| Registration           | **Unchanged** in this stage. It keeps its existing all-rows cap. Marked TODO.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

#### Admin

| Topic               | Decision                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Unlock endpoint     | New endpoint `POST /users/:id/unlock`, behind `authenticate` + `authorize('admin')`.                                                     |
| Permission rules    | Same as `PUT /users/:id/status`: `SUPER_ADMIN_IMMUTABLE` on a super-admin target, and `FORBIDDEN` when an admin targets another admin.   |
| Effect              | Clears the login lock **and** resets the login escalation, and clears OTP send blocks and their escalation for all three purposes.       |
| `GET /users` fields | Each user object gains `isLocked`, `lockedUntil`, `lockLevel` (camelCase, per Stage 15c).                                                |
| `GET /users` filter | New query parameter `locked=true\|false`. It is a closed enum and uses the same one-fixed-error-message pattern as the existing filters. |

#### Config

New env vars, added to `config.ts`'s Zod schema and to `.env.example`, `.env` and `.env.test`:

- `LOGIN_MAX_FAILURES=5`
- `LOGIN_FAILURE_WINDOW_MINUTES=15`
- `LOCK_ESCALATION_HOURS=1,4,24`, shared by the login lock and the OTP send blocks
- `LOCK_ESCALATION_RESET_HOURS=24`

#### Cross-cutting

| Topic       | Decision                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrency | Counting must be exact under concurrent requests. For example, N concurrent 5th failures produce exactly one lock. Follow the existing user-row locking pattern and the Stage 4d lock-order rule. |
| Frontend    | Matches existing patterns: `errorMessages.js` mapping, `FormBanner` / `FieldError` / toast display, and `getRowActions` for the admin row menu.                                                   |
| Tests       | Stage 7's "do not test NFR1" exclusion is **lifted** for NFR1.1. Simulate time by backdating rows, as in earlier stages.                                                                          |

### Changes to already-implemented code

| #   | File                                                                                                                                                         | Change                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/db/init.sql`                                                                                                                                            | Add the four `users` columns and the two `users_otps` columns. Existing dev volumes need `docker compose down -v`.                                                                |
| 2   | `src/config.ts`, `.env*`                                                                                                                                     | Add the new env vars.                                                                                                                                                             |
| 3   | `src/services/auth.service.ts` (`login`)                                                                                                                     | Add the lock check before the credential check. Count failures, lock on threshold, and reset on success. Skip `pending` and `suspended` accounts.                                 |
| 4   | `src/services/me.service.ts` (`initiateEmailChange`, `initiatePasswordChange`)                                                                               | Reject with `ACCOUNT_LOCKED` before the password check when locked. Count `INVALID_PASSWORD` on the login counter; a correct password resets it.                                  |
| 5   | `src/services/otp.service.ts` (`requestOtp`)                                                                                                                 | Apply the escalating block for the three purposes, writing level and block-end onto the latest row on a cap hit and copying them onto each new row. Leave registration unchanged. |
| 6   | `src/services/auth.service.ts` (`forgotPassword`, `resetPassword`) and `me.service.ts` (`throwOnUnsentOtp`, `verifyEmailChangeOtp`, `confirmPasswordChange`) | Level-matched message and `Retry-After` on `OTP_RESEND_LIMIT`. Reset the level on a successful consuming verify.                                                                  |
| 7   | `src/services/userResponse.ts` (`toUserResponse`)                                                                                                            | Add `isLocked`, `lockedUntil`, `lockLevel`.                                                                                                                                       |
| 8   | `src/db/queries/users.queries.ts` (`listUsersPage`), `users.controller.ts` (`list`)                                                                          | Add the `locked` filter.                                                                                                                                                          |
| 9   | `users.routes.ts`, `users.controller.ts`, `users.service.ts`                                                                                                 | Add `POST /users/:id/unlock`.                                                                                                                                                     |

### Sub-stages

- **18a: Schema and config.** Rows 1–2.
- **18b: Login lockout.** Rows 3–4.
- **18c: OTP send escalation.** Rows 5–6.
- **18d: Admin unlock, `GET /users` fields and filter.** Rows 7–9.
- **18e: Frontend.**
  - `errorMessages.js`: add `ACCOUNT_LOCKED` (banner).
  - `Login.jsx`: show it as a banner.
  - `AdminUsers.jsx`: add the three lock fields as columns, a `locked` filter, and an Unlock row action that follows the same visibility rules as Suspend in `getRowActions`.
  - `api/users.js`: add `unlockUser`.
- **18f: Tests**, as below.

### Verification

- 4 wrong logins, then the correct password: login succeeds and the counter resets.
- 5 wrong logins within 15 min: `429 ACCOUNT_LOCKED` with `Retry-After`. The correct password is still rejected during the lock.
- 5 wrong logins spread over more than 15 min from the first failure: no lock.
- Login attempts during a lock do not extend it.
- Second lock lasts 4 h, third and later 24 h. With the threshold not hit for 24 h after the last lock, the next lock is 1 h again.
- Wrong passwords on a `pending` or `suspended` account do not count. An unknown identifier does not count.
- `INVALID_PASSWORD` on `/users/me/email` and `/users/me/password` counts toward the same counter. A correct current password there resets it. While locked, both endpoints return `429 ACCOUNT_LOCKED`.
- A lock does not revoke refresh tokens. `POST /auth/refresh` still works while locked.
- A super admin can be locked. Suspending a locked account works. Unsuspending leaves the lock in place.
- OTP: hitting the send cap blocks sends for 1 h, then 4 h, then 24 h. Verifying an already-sent OTP still works during a block.
- OTP: `reset-password`, `verify-otp` (`change_email`) and `confirm-password-change` each reset that purpose's level. `verify-otp` (`forgot_password`) does not. 24 h after the last cap hit with no new cap hit, the level resets.
- OTP: after a block ends and a send succeeds, the new row carries the previous level, so the next cap hit escalates rather than restarting at 1 h.
- OTP: caps and levels are per purpose. Registration behaviour is unchanged.
- `POST /users/:id/unlock`: clears the login lock and the OTP blocks and resets escalation. It follows the suspend permission rules (`SUPER_ADMIN_IMMUTABLE` and `FORBIDDEN` cases).
- `GET /users` shows `isLocked`, `lockedUntil` and `lockLevel`, and `locked=true|false` filters. An invalid value returns `400` with the fixed message.
- Concurrency: N concurrent wrong logins at the threshold produce exactly one lock and the correct level. Concurrent sends at the cap produce exactly one escalation.
- Frontend: the login banner shows the lock message. The admin page shows the lock columns, the filter and the Unlock action, and the row updates in place with a toast.

### Tests (Vitest)

Follow the Stage 7 ground rules: real Postgres, the existing mocking policy, and tests under `tests/` mirroring `src/` with concurrency tests in `tests/concurrency/`. Cover every Verification bullet above that does not need Docker. Simulate elapsed time by backdating the relevant timestamp columns.

### Backlog edit (for the team to make in `docs/FoC-ProductBacklog.md`)

- **NFR1.1:** the current wording ("lock … after 5 consecutive failed login or OTP attempts within a 15-minute window") no longer matches this stage. Login failures lock with escalation; OTP protection is the existing per-OTP guess limit plus an escalating send block.
- **NFR1.1.1:** mark as deferred.

# Stage 19: OTP Email Retry and Delivery Logging (NFR2.1.1, NFR2.1.2)

> **Scope**: `user-service` only. Failed OTP email sends are retried inline, within a time limit,
> and every send attempt is logged to the console. The outcome after the final failure is
> unchanged: `503 EMAIL_SEND_FAILED`, and the new OTP is rolled back.
>
> Backlog refs: NFR2.1, NFR2.1.1, NFR2.1.2.
>
> The read-and-report step for this stage is done; the decisions below incorporate your report.
> If anything below still disagrees with the code, stop and ask me.

### Design decisions (already made, do not change)

| Rule                                    | Value                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attempts                                | Up to 4 sends in total: the first attempt plus 3 retries                                                                                                                                                                                                                                                                                           |
| OTP across retries                      | The same OTP and the same email content on every attempt. No new OTP is generated per attempt.                                                                                                                                                                                                                                                     |
| Transient errors (retried)              | `ETIMEDOUT`, `ESOCKET`, `ECONNECTION`, `EDNS` — always. `EENVELOPE`, `EMESSAGE`, `EAUTH` — only when `responseCode` is between 400 and 499 inclusive. The per-attempt timeout (below) also counts as transient.                                                                                                                                    |
| Non-transient errors (fail immediately) | `EENVELOPE`, `EMESSAGE`, `EAUTH` with any other `responseCode` or none (this includes 5xx replies and the "Missing credentials" `EAUTH`), `EPROTOCOL`, and any error without a recognised `code`. No further attempts, no wait.                                                                                                                    |
| Where retries run                       | Inline, inside the request, within the existing transaction                                                                                                                                                                                                                                                                                        |
| Retry loop location                     | Inside `sendOtpEmail` in `src/services/email.service.ts`. Its contract is unchanged: it resolves on success and throws after the final failure.                                                                                                                                                                                                    |
| Backoff                                 | The same shape as Stage 14: after the n-th failed attempt, wait `random() × min(300, 1 × 2^(n−1))` seconds (full jitter), so the caps are 1, 2 and 4 s. Computed in code (nothing is stored); `Math.random()` is acceptable here.                                                                                                                  |
| Nodemailer phase timeouts               | `connectionTimeout`, `greetingTimeout`, `socketTimeout` and `dnsTimeout` all set to 5000 ms on the transport, at `createTransport()` time                                                                                                                                                                                                          |
| Per-attempt cap                         | 5 s total per attempt, enforced by racing each `sendMail()` against a 5 s timer. If the timer wins, the attempt counts as a failed, transient attempt.                                                                                                                                                                                             |
| Abandoned sends                         | Nodemailer cannot cancel an in-flight send. An attempt cut off by the timer is left to finish on its own. Its later result must be caught (no unhandled rejection) and is not logged. Accepted consequences: the user may get duplicate emails with the same code, and if all attempts fail, a late email may deliver a code that was rolled back. |
| Overall deadline                        | 30 s from the start of the first attempt. No wait may start if it would end after the deadline; in that case, stop and fail. An attempt in flight at the deadline is handled like any other cut-off attempt.                                                                                                                                       |
| Configuration                           | Constants in code at the top of `email.service.ts`, like Stage 14. No new env vars.                                                                                                                                                                                                                                                                |
| After the final failure                 | Unchanged: `AppError(503, 'Unable to send verification email. Please try again.', 'EMAIL_SEND_FAILED')` from `issueOtp`, and the transaction rolls back                                                                                                                                                                                            |
| Purposes covered                        | Every send through `issueOtp`: Registration, Forgot Password, Change Email, Change Password                                                                                                                                                                                                                                                        |
| Dev console fallback                    | Unchanged. When `NODE_ENV=development` and `SMTP_HOST` is empty, there are no retries and no new log lines; the existing `[DEV EMAIL]` line stays as it is.                                                                                                                                                                                        |
| Logging destination                     | Console only. No DB table.                                                                                                                                                                                                                                                                                                                         |
| What is logged                          | One line per attempt, both successes and failures                                                                                                                                                                                                                                                                                                  |
| Log fields                              | Outcome, username, masked email, purpose, attempt number, and error code (failures only)                                                                                                                                                                                                                                                           |
| Email masking                           | First character of the local part, then `***`, then `@` and the full domain, e.g. `g***@u.nus.edu`                                                                                                                                                                                                                                                 |
| Never logged                            | The OTP, the full email address, the email body, and SMTP response text                                                                                                                                                                                                                                                                            |

### Log line format

```
[OTP EMAIL] outcome=sent user=<username> to=<masked email> purpose=<purpose> attempt=<n>/4
[OTP EMAIL] outcome=failed user=<username> to=<masked email> purpose=<purpose> attempt=<n>/4 error=<code>
```

- Successes use `console.log`, failures `console.error`.
- `error` is the Nodemailer `code`, followed by the `responseCode` when present (e.g. `EENVELOPE 452`). An attempt cut off by the 5 s timer logs `error=ATTEMPT_TIMEOUT`.
- For Change Email, `to` is the masked new email (the address the OTP was sent to).

### Changes to already-implemented code

| #   | File                            | Change                                                                                                                                                          |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/services/email.service.ts` | Phase timeouts on the transport; `sendOtpEmail` gains `username` and implements the retry loop, per-attempt cap, deadline, backoff and logging                  |
| 2   | `src/services/otp.service.ts`   | `issueOtp` gains `username` and passes it to `sendOtpEmail`. `requestOtp` gains `username` and passes it to its internal `issueOtp` call (line 159).            |
| 3   | `src/services/auth.service.ts`  | Pass `username` at `register()` (line 212, normalised input), `resendRegistrationOtp()` (line 444, looked-up row) and `forgotPassword()` (line 466, locked row) |
| 4   | `src/services/me.service.ts`    | Pass `locked.username` at `initiateEmailChange()` (269), `resendChangeEmailOtp()` (328), `resendChangePasswordOtp()` (356), `initiatePasswordChange()` (437)    |
| 5   | Existing tests                  | Update mocks or fixtures affected by the signature changes. Do not change what they assert.                                                                     |

Line numbers are from your report; re-check them before editing.

### Watch for

- The final failure must still throw so `withTransaction` rolls back, exactly as today.
- A non-transient failure must not be retried and must not wait.
- The 5 s timer must be cleared when the send settles first, so no stray timers keep running.
- An abandoned send's later rejection must be caught.
- `requestOtp`'s cooldown is measured from the OTP row's `created_at`, which is set before the send. Do not change this.

### Verification

- SMTP succeeds on the first attempt → `200`, one `outcome=sent ... attempt=1/4` line
- Transient failure on attempts 1–2, success on attempt 3 → `200`, two `failed` lines then one `sent` line, one OTP row, and the same OTP in every attempt
- Transient failure on all 4 attempts → `503 EMAIL_SEND_FAILED`, four `failed` lines, no new OTP row (rolled back), and the previous OTP still valid
- Each of `ETIMEDOUT`, `ESOCKET`, `ECONNECTION`, `EDNS` is retried
- `EENVELOPE`, `EMESSAGE` and `EAUTH` with `responseCode` 400 and 499 are retried; with 399, 500 and 550 they fail immediately
- `EAUTH` with no `responseCode` ("Missing credentials"), `EPROTOCOL`, and an error with no `code` each fail immediately: `503`, one `failed` line, no waits
- Waits between attempts fall within 0–1 s, 0–2 s and 0–4 s
- An attempt that has not settled after 5 s is cut off, logged as `error=ATTEMPT_TIMEOUT`, and retried; its later rejection does not cause an unhandled rejection and is not logged
- The whole send never exceeds 30 s; a wait that would end after the deadline is not started, and the result is `503 EMAIL_SEND_FAILED`
- Each purpose (registration, forgot password, change email, change password) retries and logs, with the correct username
- Change Email logs the masked new email, not the current one
- No log line contains the OTP, a full email address, or SMTP response text
- Dev fallback (development, empty `SMTP_HOST`) behaves exactly as before: no retries, no `[OTP EMAIL]` lines

### Tests (Vitest)

Write the tests in this stage, following the Stage 7 ground rules and layout. Stage 7's "do not test NFR2" exclusion is **lifted** for NFR2.1.1 and NFR2.1.2. Every bullet under Verification above is a required test case.

- Mock the Nodemailer transport (permitted by the Stage 7 mocking policy) to produce success, each error type above with chosen `responseCode`s, and sends that never settle.
- Use Vitest fake timers for the backoff waits, the 5 s cap and the 30 s deadline, so the suite does not actually sleep.
- Spy on `console.log` / `console.error` to assert the log lines.
- Use the real test Postgres for the rollback and previous-OTP-still-valid checks.
- Do not modify application code to make a test pass.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry for this stage.

### Backlog note (for the team)

- NFR2.1.2 says "for monitoring". This stage logs to the console only; there is no dashboard or alerting.

# Stage 20: Email Masking in Admin Views (NFR3.1.1)

> **Scope**: `user-service` and `frontend`. Emails are masked by the backend in every admin
> response. An admin unmasks one row's email at a time with an eye icon on `/admin/users`. Every
> unmask attempt, granted or denied, is logged to the console.
>
> Backlog refs: NFR3.1.1. Replaces NFR3.1.2 and NFR3.1.3 (no OTP before unmasking, no
> 15-minute window). The same log is used for NFR3.2.2.
>
> **Before starting:** read the current code, not just this file. If any `[DECIDE]` placeholder
> remains, or anything below disagrees with the code, stop and ask me.

### Design decisions (already made, do not change)

| Rule                          | Value                                                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Masked field                  | `email` only                                                                                                                                                                                               |
| Where masking happens         | In the backend. The response's `email` key holds the masked value; there is no separate field and no flag saying whether it is masked.                                                                     |
| Mask format                   | Same as Stage 19: first character of the local part, then `***`, then `@` and the full domain, e.g. `g***@u.nus.edu`. A one-character local part follows the same rule: `a@x.com` → `a***@x.com`.          |
| Responses that are masked     | Every admin response containing a user object: `GET /users`, `GET /users/:id`, `PUT /users/:id/status`, `PUT /users/:id/role`, `POST /users/:id/unlock`, including no-op return paths                      |
| The caller's own row          | Not masked                                                                                                                                                                                                 |
| Self views                    | Not masked: `GET /users/me`, `PUT /users/me/*` responses, and the `user` object from `POST /auth/login`                                                                                                    |
| Email search on `GET /users`  | Unchanged (exact match on the real email). Results show the masked email.                                                                                                                                  |
| Sort by email                 | Unchanged (sorts on the real email)                                                                                                                                                                        |
| Unmask endpoint               | `GET /users/:id/full-email`, behind `authenticate` + `authorize('admin')`. Returns `200` with `{ email }` (the full email only).                                                                           |
| Who can unmask                | Admin and super admin                                                                                                                                                                                      |
| Super admin target            | No one can unmask a super admin's email → `403`, code `FORBIDDEN`, message `'Cannot unmask a super administrator\'s email'`                                                                                |
| Pending and suspended targets | Can be unmasked                                                                                                                                                                                            |
| `:id` validation              | Same as Stage 9: Zod `.uuid()` at the controller → `400 VALIDATION_ERROR`, `"Invalid user ID"`. Well-formed but unknown → `404 USER_NOT_FOUND`.                                                            |
| Unmask granularity            | One row's email per click                                                                                                                                                                                  |
| Re-masking                    | Frontend only, no server call, no log line. Happens when the eye is clicked again, or 60 seconds after unmasking, whichever comes first.                                                                   |
| Rate limit                    | None                                                                                                                                                                                                       |
| Log destination               | Console only (append-only by nature). No DB table. Only developers with console access can read it.                                                                                                        |
| What is logged                | Every unmask attempt that reaches the unmask controller, granted or denied                                                                                                                                 |
| Log fields                    | Actor (ID and username), target (ID and username), timestamp, user agent, outcome, and the rejection reason for denied attempts. No IP address.                                                            |
| Log failure                   | If writing the log line fails, the unmask fails. The granted line is written before the response is sent; if writing it throws, the request fails with `500 INTERNAL_ERROR` and the email is not returned. |
| NFR3.2.2                      | Shares this log                                                                                                                                                                                            |

### Log line format

```
[UNMASK EMAIL] actorId=<id> actorUsername=<username> targetId=<id> targetUsername=<username> timestamp=<ISO 8601 UTC> userAgent=<quoted> outcome=granted
[UNMASK EMAIL] actorId=<id> actorUsername=<username> targetId=<id> targetUsername=<username> timestamp=<ISO 8601 UTC> userAgent=<quoted> outcome=denied reason=<code>
```

- Granted lines use `console.log`, denied lines `console.error`.
- `reason` is the error code returned to the caller (e.g. `FORBIDDEN`, `USER_NOT_FOUND`, `VALIDATION_ERROR`).
- `userAgent` is the `User-Agent` request header written with `JSON.stringify`, since it contains spaces. A missing header is written as `-`.
- When the target does not exist or `:id` is not a valid UUID, `targetUsername` is `-`, and `targetId` is the raw `:id` value, also written with `JSON.stringify`.
- The actor's username is not in the access token (only `sub` and `role`), so it is read from the `users` table by `req.user.user_id`.
- `timestamp` comes from the database clock (`clock_timestamp()`, per convention 5), never `Date.now()`. Read it with a query for each log line (it can be selected alongside the actor or target lookup).
- Never logged: the email (masked or full).
- Requests rejected before the unmask controller runs (`authenticate` → `401`, `authorize('admin')` → `403`) are **not** logged.
- A caller targeting their own ID gets no special handling: the normal rules apply (an admin gets their email, logged as `granted`; a super admin is a super admin target, so `403 FORBIDDEN`).

---

## Changes to already-implemented code

| #   | File                                                                             | Change                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Stage 19 masking helper (wherever it lives now)                                  | Reuse it. If it lives in `email.service.ts`, move it to `src/utils/maskEmail.ts` and import it from both places. Its output must be unchanged for Stage 19's log lines. |
| 2   | `src/services/userResponse.ts` (`toUserResponse`)                                | Take the requester's ID. Mask `email` unless the row's `id` equals the requester's ID. Every admin caller passes `req.user.user_id` through to the service.             |
| 3   | `src/services/me.service.ts` (`changeActiveView`) and any other self-view caller | Must return the email unmasked (the row is always the caller's own, so passing the caller's ID is enough)                                                               |
| 4   | `src/services/users.service.ts`, `src/controllers/users.controller.ts`           | `listUsers`, `getUserById`, `changeUserStatus`, `changeUserRole`, unlock: pass the requester's ID to the mapper                                                         |
| 5   | `src/services/users.service.ts`, `users.controller.ts`, `users.routes.ts`        | Add `getFullEmail(actorId, targetId, userAgent)` and the `GET /users/:id/full-email` route                                                                              |
| 6   | Existing tests                                                                   | Update assertions that expect real emails in admin responses. Do not change what they assert otherwise. If a test fails for another reason, stop and report it.         |
| 7   | `frontend/src/api/users.js`                                                      | Add `getFullEmail(id)`                                                                                                                                                  |
| 8   | `frontend/src/pages/AdminUsers.jsx`                                              | Eye icon in the email cell (see Stage 20b)                                                                                                                              |
| 9   | `frontend/src/api/errorMessages.js`                                              | Check `FORBIDDEN`, `USER_NOT_FOUND` and `VALIDATION_ERROR` have toast text suitable for an unmask failure                                                               |

Route order: register `GET /:id/full-email` so it is reached (it must not be shadowed by `GET /:id`).

---

## Stage 20a: Backend

### `getFullEmail(actorId, targetId, userAgent)` in `src/services/users.service.ts`

1. Look up the actor by `actorId` for their username.
2. `findById(targetId)`. If none → log `denied reason=USER_NOT_FOUND`, then `AppError(404, 'User not found', 'USER_NOT_FOUND')`.
3. If the target's `role === 'super admin'` → log `denied reason=FORBIDDEN`, then `AppError(403, 'Cannot unmask a super administrator\'s email', 'FORBIDDEN')`.
4. Write the `granted` line, then return `{ email: target.email }`. If writing the line throws, let it propagate (global handler → `500`).

No transaction or lock: this is a single read with no state change.

### Controller `fullEmail` in `src/controllers/users.controller.ts`

- `asyncHandler`-wrapped
- Validate `req.params.id` with the Stage 9 `.uuid()` schema. On failure, log `denied reason=VALIDATION_ERROR`, then return the usual `400`. (The log needs the actor's username, so look it up first.)
- Calls `usersService.getFullEmail(req.user.user_id, req.params.id, req.get('user-agent'))`, returns `200` with `{ email }`

### Route in `src/routes/users.routes.ts`

```ts
router.get(
  "/:id/full-email",
  authenticate,
  authorize("admin"),
  usersController.fullEmail,
);
```

### Verification

- `GET /users` as an admin → every `email` masked except the caller's own row; the super admin's row masked
- `GET /users/:id`, `PUT /users/:id/status`, `PUT /users/:id/role`, `POST /users/:id/unlock` (including no-op paths) → `email` masked unless the target is the caller
- `GET /users/me`, `PUT /users/me/active-view`, and the `POST /auth/login` `user` object → email unmasked
- Mask format: `gabriel@u.nus.edu` → `g***@u.nus.edu`; `a@x.com` → `a***@x.com`
- `GET /users?email=<real email>` still finds the user; the result's email is masked
- Sort by email still orders by the real email
- `GET /users/:id/full-email` as admin on a user, a pending user, a suspended user and another admin → `200 { email }` with the real email, and one `outcome=granted` line each
- Same as super admin on a user and an admin → `200`
- Any caller targeting the super admin → `403 FORBIDDEN`, one `outcome=denied reason=FORBIDDEN` line
- Unknown UUID → `404 USER_NOT_FOUND`, one denied line with `targetUsername=-`
- Non-UUID `:id` → `400 VALIDATION_ERROR`, `"Invalid user ID"`, one denied line
- Regular user → `403 FORBIDDEN`; no token → `401 UNAUTHORIZED`; neither writes a log line
- Admin targeting their own ID → `200 { email }`, one `granted` line; super admin targeting their own ID → `403 FORBIDDEN`, one denied line
- The logged `timestamp` matches the database clock (e.g. compare against `clock_timestamp()` read in the test), not the service clock
- Log lines contain actor ID and username, target ID and username, timestamp, quoted user agent, outcome; no email of any kind; no IP
- Missing `User-Agent` header → `userAgent=-`
- Logging forced to throw → `500 INTERNAL_ERROR`, email not returned

---

## Stage 20b: Frontend

### `src/api/users.js`

Add `getFullEmail(id)` → `GET /users/:id/full-email`, returns `{ email }`.

### `src/pages/AdminUsers.jsx`

- Email cell shows the masked value from the list response, with an eye icon (lucide-react) beside it
- No eye icon on the caller's own row (compare `id` with `AuthContext.user.id`) or on any row with `role === 'super admin'`
- Click → `getFullEmail(id)` → show the full email in that cell and switch the icon to "hide"
- Click again → re-mask (show the masked value from the list response), no request
- 60 seconds after unmasking → re-mask automatically. Clear the timer on re-mask and on unmount.
- Each row unmasks independently; unmasking one row does not affect others
- Failure → toast via the `errorMessages.js` map, row stays masked
- Any refetch of the table (after a row action, a search, filter or sort change, or a page change) re-masks every row and clears their timers
- Works with the row-hover three-dot menu and on touch / small screens (the icon is always visible, not hover-only)

### Verification

- Eye icon present on other users' rows, absent on own row and super admin rows
- Click → full email shown; click again → masked; wait 60 s → masked
- Two rows unmasked at once each re-mask on their own timers
- Stop user-service, click the eye → toast, still masked
- Network tab: re-masking makes no request
- Unmask a row, then change a filter (or suspend another user) → every row is masked after the refetch
- Phone-width viewport: the icon is visible and tappable

---

### Tests (Vitest)

Write the tests in this stage, following the Stage 7 ground rules and layout (real Postgres, query/service/controller tests mirroring `src/`). Every Verification bullet in 20a and 20b is a required test case. Spy on `console.log` / `console.error` for the log lines.

Frontend tests cover the 20b bullets that don't need a real browser (icon visibility, unmask/re-mask on click, the 60 s timer with Vitest fake timers, failure toast, re-mask on refetch), with `getFullEmail` mocked. If `frontend/` has no test setup yet, stop and tell me what you would add before adding it.

Do not modify application code to make a test pass.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry for this stage.

### Backlog edit (for the team to make in `docs/FoC-ProductBacklog.md`)

- **NFR3.1.1:** unchanged in intent; masking is enforced in the backend.
- **NFR3.1.2:** replace the OTP requirement with: unmasking is per row, via an eye icon, and every attempt is logged.
- **NFR3.1.3:** replace the 15-minute window with: an unmasked email re-masks when clicked again or after 60 seconds.
- **NFR3.2.2:** notes that unmask attempts are logged to the same (console) log.

---

# Stage 21: Row-Actions Menu Fix & Password Visibility Toggle (frontend)

## Stage 21a: Fix clipped row-actions menu (frontend)

### Problem

On `/admin/users`, the row-hover three-dot menu is rendered inside the table wrapper, which has `overflow-x: auto`. A non-`visible` overflow on one axis forces the other axis to `auto`, so the open menu is clipped and adds a vertical scrollbar to the table.

### `src/components/ActionMenu.jsx` (new)

- Trigger: `<button type="button">` with `aria-haspopup="menu"`, `aria-expanded`, and `aria-label` from a prop (e.g. `"Actions for testalice"`). Trigger content (e.g. lucide-react `MoreVertical`) passed as a prop.
- Menu rendered with `createPortal` into `document.body`, `position: fixed`, `role="menu"`; each item a `<button role="menuitem">`.
- Positioning: in `useLayoutEffect` after the menu renders, measure trigger and menu with `getBoundingClientRect()`.
  - Place below the trigger, right-aligned to it, 4px gap.
  - If it doesn't fit below the viewport bottom, flip above the trigger.
  - Clamp `left` to ≥ 8px.
  - Keep it `visibility: hidden` until positioned (no flash).
- Close on:
  - outside `mousedown`
  - Escape (return focus to the trigger)
  - item selection
  - `resize`
  - `scroll` (capture phase, so scrolling the table itself also closes it)

  Remove all listeners on close and unmount.

- `z-index` above the header and the chat button.
- Items: `{ label, onSelect, danger? }`; `danger` uses the existing destructive text colour.

### `src/pages/AdminUsers.jsx`

- Replace the existing absolutely positioned dropdown markup with `ActionMenu`. Delete the old menu code and its CSS; no dead code.
- Keep the existing item set and handlers (Suspend / Unsuspend, etc.) unchanged.
- Do not change the table wrapper's `overflow-x: auto`.
- The trigger must remain usable on touch / small screens. If it is currently hover-only, make it always visible below the existing mobile breakpoint.

### Other usages

Search `src/` for other dropdowns or popovers rendered inside an overflow container (e.g. Manage suppliers). List them and ask me before migrating any.

### Verification

- Open the menu on the last row → it flips upward, the table gains no scrollbar, and the menu is fully visible
- Open the menu on the first row → opens below
- Escape closes the menu and focus returns to the trigger; outside click closes it; scrolling the page or the table closes it
- Selecting an item closes the menu and calls the handler once
- Only one menu is open at a time
- At phone width with the table scrolled horizontally → the menu is unclipped and aligned to its trigger
- Keyboard: Tab reaches the trigger, Enter/Space opens the menu, and the items are focusable

---

## Stage 21b: Show/hide password toggle (frontend)

### `src/components/PasswordInput.jsx` (new)

- `forwardRef` component; passes through all `<input>` props except `type`.
- Internal `visible` state, default `false`; input `type` switches between `"password"` and `"text"`.
- Toggle: `<button type="button">` (must never submit the form), absolutely positioned inside the field on the right.
  - lucide-react `Eye` / `EyeOff` icons
  - `aria-label` "Show password" / "Hide password"
  - `aria-pressed={visible}`
  - visible `:focus-visible` outline
- Right padding on the input so text never runs under the icon.
- `autoCapitalize="none"`, `autoCorrect="off"`, `spellCheck={false}`.
- Hide Edge's native reveal button (`input::-ms-reveal { display: none; }`) so there aren't two toggles.
- Each instance toggles independently.

### Replace every password field

- `grep -rn 'type="password"' src/` and replace each match with `PasswordInput`, keeping all existing props, validation and error display.
- Expected locations: Login, Register, Forgot/Reset password, Change password (current, new, confirm), and the password re-entry in Change email. Report any extra matches, or any of these that are missing.
- `autoComplete`:
  - `"current-password"` for Login and any "current password" field
  - `"new-password"` for Register, Reset, and any new/confirm field
- OTP fields are not password fields; leave them unchanged.

### Verification

- Every password field listed above has a toggle
- Clicking the toggle reveals and hides the value, does not submit the form, and does not clear the value
- Toggling one field does not affect any other
- The toggle is reachable by Tab and works with Enter/Space; its `aria-label` updates when toggled
- The icon doesn't overlap the text at phone width
- Existing validation errors still render correctly
- `grep` finds no remaining raw `type="password"` outside `PasswordInput.jsx`

---

### Tests (Vitest)

Every Verification bullet in 21a and 21b that doesn't need a real browser is a required test case:

- Menu: portal rendering, flip logic (mock `getBoundingClientRect` / `innerHeight`), and every close path
- Password input: type switching, no submit on toggle, independence between fields, and ARIA attributes

List the visual and phone-width checks in your summary for manual verification. If `frontend/` has no test setup yet, stop and tell me what you would add before adding it.

Do not modify application code to make a test pass.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry for this stage.

# Stage 22: Active View Controls Navigation (frontend)

> **Scope**: `frontend/` only. The requester/courier toggle (Stages 11 and 16f) decides which
> pages the user sees. In requester view the main page is the Suppliers page; in courier view it
> is the Find errands page. The Landing page is removed.
>
> No backend changes. This stage reuses the existing `active_view` column,
> `PUT /users/me/active-view`, and `activeView` on `POST /auth/login` and `GET /users/me`.
>
> Backlog refs: F5.2.2.
>
> The read-and-report step for this stage (22a) is done; the decisions below incorporate your
> report.
>
> **Before starting:** read the current code, not just this file. If any `[DECIDE]` placeholder
> remains, or anything below disagrees with the code, stop and ask me.
>
> **Ground rules:** the Stage 16 ground rules apply:
>
> - Work in `frontend/` only; never touch `foc-mockup/`.
> - Do not modify `src/realtime/orderSocket.js`, `src/data/users.js`,
>   `src/components/DemoControls.jsx` or `AI-NOTES.md`.
> - List every file outside user-service screens that you touched.
>
> This stage changes the Landing, Suppliers, My activity, Find errands, Chat and admin supplier
> pages, and puts Suppliers, supplier detail, Find errands and the admin supplier pages behind
> login. Confirm the owners of
> those pages have agreed before starting.

### Design decisions

#### Which pages each view shows (logged-in users)

| View           | Pages                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Requester only | Suppliers (`/suppliers`, main page), supplier detail (`/suppliers/:id`), request form (`/requests/new` and `/requests/:id/edit`), My errands (`/my-errands`) |
| Courier only   | Find errands (`/requests`, main page), My deliveries (`/my-deliveries`)                                                                                      |
| Both views     | Chat, Credits (`/wallet`), Account, and the admin pages (`/admin/suppliers*`, `/admin/users`)                                                                |

Any page found that is not in this table → stop and ask me which view it belongs to.

#### Behaviour

| Rule                        | Value                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend                     | No changes                                                                                                                                                                                                                                                                                                                  |
| Source of the current view  | `AuthContext.user.activeView` (unchanged from 16f)                                                                                                                                                                                                                                                                          |
| Page-to-view list           | One shared list in code. Every route, the nav bar and the blocked-page check all read from it.                                                                                                                                                                                                                              |
| Landing page                | Removed. Delete `Landing.jsx` and anything only it uses (components, styles, tests).                                                                                                                                                                                                                                        |
| `/` (home)                  | Redirects: logged in → the current view's main page (`/suppliers` or `/requests`); logged out → `/login`. The FoC logo, the post-login fallback and the Forbidden page's home link all keep pointing at `/`.                                                                                                                |
| My activity                 | Split into two pages: My errands at `/my-errands` (requester only) and My deliveries at `/my-deliveries` (courier only). The `/activity` route is removed. Links that went to `/activity` from the request form (after posting or editing) go to `/my-errands`.                                                             |
| Nav bar (logged in)         | Shows only the pages of the current view, plus the pages shown in both views. The other view's links are hidden. In requester view the nav shows "My errands"; in courier view it shows "My deliveries".                                                                                                                    |
| Nav bar (logged out)        | No page links. Only Log in and Register.                                                                                                                                                                                                                                                                                    |
| Logged-out visitors         | Can open only `/login`, `/register` and `/forgot-password`. Every other page, including Suppliers, supplier detail, Find errands and the admin supplier pages, is behind `RequireAuth`, which sends them to `/login` and remembers the page (existing Stage 16 behaviour). The blocked-page message is never shown to them. |
| Opening another view's page | Shown in place; the URL is unchanged. Message: "This is only available in `<view>` mode", where `<view>` is the view that page belongs to. Two buttons: one switches to that view (staying on the page, which then renders normally), and one goes to the current view's main page (Suppliers or Find errands).             |
| Toggling the view           | Optimistic, revert and toast on failure (unchanged from 16f). The user stays on the current page. If that page belongs only to the other view, the blocked-page message above is shown.                                                                                                                                     |
| New users                   | Start in requester view (the existing schema default, unchanged). The saved view persists across sessions as before (F5.2.2).                                                                                                                                                                                               |
| Landing after login         | Unchanged from Stage 16: the page the user was sent away from, else `/`. If that page belongs only to the other view, the blocked-page message above is shown.                                                                                                                                                              |
| Find errands empty state    | Remove the "Post an errand" button. Heading: "No errands available". Text: "Check back in a bit."                                                                                                                                                                                                                           |
| Chat back arrow (mobile)    | Goes back to the previous page instead of the fixed `/activity` link. When there is no previous in-app page (e.g. the chat was opened directly by URL or in a new tab), it goes to the current view's main page (Suppliers or Find errands).                                                                                |
| Notifications               | Not implemented yet; out of scope for this stage. See "Notes for later".                                                                                                                                                                                                                                                    |

### Watch for

- `/` must not redirect until session restore has finished (`AuthContext` status is no longer `loading`). Otherwise a logged-in courier is briefly sent to `/suppliers`.
- The blocked-page check runs only when the status is `authenticated`.

---

## Stage 22b: Implementation

Implement the design decisions above exactly as written. Do not choose behaviour for any case they do not cover. Ask instead.

### Verification

Logged in:

- Requester view: the nav shows Suppliers and My errands (plus the shared pages), not Find errands or My deliveries
- Courier view: the nav shows Find errands and My deliveries (plus the shared pages), not Suppliers or My errands
- `/` redirects to `/suppliers` in requester view and `/requests` in courier view, with no flash of the wrong page during session restore
- The FoC logo goes to the current view's main page
- Chat, Credits, Account and the admin pages open normally in both views
- Admin pages stay visible in both views (for admins)
- Opening a courier-only page in requester view (typed URL, back button) → blocked-page message, URL unchanged, saying "courier mode"; and the reverse for requester-only pages
- `/requests/:id/edit` in courier view → blocked-page message
- Blocked page, switch button → the view switches, the user stays on the page, and the page renders
- Blocked page, main-page button → goes to the current view's main page without changing the view
- Toggle on a page in both views → the user stays on that page
- Toggle on a page belonging only to the old view → the user stays on it and sees the blocked-page message
- Toggle failure (user-service stopped) → the view reverts, a toast is shown, and the nav matches the reverted view
- `/my-errands` and `/my-deliveries` each show their half of the old My activity page; `/activity` no longer exists
- Posting or editing an errand → lands on `/my-errands`
- Find errands' empty state has no "Post an errand" button and reads "No errands available" / "Check back in a bit."
- Chat back arrow → returns to the page the chat was opened from
- Chat opened directly by URL or in a new tab → back arrow goes to the current view's main page
- New user → starts in requester view and sees Suppliers
- Logged out on a courier-only page, logged in with a saved requester view → after login, back on that page with the blocked-page message saying "courier mode"
- Reload, or log in on another browser → same view and same set of pages as before

Logged out:

- `/` redirects to `/login`
- `/login`, `/register` and `/forgot-password` open normally
- Every other page (Suppliers, supplier detail, Find errands, request form, My errands, My deliveries, Chat, Credits, Account, admin pages) redirects to `/login`; after logging in, the user lands back on that page (or sees the blocked-page message if it belongs to the other view)
- The nav shows no page links, only Log in and Register
- No blocked-page message appears anywhere

General:

- `Landing.jsx` and anything only it used are gone; nothing imports them
- No files under `user-service/` changed

### Tests (Vitest)

Write the tests in this stage, following the Stage 7 ground rules and layout. Every Verification bullet above that does not need a real browser is a required test case. If `frontend/` has no test setup yet, stop and tell me what you would add before adding it. Do not modify application code to make a test pass.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry for this stage.

### Notes for later (do not implement now)

- **Notifications**: when they are implemented, decide what a notification linking to a page in the other view does (e.g. a "your errand was accepted" notification received while in courier view). Add its page to the page-to-view list.
- **My errands / My deliveries data fetching**: My activity loads both halves in one fetch. Whether each new page fetches only its own half is pending the order-service owners' reply. Until then, keep the existing fetch behaviour.

### Backlog edit (for the team to make in `docs/FoC-ProductBacklog.md`)

- **F5.2.2**: TODO (team): wording describing what the active view now controls. Not needed to implement this stage.

# Stage 23: Session Lifetime and Expiry Warning (NFR4)

> **Scope**: `user-service` and `frontend`.
>
> - 23a: sessions get a fixed absolute lifetime of 30 days from login, and both token TTL env vars get bounds
> - 23b: login and refresh responses tell the frontend how long the session has left
> - 23c: the frontend shows a banner 10 minutes before the 30-day expiry
>
> There is no idle timeout.
>
> Backlog refs: NFR4.1.2 (changed), NFR4.2.1 (reworded), NFR4.1.1 (dropped).
>
> This supersedes the 7-day refresh token lifetime in Stage 1 (stack) and Stage 4c (login).
>
> **Before starting:** read the current code, not just this file. If anything below disagrees
> with the code, stop and ask me. Implement one sub-stage at a time and wait for my
> confirmation before the next.

### Design decisions (already made, do not change)

**Session lifetime**

| Rule                                | Value                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Session lifetime                    | 30 days, fixed from login. Not a sliding window: no activity or `POST /auth/refresh` call extends it. Refresh tokens are still not rotated.                                          |
| `REFRESH_TOKEN_TTL_DAYS`            | `30` in `.env`, `.env.example` and `.env.test`. Bounds 1–30 inclusive.                                                                                                               |
| `ACCESS_TOKEN_TTL_MINUTES`          | Unchanged at `15`. Bounds 1–15 inclusive.                                                                                                                                            |
| Access-token tail                   | Accepted. An access token issued just before the refresh token expires stays valid for up to `ACCESS_TOKEN_TTL_MINUTES` after it, so the real maximum is about 30 days + 15 minutes. |
| Idle timeout (NFR4.1.1)             | Not implemented. Dropped from scope.                                                                                                                                                 |
| Out-of-bounds values                | The app exits at startup with a clear error naming the variable and the allowed range, through the existing env-validation error path                                                |
| Existing tests that hardcode 7 days | Report them and stop. Do not change them.                                                                                                                                            |

**Expiry warning**

| Rule                  | Value                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| What it warns about   | The 30-day absolute expiry only                                                                                                                        |
| Data from the server  | Seconds left until the refresh token's `expires_at`, in a field named `sessionTimeLeftSeconds`                                                         |
| Responses carrying it | `POST /auth/login` and `POST /auth/refresh` (session restore on page load already goes through refresh)                                                |
| Lead time             | 10 minutes before expiry                                                                                                                               |
| Display               | A banner, not dismissible. It stays until the user is signed out.                                                                                      |
| Banner action         | A "Log in again" button: logs out now and goes to `/login`, so the user starts a fresh 30-day session                                                  |
| At expiry             | No special handling. The user is signed out at the next refresh, as today (up to ~15 minutes after the 30-day mark, because of the access-token tail). |
| Extend option         | None. The 30 days cannot be extended.                                                                                                                  |

---

## Stage 23a: 30-Day Lifetime and TTL Bounds

### Changes to already-implemented code

| #   | File                             | Change                                                                              |
| --- | -------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | `user-service/src/config.ts`     | Add bounds to `REFRESH_TOKEN_TTL_DAYS` (1–30) and `ACCESS_TOKEN_TTL_MINUTES` (1–15) |
| 2   | `user-service/.env`, `.env.test` | `REFRESH_TOKEN_TTL_DAYS=30`                                                         |
| 3   | `user-service/.env.example`      | `REFRESH_TOKEN_TTL_DAYS=30`, and a range comment on both TTL lines                  |

### Update `user-service/src/config.ts`

- `REFRESH_TOKEN_TTL_DAYS`: keep `z.coerce.number().int().positive()` and add the bound 1–30 inclusive
- `ACCESS_TOKEN_TTL_MINUTES`: same, with the bound 1–15 inclusive
- Reuse the existing error-reporting path for out-of-bounds values. Do not add a new one.
- Change nothing else in `config.ts`.

### Update the env files

`.env` and `.env.test`: set `REFRESH_TOKEN_TTL_DAYS=30`. Change nothing else.

`.env.example`: set `REFRESH_TOKEN_TTL_DAYS=30` and add the allowed range as a comment on each TTL line. Change nothing else.

```env
ACCESS_TOKEN_TTL_MINUTES=15   # 1–15
REFRESH_TOKEN_TTL_DAYS=30     # 1–30
```

Check that `config.ts` still parses these lines with the comments on them (no comment text in the value). If it does not, stop and tell me.

### Check before finishing (report only, do not change)

- **Refresh cookie `Max-Age`:** confirm it is derived from `config.jwt.refreshTokenTtlDays`, not a hardcoded 7 days. If it is hardcoded, stop and tell me.
- **Other hardcoded 7-day values:** search `user-service/` and `frontend/` for any other place that assumes a 7-day session (code, comments, user-facing text). List them; do not change them.
- **Docs:** list any place in `user-service/docs/` or the root `README.md` that states the 7-day lifetime. Do not edit them; I will decide.
- **Tests:** run the full suite after the change. List every test that fails because it hardcodes 7 days, with file and line, and stop. If a test fails for any other reason, also stop and report it.

### Verification

- `REFRESH_TOKEN_TTL_DAYS=0` and `=31` → app exits with a clear error naming the variable and the 1–30 range
- `ACCESS_TOKEN_TTL_MINUTES=0` and `=16` → app exits with a clear error naming the variable and the 1–15 range
- `REFRESH_TOKEN_TTL_DAYS=1` and `=30`, `ACCESS_TOKEN_TTL_MINUTES=1` and `=15` → accepted
- A non-integer value for either → still rejected
- The new `.env`, `.env.example` and `.env.test` values → accepted, and a `.env` copied from `.env.example` starts the service cleanly
- A new login → the `refresh_tokens` row has `expires_at - created_at` = 30 days, and the refresh cookie's `Max-Age` is 30 days
- `POST /auth/refresh` does not change `expires_at`
- A refresh token with `expires_at` backdated to the past → `POST /auth/refresh` returns `401 INVALID_REFRESH_TOKEN`

### Tests (Vitest)

Follow the Stage 7 ground rules.

- For the config bounds, follow the existing config-validation tests (child process, assert exit code and stderr). Every bound and boundary bullet above is a required test case.
- The remaining bullets are likely already covered by existing tests once `.env.test` is 30. Where they are, do not duplicate them. Where they aren't, add them.
- Do not modify application code to make a test pass, and do not change tests that hardcode 7 days (see "Check before finishing").

---

## Stage 23b: `sessionTimeLeftSeconds` on Login and Refresh

### Changes to already-implemented code

| #   | File                                                      | Change                                                                        |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | `src/services/auth.service.ts` (`login`, `refresh`)       | Return `sessionTimeLeftSeconds` alongside the existing return values          |
| 2   | `src/controllers/auth.controller.ts` (`login`, `refresh`) | Include it in the response body                                               |
| 3   | `src/db/queries/tokens.queries.ts`                        | Return the seconds left, computed in SQL, where `login` and `refresh` need it |
| 4   | Existing tests                                            | Update assertions on the exact login and refresh response shape (see Tests)   |

### Response shapes

- `POST /auth/login` → `200` with `{ accessToken, user: { id, username, email, role, activeView }, sessionTimeLeftSeconds }`. The `user` object is unchanged.
- `POST /auth/refresh` → `200` with `{ accessToken, sessionTimeLeftSeconds }`

`sessionTimeLeftSeconds` is a top-level field, not inside `user`.

### How it is computed

- Seconds from now until the refresh token's `expires_at`, whole seconds, rounded down, never negative
- Computed in SQL against the database clock (convention 5), e.g. from `expires_at - clock_timestamp()`. Never `Date.now()`.
- In `login`: from the refresh token row just created by `createRefreshToken` (inside the existing transaction)
- In `refresh`: from the locked token row, after all existing checks pass
- Add the value to the existing queries' `RETURNING` / `SELECT` lists rather than adding a separate query, where that is possible. Tell me what you chose.

Nothing else about `login` or `refresh` changes: checks, check order, locking and error codes stay as they are.

### Verification

- `POST /auth/login` → body includes `sessionTimeLeftSeconds` ≈ 30 days in seconds (2,592,000), and the `user` object is unchanged
- `POST /auth/refresh` right after login → `sessionTimeLeftSeconds` ≈ the login value minus the elapsed time
- Backdate `expires_at` to 5 minutes from now → `POST /auth/refresh` returns `sessionTimeLeftSeconds` ≈ 300
- `POST /auth/refresh` does not change `expires_at`
- Every existing login and refresh error case returns exactly as before (no `sessionTimeLeftSeconds` on errors)

### Tests (Vitest)

Follow the Stage 7 ground rules. Every Verification bullet above is a required test case.

Existing tests that assert the exact login or refresh response body (e.g. `toEqual({ accessToken })`) will need the new field: update only those response-shape assertions, as in Stage 15c. If a test fails for any other reason, stop and report it. Do not modify application code to make a test pass.

---

## Stage 23c: Expiry Warning Banner — Frontend

### Ground rules

Same as Stage 16:

- Work in `frontend/` only; never touch `foc-mockup/`
- Do not modify `src/realtime/orderSocket.js`, `src/data/users.js`, `src/components/DemoControls.jsx` or `AI-NOTES.md`
- Auth state stays in `AuthContext`; network calls go through `src/api/http.js`
- Reuse the existing banner component (`FormBanner` or whatever 16b settled on) and the existing text conventions
- React 18, JSX, no new libraries
- List every file you touched outside the files named below

### What to build

- **Read the value:** whenever a login or refresh response arrives (login, session restore, the proactive refresh, refresh-after-401), read `sessionTimeLeftSeconds` and store a local deadline in `AuthContext`, measured with a monotonic clock (`performance.now()`) so a wrong or changed device clock has no effect.
- **Show the banner:** while authenticated, once the deadline is 10 minutes or less away, show a banner at the top of every page. It cannot be dismissed. Each tab works this out from its own refresh responses; no cross-tab coordination is needed.
- **Lead time:** a named constant (10 minutes) at the top of the file that uses it. No new env var.
- **Banner text:** add it in the same place and style as the existing user-facing text. It must not promise an exact sign-out time, since the actual sign-out happens at the next refresh (see "At expiry"). Put the text in your summary so I can review it.
- **"Log in again" button:** calls the existing `AuthContext.logout()`, i.e. the same as the TopNav logout (explicit logout: no return to `from`).
- **At expiry:** nothing new. The existing refresh-failure path handles it.
- **On logout:** clear the deadline and any timer, so the banner never appears while logged out or carries over to the next login.

### Verification

- After login, no banner
- Backdate `expires_at` (backend) to 15 minutes from now, then reload → no banner; after 5 minutes → banner appears
- Backdate to 5 minutes from now, then reload → banner appears immediately
- The banner has no dismiss control and stays across page navigation
- "Log in again" → logged out and on `/login`; logging in → no banner (fresh 30 days)
- Changing the device clock does not make the banner appear or disappear
- Two tabs open → both show the banner when their deadline is reached
- Logged out → no banner, no timers left running
- When the session actually expires, the existing refresh-failure path signs the user out as before

### Tests (Vitest)

Follow the Stage 7 ground rules. Mock the network layer and use Vitest fake timers. Every Verification bullet above that does not need a real browser or backend is a required test case. If `frontend/` has no test setup yet, stop and tell me what you would add before adding it. Do not modify application code to make a test pass.

---

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry per sub-stage.

### Backlog edit (for the team to make in `docs/FoC-ProductBacklog.md`)

- **NFR4.1.1** (30-minute inactivity timeout): dropped. Note it as a deliberate scope change.
- **NFR4.1.2**: change "7 days" to "30 days", and note that the lifetime is fixed from login (not from last activity) and that an access token can outlive it by up to `ACCESS_TOKEN_TTL_MINUTES`.
- **NFR4.2.1**: reword from "notify the user 1 minute before their session expires due to inactivity and provide an option to extend it" to a non-dismissible banner 10 minutes before the 30-day session expiry, with an option to log in again (the session cannot be extended).

# Stage 24: Admin User History Page (F5.3.2)

> **Scope**: Frontend only (`frontend/`). An admin or super admin opens a user from
> `/admin/users`, sees that user's profile and a paginated list of their orders, and opens
> any order to see its full details and credit transactions. No user-service, order-service,
> credit-service or supplier-service changes.
>
> Backlog refs: F5.3.2.
>
> **Before starting:** if any `[DECIDE]` placeholder remains anywhere in this stage, stop and
> ask me. Do not pick a value yourself. Read the current code first. Where it disagrees with
> this file, follow the code and tell me.
>
> **Ground rules:** same as Stage 16 (work in `frontend/` only, never `foc-mockup/`; do not
> modify `src/realtime/orderSocket.js`, `src/data/users.js`, `src/components/DemoControls.jsx`
> or `AI-NOTES.md`; React 18, JSX, react-router-dom, Context API, Tailwind, lucide-react,
> native `fetch` via `src/api/http.js`; no new state or form libraries). List every file
> outside this page's own files that you touched.

### Backend contracts (already built and merged on main; do not change)

**Credit service** — `GET /credits/transactions/all?requestId=<uuid>`

- Admin and super admin only (bearer token).
- Params are camelCase (`userId`, `requestId`, `cursor`). Unknown keys are silently ignored, so use the names exactly. A dropped or misspelt `requestId` returns everyone's transactions with no error.
- Response: `{ transactions: [...], nextCursor: string | null }`. Envelope is camelCase; **rows are snake_case**: `transaction_id`, `transaction_type`, `originating_user_id`, `destination_user_id`, `amount`, `created_at`, `request_id`.
- Types: `allocation`, `reservation`, `transfer`, `release`. Row layout by type: reservation and release have `originating_user_id` only (the requester); transfer has originator (requester) and destination (courier); allocation has destination only and no `request_id` (allocations never appear on this page).
- 20 per page, newest first. Stop paging when `nextCursor` is `null`. Never construct a cursor. An unknown `requestId` returns `200` with an empty array.
- Errors use `{ error: { code, message } }`: `400 INVALID_CURSOR`, `400 INVALID_REQUEST_BODY`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `503 IDENTITY_PROVIDER_UNAVAILABLE`. Note this differs from user-service's `{ message, code }`; check how `http.js` and `errorMessages.js` read error codes.

**Order service**

- `GET /orders/admin/users/:userId?page=N` — admin and super admin only. `page` defaults to 1. Unknown query params return `400`. Response: `{ totalCount, currentPage, pageSize: 10, totalPages, orders: [{ order, role }] }`. `order` has every persisted field (`id`, `requesterId`, `supplierId`, `description`, `deliveryLocationId`, `credits`, `completeBy`, `additionalDetails`, `courierId`, `status`, `createdAt`, `updatedAt`, `acceptedAt`, `deliveredAt`, `creditReleasedAt`, `version`). `role` is `requester` or `courier` relative to `:userId`. All statuses (`pending`, `open`, `accepted`, `picked_up`, `delivered`, `completed`, `cancelled`, `expired`, `failed`), newest first. A page past the end returns an empty array with the real count. The endpoint calls user-service itself to check the user exists.
- Errors are `{ message }` only, with no `code`, so tell them apart by HTTP status: `400` bad id/page/param, `401`, `403`, `404` user not found, `503` user-service unavailable.
- `GET /orders/:id` — returns the bare order object. Admins can fetch any order. A missing order and a non-viewable one both return `404 { message: 'Order not found.' }`.

**User service** — `GET /users/:id` (admin) → `{ id, username, email, status, role, activeView, createdAt, updatedAt }`, any status; `404 USER_NOT_FOUND`. `GET /users/public?ids=a,b,c` (1–50 ids) → `{ users: [{ id, username }] }`; unknown ids are omitted.

**Supplier service** — `GET /api/v1/suppliers/:id` (numeric id, any authenticated role); no batch form. Location names come from the full list at `GET /api/v1/suppliers/reference/location`, looked up client-side.

Existing frontend helpers to reuse (read them first; do not rewrite): `useUserName`, `useSupplier`, `useLocationNames` in `src/api/lookups.js`; `resolveUserNames` in `src/api/credits.js`; `Pager` and `useApiNotice` in `src/components/ApiNotice.jsx`; `EmptyState`, `Forbidden`, and the toast and banner components from Stage 16.

### Design decisions (already made, do not change)

| Rule                         | Value                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access                       | Admin and super admin see the same pages. Both can view any user. Routes use `RequireAuth` + `RequireRole minimum="admin"`.                                                                                                                                                                                                |
| Routes                       | User page `/admin/user-transactions/:userId`. Order page `/admin/user-transactions/:userId/:requestId`. Both load fully on a direct URL or reload.                                                                                                                                                                         |
| Entry point                  | In `/admin/users`, clicking a user's row opens that user's page. The existing three-dot row menu keeps working and must not trigger the row click.                                                                                                                                                                         |
| Back links                   | "← Back to users" on the user page. "← Back to user" on the order page.                                                                                                                                                                                                                                                    |
| User page layout             | Profile at the top, then a paginated list of order summaries.                                                                                                                                                                                                                                                              |
| Profile fields               | `id`, `username`, `email`, `status`, `role`, `createdAt`, `updatedAt`.                                                                                                                                                                                                                                                     |
| Profile actions              | Suspend/unsuspend and promote/demote buttons, with the same behaviour as `/admin/users`: same allowed-actions table, same confirmation dialog, same toasts, refetch on a stale-state error. The profile updates from the action's response.                                                                                |
| Unknown user                 | If the profile call returns `404`, the whole page shows "user not found" (not just the profile section).                                                                                                                                                                                                                   |
| Order summaries              | Truncated: no description and no transactions. Shows the order's credits. Shows the viewed user's role (`requester` / `courier`) as a label beside the username. All statuses are shown.                                                                                                                                   |
| Summary fields               | user summary - email (masked), status, role, credits; order summary - request ID, requestor, supplier, credits for the transaction, courier, status                                                                                                                                                                        |
| Pagination                   | Page-number, 10 per page, via `Pager`, using `totalPages`. The current page number is kept in the URL, so a reload keeps the page. `page` — the query param name.                                                                                                                                                          |
| Filtering                    | Role (requester/courier) and status. The backend has no such params, so filtering is **client-side, within the current page of 10 only**. A page can therefore show fewer than 10 orders, or none, while other pages still match. The UI must say the filter applies to the current page. No search and no sorting.        |
| Click an order               | Navigates to the order page.                                                                                                                                                                                                                                                                                               |
| Order page                   | Loads the order with `GET /orders/:id`. Shows every field: order id (the request id), requester, supplier, delivery location, credits, completeBy, description, additionalDetails, courier, status, and all datetimes (`createdAt`, `updatedAt`, `acceptedAt`, `deliveredAt`, `creditReleasedAt`). `version` is not shown. |
| Order not involving the user | If the order's requester and courier are both not `:userId`, show "Order not found" (also shown when `GET /orders/:id` returns `404`).                                                                                                                                                                                     |
| Transactions                 | Fetched once per order page load via `?requestId=<order id>`. Fields shown: transaction id, type, originating user, destination user, amount, created at. Paged with `nextCursor`; stop when it is `null`. No allocations.                                                                                                 |
| Credits colour and sign      | Red/green with a `+` or `−`. For reservation and release, don't put it as `+` or `-` or red or green - just put the amount held. only for transfer then have colour and sign.                                                                                                                                              |
| Names                        | Usernames for requester, courier and transaction parties; supplier name; delivery location name, via the existing helpers.                                                                                                                                                                                                 |
| Name fallbacks               | Existing ones: shortened UUID for a missing username, "Location <id>" for a missing location. Missing supplier name: "Supplier <id>" (same pattern as location).                                                                                                                                                           |
| Dates                        | Whatever the frontend already uses.                                                                                                                                                                                                                                                                                        |
| Empty states                 | An order with no transactions shows "no transactions". A user with no orders shows an empty-state message.                                                                                                                                                                                                                 |
| Section failures             | Only the failed section shows an error and a retry button; the rest of the page still renders.                                                                                                                                                                                                                             |

### Sub-stages

**18a — API modules.** Add the admin calls to the existing API modules, following their style: user orders (`/orders/admin/users/:userId`) in `src/api/orders.js`; transactions by `requestId` in `src/api/credits.js`; the profile call (`GET /users/:id`) in `src/api/users.js` if it isn't there. Confirm how each service's error shape reaches the pages, and report any mismatch before building pages on top.

**18b — User page.** Profile, action buttons, order summaries, pagination and filters, per the table above.

**18c — Order page.** The order, and its transactions, per the table above.

**18d — Entry point and routes.** Add both routes behind the guards. Make rows in `/admin/users` open the user page.

### Verification

- Click a row in `/admin/users` → the user page opens; the three-dot menu still opens without navigating.
- A direct URL or reload of either page works, and the page number survives a reload.
- Non-admin → the 403 view (URL unchanged). Logged out → `/login`, then back.
- A nonexistent user id → whole page "user not found". A malformed user id → the same view.
- A user with no orders → empty state. A page past the last page → empty state, with "Page X of Y" still correct.
- Role and status filters change which of the current page's orders show; the UI says it applies to this page only.
- The order page shows all listed fields and the transactions; an order with no transactions shows the empty message.
- An order that doesn't involve the user in the URL → "Order not found". A nonexistent order id → "Order not found".
- Credits show with the colour and sign you decided.
- Stop credit-service → only the transactions section errors, with a retry button that works. Stop order-service → only the orders section errors. Stop supplier-service or user-service → names fall back, the page doesn't break.
- Suspend, unsuspend, promote and demote from the user page behave as on `/admin/users`, and the profile updates without a reload.

### Tests (Vitest)

Write the tests in this stage, with the existing Vitest + `@testing-library/react`, `jest-dom` and `user-event` setup. Mocking the API modules or `fetch` is allowed. Every Verification bullet that doesn't need a running backend is a required test case. Do not modify application code to make a test pass. Report any failure that isn't a test problem.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry for this stage.

# Stage 25: OTP "Attempts Exceeded" Dead-End Fix (backend + frontend)

> **Scope**: `user-service` and `frontend/`. Never touch `foc-mockup/`.
> Read the current code before writing anything. Where it disagrees with this file, follow the code and tell me.
> Do not implement test cases before the implementation is done.

## The bug

A user enters 5 wrong codes and then submits a 6th. The 5th wrong guess gives no warning (plain `400 INVALID_OTP`), so the user types again, even the correct code, and the 6th submit returns `429 OTP_ATTEMPTS_EXCEEDED` ("request a new code"). Four things go wrong:

0. The user is not told the code is dead when it dies (on the 5th failed attempt), only on the next submit, which is rejected even if the code is correct.

1. The OTP boxes keep the old digits and stay enabled, even though that code can never work again. The frontend only clears them on `INVALID_OTP`.
2. The resend cooldown is counted from when the current OTP was **created** (60 s), not from the wrong guesses. If the user burns 5 guesses quickly, resend is still inside the cooldown. It returns `429 OTP_RESEND_COOLDOWN` with `Retry-After` of about 30, and nothing is sent.
3. The page does not know about the cooldown until the user clicks resend and fails, so the "request a new code" message points at a button that cannot work yet.

## Design decisions (already made, do not change)

| Topic                | Decision                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cooldown rule        | Unchanged. The resend cooldown still starts when the latest OTP was created. Resend limit, 5 guesses per OTP and `requestOtp` are not touched.                                                                                                                                                                                                                                                           |
| How the UI learns it | The backend tells it. `OTP_ATTEMPTS_EXCEEDED` responses carry a `Retry-After` header: the seconds until a resend is allowed, computed on the DB clock. `0` means resend is allowed now. The frontend does not track its own send time.                                                                                                                                                                   |
| Frontend on exceeded | Clear the boxes, disable them, show the error, and start the resend countdown straight away (or enable resend at once if the value is `0`).                                                                                                                                                                                                                                                              |
| After a good resend  | Boxes are re-enabled, cleared and the first one is focused. The error is removed.                                                                                                                                                                                                                                                                                                                        |
| Scope of the UI fix  | Every page with an OTP step: register, forgot password, change email, change password. Use the shared components so the behaviour is the same everywhere.                                                                                                                                                                                                                                                |
| Expired code (UI)    | On `OTP_EXPIRED`, clear the boxes and refocus the first one, the same as `INVALID_OTP`. Resend is available at once (the 60 s cooldown always ends before the 10-minute lifetime), so no countdown is started.                                                                                                                                                                                           |
| Expired code (count) | A guess against an expired code is treated exactly like a wrong guess: it adds 1 to that OTP's `attempts_count`. Failures 1 to 4 return `OTP_EXPIRED` (wrong codes return `INVALID_OTP`).                                                                                                                                                                                                                |
| Tell on the 5th      | The **5th failed attempt** (wrong or expired) is the one that uses the code up, so it returns `429 OTP_ATTEMPTS_EXCEEDED` itself, with the `Retry-After` header, instead of `INVALID_OTP` / `OTP_EXPIRED`. Any later submit on that code also returns `OTP_ATTEMPTS_EXCEEDED`. The limit stays at 5 guesses per code. A **correct** code on the 5th attempt still succeeds, because only failures count. |
| Check order          | The attempts check runs **before** the expiry check. An expired code with the count at the max returns `OTP_ATTEMPTS_EXCEEDED` with `Retry-After: 0` (the cooldown is long over), so the UI disables the boxes and enables resend at once.                                                                                                                                                               |

## Stage 25a: Backend — `Retry-After` on `OTP_ATTEMPTS_EXCEEDED`

Files: `src/services/otp.service.ts` (and `src/db/queries/otp.queries.ts` if the latest-OTP query needs another column).

- In `checkOtp`, step 3 (`attempts_count >= max_attempts`) already has the latest OTP row and `db_now` from `findLatestOtp`. Compute
  `retryAfterSeconds = max(0, ceil(seconds between db_now and created_at + config.otp.resendCooldownSeconds))`.
  Do the arithmetic in SQL with `clock_timestamp()`, or from the `db_now` already returned. **Do not use `Date.now()`** (convention 5).
- Throw `AppError(429, 'Too many incorrect attempts. Please request a new OTP.', 'OTP_ATTEMPTS_EXCEEDED', retryAfterSeconds)`, using the same optional `retryAfterSeconds` field that `OTP_RESEND_COOLDOWN` and `ACCOUNT_LOCKED` use.
- Make sure the global error handler emits `Retry-After` for a value of `0`. If it currently checks truthiness, change it to check `!== undefined`. Check that this doesn't change the other codes: `OTP_RESEND_COOLDOWN` is always above 0 and `ACCOUNT_LOCKED` is always above 0.
- This covers every purpose automatically because they all go through `checkOtp`. Confirm that each verify path (`verify-otp` registration/forgot-password, change email, change password, reset-password) lets the error through unchanged. Report any that catches and rewraps it.
- Put the `retryAfterSeconds` calculation in one small helper, because 25c also needs it for the 5th failed attempt. Both paths must give the same value.
- The body stays `{ message, code }`. The wrong-guess path still returns `{ ok: false }` and throws after the commit (see 25c for the 5th failed attempt).

## Stage 25c: Backend — count guesses against an expired code

Files: `src/services/otp.service.ts`, `src/db/queries/otp.queries.ts`, and every caller of `checkOtp`.

- In `checkOtp`, step 2 (`expires_at` has passed) must call `incrementAttempts` and then **return** `{ ok: false, reason: 'expired' }` instead of throwing. Throwing inside `withTransaction` would roll the increment back (convention 4). The wrong-guess path returns `{ ok: false, reason: 'invalid' }`. The caller throws after the transaction commits: `INVALID_OTP` for `'invalid'`, `OTP_EXPIRED` (same 400 and message as now) for `'expired'`.
- Do not copy the branching into each caller. Add one small shared helper (for example `throwOtpFailure(result)`) in `otp.service.ts` and use it at every call site. **Before changing anything, list every call site** (registration verify, forgot-password verify and reset, change email, change password, any admin-action use) and tell me if one of them handles the failure differently.
- New order of checks: missing/consumed row → `INVALID_OTP`; attempts used up → `OTP_ATTEMPTS_EXCEEDED`; expired → count it and return `OTP_EXPIRED`; otherwise compare. The attempts check moves above the expiry check, so an expired code whose count is at the max returns `OTP_ATTEMPTS_EXCEEDED` (with the 25a `Retry-After`, which is `0` here). Report any caller or test that relied on the old order.
- **Tell on the 5th failed attempt.** `incrementAttempts` already returns the new count. If the new count has reached `max_attempts`, `checkOtp` must still **return** (not throw), as `{ ok: false, reason, exhausted: true, retryAfterSeconds }`, where `retryAfterSeconds` comes from the 25a helper using the DB clock inside the same transaction. The increment commits first. The shared `throwOtpFailure` helper then throws `AppError(429, ..., 'OTP_ATTEMPTS_EXCEEDED', retryAfterSeconds)` when `exhausted` is true, and `INVALID_OTP` / `OTP_EXPIRED` otherwise. A correct code never reaches the increment, so it is not affected.
- Existing tests and fixtures that expect `400 INVALID_OTP` on the 5th wrong guess (for example the "5 wrong OTPs" cases from Stages 5 to 12) will now see `429 OTP_ATTEMPTS_EXCEEDED` on the 5th. Update those expectations, list them in your summary, and do not change application code to make them pass.
- `attempts_count` is a `SMALLINT`, and repeated guesses against an expired code would otherwise keep incrementing it. Make `incrementAttempts` stop at `max_attempts` (for example `LEAST(attempts_count + 1, max_attempts)`) so it cannot overflow or go past the max. This is safe for the wrong-guess path too, which never reaches the increment once the count is at the max.
- No account-level lockout counts OTP guesses (Stage 18 locks on passwords only), so this changes only the per-OTP `attempts_count`. Do not add anything to the Stage 18 counters.

## Stage 25b: Frontend

Read `frontend/` first (`OtpInput.jsx`, `ResendButton.jsx`, `errorMessages.js`, `src/api/http.js`, and the pages with an OTP step) and **report how `Retry-After` currently reaches `ResendButton`** before changing anything. Then:

- `src/api/http.js`: make sure the thrown error exposes `retryAfterSeconds` (parsed from the header, `undefined` if missing) for every `429`, not only the resend endpoint. If it already does, change nothing.
- `OtpInput.jsx`: the parent must be able to (a) clear and refocus (exists), and (b) set the input to a disabled "dead" state that keeps the boxes empty. Reuse the existing `disabled` prop if it fits. Don't add a new prop for something the current props can do.
- `ResendButton.jsx`: it must accept a way to start (or restart) the countdown from a value supplied by the parent, e.g. an `initialCooldown` / `startCooldown(seconds)` handle. `0` means enabled immediately. Keep the existing behaviour for `OTP_RESEND_COOLDOWN` and `OTP_RESEND_LIMIT`.
- On `OTP_ATTEMPTS_EXCEEDED` (in each OTP page, including when it arrives as the response to the 5th failed attempt): clear the boxes, disable them, show the mapped error, and start the resend countdown from `err.retryAfterSeconds ?? 0`.
- On a successful resend (`OTP_SENT`): clear the error, re-enable the boxes, clear them and focus the first.
- On `OTP_EXPIRED` (in each OTP page): clear the boxes and refocus the first one, as for `INVALID_OTP`. Keep them enabled. Show the mapped error. Resend is available straight away, so do not start a countdown. If resend still returns `OTP_RESEND_COOLDOWN`, handle it as described below.
- On `OTP_RESEND_LIMIT`: boxes stay disabled, show the limit text, no countdown (unchanged).
- If resend itself returns `OTP_RESEND_COOLDOWN` (a race between the two clocks): keep the boxes disabled and restart the countdown from the new `Retry-After`.
- `errorMessages.js`: change the text for `OTP_ATTEMPTS_EXCEEDED` so it no longer promises something that can't happen yet. It should say the code is no longer valid and that the user can request a new one when the button is available. Show me the old and new text in your summary.
- Registration arrived-from-login flow and the forgot-password step 3 fallback ("back to step 2 with the error"): the step 2 state must also start with the boxes disabled and the countdown running when it is entered with `OTP_ATTEMPTS_EXCEEDED`.

## Verification

- Register, enter wrong codes: the first 4 return `400 INVALID_OTP` with the boxes cleared. The **5th** returns `429 OTP_ATTEMPTS_EXCEEDED` **with a `Retry-After` header** of roughly the time left (within the first 60 s). The boxes clear and disable, and the resend button shows the same countdown. `attempts_count` is 5 in the DB.
- A correct code on the 5th attempt (after 4 wrong ones) succeeds.
- After the 5th failure, submitting the correct code (e.g. through the API) still returns `429 OTP_ATTEMPTS_EXCEEDED`.
- Same flow, but backdate the OTP `created_at` by more than 60 s first: the response has `Retry-After: 0`, boxes are disabled, and resend is enabled immediately.
- When the countdown ends, clicking resend sends a new code, the boxes re-enable and clear, and the new code works. The old code returns `INVALID_OTP`.
- After 5 resends the limit text shows, boxes stay disabled, no countdown (unchanged).
- Expired code: backdate `expires_at`, submit any 6 digits. The response is `400 OTP_EXPIRED`, the OTP's `attempts_count` goes up by 1 and is persisted (check the DB), and the boxes clear with focus on the first. Resend works immediately.
- Submit against an expired code: submits 1 to 4 return `OTP_EXPIRED` with the boxes cleared. The 5th returns `429 OTP_ATTEMPTS_EXCEEDED` with `Retry-After: 0`, the boxes disable, and resend is enabled at once. Later submits keep returning `OTP_ATTEMPTS_EXCEEDED`, `attempts_count` stays at `max_attempts`, and there is no `SMALLINT` error.
- Mixed: 3 wrong guesses, expire the code, the next guess returns `OTP_EXPIRED` (4th failure), and the one after that returns `OTP_ATTEMPTS_EXCEEDED` (5th failure).
- A new code issued after expiry starts at `attempts_count = 0` and accepts the correct code.
- Forgot password step 3 with an expired code: back at step 2 with the expiry error and cleared boxes.
- Repeat for forgot password, change email and change password.
- Reload the page after being locked out, then enter any code. The same header is returned and the UI shows the correct remaining time.
- Existing responses are unchanged: `OTP_RESEND_COOLDOWN`, `OTP_RESEND_LIMIT` and `ACCOUNT_LOCKED` still carry their `Retry-After`. `INVALID_OTP` still clears and refocuses the boxes.

## Tests

Backend (Vitest, real Postgres, following the Stage 7 ground rules) and frontend (Vitest + Testing Library). Do not modify application code to make a test pass. Report any failure that isn't a test problem.

**1. Edit the existing tests first.** Search `tests/` and the frontend tests for every case that depends on the old behaviour, and update its expectations. At least look for:

- Any test that submits wrong OTPs in a loop, or checks `attempts_count`, `max_attempts`, `INVALID_OTP` or `OTP_ATTEMPTS_EXCEEDED`. This covers registration `verify-otp`, forgot-password `verify-otp` and `reset-password`, change email and change password. The old pattern "5 wrong OTPs, then the correct OTP → `429 OTP_ATTEMPTS_EXCEEDED`" becomes "4 wrong OTPs → `400 INVALID_OTP` each; the 5th wrong OTP → `429 OTP_ATTEMPTS_EXCEEDED` with a `Retry-After` header; the correct OTP afterwards → `429 OTP_ATTEMPTS_EXCEEDED`; the account, email or password is unchanged".
- Any test that submits an expired OTP and expects `OTP_EXPIRED`. It should still pass for a first or early failure. Add the new checks that `attempts_count` goes up and is persisted, and, if the test loops, that the 5th failure returns `OTP_ATTEMPTS_EXCEEDED`.
- Any test that depends on the check order (expired before attempts used up). It now runs the other way round.
- Frontend tests for `OtpInput`, `ResendButton`, the register, forgot-password, change-email and change-password pages, and `errorMessages.js`: the `OTP_ATTEMPTS_EXCEEDED` handling, the clearing of boxes on `INVALID_OTP`, and the changed message text. Add the `OTP_EXPIRED` clearing.

Keep each assertion as strict as it was. Change the expected values, not the strength of the checks. List every test file and case you changed in your summary.

**2. Then add cases** for every Verification bullet above that doesn't need a real browser. Use fake timers for the countdown.

## Notes for the summary

- List any place you deviated from this file and why.
- Say which `checkOtp` call sites you changed for 25c and whether any needed more than the shared helper.
- List the existing tests and fixtures you updated because the 5th wrong guess now returns `429 OTP_ATTEMPTS_EXCEEDED`.

## AI logging

Same as earlier stages: header comment on every file created **or modified**, and a usage-log entry per sub-stage (25a, 25b, 25c) in the existing format.

# Stage 26: Admin Audit Log (NFR3.2.2)

> **Scope**: `user-service`, `frontend`, and one line each in `frontend/vite.config.js` and `frontend/nginx/default.conf`.
>
> - 26a: audit table, append-only trigger, config of reason presets
> - 26b: reason required on every high-risk admin action; audit row written in the same transaction as the change
> - 26c: unmask becomes a `POST` with a reason; the `[UNMASK EMAIL]` console lines are removed
> - 26d: `GET /admin/audit-logs`
> - 26e: frontend (reason dialogs, audit log page, nav link, proxy entry)
>
> Backlog refs: NFR3.2.2. NFR3.2.1 (OTP before high-risk actions) is dropped.
>
> This supersedes the console logging of unmask attempts in Stage 20 (including its denied-attempt lines and the "log failure fails the unmask" rule, which now applies to the audit insert).
>
> **Before starting:** read the current code, not just this file. If anything below disagrees with the code, stop and ask me. Implement one sub-stage at a time and wait for my confirmation before the next.
>
> **Verify first (report only, do not change anything):**
>
> 1. What `POST /users/:id/unlock` currently does when the target is not login-locked.
> 2. Whether any production proxy or reverse-proxy config (nginx, Caddy, compose) has its own path rules. List the prefixes it forwards.
> 3. Every existing test that asserts on the `[UNMASK EMAIL]` console lines or on `GET /users/:id/full-email`.

### Design decisions (already made, do not change)

**What is audited**

| Rule                  | Value                                                                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audited actions       | Suspend, unsuspend, promote, demote, unmask email, unlock                                                                                                                                 |
| Actions not audited   | Viewing the log, `GET /users`, `GET /users/:id`, every other read                                                                                                                         |
| Credit adjustment     | Not in this stage. See "Notes for later".                                                                                                                                                 |
| When a row is written | Only when the action actually succeeds. A suspend that changes status writes a row; an unmask that returns the email writes a row.                                                        |
| No-op requests        | No row. Same as today: `200`, unchanged user.                                                                                                                                             |
| Rejected requests     | No row and no console line: `authenticate` / `authorize` failures, business-rule rejections (`SUPER_ADMIN_IMMUTABLE`, `FORBIDDEN`, `422`s, `404`, `400`).                                 |
| Same transaction      | The audit insert runs with the same `client` inside the same `withTransaction` as the change. If the insert fails, the change rolls back and the request fails with `500 INTERNAL_ERROR`. |
| Unmask                | There is no state change. The audit insert is done first; the email is returned only after the insert succeeds. If the insert throws, `500 INTERNAL_ERROR` and the email is not returned. |
| Timestamp             | Database clock (`clock_timestamp()` written in SQL), never `Date.now()`                                                                                                                   |
| Retention             | Rows are kept indefinitely                                                                                                                                                                |

**Table**

| Rule              | Value                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name              | `admin_audit_log`                                                                                                                                                   |
| Enum              | `audit_action_enum`: `USER_PROMOTE`, `USER_DEMOTE`, `USER_SUSPEND`, `USER_UNSUSPEND`, `EMAIL_UNMASK`, `USER_UNLOCK` (same safe-creation pattern as the other enums) |
| `id`              | UUID, primary key, `gen_random_uuid()`                                                                                                                              |
| `created_at`      | TIMESTAMPTZ NOT NULL, `DEFAULT clock_timestamp()`                                                                                                                   |
| `actor_id`        | UUID NOT NULL. **No foreign key.**                                                                                                                                  |
| `action`          | `audit_action_enum` NOT NULL                                                                                                                                        |
| `target_id`       | UUID NOT NULL. **No foreign key.**                                                                                                                                  |
| `before`          | JSONB, nullable                                                                                                                                                     |
| `after`           | JSONB, nullable                                                                                                                                                     |
| `reason`          | TEXT NOT NULL                                                                                                                                                       |
| `user_agent`      | TEXT, nullable (`-` is not stored; a missing header is NULL)                                                                                                        |
| `request_id`      | Not included                                                                                                                                                        |
| No FK, no cascade | Deleting a user (e.g. `deleteStalePendingUsers`) never touches audit rows                                                                                           |
| Indexes           | `(created_at DESC)`, `(actor_id)`, `(target_id)`, `(action)`                                                                                                        |

**Append-only (enforced in the database)**

- A `BEFORE UPDATE OR DELETE` row trigger on `admin_audit_log` that raises an exception.
- A `BEFORE TRUNCATE` statement trigger that raises an exception.
- Trigger only. The app keeps connecting as `postgres`; no new DB role. Accepted: a superuser or the table owner can disable the triggers.
- The application has no update or delete query for this table.

**`before` / `after`** (only changed fields, JSONB)

| Action           | `before`                  | `after`                   |
| ---------------- | ------------------------- | ------------------------- |
| `USER_SUSPEND`   | `{"status": "active"}`    | `{"status": "suspended"}` |
| `USER_UNSUSPEND` | `{"status": "suspended"}` | `{"status": "active"}`    |
| `USER_PROMOTE`   | `{"role": "user"}`        | `{"role": "admin"}`       |
| `USER_DEMOTE`    | `{"role": "admin"}`       | `{"role": "user"}`        |
| `USER_UNLOCK`    | `{"isLocked": true}`      | `{"isLocked": false}`     |
| `EMAIL_UNMASK`   | `NULL`                    | `NULL`                    |

The email (masked or full) is never stored anywhere in the audit row.

**Unlock behaviour (option A)**

- Unlock acts only on a user who is currently login-locked, using the same definition of `isLocked` as `GET /users` (Stage 18).
- If the target is not login-locked, it is a no-op: `200`, unchanged user, no audit row, and nothing is cleared (including OTP send blocks).
- When it does unlock, it clears the login lock, resets login escalation, and clears OTP send blocks and escalation for all three purposes, as in Stage 18. Only the login lock appears in `before`/`after`.
- Permission rules unchanged from Stage 18.

**Reasons**

> **Amendment (2026-11-06):** unlock and email-unmask no longer require a reason. Only
> `USER_SUSPEND` / `USER_UNSUSPEND` (status endpoint) and `USER_PROMOTE` / `USER_DEMOTE` (role
> endpoint) do. `POST /users/:id/unlock` and `POST /users/:id/full-email` take no body; the
> stored audit `reason` for these two actions is a fixed `"N/A"`.

| Rule                 | Value                                                                                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required             | Every audited endpoint requires a reason in the request body                                                                                                                                                                                                    |
| Request body         | `{ "reason": "<CODE>" }`, or `{ "reason": "OTHER", "otherReason": "<free text>" }`                                                                                                                                                                              |
| `otherReason`        | Required when `reason` is `OTHER`, rejected (unexpected field) otherwise. Trimmed. Length 10–500 after trimming.                                                                                                                                                |
| Allowed codes        | Per action, from the table below. A code that is valid for a different action is rejected.                                                                                                                                                                      |
| Stored value         | The code alone (e.g. `FRAUD_OR_SCAM`), or `OTHER: <trimmed free text>`                                                                                                                                                                                          |
| Validation timing    | At the controller (Zod `.strict()`), before any DB call, so an invalid or missing reason is `400 VALIDATION_ERROR` even if the request would have been a no-op                                                                                                  |
| Action chosen from   | Status endpoint: target status `suspended` → `USER_SUSPEND`, `active` → `USER_UNSUSPEND`. Role endpoint: `admin` → `USER_PROMOTE`, `user` → `USER_DEMOTE`. The reason codes validated are those for that action.                                                |
| Zod messages         | Existing style: required → `"Reason is required"`, type → `"Reason must be a string"`, invalid code → `"Invalid reason"`, `otherReason` missing → `"Details are required when the reason is Other"`, length → `"Details must be between 10 and 500 characters"` |
| Where the lists live | One constant in the backend (authoritative) and one in the frontend. They must match; note this in the usage log.                                                                                                                                               |

Preset codes:

| Action           | Codes                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `USER_SUSPEND`   | `FRAUD_OR_SCAM` (fake errands, payment fraud, scamming other users), `HARASSMENT` (abusive messages or behaviour toward other users), `REPEATED_NO_SHOW` (accepting errands and not completing them, repeatedly), `POLICY_VIOLATION` (prohibited items or services, terms of use breach), `SUSPECTED_COMPROMISE` (account appears hijacked; protective suspension), `USER_REQUEST` (user asked to deactivate temporarily), `OTHER` |
| `USER_UNSUSPEND` | `APPEAL_ACCEPTED` (user appealed and the review found in their favour), `SUSPENSION_PERIOD_ENDED` (a time-boxed suspension is complete), `ISSUE_RESOLVED` (e.g. a compromised account is secured, or a dispute is settled), `SUSPENDED_IN_ERROR` (wrong user or mistaken report), `USER_REQUEST` (user asked to reactivate after a self-requested suspension), `OTHER`                                                             |
| `USER_PROMOTE`   | `APPOINTED_MODERATOR` (approved addition to the admin or moderation team), `TEAM_MEMBER_ONBOARDING` (project or ops team member needs admin access), `TEMPORARY_COVERAGE` (covering for another admin; pair with a planned demote), `OTHER`                                                                                                                                                                                        |
| `USER_DEMOTE`    | `ROLE_ENDED` (left the team or term finished), `TEMPORARY_ACCESS_EXPIRED` (the coverage period is over), `MISCONDUCT` (misuse of admin privileges), `SUSPECTED_COMPROMISE` (admin account may be compromised), `LEAST_PRIVILEGE_REVIEW` (access review found admin isn't needed), `OTHER`                                                                                                                                          |
| `EMAIL_UNMASK`   | None — unmask no longer collects a reason (amendment above)                                                                                                                                                                                                                                                                                                                                                                        |
| `USER_UNLOCK`    | None — unlock no longer collects a reason (amendment above)                                                                                                                                                                                                                                                                                                                                                                        |

**Viewing the log**

| Rule                | Value                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Endpoint            | `GET /admin/audit-logs`, behind `authenticate` + `authorize('admin')`                                                                                                                                                                                                                                                                                   |
| Who sees what       | Admin and super admin see the same rows. No masking.                                                                                                                                                                                                                                                                                                    |
| Pagination          | Same as `GET /users`: offset, `page` 1-based, fixed page size 50 (a constant), no `pageSize` param, page past the end → `200` with empty `logs` and a correct `total`                                                                                                                                                                                   |
| Response            | `{ logs, page, pageSize, total, totalPages }`                                                                                                                                                                                                                                                                                                           |
| Log entry fields    | `id`, `createdAt`, `actorId`, `actorUsername`, `action`, `targetId`, `targetUsername`, `before`, `after`, `reason`, `userAgent`                                                                                                                                                                                                                         |
| Usernames           | Joined from `users` on `actor_id` / `target_id` (LEFT JOIN). If the user no longer exists, the username is `null`; the frontend shows "user deleted".                                                                                                                                                                                                   |
| Filters             | `actor` (username substring), `target` (username substring), `action` (repeatable param: `?action=USER_SUSPEND&action=USER_UNLOCK`), `reasonCode`, `from`, `to`                                                                                                                                                                                         |
| `actor` / `target`  | Lowercased, substring match on the joined username, escaped like Stage 15b. A deleted user has no username, so cannot match.                                                                                                                                                                                                                            |
| `reasonCode`        | Matches the code part of the stored reason: `reason = $code`, or for `OTHER`, `reason LIKE 'OTHER: %'` (escaped). One value.                                                                                                                                                                                                                            |
| `from` / `to`       | ISO 8601 timestamps, inclusive, compared to `created_at`. `from` after `to` → `400 VALIDATION_ERROR`.                                                                                                                                                                                                                                                   |
| Sort                | `sortDir` only (`asc` / `desc`), always on `created_at`, default `desc`, with `id` as tie-breaker. No `sortBy` param.                                                                                                                                                                                                                                   |
| Validation          | Zod `.strict()` on `req.query`, existing message style, unknown param → `"Request contains unexpected fields"`. Invalid `action` value → `"Action must be one of ..."`. Invalid `reasonCode` → `"Invalid reason code"`. Invalid dates → `"From must be a valid date"` / `"To must be a valid date"`. A repeated param on a single-value filter → `400`. |
| SQL safety          | All values are bound parameters. `sortDir` goes through a fixed whitelist.                                                                                                                                                                                                                                                                              |
| Auditing the viewer | None                                                                                                                                                                                                                                                                                                                                                    |
| Frontend path       | The API is `/admin/audit-logs`; the page is `/admin/logs`. They must stay different.                                                                                                                                                                                                                                                                    |

---

## Changes to already-implemented code

| #   | File                                                                                                                | Change                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/db/init.sql`                                                                                                   | `audit_action_enum`, `admin_audit_log` table, indexes, the three triggers. Existing dev volumes need `docker compose down -v`.                                                                                                         |
| 2   | `src/db/queries/auditLog.queries.ts` (new)                                                                          | `insertAuditLog`, `listAuditLogsPage`                                                                                                                                                                                                  |
| 3   | `src/services/users.service.ts`                                                                                     | `changeUserStatus`, `changeUserRole`, unlock and `getFullEmail` take `reason` and `userAgent` and write the audit row (see 26b, 26c)                                                                                                   |
| 4   | `src/controllers/users.controller.ts`                                                                               | Validate `reason` / `otherReason` on the status, role, unlock and full-email handlers                                                                                                                                                  |
| 5   | `src/routes/users.routes.ts`                                                                                        | `GET /:id/full-email` → `POST /:id/full-email`                                                                                                                                                                                         |
| 6   | `src/services/users.service.ts` (`getFullEmail`)                                                                    | Remove all `[UNMASK EMAIL]` `console.log` / `console.error` lines and the code that existed only to produce them (actor lookup for the log line, DB-clock read for the log line)                                                       |
| 7   | `src/routes/auditLog.routes.ts`, `src/controllers/auditLog.controller.ts`, `src/services/auditLog.service.ts` (new) | `GET /admin/audit-logs`                                                                                                                                                                                                                |
| 8   | `src/app.ts`                                                                                                        | Mount the audit log router at `/admin/audit-logs`                                                                                                                                                                                      |
| 9   | Existing tests                                                                                                      | Update tests for the new request bodies and the `POST` unmask route, and delete tests that assert on `[UNMASK EMAIL]` console lines. Do not change what they otherwise assert. If a test fails for another reason, stop and report it. |
| 10  | `frontend/vite.config.js`, `frontend/nginx/default.conf`                                                            | Add `"/admin/audit-logs"` to both the dev proxy and the prod nginx config, pointing at the user service (same target as `/auth` and `/users` in each). Add nothing for `/admin` as a whole. Done in 26e.                               |
| 11  | `frontend/src/api/users.js`, `frontend/src/api/auditLog.js` (new), `frontend/src/api/errorMessages.js`              | New request bodies, `POST` unmask, `listAuditLogs`; text for any new codes                                                                                                                                                             |
| 12  | `frontend/src/pages/AdminUsers.jsx`                                                                                 | Reason dialog on every audited action; unmask asks for a reason on every eye click                                                                                                                                                     |
| 13  | `frontend/src/pages/AdminLogs.jsx` (new), `App.jsx`, nav bar                                                        | `/admin/logs` page, linked from the nav bar                                                                                                                                                                                            |

---

## Stage 26a: Schema

### Update `src/db/init.sql`

- Add the enum, table, indexes and triggers from the decisions above.
- Trigger function raises an exception with a clear message (e.g. `admin_audit_log is append-only`).
- `init.sql` only runs on a fresh volume. Remind me to reset with `docker compose down -v`, and note that `globalSetup.ts` rebuilds the test database from `init.sql`.

### Create `src/db/queries/auditLog.queries.ts`

- `insertAuditLog({ actorId, action, targetId, before, after, reason, userAgent }, db)`: `db` required (transaction-only). `created_at` from `clock_timestamp()`.
- `listAuditLogsPage(...)` is added in 26d.

### Verification

- `\d admin_audit_log` shows the columns, no foreign keys, and the indexes
- `\dT+ audit_action_enum` shows the six values
- `UPDATE`, `DELETE` and `TRUNCATE` on the table each fail with the trigger's message
- Deleting a user who appears as `actor_id` or `target_id` succeeds and leaves the audit rows unchanged

---

## Stage 26b: Reasons and Audit Rows for Status, Role and Unlock

### Backend

- Add the reason validation (controller) and the preset lists (one backend constant) as specified above.
- In `changeUserStatus`, `changeUserRole` and the unlock service function, after the change succeeds and **inside the same `withTransaction`**, call `insertAuditLog` with the same `client`:
  - `actorId` from `req.user.user_id`, `userAgent` from `req.get('user-agent')` (NULL if missing)
  - `before` / `after` per the table above
  - `reason` as the stored value
- No-op paths return before the insert (no row).
- Rejections happen before the insert (no row).
- Unlock follows "Unlock behaviour (option A)" above. If your Verify-first report shows unlock currently acts on non-locked users, change it to the no-op and tell me.
- Nothing else about these functions changes: locking, lock order, token revocation and error codes stay as they are.

### Verification

- Suspend / unsuspend / promote / demote / unlock each succeed with a valid reason → one audit row with the right `action`, `actor_id`, `target_id`, `before`, `after`, `reason`, `user_agent`
- `OTHER` with `otherReason` → `reason` stored as `OTHER: <trimmed text>`; `otherReason` of 9 characters or 501 characters → `400`, and exactly 10 and 500 are accepted
- Missing `reason`, non-string `reason`, a code from a different action, `OTHER` without `otherReason`, `otherReason` with a non-`OTHER` code, and an extra field → `400 VALIDATION_ERROR` with the right message, no change, no row
- Invalid reason on a request that would have been a no-op → still `400`
- No-op (already suspended, already active, already that role, unlock on a user who is not login-locked) → `200`, unchanged user, no row, nothing cleared
- Each existing rejection (`SUPER_ADMIN_IMMUTABLE`, admin vs admin `FORBIDDEN`, pending target `422`, suspended/pending role `422`, `404`, `401`, `403`) → no row
- Unlock of a locked user → login lock cleared, OTP send blocks cleared, one row with `{"isLocked": true}` → `{"isLocked": false}`
- Force `insertAuditLog` to throw → `500 INTERNAL_ERROR`, and the status / role / lock change and any token revocation are rolled back
- The audit row is committed in the same transaction as the change (a failed change leaves no row)
- Two concurrent status changes on the same user with different statuses → no deadlock, no `500`, exactly one row per change that actually changed state
- `created_at` comes from the database clock

---

## Stage 26c: Unmask as `POST` with a Reason

> **Amendment (2026-11-06):** unmask no longer requires a reason (see "Reasons" amendment
> above). `POST /users/:id/full-email` takes no body; the stored audit `reason` is a fixed
> `"N/A"`.

### Backend

- `POST /users/:id/full-email` replaces `GET /users/:id/full-email`. No request body. The route stays behind `authenticate` + `authorize('admin')` and must not be shadowed by `/:id` routes.
- Stage 20 rules still apply: `:id` Zod `.uuid()` check, `404 USER_NOT_FOUND`, `403 FORBIDDEN` for a super admin target (including a super admin targeting themself), an admin may unmask themself, pending and suspended targets can be unmasked.
- On success: `insertAuditLog` (`EMAIL_UNMASK`, `before` and `after` NULL, reason `"N/A"`, the user agent) in a transaction, then return `200 { email }`. If the insert throws → `500 INTERNAL_ERROR`, no email.
- Remove every `[UNMASK EMAIL]` console line. Rejected unmask attempts write nothing.

### Verification

- Admin on a user, a pending user, a suspended user, another admin → `200 { email }` with the real email, and one `EMAIL_UNMASK` row each, `before` and `after` NULL, `reason` `"N/A"`
- Super admin unmasking a user and an admin → `200` and a row
- Any caller targeting the super admin → `403 FORBIDDEN`, no row; unknown UUID → `404`, no row; non-UUID → `400`, no row
- An unexpected field in the body → `400`, no row, no email
- Regular user → `403`; no token → `401`; no rows
- Admin unmasking their own ID → `200` and a row; super admin on their own ID → `403`, no row
- Force `insertAuditLog` to throw → `500 INTERNAL_ERROR`, email not returned
- `GET /users/:id/full-email` no longer exists (`404`)
- No audit row, response or console line contains the email, masked or full
- No `[UNMASK EMAIL]` console output is produced in any case

---

## Stage 26d: `GET /admin/audit-logs`

### Backend

- `listAuditLogsPage({ actor, target, actions, reasonCode, from, to, sortDir, limit, offset }, db = pool)` in `auditLog.queries.ts`: returns `{ rows, total }`, same `WHERE` for the count as for the rows, LEFT JOINs to `users` for both usernames.
- `listAuditLogs(query)` in `auditLog.service.ts`: `PAGE_SIZE = 50`, offset from `page`, returns `{ logs, page, pageSize, total, totalPages }` with the entry fields from the decisions table.
- Controller: Zod `.strict()` on `req.query` per the decisions table. `page` follows Stage 15b (`"Page must be a positive integer"`).
- Route behind `authenticate` + `authorize('admin')`, mounted at `/admin/audit-logs`.

### Verification

- No params → `200`, `{ logs, page: 1, pageSize: 50, total, totalPages }`, newest first
- More than 50 rows: `page=2` continues with no overlap or gap; a page past the end → `200`, `logs: []`, correct `total`
- `page=0`, `-1`, `abc`, `1.5` → `400`, `"Page must be a positive integer"`
- `actor` and `target` substring matches on usernames (case-insensitive input); `%` and `_` are matched literally
- `action` with one and with several values; an invalid value → `400`
- `reasonCode=FRAUD_OR_SCAM` matches that code; `reasonCode=OTHER` matches rows stored as `OTHER: ...`; an invalid code → `400`
- `from` / `to` inclusive on both ends; `from` after `to` → `400`; invalid dates → `400`
- All filters combined → only rows matching every one
- `sortDir=asc` → oldest first; `sortBy=anything` → `400` (unexpected field)
- A row whose actor or target has been deleted → still listed, username `null`
- Unknown param → `400`, `"Request contains unexpected fields"`
- Admin and super admin both `200` with the same rows; regular user → `403`; no token → `401`
- No row is written by viewing the log
- Entries contain no email (masked or full) and no password hash

---

## Stage 26e: Frontend

### Ground rules

Same as Stage 16: work in `frontend/` only (plus nothing under `foc-mockup/`), do not modify `src/realtime/orderSocket.js`, `src/data/users.js`, `src/components/DemoControls.jsx` or `AI-NOTES.md`, reuse existing components (toast, `FormBanner`, `FieldError`, confirmation dialog, `ActionMenu`), no new libraries. List every file you touched outside the files named in the changes table.

### Reason dialog (`AdminUsers.jsx`)

> **Amendment (2026-11-06):** Unlock keeps a plain confirmation dialog with no reason picker
> (same as before this stage). Only Suspend, Unsuspend, Promote and Demote use the reason
> dialog described below.

- Every audited status/role action (Suspend, Unsuspend, Promote, Demote) opens a dialog that combines the existing confirmation with a reason picker: a dropdown of that action's preset codes (display text from the descriptions in the table above) and, when `OTHER` is selected, a text area for details (10–500 characters, with a live character count and an inline error).
- Confirm is disabled until a code is chosen and, for `OTHER`, the details are valid.
- The dialog names the user and the action, as the existing confirmation does.
- The request sends `{ reason }` or `{ reason: 'OTHER', otherReason }`.
- The frontend still collects the reason when the action turns out to be a no-op; the response is `200` as before and nothing else changes in the UI.
- The preset lists are a frontend constant that must match the backend's.

### Unmask

> **Amendment (2026-11-06):** unmask no longer asks for a reason. The eye click calls
> `POST /users/:id/full-email` directly, with no confirmation/reason dialog.

- Every eye click that would unmask calls `POST /users/:id/full-email` directly (no dialog).
- Re-masking (click again, or after 60 seconds) is unchanged and sends no request.
- The rest of the Stage 20b behaviour is unchanged (own row and super admin rows have no eye, refetch re-masks every row, failure toast).

### `src/pages/AdminLogs.jsx` at `/admin/logs`

- Behind `RequireAuth` + `RequireRole minimum="admin"`. Linked from the nav bar for admins in both views (same visibility as the other admin pages). Label: "Audit log".
- Table columns: time, actor, action, target, reason, before → after, user agent.
- Actor and target show the username; `null` shows "user deleted".
- Filters: actor (username substring box, 300 ms debounce), target (same), action (multi-select), reason code (single select), from/to date-time pickers. Empty filters are omitted from the request.
- Sort: click the time header to flip direction. Default newest first.
- Pagination: prev/next and "Page X of Y" from `totalPages`; changing a filter or sort resets to page 1. Empty state when there are no rows.
- Read-only: no row actions, no edit, no delete.
- Failure → toast via `errorMessages.js`.
- Works at phone width.

### `vite.config.js` and `nginx/default.conf`

Add `"/admin/audit-logs"` to both the dev proxy (`vite.config.js`) and the prod nginx config (`frontend/nginx/default.conf`), each with the same target as `/auth` and `/users` in that file. Do not add `/admin`, and do not add anything that would catch `/admin/logs`, `/admin/users` or `/admin/suppliers*`.

### Verification

- Each action's dialog shows only its own preset codes; Confirm stays disabled until valid; `OTHER` shows the details box with a live count and enforces 10–500
- Cancelling any dialog sends no request
- Suspend, unsuspend, promote, demote, unlock and unmask each send the right body
- No-op action still collects a reason and returns normally, with the row unchanged
- Unmask asks for a reason on every click, including a second unmask of the same row
- Reloading `/admin/users`, `/admin/suppliers` and `/admin/logs` all load the React app; the audit log page's data loads through the proxy
- Admin and super admin see "Audit log" in the nav in both views; a regular user does not and gets the 403 view at `/admin/logs`
- Each filter and sort changes the request params; combinations AND together; page past the end shows the empty state
- A deleted user shows "user deleted"
- Failure (user-service stopped) → toast
- Phone-width viewport works

---

### Tests (Vitest)

Write the tests in this stage, following the Stage 7 ground rules and layout (real Postgres, query/service/controller tests mirroring `src/`, concurrency cases in `tests/concurrency/`). Stage 7's exclusions do not apply here. Every Verification bullet in 26a–26e that does not need a real browser is a required test case:

- Include the trigger tests (`UPDATE`, `DELETE`, `TRUNCATE` each rejected) and the "user deleted, rows survive" test.
- Include rollback tests that force the audit insert to fail.
- Include the concurrent status-change case.
- Frontend tests: dialog validation, request bodies, unmask asks every click, audit log page filters and sort params, "user deleted" rendering, nav visibility. Mock the network layer. If `frontend/` has no test setup yet, stop and tell me what you would add before adding it.
- List the visual and phone-width checks in your summary for manual verification.

Do not modify application code to make a test pass.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry per sub-stage. Note in the usage log that the backend and frontend preset lists must match.

### Notes for later (do not implement now)

- **Credit adjustment** is a high-risk action but there is no endpoint yet, and credit-service is Wee Jean's. When it is implemented, add an `action` value for it and decide how credit-service writes to this table (it cannot reach `user-db` today).
- Nothing in this stage logs rejected attempts. If that is needed later, it needs a design of its own.

### Backlog edit (for the team to make in `docs/FoC-ProductBacklog.md`)

- **NFR3.2.1** (secondary OTP before high-risk admin actions): dropped. Note it as a deliberate scope change.
- **NFR3.2.2**: reword to: successful high-risk admin actions (suspend, unsuspend, promote, demote, unlock, email unmask) are recorded in an append-only audit table with actor, target, before/after, a required reason and the user agent, and are viewable by admins at `/admin/logs`. Rejected attempts and no-ops are not recorded.
- **NFR3.1.2** / **NFR3.1.3**: as noted in Stage 20, plus: unmasking now requires a reason, on every click.

# Stage 27: Admin Elevation (OTP) for High-Risk Admin Actions (NFR3.2.1)

> **Scope**: `user-service`, `frontend`, and one line per new route in `frontend/vite.config.js`
> and `frontend/nginx/default.conf`. Before an admin can suspend/unsuspend or promote/demote a
> user, they must "elevate privileges": verify an OTP sent to their own email. Verification gives
> a short-lived, per-device elevation token, sent on later requests in the `Elevated-Token` header.
>
> - 27a: admin OTP routes and the elevation token
> - 27b: enforcing elevation on the status and role endpoints
> - 27c: frontend (Elevate privileges button and timer, OTP modal, flow with the Stage 26 reason dialog, token kept in `sessionStorage`)
>
> Backlog refs: NFR3.2.1. This restores NFR3.2.1, which Stage 26 recorded as dropped.
>
> **Depends on Stage 26 (landed):** the `reason` / `otherReason` fields, the preset reason codes, the
> audit table and the reason dialog already exist. This stage does not change them. Unlock and
> unmask email carry no reason (Stage 26 amendment) and need no elevation.
>
> **Not in this stage:** a Content-Security-Policy. It applies to the whole frontend and gets its own later stage. Until then, do not add CSP headers or meta tags.
>
> **Before starting:** read the current code, not just this file. If any `[DECIDE]` placeholder
> remains, or anything below disagrees with the code, stop and ask me. Do not pick a value
> yourself. Implement one sub-stage at a time and wait for my confirmation before the next.
>
> **Ground rules:** conventions 1–8 at the top of this file and the Stage 4d lock-order rule apply.
> The Stage 16 frontend ground rules apply to 27c (work in `frontend/` only; never touch
> `foc-mockup/`; do not modify `src/realtime/orderSocket.js`, `src/data/users.js`,
> `src/components/DemoControls.jsx` or `AI-NOTES.md`; reuse `OtpInput`, `ResendButton`,
> `errorMessages.js`, toasts and banners; no new libraries; list every file touched outside the
> changes table).

### Design decisions (already made, do not change)

#### Which actions, which callers

| Rule                        | Value                                                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actions that need elevation | Suspend / unsuspend (`PUT /users/:id/status`) and promote / demote (`PUT /users/:id/role`)                                                                                             |
| Actions that do not         | Unlock, unmask email, every `GET`. Credit adjustments are not part of this stage.                                                                                                      |
| Callers                     | Admin and super admin                                                                                                                                                                  |
| No-op requests              | Do not need elevation (the no-op paths return before the elevation check)                                                                                                              |
| Check order                 | Elevation is checked **last**: Zod validation (including the Stage 26 reason) → lock → role restrictions → pending/suspended rules → no-op → **elevation check** → write and audit row |
| Failed elevation            | Rejected before any write: no change, no audit row (Stage 26: rejected requests write nothing)                                                                                         |

#### OTP

| Rule               | Value                                                                                                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API-facing purpose | `admin_action` → DB enum `'Admin Action'`. Every admin OTP route takes a `purpose` field with a single-value enum (`admin_action`); anything else → `400 VALIDATION_ERROR`, `"Invalid purpose"`.                                                                                             |
| Sent to            | The acting admin's own registered email                                                                                                                                                                                                                                                      |
| Sending            | Through `requestOtp`, never `issueOtp` directly. The 60 s cooldown, the resend window (`config.otp.resendWindowMinutes`), the per-OTP guess limit (5) and the Stage 18 escalating send block (1 h, 4 h, 24 h) all apply. Stage 18 covered three purposes; this extends it to `Admin Action`. |
| Lockout            | Wrong admin OTP guesses do **not** count toward the login lockout. They use the per-OTP guess counter only.                                                                                                                                                                                  |
| Escalation reset   | A successful verify resets this purpose's send escalation level, as for the other purposes                                                                                                                                                                                                   |
| Verify             | Consuming (the OTP is used up on a correct code)                                                                                                                                                                                                                                             |
| Email              | Same shape as the other purposes (OTP + expiry, no links). Subject: `Your FoC admin privileges elevation verification code`                                                                                                                                                                  |
| Retries / logging  | Inherited from Stage 19 (`issueOtp`)                                                                                                                                                                                                                                                         |
| Sending the code   | By a "Send code" button the admin clicks. The OTP modal does **not** send a code when it opens.                                                                                                                                                                                              |

#### Elevation token (per device)

| Rule                                | Value                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mechanism                           | A short-lived elevation token. The 15-minute window lives in the token, so it is per device, not per account.                                                                                                                                                                                                                                                               |
| Algorithm and format                | RS256, same key and `kid` handling as the access token. Claims: `sub`, `role`, `sid`, `iat`, `exp`. JWT header `typ` is `ep+JWT`.                                                                                                                                                                                                                                           |
| Token types                         | Access tokens now carry header `typ: at+JWT`. Ported now with no grace period (no active users). `verifyAccessToken` accepts only `at+JWT`; the elevation verifier accepts only `ep+JWT`. Each rejects the other's tokens and plain `JWT`.                                                                                                                                  |
| `sid` (device binding)              | `sid` is the `refresh_tokens.id` of the login the token belongs to. It stays the same for the whole login because refresh tokens are not rotated. **Both** the access token and the elevation token carry it. The elevation check requires the elevation token's `sub` and `sid` to equal the caller's access-token `sub` and `sid`. A mismatch → `403 ELEVATION_REQUIRED`. |
| Lifetime                            | Follows the other TTLs: an env var in `.env`, `.env.example`, `.env.test` and `config.ts`, with bounds like the access-token TTL. Name `ELEVATION_TOKEN_TTL_MINUTES`, value `15`, bounds 1–15.                                                                                                                                                                              |
| Sent on requests                    | `Elevated-Token` request header                                                                                                                                                                                                                                                                                                                                             |
| `admin_action_allowed_until` column | Dropped. Nothing is added to the `users` table.                                                                                                                                                                                                                                                                                                                             |
| Returned by verify                  | `200 { elevationToken }`. No other fields. The client decodes `exp` for the timer, as it does for the access token.                                                                                                                                                                                                                                                         |
| Client storage                      | `sessionStorage` (per tab; survives a reload in the same tab; a new tab starts with none). This is the one exception to the Stage 23 rule that auth tokens never go in storage; that rule still holds for the access token. No backend hydration is needed.                                                                                                                 |
| On load                             | The frontend reads the stored token, decodes `exp`, removes it if expired, and shows the timer if still valid. The server is the authority: a rejected token (`ELEVATION_REQUIRED`) is also removed from storage.                                                                                                                                                           |
| Logout                              | The frontend removes the stored token on logout, and on any forced logout that clears auth state (including the forced re-login after a password change).                                                                                                                                                                                                                   |
| Ends early when                     | Only at `exp`. Follows the access token: no revocation. Logout, password change, forgot-password reset, role change and suspension do not end the window early on the server (only the frontend clears its stored copy on logout).                                                                                                                                          |
| Re-verify while active              | Rejected (see errors). The three admin OTP routes read the `Elevated-Token` header; a valid token for the caller (`sub` and `sid` match) → `409 ALREADY_ELEVATED`. The frontend sends the header on these three calls when it holds a token.                                                                                                                                |

#### Endpoints (new, under `/admin/`)

All three: `authenticate` + `authorize('admin')`, Zod `.strict()`, `asyncHandler`.

| Route                    | Body               | Success                                                                                    |
| ------------------------ | ------------------ | ------------------------------------------------------------------------------------------ |
| `POST /admin/send-otp`   | `{ purpose }`      | `200 { message: 'A verification code has been sent to your email', code: 'OTP_SENT' }`     |
| `POST /admin/verify-otp` | `{ otp, purpose }` | `200 { elevationToken }`                                                                   |
| `POST /admin/resend-otp` | `{ purpose }`      | `200 { message: 'A new verification code has been sent to your email', code: 'OTP_SENT' }` |

- Success messages follow the existing OTP routes.
- `otp` format check in the service layer, as everywhere: `^\d{6}$` → `400 VALIDATION_ERROR`, `"OTP must be a 6-digit code"`.
- `resend-otp` with no pending admin OTP → `400 NO_PENDING_OTP`, `"No pending verification found"` (pending = latest `Admin Action` OTP row exists and is not consumed, as in Stage 12d).
- These paths sit under `/admin/`, where frontend pages live. Each needs its own exact entry in `vite.config.js` and `nginx/default.conf`, as `/admin/audit-logs` got in Stage 26. Do not add `/admin` as a whole.
- CORS: no code change is planned. `cors({ origin, credentials: true })` has no `allowedHeaders`, so it allows whatever headers a cross-origin preflight asks for, and the frontend reaches the service through the Vite proxy and nginx (same-origin). Verify by sending a request with `Elevated-Token` through the dev proxy and through nginx and confirming the header arrives in the service. If it does not arrive anywhere, stop and tell me what you found.

#### Errors

| Case                                                    | Response                                                                                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status/role change with no valid `Elevated-Token`       | `403 ELEVATION_REQUIRED`, `"Verify your identity to perform this action."`. Covers missing, invalid and expired tokens, all with the same code.                                          |
| `send-otp`, `verify-otp` or `resend-otp` while elevated | `409 ALREADY_ELEVATED`, `"Admin actions are already unlocked."`                                                                                                                          |
| Wrong, expired, attempts exceeded, cooldown, limit      | Existing codes reused: `INVALID_OTP`, `OTP_EXPIRED`, `OTP_ATTEMPTS_EXCEEDED`, `OTP_RESEND_COOLDOWN` (with `Retry-After`), `OTP_RESEND_LIMIT` (level-matched message, with `Retry-After`) |

#### Frontend flow (`/admin/users` only)

| Rule                                              | Value                                                                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Elevate button                                    | "Elevate privileges", on `/admin/users` only. Disabled while elevated. A timer sits beside it (a new component).            |
| Greyed-out items                                  | None. Suspend/unsuspend and promote/demote are always clickable.                                                            |
| Click an action, not elevated                     | The OTP modal opens. After a successful verify, the Stage 26 reason dialog opens, then the request is submitted.            |
| Click an action, elevated                         | The Stage 26 reason dialog opens straight away                                                                              |
| Click "Elevate privileges"                        | The OTP modal opens. After a successful verify, nothing else runs.                                                          |
| OTP modal                                         | Opens with a "Send code" button. Nothing is sent until the admin clicks it.                                                 |
| Window expires                                    | The timer disappears and the button is enabled again. The next high-risk click opens the OTP modal.                         |
| `ELEVATION_REQUIRED` after the reason was entered | The OTP modal opens; after verifying, the reason already entered is kept and the request is retried through the same dialog |
| Cooldown                                          | Resend disabled with a countdown from `Retry-After`                                                                         |
| Limit                                             | Text only, level-matched ("about an hour" / "about 4 hours" / "about a day"), no countdown                                  |
| Error text                                        | Add `ELEVATION_REQUIRED` and `ALREADY_ELEVATED` to `errorMessages.js`, with the display type for each                       |

---

## Changes to already-implemented code

| #   | File                                                                                                          | Change                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `.env`, `.env.example`, `.env.test`, `src/config.ts`                                                          | Elevation token TTL env var with bounds (name and bounds to confirm above)                                                                                                                                                                                                                                |
| 2   | `src/utils/jwt.ts`, `src/middleware/authenticate.ts`, `src/types/express.d.ts`                                | Sign the access token with header `typ: at+JWT` and a `sid` claim; `verifyAccessToken` returns `sid` too and rejects any other `typ`. Add sign/verify for the elevation token (`ep+JWT`, claims `sub`, `role`, `sid`, `iat`, `exp`). `req.user` gains `sid`.                                              |
| 2a  | `src/services/auth.service.ts` (`login`, `refresh`), `src/db/queries/tokens.queries.ts`                       | Pass the `refresh_tokens.id` of the login into the access token as `sid`. Verify first that `createRefreshToken` returns the row id, and that `refresh` has the id of the locked row. Report what you find. Other services only read `sub` and `role`; check that the JWKS consumers ignore extra claims. |
| 2b  | Existing auth tests that decode or build access tokens                                                        | Update only the token fixtures and decode assertions (`typ`, `sid`). If a test fails for another reason, stop and report it.                                                                                                                                                                              |
| 3   | `src/services/email.service.ts`                                                                               | Add an `Admin Action` entry to the purpose map, subject `Your FoC admin privileges elevation verification code`                                                                                                                                                                                           |
| 4   | `src/services/otp.service.ts` (`requestOtp`) and the verify path                                              | Apply the Stage 18 escalating send block to `Admin Action`; a successful verify resets its level                                                                                                                                                                                                          |
| 5   | New route, controller and service files for the three admin OTP routes                                        | Follow the existing file naming, as the audit-log files did. Mount in `src/app.ts`.                                                                                                                                                                                                                       |
| 6   | `src/controllers/users.controller.ts`, `src/services/users.service.ts` (`changeUserStatus`, `changeUserRole`) | The controller reads the `Elevated-Token` header and passes it down; the service checks it at the "last" position in the transaction, before the write and the audit row                                                                                                                                  |
| 7   | `frontend/src/` (new small storage helper), `AuthContext` logout and forced-logout paths                      | Read, write and remove the elevation token in `sessionStorage`; remove it on logout and forced logout. Reword the Stage 23 manual check "no access token in storage" so it names the access token only.                                                                                                   |
| 8   | `src/utils/errors` or the existing `AppError` usage                                                           | New codes `ELEVATION_REQUIRED` and `ALREADY_ELEVATED` thrown as `AppError`                                                                                                                                                                                                                                |
| 9   | Existing tests                                                                                                | Status and role tests need a valid elevation token fixture. Update only those fixtures. If a test fails for another reason, stop and report it.                                                                                                                                                           |
| 10  | `frontend/vite.config.js`, `frontend/nginx/default.conf`                                                      | Exact entries for `/admin/send-otp`, `/admin/verify-otp`, `/admin/resend-otp`, same target as `/auth` and `/users`                                                                                                                                                                                        |
| 11  | `frontend/src/api/` (new admin OTP functions), `src/api/http.js`                                              | Add the three calls; attach `Elevated-Token` on the status and role calls when elevated                                                                                                                                                                                                                   |
| 12  | `frontend/src/pages/AdminUsers.jsx`, new elevate timer component, `errorMessages.js`                          | Elevate button and timer, OTP modal, retry flow with the kept reason                                                                                                                                                                                                                                      |

---

## Stage 27a: Admin OTP Routes and Elevation Token

### Verification

- Admin and super admin can `send-otp`, `verify-otp` and `resend-otp`; a regular user gets `403 FORBIDDEN`; no token → `401 UNAUTHORIZED`
- `purpose` other than `admin_action` → `400 VALIDATION_ERROR`, `"Invalid purpose"`; an extra field → `400`, `"Request contains unexpected fields"`
- `otp` not 6 digits → `400 VALIDATION_ERROR`, `"OTP must be a 6-digit code"`
- The code is sent to the acting admin's own email; the email subject is `Your FoC admin privileges elevation verification code`
- Correct code → an elevation token is returned and works; the same code again → `400 INVALID_OTP`
- The token is RS256, carries `sub`, `role`, `iat`, `exp`, and expires after the configured TTL
- Wrong code → `400 INVALID_OTP`, attempt persisted; 5 wrong codes → `429 OTP_ATTEMPTS_EXCEEDED`; expired → `400 OTP_EXPIRED`
- Wrong admin OTPs do not affect the login lockout counter
- Resend inside 60 s → `429 OTP_RESEND_COOLDOWN` with `Retry-After`; after the cap → `429 OTP_RESEND_LIMIT` with a level-matched message and `Retry-After`; the block escalates 1 h, 4 h, 24 h and does not mix with other purposes
- A successful verify resets this purpose's escalation level
- `send-otp`, `verify-otp` and `resend-otp` while elevated → `409 ALREADY_ELEVATED`
- Email send failure → `503 EMAIL_SEND_FAILED`, rolled back, Stage 19 retries apply
- Two concurrent `verify-otp` with the correct code → one success, one `400 INVALID_OTP`
- Elevation on one device does not elevate another device of the same admin
- Access tokens carry header `typ: at+JWT` and a `sid` claim equal to the login's `refresh_tokens.id`; `sid` is the same after a refresh of the same login
- The elevation token is rejected as an access token, and an access token (or a plain `JWT`) is rejected as an elevation token
- An elevation token from one login is rejected for a different login of the same admin (`sid` mismatch) and for a different admin (`sub` mismatch)
- Out-of-bounds TTL values exit at startup with a clear error naming the variable and range (as in Stage 23a)
- `resend-otp` with no pending admin OTP (none, or the latest is consumed) → `400 NO_PENDING_OTP`, `"No pending verification found"`
- A valid elevation token in `Elevated-Token` on `send-otp`, `verify-otp` or `resend-otp` → `409 ALREADY_ELEVATED`; an invalid or expired one does not block sending
- Logout, password change, reset, role change and suspension do not make an unexpired elevation token fail (it expires at `exp`)
- A request with `Elevated-Token` reaches the service through the Vite proxy and through nginx (CORS check; report the result)

---

## Stage 27b: Enforcing Elevation on Status and Role Changes

### Verification

- Suspend/unsuspend and promote/demote with no `Elevated-Token`, an invalid token, or an expired token → `403 ELEVATION_REQUIRED`, no change, no audit row
- The same calls with a valid token and a valid Stage 26 reason → `200` as before, with the audit row from Stage 26
- Elevation is checked after the existing checks: a self-targeting, super-admin, admin-vs-admin, pending or suspended-target request returns its existing error first, not `ELEVATION_REQUIRED`
- No-op status and role requests still return `200` unchanged without elevation
- An invalid or missing reason still returns `400` first (Zod runs before everything)
- Unlock and unmask email work without elevation
- Concurrent status/role calls keep the Stage 9/10 behaviour (no deadlock, no `500`)
- A token issued to one admin does not elevate a different admin (`sub` mismatch), and a token from another login of the same admin does not elevate this one (`sid` mismatch)

---

## Stage 27c: Frontend

### Verification

- Elevate button and timer appear only on `/admin/users`; the button is disabled while elevated
- Clicking an action while not elevated opens the OTP modal, then the reason dialog after a correct code, then submits
- Clicking an action while elevated opens the reason dialog straight away
- Clicking "Elevate privileges" and verifying runs no action
- The OTP modal sends nothing until "Send code" is clicked; closing and reopening the modal sends nothing
- Timer counts down, disappears at zero, and the button is enabled again; the next action click opens the OTP modal
- `ELEVATION_REQUIRED` after the reason was entered → OTP modal opens, and after verifying the reason is still filled in
- Resend cooldown shows a countdown; the limit state shows level-matched text with no countdown
- Wrong code shows the error and clears the boxes; attempts exceeded points at resend
- `ALREADY_ELEVATED` is shown as a toast and the button state corrects itself
- The token is stored in `sessionStorage` after verify; reload mid-window in the same tab → the timer shows the correct remaining time from the stored token's `exp`; a new tab starts without elevation
- An expired stored token is removed on load; a token rejected with `ELEVATION_REQUIRED` is removed
- Logout and forced logout (including after a password change) remove the stored token
- The access token is still not in `localStorage` or `sessionStorage` (check DevTools); only the elevation token is
- The three admin OTP calls send `Elevated-Token` when a token is held
- Success updates the row and shows a toast; failure shows a toast and refetches
- Reloading `/admin/users`, `/admin/logs` and `/admin/suppliers` still loads the React app; the three admin OTP calls go through the proxy
- Phone-width viewport: modals, button and timer are usable

---

### Tests (Vitest)

Follow the Stage 7 ground rules: real Postgres, the existing mocking policy (mock `sendOtpEmail` to capture the OTP), tests under `tests/` mirroring `src/`, concurrency tests in `tests/concurrency/`. Every Verification bullet in 27a, 27b and 27c that does not need a real browser is a required test case. Simulate time by backdating, or with fake timers on the frontend. Existing status and role tests need an elevation fixture: update only those. Frontend tests mock the network layer and use the existing setup. List the visual and phone-width checks in your summary for manual verification. Do not modify application code to make a test pass.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry per sub-stage.

### Backlog edit (for the team to make in `docs/FoC-ProductBacklog.md`)

- **NFR3.2.1:** reword to: suspend/unsuspend and promote/demote require the admin to elevate privileges first (OTP to their own email, 15-minute per-device window). Direct credit balance adjustments are dropped. Undo the "dropped" note added for Stage 26.

# Stage 28: Scheduled Errands — Claude Code Implementation Instructions

> **How to use this file**: Read and implement ONE stage at a time. After each stage, stop, verify the checklist, and wait for my confirmation. Do not implement future stages speculatively.
>
> Every `[DECIDE]` placeholder is mine to fill. If one remains in the stage you are about to implement, stop and ask me. Do not pick a value yourself.

## AI Usage Logging

After each stage, generate for me to copy into `/ai/usage-log.md`:

```
## <date> — Scheduled Errands Stage <n>: <name>

**Tool:** Claude Code (claude-sonnet-5)
**Scope:** Implementation code

**What I prompted:**
<brief summary>

**What it produced:**
<files created/modified>

**What I kept/changed/rejected:**
<leave blank>
```

Add this header comment to every file you create or modify:

```
// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: <date>
// <DD/MM/YYYY>: <scope> <n>
// Author review: <leave blank for me to fill in>
```

## Ground rules

1. Read the current code first, not just this file. Where they disagree, follow the code and tell me.
2. Read the existing `OrderRequest` model in `order-service/prisma/schema.prisma` BEFORE designing the series table. Copy its order fields (names, types, validation) rather than inventing new ones. Read `order-service/AGENTS.md` and obey it.
3. Do not edit supplier-service except in Stage 3a (as a PR, not merged). George and Wen Xi have approved my edits to `queue/tasks.ts` and `credit-jobs.ts` (the chat payload) and the series section in `MyErrands.jsx`; edit those files only as this file describes. Do not change the credit-reservation failure path (`pending → failed` via the credit worker) or any normal-order behaviour, except where a stage says so.
4. Follow existing conventions: `{ message }` error bodies, `ErrorCode`/`ErrorMessage` in `constants/errors.ts`, `statusFor` in `orders.controller.ts`, hand-written validators, ESM `.js` imports, Prisma migrations named `YYYYMMDDHHMMSS_description` via `npm run db:migrate`, `startScheduledTask` for schedulers, time-dependent functions take `now: Date`.
5. Do not add tests unless the stage says so. Each stage below does say so: write tests in the same stage.
6. When done, list every deviation from this file and why.

## Design decisions (made by me, do not change)

### Model

| Rule                                      | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Location                                  | Inside order-service                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Tables                                    | New `order_series`; `requests` gains nullable `seriesId` (FK → `order_series.id`, `ON DELETE SET NULL`) and nullable `failureReason`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Series order fields                       | Same as `OrderRequest` (supplier, description, delivery location, delivery details, credits, additional details). `completeBy` is replaced by `durationMinutes`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Rule                                      | RRULE stored as plain text in the series row. End condition (`UNTIL` / `COUNT` / never) lives inside the RRULE. Library: `rrule` (npm), backend and frontend                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Start                                     | Stored start (DTSTART) on the series                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Next fire                                 | `nextFireAt` stored on the series row, indexed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Retry state                               | New nullable columns on the series row, all null when nothing is retrying: `currentOccurrenceAt` Timestamptz(3) (the scheduled time being retried), `retryType` enum (`user_service_unreachable`, `supplier_service_unreachable`, `supplier_closed`), `attemptCount` Int, `nextRetryAt` Timestamptz(3). Names and enum values follow the existing `OrderRequest` conventions (camelCase, `At` suffix, lowercase snake enum values); check them against the real model and tell me before migrating if any differ. While an occurrence is retrying, the next occurrence's fire time is computed from the RRULE when needed, not stored |
| Series status                             | `active` / `inactive` (pause = inactive). Deleting a series deletes the row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Finished series                           | Deleted by the worker only when the rule has no next occurrence (`nextFireAt` is null) AND no retry is in progress. A one-time errand (`COUNT=1`) has a null `nextFireAt` straight after firing, so it must not be deleted while its retry is running                                                                                                                                                                                                                                                                                                                                                                                 |
| One-time errand                           | A series with `COUNT=1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Timezone                                  | Singapore time. Recurrence follows iOS Calendar: every day/week/month/year plus custom (see Stage 6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Month without the day (5th weekday, 31st) | Skipped for that month (RFC 5545)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Limits                                    | None per user                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### completeBy

| Rule                          | Value                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage                       | Series stores `durationMinutes`. Each occurrence's `completeBy` = scheduled fire time + duration (counted from the SCHEDULED time, not the actual post time)                                                                                                                                                                                                               |
| Max duration                  | 24 hours (1440 minutes)                                                                                                                                                                                                                                                                                                                                                    |
| Frontend                      | User picks a date and time; frontend converts to minutes. Date picker prevents completeBy ≤ post time, so no backend rule for it                                                                                                                                                                                                                                           |
| No deadline                   | Not possible. George and Wen Xi are making `completeBy` default to 24 hours instead of NULL for all orders (new FR), so every occurrence has a deadline. If `durationMinutes` is omitted on a series: `[DECIDE: default 1440 or required; waiting for George's completeBy change]`. Do NOT build on George's completeBy default until it is merged: read the code as it is |
| Max duration on normal orders | `[ON HOLD]`: George said "default", not "cap". Confirm whether normal orders also have a 24h maximum                                                                                                                                                                                                                                                                       |

### API (all under `/orders`, registered BEFORE `/:id`; param named `:seriesId`, so controller does its own UUID check)

| Endpoint                              | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /orders/series`                 | `201`. Body: order fields, `rrule`, `durationMinutes`, `startAt` (ISO) and/or `startNow` (boolean). `startNow` wins if both. Neither → `400 MISSING_START_TIME`. Does NOT check supplier/location at create time                                                                                                                                                                                                           |
| `GET /orders/series/mine`             | `{ ok: true, series }`. No pagination. Includes paused series; a one-time series shows until it posts. Each series includes the next 3 upcoming dates (computed from the rule) and a count of its orders in `pending` + `open`. Retry state and `nextFireAt` are NOT exposed                                                                                                                                               |
| `GET /orders/series/:seriesId`        | Bare series object, same extra fields                                                                                                                                                                                                                                                                                                                                                                                      |
| `PATCH /orders/series/:seriesId/edit` | `200`. Validates only fields sent. All fields editable, including `credits`. `status` (`active`/`inactive`) may be sent together with other fields. Edits affect future occurrences only. Count restarts (DTSTART reset to the edit time) only when the RRULE or its count limit changes. Resume computes `nextFireAt` from the resume time (missed occurrences during a pause are dropped). Optimistic lock via `version` |
| `DELETE /orders/series/:seriesId`     | `200 { ok: true }`. Sets `seriesId` null on posted orders (FK). Stops any retry in progress (see Failures)                                                                                                                                                                                                                                                                                                                 |
| Access                                | Owner only; anyone else → `403 FORBIDDEN`                                                                                                                                                                                                                                                                                                                                                                                  |
| Error shape                           | `{ message }`                                                                                                                                                                                                                                                                                                                                                                                                              |

### Error codes

`SERIES_NOT_FOUND` (404, also for malformed series id), `SERIES_CONFLICT` (409), `INVALID_RULE`, `MISSING_RULE`, `INVALID_DURATION`, `INVALID_START`, `MISSING_START_TIME`, `INVALID_STATUS` (reused for a bad `status` in an edit), `FORBIDDEN`, `INVALID_SERVICE_KEY` (401, handled inline), `INVALID_USER` (pending user), `INVALID_USER_ID` (user not found), `USER_SERVICE_UNAVAILABLE`, `SUPPLIER_NOT_FOUND`, `SUPPLIER_SERVICE_UNAVAILABLE`. Add `404` for `SERIES_NOT_FOUND` and `409` for `SERIES_CONFLICT` in `statusFor`; everything else falls to 400 as today.

### Firing and failures

| Rule                                 | Value                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheduler                            | New 1-second scheduler, `concurrency: 1`, via `startScheduledTask`, in `worker.ts`                                                                                                                                                                                                                                                                                                                          |
| Exactly once                         | Claim a due series with `updateMany` guarded by `version` (like `orders.service.ts`); `count === 0` → skip                                                                                                                                                                                                                                                                                                  |
| Posting                              | Each occurrence is created through the normal create path (status `pending`, outbox `credit_reserve`). Set status explicitly. Credits are reserved only when the occurrence posts                                                                                                                                                                                                                           |
| Credit failure after posting         | Normal order flow (`failed`). Do not touch                                                                                                                                                                                                                                                                                                                                                                  |
| Late                                 | Never dropped for lateness alone. If posted > 1 minute after its scheduled time, add a "posted late" note in the order chat after the order reaches `open` (covers worker-down and supplier-closed)                                                                                                                                                                                                         |
| completeBy already past at fire time | Skip this occurrence (one time only), `failed` row, notice. Series continues to the next occurrence                                                                                                                                                                                                                                                                                                         |
| Catch-up after downtime              | Each missed occurrence is judged on its own `completeBy`                                                                                                                                                                                                                                                                                                                                                    |
| Next fire (design B)                 | `nextFireAt` (nullable) advances to the next occurrence, computed from the RRULE, as soon as an occurrence is picked up, including when it goes into retry. A retry is driven by `currentOccurrenceAt` and `nextRetryAt`. The worker looks for series where `nextFireAt <= now` OR `nextRetryAt <= now`. When an occurrence is skipped or fails, just clear the retry columns; `nextFireAt` needs no change |
| One retry slot per series            | If the next occurrence becomes due while a retry is still active, drop the retry (`failed` row + notice) and start the new occurrence                                                                                                                                                                                                                                                                       |

#### Fire-time checks, in order

1. **User** — `GET {USER_ORDER_SERVICE_URL}/users/worker/:id` with header `User-Order-Service-Key` (secret `USER_ORDER_SERVICE_API_KEY`). Response `{ status, lockedUntil }`.
2. **Supplier** — existing `supplierExists` / `locationExists` in `suppliers.client.ts`, reused with header `Supplier-Order-Service-Key` (secret `SUPPLIER_ORDER_SERVICE_API_KEY`) in place of the user's token. Client also returns a closed flag and the next opening time.

| Outcome                                                                        | Action                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User `suspended`                                                               | Drop now, `failed` row, notice                                                                                                                                                                                                   |
| User locked (`lockedUntil` in the future, compared with order-service's clock) | Drop now, `failed` row, notice                                                                                                                                                                                                   |
| User `pending`                                                                 | Drop now, `INVALID_USER`                                                                                                                                                                                                         |
| User not found (404)                                                           | Drop now, `INVALID_USER_ID`                                                                                                                                                                                                      |
| Supplier/location not found (inactive or deleted)                              | Drop now, `failed` row, notice                                                                                                                                                                                                   |
| Supplier has empty `openingHours`                                              | Fail, `failed` row, notice                                                                                                                                                                                                       |
| Supplier closed now                                                            | Retry at the next opening time if before `completeBy`; otherwise `failed` row + notice. Re-check the USER on every such retry. If the next opening is after the next occurrence's fire time, drop the current one now and inform |
| User-service unreachable                                                       | Retry with backoff (Stage 19 shape: up to 4 attempts, waits capped 1/2/4 s with full jitter, 3 s per call, 30 s overall deadline). Exhausted → `failed` row + notice                                                             |
| Supplier-service unreachable                                                   | Same backoff. Do NOT re-check the user on these retries. Notify only when exhausted                                                                                                                                              |
| Series edited, paused or deleted while retrying                                | Stop the retry, `failed` row, notice. Delete handler creates the row and notice in the same step (the series row, and its retry state, disappears)                                                                               |
| First failure of any kind (except supplier unreachable)                        | Notice on the first failure                                                                                                                                                                                                      |

#### Next opening time (computed in order-service from supplier `openingHours`)

`day` 1–7 = Mon–Sun, 8 = open 24/7. `open`/`close` are `"HH:MM"` 24h, Singapore time (UTC+8), `close` exclusive. Overnight is `open > close`; the early-morning half belongs to the next day. A `00:00`/`23:59` pair on the current day means always open. No row for a day = closed that day. At most one window per day. Ignore the `is_24h` column.

### Failed rows

| Rule                                     | Value                                                                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Insert                                   | Directly into `requests` with `status = 'failed'`, `failureReason` set, no credit reservation, no outbox row, no chat conversation, no socket event      |
| Only series outcomes set `failureReason` | Credit-reservation failures keep it null                                                                                                                 |
| Visibility                               | `GET /orders/mine` also returns `failed` rows that have a `failureReason`. Credit failures stay hidden                                                   |
| Frontend                                 | Add a `failed` chip and `STATUS_LABELS`; include `failed` in the `ACTIVE`/`CLOSED` lists in `activityShared.jsx`; show the reason. No "Open chat" button |

### Notifications

All FAILURE and SKIP notices (no order chat exists for them) go through ONE function, `notifySeriesEvent({ userId, messageId, message })`. Wen Xi's system chat is merged (PR #170). It calls chat-service `POST /chat/send-system-notification` with body `{ orderId: null, recipient: userId, messageId, message }` (`recipient` is required when `orderId` is null), header `X-Service-Key` = `CHAT_SERVICE_API_KEY` (already in order-service config). `messageId` is a caller-generated UUID and is the idempotency key: same key + same payload → `200`, conflicting payload → `409`. The system conversation is created lazily by chat-service. Message text is free text (no length cap enforced). Do not send an order id or a series id.

Order-service's chat path currently cannot send orderless notices: `ChatNotificationPayload` (`queue/tasks.ts:144-148`) requires a non-null `orderId` and has no `recipient`, and the worker validator (`credit-jobs.ts:212-215`) enforces it. Decided: extend the existing `chat_notification` payload with a nullable `orderId` (null, not 0: chat-service validates a UUID or null) and a `recipient`, and update the validator. Send through the existing outbox/BullMQ path, in the same transaction as the failed-row insert, like the current chat tasks. This edits George and Wen Xi's files; they have approved it. Generate `messageId` once when the notice is created, so every retry reuses it.

The notice carries the user id, the text and an idempotency key only. No order id, no series id.

KNOWN ISSUE (leave a code comment saying so): the late note is sent after the order reaches `open`. If credit reservation fails, the order never opens and the late note is lost.

The LATE note is separate: it is NOT sent through `notifySeriesEvent` or the system chat. It goes in the normal order chat via the existing `chat_notification` outbox task, after the order reaches `open` (the order has a conversation by then).

---

## Stage a: Schema and migration (order-service)

- Read the `OrderRequest` model first. Add `OrderSeries` and the two `requests` columns. Retry state columns as in the design table.
- Index `nextFireAt` (+ status). One migration, named per convention.
- `listMyOrders` filter change (include failed with `failureReason`) goes in Stage 5.

**Verify**: migration applies on a fresh DB; deleting a series sets `seriesId` null on its orders.
**Tests**: real-DB tests for the FK behaviour.

## Stage b: User-service worker endpoint

- `GET /users/worker/:id`, behind a new service-key middleware (header `User-Order-Service-Key`, secret `USER_ORDER_SERVICE_API_KEY`, add to `config.ts` Zod schema, `.env.example`, `.env`, `.env.test`). Compare with the existing `hashesMatch`. Bad key → `401 INVALID_SERVICE_KEY`.
- Register BEFORE `GET /:id` and `GET /:id/full-email` in `users.routes.ts`. No `authenticate`/`authorize`.
- Returns `{ status, lockedUntil }` only. No email, no other fields. Unknown user → `404 USER_NOT_FOUND`; non-UUID → `400 VALIDATION_ERROR`, "Invalid user ID". Pending users are returned with `status: 'pending'`.
- Keep user-service conventions (Zod `.strict()`, `asyncHandler`, camelCase responses).

**Tests**: key missing/wrong/right, locked, suspended, pending, unknown, non-UUID, route order.

## Stage c1: supplier-service service-key access (PR for Congchen to review)

supplier-service is Congchen's. This stage is the ONLY one that touches it. Work on a new branch, open a PR against the main branch, and do not merge. Read `supplier-service/AGENTS.md` (if it exists), `SupplierServiceArchitecture.md`, the existing auth middleware (JWT + `requireRole`), the config/env loading, the error response shape and the test setup BEFORE changing anything, and follow them. supplier-service uses MySQL with raw queries, not Prisma.

Behaviour (from me):

- `GET /api/v1/suppliers/:id` and `GET /api/v1/suppliers/reference/location` also accept a service key as an alternative to a user JWT.
- Header `Supplier-Order-Service-Key`; secret env variable `SUPPLIER_ORDER_SERVICE_API_KEY`, validated in the existing config loader and added to `.env.example`, the compose env, and the test env. Same value as order-service's.
- Compare with a constant-time comparison.
- Valid key → request proceeds with no user token and no role check, on these two routes only.
- Key present but wrong, and no valid JWT → `401` with `INVALID_SERVICE_KEY` (use the service's existing error shape; tell me if it has no `code` field).
- No key → the existing JWT behaviour, unchanged. A valid JWT still works even if a wrong key is also sent
- No other route accepts the key. No change to responses, queries or data. Do not touch `is_24h`, seed scripts or the load-test seed.

**Tests** (the service's existing runner): valid key on both routes; wrong key with and without a JWT; no key with a valid JWT (unchanged); no key and no JWT; the key on another route is rejected; the secret is never logged.

**Verify**: both routes work with the key and no token; existing tests still pass. Give me the PR description text, listing exactly what changed, for Congchen to review. I will tell him the PR is open.

## Stage c2: order-service supplier client

- `suppliers.client.ts`: add the key path for the worker, reusing `supplierExists` and `locationExists` with `Supplier-Order-Service-Key` (secret `SUPPLIER_ORDER_SERVICE_API_KEY`, in config, `.env.example` and the test env) where the user's token was. Parse `openingHours`/`isOpen` from the response (today only the status is read). Return the existing `found` / `not_found` / `unavailable` plus a closed flag and the next opening time per the rules above, and handle an empty `openingHours` list as a failure. Congchen confirmed the hours format described above, and said every Store should have hours rows ("iirc", so unverified): while in supplier-service for Stage 3a, check whether Store creation can produce zero hours rows and tell me what you find. Keep the existing user-token behaviour for normal orders untouched.

**Tests**: next-opening-time with fixtures for overnight, closed days, day 8, `00:00`/`23:59`, empty list, the current time at the exact open and close minutes; client result mapping (mock fetch).

## Stage d: User client (order-service)

- `user.client.ts`, env `USER_ORDER_SERVICE_URL`, `USER_ORDER_SERVICE_API_KEY`. Results `found` / `not_found` / `unavailable` plus `status` and `lockedUntil`. 3 s timeout.

**Tests**: mock fetch for each result.

## Stage e: Series API and failed rows

- Routes, controller, service, validators, error codes per the tables. Mirror `createOrder`/`editOrder` patterns.
- Delete: count and stop-retry behaviour as specified.
- Failed-row insert helper (direct insert). `listMyOrders` change.
- `notifySeriesEvent` (see Notifications). Message wording per outcome: draft it and show me before use.

**Tests**: every endpoint, ownership, validation codes, edit semantics (count reset, resume), startNow/startAt rules, `statusFor` mapping.

## Stage f: Worker

- Scheduler, claim, fire-time checks, retry, late note, finished-series deletion, skip rules, all per the tables.
- Pass `now: Date` to every time-dependent function.

**Tests**: pass fixed `Date`s. Cover each outcome row, exactly-once under two concurrent claims, catch-up, skip, late note threshold, retry stops on edit/pause/delete.

## Stage g: Frontend

- Revive and extend the commented-out "Schedule for later" stub in `CreateRequest.jsx` (George agreed). Remove or replace the dead `postAt` remnants in `data/requests.js` and the unused `postAtLabel`.
- Recurrence picker (iOS-style): every day / week / month / year, plus custom: daily every x days; weekly every x weeks on chosen days; monthly every x months on a date or the first/second/third/fourth/fifth/last Mon–Sun, day, weekday or weekend day; yearly every x years in chosen months on the first…last weekday/day/weekday/weekend day. End: on date, after N, never. Add `rrule` to `frontend/package.json`.
- Date/time picker (none exists). completeBy picked as date+time, sent as `durationMinutes` (max 1440).
- No separate schedules page, path or nav link. Add a "Scheduled" section at the top of "My errands" (`MyErrands.jsx`), above "Active now". It lists the user's series (paused ones included; a one-time series shows until it posts) with status, rule summary and next 3 dates, and pause/resume/edit/delete actions. Pause/edit/delete show a reminder with the count of pending+open orders that stay unaffected. Orders posted from a series show a "from series" tag (from `seriesId`; it disappears once the series is deleted). George and Wen Xi have approved this section and the failed chip in `MyErrands.jsx`/`activityShared.jsx`.
- Series edit form: reuse `CreateRequest.jsx` in a series mode (same form as creating a series). It needs a route: tell me the path you propose before adding it, and it must not start with /auth, /users, /credits, /orders, /api/v1 or /socket.io (check vite.config).
- `api/series.js` mirroring `api/orders.js`; error texts for the new codes.
- Failed chip and reason in `MyErrands.jsx`/`activityShared.jsx`.

**Tests**: Vitest + RTL, `vi.useFakeTimers()` where needed; picker output → RRULE, schedules page actions, reminder text, failed chip.

---

## After the last stage

List every deviation, and every `[DECIDE]`/`[ON HOLD]` that was still open when you implemented.

# Stage 29: Auto-Redirect Instead of the Blocked-Page Message (frontend)

> **Scope**: `frontend/` only. Replaces Stage 22's blocked-page message ("This is only available
> in `<view>` mode" with switch / go-to-main-page buttons). A logged-in user who lands on a page
> that belongs only to the other view is now sent straight to the current view's main page:
> Suppliers (`/suppliers`) in requester view, Find errands (`/requests`) in courier view.
>
> No backend changes. Backlog refs: F5.2.2.
>
> **Before starting:** read the current code, not just this file. Stage 22 and Stage 28g may have
> changed since they were written. If any `[DECIDE]` placeholder remains, or anything below
> disagrees with the code, stop and ask me.
>
> **Ground rules:** the Stage 16 / Stage 22 ground rules apply (work in `frontend/` only; never
> touch `foc-mockup/`; do not modify `src/realtime/orderSocket.js`, `src/data/users.js`,
> `src/components/DemoControls.jsx` or `AI-NOTES.md`; list every file outside user-service screens
> that you touched).

### Design decisions (already made, do not change)

| Rule                          | Value                                                                                                                                                                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opening another view's page   | Redirect to the current view's main page (`/suppliers` or `/requests`). The view does NOT change. No blocked-page message, no buttons.                                                                                                                                           |
| History                       | The redirect replaces the history entry (`<Navigate replace>` / `navigate(..., { replace: true })`), so Back does not land on the other-view page and bounce again.                                                                                                              |
| Toggling the view             | If the current page is in both views, stay on it (unchanged). If it belongs only to the old view, go to the new view's main page.                                                                                                                                                |
| Toggle failure                | After the view reverts, return the user (replace, not push) to the page they were on before toggling. Only do this if they are still on the main page the toggle sent them to; if they have since navigated elsewhere, leave them there. The existing failure toast still shows. |
| Landing after login           | Unchanged: the remembered page, else `/`. If the remembered page belongs only to the other view, the redirect rule applies.                                                                                                                                                      |
| Feedback on redirect          | Toast: "You are now in `<view>` mode", where `<view>` is the current view (requester / courier). Shown on every redirect from this stage (typed URL, Back, toggle, landing after login), not on the toggle-failure return. Use the existing toast mechanism.                     |
| Page-to-view list             | Unchanged; still the single source for routes, nav and the redirect check. Any page not in it (including the series edit route from Stage 28g, if it exists) → stop and ask me.                                                                                                  |
| Logged-out visitors           | Unchanged: `RequireAuth` sends them to `/login`. The redirect check runs only when `AuthContext` status is `authenticated`.                                                                                                                                                      |
| Blocked-page component        | Removed. Delete it and anything only it uses (styles, tests, the "only available in … mode" strings).                                                                                                                                                                            |
| Everything else from Stage 22 | Unchanged (nav per view, `/` redirect, My errands / My deliveries split, Find errands empty state, chat back arrow).                                                                                                                                                             |

### Watch for

- No redirect while session restore is `loading`; otherwise a courier reloading `/requests` gets bounced to `/suppliers`.
- No redirect loop: each main page must belong to its own view in the page-to-view list.
- The chat back arrow uses history; going back to an other-view page must redirect, not show a blank or blocked page.

---

## Changes to already-implemented code

| #   | File                                                               | Change                                                                                                                 |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | The Stage 22 view guard (wherever the blocked-page check lives)    | Render a replace-redirect to the current view's main page instead of the blocked-page message                          |
| 2   | Blocked-page component and its styles                              | Delete                                                                                                                 |
| 3   | Stage 22 tests that assert the blocked-page message or its buttons | Rewrite to assert the redirect. Do not change other assertions. If a test fails for another reason, stop and report it |

---

## Stage 29a: Implementation

Implement the decisions above exactly as written. Do not choose behaviour for any case they do not cover. Ask instead.

### Verification

- Requester view, open `/requests`, `/my-deliveries` (typed URL) → lands on `/suppliers` with the "requester mode" toast; view still requester
- Courier view, open `/suppliers`, `/suppliers/:id`, `/requests/new`, `/requests/:id/edit`, `/my-errands` → lands on `/requests`; view still courier
- After a redirect, Back does not return to the other-view page (no bounce loop)
- Toggle on a page in both views (Chat, Credits, Account, admin pages) → stays on that page
- Toggle on a requester-only page → lands on `/requests`; toggle on a courier-only page → lands on `/suppliers`
- Toggle failure (user-service stopped) on a requester-only page → view reverts, failure toast shown, user is back on the original page, nav matches the reverted view
- Toggle failure after the user has already moved off the redirected main page → view reverts, user stays where they are
- Every redirect shows the toast "You are now in requester mode" / "You are now in courier mode" matching the current view; the toggle-failure return shows only the failure toast
- Logged out on a courier-only page, log in with a saved requester view → lands on `/suppliers`
- Reload on a page of the current view → stays there, no flash of the other main page
- Logged out → every protected page still goes to `/login`; no redirect to a main page before login
- Chat opened from My errands in requester view, toggle to courier, press back arrow → lands on `/requests`
- No "only available in … mode" text anywhere; the blocked-page component is gone and nothing imports it
- No files under `user-service/` changed

### Tests (Vitest)

Follow the Stage 7 ground rules and the existing frontend test setup. Every Verification bullet above that does not need a real browser is a required test case. Do not modify application code to make a test pass.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry for this stage.

### Notes for later (do not implement now)

- **Notifications** (carried from Stage 22): a notification linking to a page in the other view will now bounce to the current main page. Decide whether such links should switch the view first.

### Backlog edit (for the team to make in `docs/FoC-ProductBacklog.md`)

- **F5.2.2**: TODO (team): wording now that other-view pages redirect to the current view's main page.

# Stage 30: Email Unmask on the Admin User Page (NFR3.1.1, F5.3.2)

> **Scope**: Frontend only (`frontend/`). The profile section of `/admin/user-transactions/:userId`
> (Stage 24) gets the same eye-icon unmask as the email cell on `/admin/users` (Stage 20b, as
> amended by Stage 26e). No user-service changes: `POST /users/:id/full-email` and its
> `EMAIL_UNMASK` audit row already exist.
>
> Backlog refs: NFR3.1.1, NFR3.1.2, NFR3.1.3, F5.3.2. This replaces the Stage 24 rule that the
> profile email is shown masked with no way to unmask it.
>
> **Before starting:** read the current code, not just this file. If anything below disagrees with the code, stop and ask me.
>
> **Ground rules:** same as Stage 24 (Stage 16 frontend rules: `frontend/` only, never
> `foc-mockup/`; do not modify `src/realtime/orderSocket.js`, `src/data/users.js`,
> `src/components/DemoControls.jsx` or `AI-NOTES.md`; reuse existing components; no new
> libraries). List every file you touched outside this page's own files.
>
> **Verify first (report only, do not change anything):**
>
> 1. How `AdminUsers.jsx` implements the eye icon today: where the unmasked value, the 60 s timer and the re-mask-on-refetch logic live, and which API function it calls.
> 2. Whether the user page's profile email comes from `GET /users/:id` (masked by the backend) and every place the page replaces the profile object (initial load, retry, action response, stale-state refetch).

### Design decisions (already made, do not change)

| Rule                    | Value                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Behaviour               | Same as `/admin/users` today (Stage 20b + Stage 26e amendment). Nothing about the unmask protocol changes.                                        |
| Where                   | The email field in the profile section of the user page only. The order page has no email and gets nothing.                                       |
| Request                 | Each unmasking click calls `POST /users/:id/full-email` with no body, no dialog and no reason, through the same API function `/admin/users` uses  |
| Elevation               | None (Stage 27: unmask needs no elevation)                                                                                                        |
| Audit                   | Backend only, unchanged: one `EMAIL_UNMASK` row per successful unmask                                                                             |
| Eye icon hidden         | When the viewed user is the caller (compare with `AuthContext.user.id`) or has `role === 'super admin'`                                           |
| Re-masking              | Click the eye again, or 60 s after unmasking, whichever comes first. No request. Timer cleared on re-mask and on unmount.                         |
| Re-mask on profile load | Any time the page replaces the profile object (retry, an action's response, a stale-state refetch) the email re-masks and the timer is cleared    |
| Failure                 | Toast via `errorMessages.js`; the email stays masked                                                                                              |
| Touch / small screens   | The icon is always visible, not hover-only                                                                                                        |
| Shared code             | Both pages use one shared implementation, extracted from the existing `AdminUsers.jsx` logic. Behaviour on `/admin/users` stays exactly as it is. |

### Changes to already-implemented code

| #   | File                                               | Change                                                       |
| --- | -------------------------------------------------- | ------------------------------------------------------------ |
| 1   | The Stage 24 user page component (profile section) | Eye icon beside the email, per the table above               |
| 2   | `frontend/src/pages/AdminUsers.jsx`                | Switch to the shared code, behaviour unchanged               |
| 3   | Existing `AdminUsers` unmask tests                 | Must still pass unchanged. If one fails, stop and report it. |

### Verification

- Eye icon shown on another user's page, including pending, suspended and admin users
- No eye icon on the caller's own page or on the super admin's page
- Click → full email shown and the icon switches to "hide"; click again → masked, no request
- 60 s after unmasking → masked, no request
- Network tab: each unmasking click sends one `POST /users/:id/full-email` with no body; re-masking sends nothing
- One `EMAIL_UNMASK` audit row per unmask, visible at `/admin/logs`
- No dialog, reason picker or OTP modal appears, whether or not the admin is elevated
- Unmask, then suspend/unsuspend or promote/demote the user → the profile updates and the email is masked again
- Unmask, then open an order and come back → masked
- Stop user-service, click the eye → toast, still masked
- The orders section, filters, pagination and action buttons behave as before
- `/admin/users` unmask behaviour is unchanged
- Phone-width viewport: the icon is visible and tappable

### Tests (Vitest)

Use the existing Vitest + `@testing-library/react`, `jest-dom` and `user-event` setup, with the API function mocked and fake timers for the 60 s case. Every Verification bullet that doesn't need a running backend or a real browser is a required test case. Do not modify application code to make a test pass. List the visual and phone-width checks in your summary for manual verification.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry for this stage.

### Backlog edit (for the team to make in `docs/FoC-ProductBacklog.md`)

- **NFR3.1.2:** the per-email eye-icon unmask is available on both `/admin/users` and the admin user page.
- **F5.3.2:** the profile email is masked by default and can be unmasked as in NFR3.1.2.

# Stage 31: Lockout Unlock Email (NFR1.1.1)

> **Scope**: `user-service`, `frontend`, and the proxy entries for any new frontend or backend path
> (`frontend/vite.config.js`, `frontend/nginx/default.conf`, as in Stages 26 and 27). When an account
> is locked by the Stage 18 login lockout, the user is emailed a link. The link opens a frontend
> page with a button. Pressing the button clears the lock.
>
> - 31a: config and unlock-token utilities
> - 31b: the email, the retry reuse, and sending it on every login lock
> - 31c: the unlock-by-link endpoint
> - 31d: frontend page
> - 31e: tests
>
> Backlog refs: NFR1.1.1. This supersedes the "deferred" note in Stage 18.
>
> **Before starting:** read the current code, not just this file. If any `[DECIDE]` placeholder
> remains, or anything below disagrees with the code, stop and ask me. Do not pick a value
> yourself. Implement one sub-stage at a time and wait for my confirmation before the next.
>
> **Ground rules:** conventions 1-8 at the top of this file and the Stage 4d lock-order rule apply.
> The Stage 16 frontend ground rules apply to 31d (work in `frontend/` only; never touch
> `foc-mockup/`; do not modify `src/realtime/orderSocket.js`, `src/data/users.js`,
> `src/components/DemoControls.jsx` or `AI-NOTES.md`; reuse existing components,
> `errorMessages.js`, banners and toasts; no new libraries; list every file touched outside the
> changes table).

### Design decisions (already made, do not change)

#### When the email is sent

| Rule                  | Value                                                                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger               | Every Stage 18 **login** lock: the 1 h, the 4 h and the 24 h lock. A lock set from `POST /auth/login`, `PUT /users/me/email` or `PUT /users/me/password` (they share one counter) sends the email.                            |
| Not a trigger         | OTP send blocks (Stage 18). Only the login lock sends an email.                                                                                                                                                               |
| Pending and suspended | No email is sent if the account is `pending` or `suspended` when the email would be sent.                                                                                                                                     |
| Exactly once per lock | One lock sends one email. N concurrent failures that produce one lock send one email. Requests rejected during a lock do not send one.                                                                                        |
| Sent to               | The account's registered email                                                                                                                                                                                                |
| After commit          | The email is sent only after the transaction that sets the lock has committed. A failed send never rolls back the lock.                                                                                                       |
| Failure               | If every attempt fails, the failure is logged and nothing else happens. The lock stands. The caller still gets `429 ACCOUNT_LOCKED` as in Stage 18.                                                                           |
| Retries and timeline  | Exactly the Stage 19 configuration: same attempt count, same transient/non-transient error rules, same backoff, same per-attempt timeout, same overall deadline, same handling of abandoned sends, same dev console fallback. |
| Reuse                 | Reuse the Stage 19 retry mechanism. Do not copy the loop. `sendOtpEmail` keeps its contract. Tell me how you shared it.                                                                                                       |
| Logging               | Console only, in the Stage 19 log line format. How the unlock email is told apart from the OTP purposes in that line: `[DECIDE]`.                                                                                             |
| Request latency       | Whether the login/password request waits for the send (up to the Stage 19 deadline) or the send runs in the background after the commit: `[DECIDE]`.                                                                          |
| Email content         | Subject, wording, and whether it states the lock length: `[DECIDE]`. It contains the unlock link. It never contains an OTP, the password or a password hint.                                                                  |

#### The unlock link and token

| Rule                    | Value                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token                   | A signed JWT. RS256, same key and `kid` handling as the access token. Its own JWT header `typ`, so it cannot be used as an access token or an elevation token, and those cannot be used as an unlock token. The `typ` value: `[DECIDE]`.                                                                                                 |
| Claims                  | `sub`, `iat`, `exp`, plus a claim binding the token to one specific lock. Which claim and which lock value it holds: `[DECIDE]` (candidate discussed: the lock's end time, `login_locked_until`).                                                                                                                                        |
| Lifetime                | 1 hour. Fixed constant or env var with bounds: `[DECIDE]`.                                                                                                                                                                                                                                                                               |
| Binding to the lock     | The token works only while the lock it was issued for is still the account's current lock. It stops working once that lock is cleared (admin unlock, successful login, correct current password on `PUT /users/me/email` or `PUT /users/me/password`, or an earlier use of the link), has expired, or has been replaced by a newer lock. |
| Single use              | Following from the binding: after the link clears the lock, the same link no longer does anything.                                                                                                                                                                                                                                       |
| Link                    | `FRONTEND_BASE_URL` + a frontend path, with the token in it. Path and query parameter name: `[DECIDE]`.                                                                                                                                                                                                                                  |
| Opening the link        | Opens a frontend page with a button. Opening the page (a GET) changes nothing. Only pressing the button calls the backend, with a POST.                                                                                                                                                                                                  |
| Backend endpoint        | Public (no `authenticate`). Zod `.strict()`, `asyncHandler`. Method and path: `POST` + `[DECIDE]`. Body carries the token.                                                                                                                                                                                                               |
| What a valid click does | The same effect as the admin unlock: clears the login lock **and** resets the login escalation, and clears OTP send blocks and their escalation for all three purposes. Share the code with the admin unlock; do not duplicate it.                                                                                                       |
| Locking                 | Follow conventions 2-3: `withTransaction`, `SELECT ... FOR UPDATE` on the user row, `client` on every query, re-check the locked row after the lock is granted. Use one conditional update. Concurrent clicks produce one unlock.                                                                                                        |
| Link used after expiry  | If the lock has already ended or been cleared (the token no longer matches the account's current lock): the frontend goes straight to `/login`. What the page shows on the way (nothing, or a message): `[DECIDE]`.                                                                                                                      |
| Other bad tokens        | Malformed, bad signature, wrong `typ`, expired by `exp` (older than 1 hour): `[DECIDE]` for the error code, the HTTP status and what the frontend does.                                                                                                                                                                                  |
| Suspended at click time | Suspended or pending when the button is pressed: `[DECIDE]`.                                                                                                                                                                                                                                                                             |
| Audit                   | None. No audit row for a self-unlock via the link (the Stage 26 table is for admin actions). Admin unlock is unchanged.                                                                                                                                                                                                                  |
| Rate limit              | None.                                                                                                                                                                                                                                                                                                                                    |

#### Config

New env var, added to `config.ts`'s Zod schema and to `.env.example`, `.env` and `.env.test`:

- `FRONTEND_BASE_URL` (dev value `http://localhost:5173`)
- the token lifetime variable, only if the lifetime decision above is "env var"

Check whether `FRONTEND_BASE_URL` can also be what the Stage 4a CORS origin uses. Report only, do not change the CORS setup.

---

## Changes to already-implemented code

| #   | File                                                                                                                        | Change                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/config.ts`, `.env*`                                                                                                    | Add the new env var(s).                                                                                                                                                |
| 2   | `src/services/email.service.ts`                                                                                             | Add the unlock-email template and send function. Share the Stage 19 retry mechanism. `sendOtpEmail` contract unchanged.                                                |
| 3   | The Stage 13 signing/verification code                                                                                      | Add signing and verification of the unlock token, with its own `typ`. `verifyAccessToken` and the elevation verifier must reject it.                                   |
| 4   | `src/services/auth.service.ts` (`login`) and `src/services/me.service.ts` (`initiateEmailChange`, `initiatePasswordChange`) | After the commit that sets a login lock, send the email (rules above).                                                                                                 |
| 5   | `src/services/users.service.ts` (admin unlock)                                                                              | Move the clearing logic into a shared function used by the admin unlock and the new endpoint. Admin unlock behaviour and responses unchanged.                          |
| 6   | `src/routes/auth.routes.ts`, `src/controllers/auth.controller.ts`, `src/services/auth.service.ts`                           | Add the public unlock-by-link endpoint (or the files the `[DECIDE]` path puts it in).                                                                                  |
| 7   | `frontend/src/api/auth.js` (or the API module `login` is in), `frontend/src/api/errorMessages.js`                           | Add the unlock call and error text for the new error codes.                                                                                                            |
| 8   | `frontend/src/App.jsx` (routes), new page file                                                                              | Add the unlock page. It is reachable logged out and logged in.                                                                                                         |
| 9   | `frontend/vite.config.js`, `frontend/nginx/default.conf`                                                                    | One exact entry per new path that needs it, as in Stages 26 and 27. Do not add a whole prefix.                                                                         |
| 10  | Existing tests                                                                                                              | Stage 18 tests that assert on login-lock behaviour must still pass unchanged, with the email mocked per the Stage 19 mocking policy. If one fails, stop and report it. |

---

## Stage 31a: Config and unlock-token utilities

Rows 1 and 3.

### Verification

- App starts with the new env var(s) set; exits with a clear error naming the variable if `FRONTEND_BASE_URL` is missing or not a valid URL
- A signed unlock token verifies with the unlock verifier
- An access token, an elevation token and a plain `JWT` are rejected by the unlock verifier
- An unlock token is rejected by `verifyAccessToken` and the elevation verifier
- A token past its `exp`, and a token with a bad signature, are rejected

---

## Stage 31b: The email and sending it on every login lock

Rows 2 and 4.

### Verification

- 5 wrong logins (Stage 18 threshold) → one email to the registered address with a link built from `FRONTEND_BASE_URL`
- The 2nd lock (4 h) and the 3rd lock (24 h) each send their own email
- Wrong passwords on `PUT /users/me/email` and `PUT /users/me/password` that cause a lock send one email
- A lock caused by OTP send blocks sends nothing
- Attempts during a lock send nothing and do not extend the lock
- A `pending` or `suspended` account sends nothing
- N concurrent failures at the threshold → one lock and one email
- The email fails on every attempt → the failure is logged, the lock stands, the response is still `429 ACCOUNT_LOCKED`
- Transient and non-transient failures follow the Stage 19 rules, with the Stage 19 backoff and deadline
- Development console fallback behaves as in Stage 19
- The email contains no OTP and no password information
- The OTP email flows still behave exactly as in Stage 19

---

## Stage 31c: Unlock-by-link endpoint

Rows 5 and 6.

### Verification

- A valid token for a currently locked account → the lock, the login escalation, and the OTP send blocks and escalations (all three purposes) are cleared; the user can log in
- The same token used a second time does nothing further and gets the "lock already ended" outcome
- A token for an earlier lock after a newer lock was set → does not unlock the newer lock
- A token after an admin unlock, after a successful login, or after a correct current password on `PUT /users/me/email` / `PUT /users/me/password` → does nothing
- A token for a lock that has expired by time → the "lock already ended" outcome
- Malformed token, bad signature, wrong `typ`, token older than 1 hour → the `[DECIDE]` outcome
- A pending or suspended account → the `[DECIDE]` outcome
- A locked super admin can unlock via the link
- No audit row is written
- Concurrent clicks with the same token → one effective unlock, no error beyond the normal "already ended" outcome
- Admin `POST /users/:id/unlock` behaves exactly as in Stage 18

---

## Stage 31d: Frontend page

Rows 7-9.

- A page opened from the link. It reads the token from the URL, shows an explanation and one button. Opening the page sends no request.
- Pressing the button calls the unlock endpoint with the token.
- Success: goes to `/login` with the existing toast style. Text: `[DECIDE]`.
- "Lock already ended" outcome: goes straight to `/login`.
- Other outcomes: per the `[DECIDE]` entries above.
- Works when logged out (the main case) and when logged in. It is not in the Stage 22 page-to-view list; if it has to be, stop and ask me.
- The button is disabled while the request is in flight.

### Verification

- Open the link → page shows with the button; the network tab shows no request until the button is pressed
- Press the button on a valid link → one `POST`, then `/login`; logging in with the correct password works
- Press it on a stale link → goes straight to `/login`
- Double-click the button → one request
- Malformed or missing token in the URL → the `[DECIDE]` behaviour
- Phone-width viewport: the page and button are usable

---

## Stage 31e: Tests (Vitest)

Follow the Stage 7 ground rules and the Stage 19 mocking policy for the email transport: real Postgres, tests under `tests/` mirroring `src/`, concurrency tests in `tests/concurrency/`. Simulate elapsed time by backdating timestamp columns, as in earlier stages. Every Verification bullet in 31a-31d that does not need Docker or a real browser is a required test case. For the frontend, use the existing Vitest + `@testing-library/react` setup with the API function mocked. List the phone-width and real-browser checks in your summary for manual verification. Do not modify application code to make a test pass.

### AI logging

Same as earlier stages: header comment on every file created or modified, and a usage-log entry per sub-stage.

### Backlog edit (for the team to make in `docs/FoC-ProductBacklog.md`)

- **NFR1.1.1:** reword to: when an account is locked by the login lockout, the system emails the registered address a link, valid for 1 hour and tied to that lock, that opens a page where the user can press a button to clear the lock and its escalation (and any OTP send blocks). Sent for every login lock; not for OTP send blocks; not for pending or suspended accounts. Failed sends are retried as for OTP emails and then logged.
- Remove the "deferred" note on NFR1.1.1 added for Stage 18.

# Stage 32: Schedule Option on the Errand Form (frontend)

> Read and implement this stage only. If any `[DECIDE]` remains in this file, stop and ask me. Do not pick a value yourself.

## AI Usage Logging

After the stage, generate the usage-log entry and add the AI disclosure header to every file you create or modify, in the same format as Stages 1–31.

## Ground rules

1. Read the current code first, not just this file. Where they disagree, follow the code and tell me.
2. Frontend only. Do not change order-service, user-service or supplier-service, the series API (`/orders/series*`), its request or response shapes, or the worker. If something here needs a backend change, stop and report it.
3. Follow existing conventions in `frontend/` (React 18 JSX, existing form components, Vitest + Testing Library).
4. Write tests in this stage.
5. When done, list every deviation from this file and every `[DECIDE]` that was still open.

## The problem

Recurring and delayed errands can only be created from a separate page, reached from the "New" button in the Scheduled section of My errands. The normal errand form (`/requests/new`) has no way to schedule.

## Step 1: Read and report (no code changes)

Report before editing:

- What the "New" button in the Scheduled section opens today (route and component).
- How the current series create form is built and what it shares with `CreateRequest.jsx`.
- How the series edit form is reached today (route, component).
- Which fields the normal form collects versus what `POST /orders/series` needs (`durationMinutes`, `startAt` / `startNow`, `rrule`).
- Where the recurrence picker, date/time picker and `rrule` helpers live.
- Whether `PATCH /orders/series/:seriesId/edit` accepts a change to the posting start time, and what it does to the next fire. If it doesn't, stop and tell me.

## Step 2: Implement (decided)

### Form layout

All errands use the one form. Keep the existing sections and add the following, in this order:

```
1. WHEN SHOULD THIS ORDER BE SENT?
   ( ) Send Now      ( ) Send Later (Schedule)
                         └─ Select date & time

2. WHEN DO YOU NEED IT BY?          (existing section, kept)
   ( ) ASAP          ( ) By a specific time
                         └─ Select target time

3. RECURRENCE
   [ ] Repeat this errand
        └─ recurrence picker + end condition (expands inline when ticked)
```

- Default: Send Now, and Repeat unticked.
- Send Later expands the date/time picker inline. Ticking Repeat expands the recurrence picker and end condition inline.
- The end condition "after N occurrences" shows the word "times" after the number (e.g. "After [ 5 ] times").
- Reuse the existing recurrence picker, date/time picker and series API module. Do not duplicate them.

### Complete-by

- Keep the current "When do you need it by?" behaviour. The user picks a complete-by time, and the frontend computes `durationMinutes` from it relative to the scheduled start time (Send Later) or the post time (Send Now). That duration is used for every later occurrence.
- Keep the existing limits (duration max 1440 minutes, complete-by must be after the start).

### What gets submitted

(Derived from the Stage 28 spec: a one-time errand is a series with `COUNT=1`.)

- Send Now, Repeat unticked → normal order, existing create call.
- Send Later, Repeat unticked → series with `COUNT=1` and `startAt`.
- Send Now, Repeat ticked → series with `startNow: true` and the chosen rule.
- Send Later, Repeat ticked → series with `startAt` and the chosen rule.

### Text and buttons

- The remark "N credits will be reserved until this errand is completed or cancelled" and the "After posting, you'll have X of Y credits available" hint show only when Send Now is selected. They are hidden when Send Later is selected.
- Submit button: "Post errand" for Send Now with no repeat, "Schedule errand" otherwise.

### After submit

- On success, go to My errands.

### Removing the old page

- Remove the "New" button from the Scheduled section.
- Delete the old separate series create page, its route and any components only it used. Leave no dead routes or imports.

### Editing a series

- Keep the existing edit route and form.
- The edit form must also allow changing when the errand posts (the start date and time), not just the other fields. Same field layout as the create form.

## Decisions

- ASAP together with Send Later: ASAP is hidden when Send Later is selected. Only "By a specific time" is available; the user must pick a complete-by time.
- Send Now with Repeat ticked: show the credits remark and hint, same as any other Send Now submission, since the first occurrence posts immediately and reserves credits now.

## Tests

- Send Now, no repeat: normal order call, no series call.
- Each of the other three combinations sends the series request with the expected `startNow` / `startAt`, `rrule` (including `COUNT=1` for one-time) and `durationMinutes`.
- Duration is computed from the complete-by and the start time; validation errors for complete-by before start and over 24 h.
- Send Later expands the date/time picker; Repeat expands the recurrence picker; "times" label on the after-N end condition.
- Credits remark and hint show only for Send Now; submit button label per combination.
- After a successful submit, lands on My errands.
- Edit form can change the posting start time.
- Update or remove any tests that referenced the old button, page or route.

## Verification

- Normal errand posting is unchanged.
- A delayed errand and a recurring errand can both be created from the form and appear in the Scheduled section of My errands.
- The "New" button and the old page are gone.
- Phone-width viewport works.
