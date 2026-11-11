<!--
AI Assistance Disclosure
Tool: OpenAI Codex (GPT-5.6 Luna, GPT-5.6 Sol, GPT-6 Sol and GPT-6.1 Sol), 2026-09-25 to 2026-11-11.
Scope: Documentation wording under author-finalized User Service requirements and architecture.
Author review: Josh Wang Kai Kiat validated correctness, edited where needed, and verified behavior/tests.
-->
# User Service

Friends on Campus account management: signup, email/Telegram verification, sessions, passwords, profiles, deletion, friendships and Admin integration.

Built with Node.js 20, Express, TypeScript, PostgreSQL and Prisma. AWS SES sends account emails; Telegram delivers verification codes; Kafka carries account events.

## Start locally

From the repository root, open PowerShell and run:

```powershell
cd user-service
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d --build
```

Docker Desktop must be running. Compose applies existing migrations, starts PostgreSQL and runs the API with live reload.

| Address | Purpose |
| --- | --- |
| `http://localhost:8080/api-docs` | Swagger: view and try endpoints |
| `http://localhost:8080/api-docs.json` | OpenAPI JSON |
| `http://localhost:8080/health` | Service health |
| `localhost:5554` | PostgreSQL from the host; containers use `db:5432` |

The API binds to `127.0.0.1:8080`. To inspect or stop the local service:

```powershell
docker compose logs -f user-service
docker compose stop
```

For a host Node.js run, keep only PostgreSQL in Docker. Run these commands from `user-service`:

```powershell
docker compose up -d db
npm ci
npm run prisma:generate
npx prisma migrate deploy
npm run dev
```

Use the host `DATABASE_URL` in `.env.example`. Stop the Compose API before starting a host copy on port 8080.

## Configuration

[.env.example](.env.example) lists settings and defaults. Keep real credentials in the ignored `.env`; deployments supply their own environment and secrets.

| Settings | Purpose |
| --- | --- |
| `DATABASE_URL`, `PORT` | Database connection and API port |
| `OTP_SECRET` | OTP signing secret; set a strong value outside local development |
| `ALLOWED_EMAIL_DOMAINS` | Signup domains; defaults to `u.nus.edu,nus.edu.sg` |
| `EMAIL_PROVIDER` | `development` logs messages, `ses` sends emails, `disabled` prevents sending |
| `SES_FROM_EMAIL`, `AWS_REGION` | Verified sender and matching SES region |
| `FRONTEND_BASE_URL` | Frontend origin used in recovery links |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | Real verification bot credentials |
| `TELEGRAM_POLLING_ENABLED` | Enable polling on exactly one process per bot |
| `KAFKA_BROKERS` | Enable event delivery; empty leaves events queued in PostgreSQL |
| `ADMIN_SERVICE_BASE_URL` | Private Admin origin; host example `http://localhost:8084` |
| `APP_ENV`, `ENABLE_TEST_VERIFICATION` | Explicit non-production verification override; default off |

**Email:** SES uses the AWS SDK credential chain. Host runs can use an approved AWS profile; local containers can use temporary credentials in `.env`. Deployments should use a workload role. The principal needs `ses:SendEmail` for the sender identity. In the SES sandbox, verify both sender and demo recipients in the same account/region. The sender address is separate from the allowed signup domains.

Development email logging is allowed only in `NODE_ENV=development/test`; production must use SES or disabled delivery. SES logs omit message contents and credentials. Email sends are synchronous and have no durable queue: a failed send may require a resend, and retries can duplicate a message. Signup can save an unverified account before delivery fails; use resend-verification after fixing delivery. SES acceptance does not guarantee inbox delivery.

**Telegram:** one process may poll a bot. Use a separate bot per environment or disable polling on additional copies. Without bot credentials, the development logger is available only in `NODE_ENV=development`; real environments require a bot. Opening Telegram alone does not complete verification: submit the received OTP in the app.

## API and behavior

Use [Swagger](http://localhost:8080/api-docs) for request schemas and errors, or the concise [API contract reference](API_CONTRACT_UPDATES.txt) when updating the shared team document. In Swagger, log in and paste the returned token into **Authorize**.

- Tokens are opaque bearer sessions, not JWTs. Only their hashes are stored. Passwords use salted `scrypt` hashes.
- Accounts are `Created`, `Verified` or `Suspended`. Both email and Telegram verification are required for `Verified`; admin role and login lockout are separate fields.
- A correct password on a suspended account returns `403 ACCOUNT_SUSPENDED` without a session, including when locked. A rejected latest appeal adds its reason to the error message; an unavailable Admin lookup keeps the default suspension message. Wrong passwords stay generic `401`.
- Five failed passwords lock login by default. Password reset unlocks it and revokes sessions. Profile password changes retain the current session and revoke the others.
- Deletion is scheduled six calendar months ahead and revokes credentials immediately. Successful login before the deadline cancels it. Final cleanup removes the account and queues `UserDeleted` atomically.
- Friend requests require an active session, recipient acceptance and eligible accounts. Lists expose only IDs/names. The UI introduces people through orders; User Service does not enforce shared-order history. `GET /friends?q=...` searches existing friends only.
- Admin owns report/appeal records. User validates accounts and forwards the minimum payload; submissions do not automatically suspend or reinstate anyone.

## First administrator

After migrations, a privileged operator can promote an existing active, unlocked user who has completed both verifications and has no pending deletion:

```powershell
npm run build
npm run bootstrap:admin -- --user-id "USER_UUID" --confirm
```

Replace `USER_UUID` with the target UUID and check that `DATABASE_URL` identifies the intended database. Bootstrap refuses if any admin exists or a prior bootstrap audit is recorded. It revokes the target's sessions/reset links; sign in again afterward. It is a deployment command, not a public endpoint.

## Testing

Run all commands below from `user-service`:

```powershell
npm ci
npm run prisma:generate
npx prisma validate
npm run build
npm test
```

Database integration suites require local PostgreSQL on port `5554` and compiled `dist` files:

```powershell
docker compose up -d db
npm run test:integration:friendships
npm run test:integration:admin-users
npm run test:integration:account-support
```

These suites and `test:integration:email`, `test:integration:lockout`, `test:integration:lifecycle` and `test:integration:admin-bootstrap` create and remove disposable databases. External email/Admin/Kafka calls use test substitutes; no real messages are sent. Their results cover User behavior, not live infrastructure or consumer processing.

`test:integration:onboarding` and `test:integration:password-reset` instead use the running local Compose API and `user_db`, creating then removing synthetic accounts. They require development email delivery; onboarding also requires no real bot. Use these only in a dedicated local setup.

## Deployment and integration

- Apply existing migrations before starting the app. The Dockerfile provides `build`, `migrate` and `runtime` stages; the production runtime runs compiled JavaScript as a non-root user. The deployment migration Job uses the `migrate` stage.
- Gateway authorization uses `/api/v1/user/internal/authorize`, strips client identity headers and injects trusted `x-user-id`, `x-is-admin` and `x-permitted-action`. Each service must enforce the permission it needs.
- Internal Telegram lookup is Order-only through Linkerd. Admin mutations require the real administrator's bearer token, even over internal networking.
- Repository gateway/nginx rules block Admin's unauthenticated `/api/v1/admin/appeals/latest` route; the mesh admits User only. Keep it private when changing deployment/proxy rules.
- `UserVerified` and `UserDeleted` use durable outboxes and the configured `foc.user.status` topic. Delivery can repeat; consumers must deduplicate. Credit opens an account on `UserVerified` and revokes it on `UserDeleted` (balance to 0, account marked deleted, history kept; see `credit-service/docs/schema.md`).
- Local `.env` values are not part of an image. Supply deployment secrets, SES permissions, frontend origin and bot credentials separately.

Remaining work: record User load-test results (60,000 accounts; 95% auth/lookups under 1 second; 100 concurrent users with 95% requests under 2 seconds), and agree the broader account-status-help API beyond suspension appeals. Manual smoke tests cover the flows exercised, while performance and network-policy checks need their own evidence.

## Reference

- [API contract](API_CONTRACT_UPDATES.txt): endpoints, DTOs, errors and events.
- [Architecture](docs/architecture.md): service boundaries, flows and design choices.
- [Database schema](docs/schema.md): tables, relationships and constraints.
- [Executable schema](prisma/schema.prisma) and [migrations](prisma/migrations).

## AI Use Summary

**Owner:** Josh Wang Kai Kiat

**Tools:** OpenAI Codex (GPT-5.6 Luna, GPT-5.6 Sol, GPT-6 Sol and
GPT-6.1 Sol), used from 2026-09-25 to 2026-11-11.

Josh Wang Kai Kiat finalized User Service requirements and architecture,
including service boundaries, interfaces, schema, security and reliability
choices. Codex assisted with implementation code, unit/integration tests,
boilerplate and configuration, debugging, refactoring, and documentation
wording after those decisions were made. It was not used to prioritize the
backlog, choose the architecture or design, or draft decision rationales.

AI-influenced files have `AI Assistance Disclosure` headers where their
format supports comments. Applied Prisma migration SQL is covered by the
[migration collection disclosure](prisma/migrations/AI_ASSISTANCE.md) rather
than modified. Comment-incompatible JSON/package metadata and generated
files are covered by the [shared usage log](../ai/usage-log.md#8-user-service).

**Author review:** Josh Wang Kai Kiat reviewed and edited the generated work,
validated it against the project requirements and service contracts, and
verified it with the recorded build, test and manual checks. The team remains
responsible for correctness, security, licensing and final acceptance.

Exact prompts and key responses are recorded in
[`../ai/usage-log.md`](../ai/usage-log.md#8-user-service). The author-owned
implementation plan is recorded in
[`../ai/plans/user_service_plan.md`](../ai/plans/user_service_plan.md).
