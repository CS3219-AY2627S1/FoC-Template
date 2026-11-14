<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
Scope: Generated this guide documenting the existing, already-decided local setup steps for
       user-service (env_file pattern from instructions.md Stage 3b/3c, SUPER_ADMIN_PASSWORD/
       CREDIT_SERVICE_URL requirements from src/config.ts, RS256 keypair requirement from
       Stage 2). No requirements, architecture, schema, or API decisions were made by the AI
       tool — this restates decisions already recorded in instructions.md and src/config.ts.
Author review:
Scope (2026-10-22): Merged in the former jwks-verification-guide.md (originally authored
       2026-10-17 per instructions.md Stage 13d) as Part 2, at the user's request, so both
       user-service docs live in one file. Content unchanged beyond heading levels and
       cross-references; no requirements, architecture, schema, or API decisions were made.
Author review:
Scope (2026-11-04): Stage 17 - replaced Part 1's manual steps 1-3 (copy .env, set
       SUPER_ADMIN_PASSWORD, openssl keypair) with `npm run setup`, which now does all three.
       Renumbered the remaining steps. No requirements, architecture, schema, or API decisions
       were made by the AI tool — see instructions.md Stage 17 for the governing decision.
Author review:
-->

# `user-service` Developer Guide

Two unrelated things, kept in one file: **Part 1** is what you need to get `user-service`
running on a fresh checkout. **Part 2** is the published contract other services (order,
supplier, credit) implement against to verify `user-service`'s access tokens — read that part
only if you're implementing auth in one of those services.

## Part 1: Local setup

This is what a fresh checkout needs before `user-service` will start, whether you run it via
`docker compose up --build` or directly on the host. None of this is loaded from
`compose.yaml` — `user-service` loads all its config from `user-service/.env`
(`env_file: ./user-service/.env`, per instructions.md Stage 3b), and that file is gitignored,
so every developer sets up their own copy.

### 1. Run the setup script

```bash
cd user-service && npm install && npm run setup
```

This does everything the old manual steps did, in one pass: copies `.env.example` to `.env`
if you don't have one yet, generates a `SUPER_ADMIN_PASSWORD` meeting the complexity check in
[`bootstrap.service.ts`](../src/services/bootstrap.service.ts) and prints it once, and
generates the RS256 keypair into `user-service/keys/` (`JWT_PRIVATE_KEY_PATH`/
`JWT_PUBLIC_KEY_PATH` in `.env.example` already point there). None of this is shared with
teammates — your `.env` and `keys/` are gitignored, and your `user-db` is your own
container/volume, so there's nothing to keep in sync.

It's safe to re-run: an existing `.env`, password, or keypair is left untouched. Pass
`npm run setup -- --force` to regenerate the RS256 keypair and `JWT_KEY_ID` (for example,
after a suspected key leak) — this does not touch `SUPER_ADMIN_PASSWORD` or any other `.env`
value. After `--force`, tokens signed with the old key stop verifying, so restart any other
locally running services (credit, supplier) that cache this service's JWKS.

### 2. Everything else

- **SMTP vars** (`SMTP_HOST`/`USER`/`PASS`/`FROM`): can stay blank — `src/config.ts` only
  requires them when `NODE_ENV` isn't `development`. Emails are logged instead of sent.
- **`TEST_USER_*`**: optional; only seeds a test user if all three (`USERNAME`/`EMAIL`/`PASSWORD`)
  are set.

### 3. Start the stack

```bash
docker compose up --build
```

If `user-service` still crashes on startup with a Zod validation error naming a specific env
var, your local `.env` is most likely missing that var or out of date — diff it against
`.env.example` and copy over what's missing.

## Part 2: Verifying `user-service` access tokens via JWKS

This is for whoever implements token verification in **order-service**, **supplier-service**,
and **credit-service**. It describes what `user-service` publishes and how to check a token
against it. It is not code for your service — you write and own that yourself.

### What changed

`user-service` no longer answers a per-request `GET /auth/verify` call. It now publishes its
public signing key(s) at a JWKS endpoint; your service fetches them and verifies tokens itself,
locally, without calling `user-service` on every request.

If your service currently calls `GET /auth/verify` (today, only `supplier-service` does, in
`supplier-service/src/middleware/authenticate.ts`), that endpoint is gone — it now returns
`404`. That middleware has to be rewritten using this guide. `order-service` and
`credit-service` have no auth middleware yet; this is where you add it.

### The endpoint

```
GET {USER_SERVICE_BASE_URL}/auth/.well-known/jwks.json
```

- No `Authorization` header needed — it's public, by design (you need it before you can verify
  anything).
- Returns `200` with a standard JWKS body (RFC 7517):

```json
{
  "keys": [{ "kty": "RSA", "use": "sig", "alg": "RS256", "kid": "2026-10", "n": "...", "e": "..." }]
}
```

- **Don't assume exactly one key.** `user-service` rotates its signing key roughly every 3
  months, and during a rotation overlap window the JWKS lists both the current and the
  previous key, each under its own `kid`. A token signed before the rotation is still valid
  and still verifiable — just against the other entry.

### Verifying a token

1. Read the `Authorization: Bearer <token>` header. Missing or non-`Bearer` → reject.
2. Decode the token's **header** (not the payload yet) to read its `kid`. Every token
   `user-service` issues carries one.
3. Look up that `kid` in your cached JWKS keys.
   - **Cache the JWKS response** — don't fetch it on every request.
   - If the `kid` isn't in your cache, refetch the JWKS once (it may have just rotated) before
     rejecting. If it's still not there after a refetch, the token is invalid.
4. Verify the token's signature with `RS256` **only** — pin the algorithm yourself; never trust
   the token's own `alg` header to decide how to verify it.
5. On a valid signature, the claims you need are the same two `GET /auth/verify` used to
   return: `sub` (the user id) and `role`.
6. Anything that fails — missing header, unknown `kid` after a refetch, bad signature, expired
   token — gets rejected the same way (your service's own `401` shape; `user-service`'s own
   `authenticate` middleware uses `{ message: 'Unauthorized', code: 'UNAUTHORIZED' }`, if you
   want to match it, but that's your call).

### Library choice

This isn't prescribed — it's your service's own implementation detail to decide, same as any
other dependency choice. None of the three services currently depend on a JWT/JWKS library.
Two common shapes for this, for reference:

- `jsonwebtoken` (verify) + `jwks-rsa` (fetch/cache JWKS by `kid`) — widely used together.
- `jose` — handles both JWKS fetching/caching and verification in one library, works the same
  way in and outside Node.

Either way, the steps above (cache, look up by `kid`, refetch once on a miss, verify, read
`sub`/`role`) are what matters — the library is just how you do it.
