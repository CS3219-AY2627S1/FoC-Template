# User Service instructions

## Stack and ownership

- Implement User Service with Python 3.13, FastAPI, Pydantic v2, SQLAlchemy async, and `asyncpg`. Use FastAPI dependencies for authentication, current-session checks, ownership checks, and role checks.
- User Service owns FoC registration, OTP verification, bcrypt password hashes, RS256 JWT issuance/validation, rotating refresh tokens, profiles, User/Admin/Super Admin roles, audit records, and `user.registered.v1` outbox events.
- Requester and courier are participation capabilities on one immutable user ID, not separate accounts or privileged system roles.

## Supabase PostgreSQL

- Supabase is managed PostgreSQL only. Do not use Supabase Auth, Supabase Data API, `supabase-js`, or browser-to-Supabase access.
- Keep User Service tables in the `user_service` schema. The FastAPI application role must have only the required privileges for that schema.
- `supabase/migrations/` is the canonical schema history. Create migrations with `npx supabase migration new <description>`, validate them with `npx supabase db reset`, and commit them. Do not add another migration framework or run schema changes at FastAPI startup.
- Local development starts the stack with `npx supabase start`; the local project links to cloud project `foc-user-service`. Supabase GitHub integration uses repository `AY2627-CS3219-P6/foc` and working directory `user-service`.

## Secrets and external integration

- Keep `.env` and `secrets/` local and ignored. `scripts/generate_dev_secrets.py` creates non-production RSA keys plus OTP and internal-service secrets without printing values. Never overwrite generated secrets unless the user explicitly requests it.
- The User Service private RSA key stays in User Service. Other services receive only a public JWKS key. Never log, return, or publish passwords, password hashes, OTPs, refresh tokens, private keys, database credentials, or Supabase keys.
- Supplier Service verifies ordinary JWTs with JWKS and calls the narrow internal authorization-decision endpoint for every supplier-management action. That endpoint fails closed.

## Verification

- Add pytest unit/integration coverage for validation, authentication, session rotation, protected profile fields, RBAC, last-Super-Admin concurrency protection, audit immutability, and outbox idempotency.
- Before handoff, run the relevant tests plus `npx supabase db reset`; verify migrations can reconstruct a clean local database.

## Phase review, commits, and pull requests

- Implement one PLAN.md phase at a time. Pause for the user's review and
  approval before committing that phase; do not combine phases in one commit or
  pull request.
- Every phase commit message and pull-request body must use point form: first
  list what the change implements, then end with a separate point-form
  FR/NFR coverage list that identifies only the requirements the phase actually
  satisfies or advances.
- When a later phase depends on an unmerged earlier phase, create a stacked
  branch from the earlier phase branch and open its pull request against that
  phase branch. Retarget it to main only after the earlier pull request merges.
