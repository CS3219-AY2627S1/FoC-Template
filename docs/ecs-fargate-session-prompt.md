<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
Scope: Copied this plan into docs/ verbatim from George's local file, below this header. The AI tool
       changed none of the plan's text in this copy and made no requirements, architecture, schema,
       or API decisions in doing so. This note covers the copy only, not who wrote the plan.
Author review: George Yeo
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
Scope: Reworded the plan to record George's chat decisions (coursework deployment, CD on the team repo,
       deploy on every merge to main, budget alert skipped), and listed facts found during Phase 1 and
       Phase 2. The decisions are George's; no requirements, architecture, schema, or API decisions
       were made by the AI tool.
Author review: George Yeo
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
Scope: Recorded George's decision to use an ECS task role for S3 after NUS's organisation policy blocked
       creating the IAM user, and the bucket's account regional name. The decisions are George's; no
       requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: George Yeo
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-07
Scope: Recorded facts from Phase 2 steps 10-14: MySQL version, database logins, the user database name,
       SSM parameter names and the one-off log group. No requirements, architecture, schema, or API
       decisions were made by the AI tool.
Author review: George Yeo
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-07
Scope: Recorded facts from Phase 2 and Phase 4: ALB rule limit, the superadmin smoke test finding and
       the task definition order for shipping 1fad383. No requirements, architecture, schema, or API
       decisions were made by the AI tool.
Author review: George Yeo
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-07
Scope: Linked the run checklist and recorded the deployment status. No requirements, architecture,
       schema, or API decisions were made by the AI tool.
Author review: George Yeo
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-10
Scope: Recorded George's 2026-11-10 chat decisions (deploy chat-service with its own MySQL database
       and the foc_admin login, verified database TLS as for supplier, real SMTP with
       NODE_ENV=production for user-service) and the facts found while carrying them out. The
       decisions are George's; no requirements, architecture, schema, or API decisions were made by
       the AI tool.
Author review: George Yeo
-->

# Task: move FoC from Docker Compose to AWS ECS on Fargate, for the coursework's cloud deployment

I'm George. Your job is to edit the FoC repo (a campus errand app: requesters post requests, couriers deliver them, settled in platform credits) to implement deployment to cloud component of the coursework. All design decisions are already made, below. Your job is to carry out this plan with me, starting with Phase 1.

## Ground rules

- **Be brief, but I'm still learning AWS.** Define an AWS term in plain language the first time it comes up.
- **Git:** `origin` is my fork (`george-yeo/FoC-Template`) and `upstream` is the team repo (`AY2627S1-CS3219-P18/FoC`). CD runs from the team repo, and code reaches its protected `main` by PR. Branch from `main` (`acd4397` when this was written; run `git rev-parse main` and tell me if it moved). Commit, push or open a PR only when I ask.
- **Secrets:** never read `.env` files or `user-service/keys/`, and never ask me to paste a secret into chat. I enter secrets directly in the AWS console. Only `.example` files are safe to read.
- **AWS:** I provision by hand in the console. Give me one step or small group at a time, tell me what to check, and wait. No Terraform or CDK. Confirm with me before anything costly or destructive. Region is `ap-southeast-1`.
- **Cost:** my limit is short test runs only. The stack is about $10/day while fully running (rough estimate, unverified). Warn me before anything adds cost, and remind me to tear down at the end of a session.
- **Honesty:** report what you actually ran. Everything marked **(verify)** below is from memory or inference, so check it rather than trusting it. Repo line numbers are from `acd4397`.

## Decisions (don't reopen unless a fact below proves wrong)

| Area | Decision |
|---|---|
| Compute | ECS Fargate, X86_64, exactly 1 task per service, no autoscaling |
| Services | 9 ECS services: `user-service`, `credit-service`, `supplier-service`, `order-service`, `chat-service` (added 2026-11-10), `frontend`, `order-worker`, `credit-worker`, `supplier-worker` |
| Routing | ALB path rules, one target group per web service. nginx's routing role is replaced, but the frontend image stays unchanged and keeps serving static files |
| HTTPS | CloudFront in front of the ALB, using the default `*.cloudfront.net` domain. No custom domain or ACM. CloudFront to ALB stays HTTP |
| Networking | Tasks in public subnets with public IPs and no NAT. RDS and ElastiCache in private subnets |
| Service calls | ECS Service Connect, reusing the Compose names so URL values don't change |
| Databases | 5 RDS instances mirroring Compose: Postgres 17 (order), Postgres 16 (user), Postgres 16 (credit), MySQL 8 (supplier), MySQL 8.4 (chat, added 2026-11-10) |
| DB encryption | Verified SSL enforced on all five |
| Redis | 2 ElastiCache clusters (order, supplier), cluster mode disabled, TLS on, `noeviction`, single node, no snapshots |
| Secrets | SSM Parameter Store SecureString, injected through the task definition |
| Photos | S3 bucket with public read, plus an ECS task role limited to that bucket. No stored keys |
| Email | Changed 2026-11-10: real email through Brevo's SMTP relay, with the password in SSM. All services, including `user-service`, use `NODE_ENV=production`, so the refresh cookie is `Secure` and `user-service` exits at startup if an SMTP setting is empty. (Before: no SMTP, and `user-service` ran with `NODE_ENV=development` and logged OTPs to CloudWatch.) |
| Auth | JWT verification stays inside the services (RS256 via JWKS) |
| Deploys | Web services: min healthy 100%, max 200%. Workers: min healthy 0%, max 100% |
| Supplier health | New static `GET /health`, mounted ahead of the per-IP rate limiter |
| Seeding | One-off ECS tasks |
| CD | GitHub Actions on the team repo, deploying on every merge to `main`: build, push to ECR, update ECS, authenticated with GitHub OIDC. AWS account is not Learner Lab, but it is in NUS's organisation, whose rules apply |
| Local dev | Docker Compose stays as is. Every new setting must default to off, so Compose and CI don't change |

**CD trigger (decided):** automatic, on every merge to `main`.

**Supplier rate limit:** `docs/superpowers/plans/2026-09-30-supplier-service-phase-5.md` sets `PER_IP_RATE_LIMIT` to 30 for production and 20,000 for staging. Start at 30, and tell me if testing hits 429s.

**Found while carrying this out (these replace the matching text below):**
- **MySQL SSL:** the supplier pool also sets `verifyIdentity: true`, because `mysql2` doesn't check the certificate hostname without it.
- **RDS CA file:** it's at `/etc/ssl/rds-ap-southeast-1-bundle.pem` in all backend images and the seed image. `NODE_EXTRA_CA_CERTS` must use that path.
- **Boot test:** Phase 1 item 11 ran on throwaway plain and TLS servers rather than the Compose databases and Redis.
- **OIDC subject:** repos created after 2026-07-15 use GitHub's ID-based `sub` format. Use the value in Phase 2 step 5.
- **Resource names:** ECR repos are `foc/<service>` plus `foc/supplier-seed`, the ECS cluster is `foc`, and the task execution role is `foc-ecs-task-execution`.
- **No IAM users:** a service control policy on NUS's organisation denies `iam:CreateUser` in this account. Creating roles works. My decision on 2026-11-06 is to give supplier its S3 access through a task role, `foc-supplier-task`, instead of an IAM user. The code uses the task role when `PHOTO_STORE_ACCESS_KEY` and `PHOTO_STORE_SECRET_KEY` are unset.
- **S3 bucket name:** the bucket uses S3's account regional namespace, so its name is `foc-supplier-photos-993173880680-ap-southeast-1-an`.
- **MySQL version:** the supplier database uses MySQL 8.4, because RDS MySQL 8.0 left standard support on 2026-07-31.
- **Database logins:** all 4 RDS instances use the admin login `foc_admin`, each with its own password. Credit's services still connect as `credit_app`.
- **User database name:** `foc-user-db` was created without an initial database name, so step 16 must run `CREATE DATABASE user_service;` first.
- **SSM parameters:** `/foc/user/db-password`, `/foc/user/super-admin-password`, `/foc/user/jwt-private-key`, `/foc/user/jwt-public-key`, `/foc/credit/admin-password`, `/foc/credit/app-password`, `/foc/supplier/db-password` and `/foc/order/database-url`.
- **One-off task logs:** steps 16 and 20 log to an extra log group, `/ecs/foc/one-off`.
- **ALB rules:** a rule takes at most 5 path values, so user's 6 paths use two rules.
- **Smoke test finding:** `superadmin` has no credit balance, so a transfer to it as courier ends in `COURIER_NOT_FOUND` and a dead-letter row while the order shows `completed`. Raised for the team to decide.
- **`SUPPLIER_SERVICE_URL`:** `order-service` must run a task definition with this variable before `1fad383` deploys, because CD only swaps the image. That was missed on the first deploy, so `order-service:3` added it afterwards.
- **Status on 2026-11-07:** Phase 2 and Phase 4 are complete, and `1fad383` is live. The smoke test's browser steps are George's report.
- **chat-service (2026-11-10):** deployed from PR #193.
  - Its own RDS instance, `foc-chat-service` (MySQL 8.4, `foc_admin` login). It was created without an initial database name, so a one-off task ran `CREATE DATABASE chat_service;`.
  - Verified TLS through `DB_SSL=true` and `NODE_EXTRA_CA_CERTS`. Migrations get TLS from `DATABASE_URL`'s `?sslaccept=strict&sslcert=/etc/ssl/rds-ap-southeast-1-bundle.pem`. It applies its Prisma migrations at boot, like order.
  - It shares `foc-order-redis` with order, as in Compose: Socket.IO prefix `chat-socket.io` and translation queue `queue:chat:translation`.
  - 0.5 vCPU / 1 GB, Service Connect client and server `chat-service:3000`, target group `foc-chat` (`/health`), and load balancer rule 6: `/chat/conversations`, `/chat/conversations/*`, `/chat-socket.io`, `/chat-socket.io/*`.
  - It must be running before `order-worker` starts.
- **Settings added on `main` after the 2026-11-07 deploy:** CD only swaps the image, so these were added to new task definition revisions on 2026-11-10.
  - `order-worker`: `CHAT_SERVICE_URL`, `CHAT_SERVICE_API_KEY`, `SUPPLIER_ORDER_SERVICE_API_KEY`, `USER_ORDER_SERVICE_URL` and `USER_ORDER_SERVICE_API_KEY`.
  - `user-service`: `USER_ORDER_SERVICE_API_KEY`, `ELEVATION_TOKEN_TTL_MINUTES=15`, `FRONTEND_BASE_URL`, and the SMTP settings.
  - `supplier-service` and `supplier-worker`: `SUPPLIER_ORDER_SERVICE_API_KEY`.
  - `chat-service`: `TRANSLATION_LLM_KEY`. `TRANSLATION_LLM_MODEL` is left at its code default.
- **New SSM parameters (2026-11-10):** `/foc/chat/database-url`, `/foc/chat/service-api-key`, `/foc/chat/translation-llm-key`, `/foc/user/smtp-pass`, `/foc/user/order-service-api-key` (shared by user-service and order-worker) and `/foc/supplier/order-service-api-key` (shared by supplier-service, supplier-worker and order-worker). `/foc/chat/db-password` was made for the database-creation task.
- **User database schema:** `user-service` doesn't change its schema at boot. On 2026-11-10, login failed with `column "preferred_lang" does not exist`. A one-off `postgres:16` task applied the statements `init.sql` gained since 2026-11-07: `users.preferred_lang`, the two `users_otps` send-limit columns and the `last_request` table. `user-service/prisma/migrations` (added 2026-11-09) was not used, because its baseline includes changes this database didn't have. The run checklist's "Before starting after merges" covers future changes.
- **Status on 2026-11-10:** all 9 services ran, and login worked after the schema fix. The rest of the smoke test was in progress.

## What the repo looks like (found by reading `acd4397`)

- **nginx** lives inside the frontend image (`frontend/nginx/default.conf`). It uses `$request_uri`, so there's no prefix stripping. No `auth_request` or nginx rate limits.
- **Frontend** uses relative paths on one origin, with no `VITE_*` values baked in. No SPA routes collide with API paths.
- **Service calls:** order, credit and supplier call `user-service` for JWKS; `user-service` (outbox relay) and `order-worker` call `credit-service`. Credit has no HTTP call to order; those two talk through BullMQ on `queue:credit:transfer`. My original brief claimed a hardcoded credit-to-order `ip:port` bug, but it doesn't exist on any remote branch, so ignore it.
- **Redis clients:** `order-redis` is used by order, order-worker and credit-worker (the credit API validates its settings but opens no connection). `supplier-redis` is used by supplier and supplier-worker. Both workers use the queue key `queue:outbox:relay` and the same scheduler ID, which is why there are two clusters.
- **Health:** user, credit and order have `/health`, and frontend has `/healthz`. Supplier has none. `/health` can't be reached per service through the ALB, because paths can't tell the services apart. Use target-group health instead, and add no new routes for it.
- **Images:** targets are `prod` for user, credit, supplier and frontend, and `production` for order. CI builds these images but never runs them, and Compose runs user, credit and supplier as `dev`, so **those three `prod` images have never booted**. Workers need `node dist/worker/main.js` for credit and supplier, and `node dist/worker.js` for order.
- **Rolling overlap checks:** BullMQ locks prevent double processing, schedulers are idempotent, and the relay treats a 409 as `sent` while credit rejects duplicate allocations. Only `order-worker`'s `concurrency: 1` on the credit queue doesn't hold across two copies, which is why workers use 0/100.

## Phase 1: repo changes

Branch from `main`. Keep each change small, and run each service's tests.

1. **Postgres SSL (user, credit).** Add `DB_SSL` (default off) to each config schema, and pass `ssl: { rejectUnauthorized: true }` in `user-service/src/db/pool.ts` and `credit-service/src/db/pool.ts` when it's on.
2. **Postgres SSL (order).** No code: `DATABASE_URL` gets `?sslmode=require`. **(verify)** I expect the app to verify the certificate and `prisma migrate deploy` to encrypt without verifying. Confirm both at first boot and tell me what actually happens.
3. **MySQL SSL (supplier).** Add `DB_SSL` to `supplier-service/src/config.ts` and `ssl: { rejectUnauthorized: true }` in `src/db/pool.ts`. Check that `src/db/migrate.ts` goes through the same pool.
4. **RDS CA file.** Add `https://truststore.pki.rds.amazonaws.com/ap-southeast-1/ap-southeast-1-bundle.pem` **(verify URL)** to the deploy stage of all 4 backend Dockerfiles. `ADD` from a URL creates mode 600 files and order's image runs as `USER node`, so set `--chmod=644` or use another method that leaves it readable. ECS sets `NODE_EXTRA_CA_CERTS` to its path.
5. **Redis TLS.** Add `REDIS_TLS` (default off) and pass `tls: {}` when on. Sites: `order-service/src/server.ts:45`, `order-service/src/worker.ts:74` and `:80`, `credit-service/src/queue/redisConnection.ts:51` (with its caller in `worker/main.ts:33`), `supplier-service/src/redis/client.ts:19`, `supplier-service/src/worker/main.ts:31`. Search again for any I missed, including order's optional queue dashboard.
6. **S3 region.** Add `PHOTO_STORE_REGION` (default `us-east-1`, so MinIO keeps working) in `supplier-service/src/config.ts` and use it at `src/storage/s3PhotoStorage.ts:23`. Keep `forcePathStyle`. The endpoint will be `https://s3.ap-southeast-1.amazonaws.com`, and photo URLs must be `https` because the site now is.
7. **Supplier `/health`.** Static response like credit's, at app level in `supplier-service/src/app.ts`, ahead of the rate limiter. Add a test.
8. **Keep-alive.** Node's default 5s `keepAliveTimeout` is shorter than the ALB's 60s idle timeout, which causes sporadic 502s. Set `keepAliveTimeout = 65000` and `headersTimeout = 66000` on the HTTP server in `user-service/src/server.ts`, `credit-service/src/server.ts`, `supplier-service/src/app.ts` and `order-service/src/server.ts`.
9. **Supplier seed image.** A small Dockerfile with repo-root context, keeping the layout the seed expects, because `test/seed/seedSuppliers.seed.test.ts` looks for images at `../../../frontend/public/images` and `../../../foc-mockup/public/images`. Root context has no `.dockerignore`, so keep the context small. `supplier-service/vitest.seed.config.ts` builds its own env block, so pass `DB_SSL` and `PHOTO_STORE_REGION` through there. Check whether the seed is safe to run twice.
10. **Env docs.** Add the new variables to the relevant `.env.example` files.
11. **Boot-test the prod images locally.** Start Docker Desktop first (ask me; its daemon wasn't responding last time). Run user, credit and supplier `prod` images plus all 3 worker commands against the local Compose databases and Redis. Don't change `compose.yaml` for this.

**No repo change, handled in the task definition:**
- **JWT keys.** `user-service` reads PEM files, and `.dockerignore` excludes `keys`. Inject the PEMs from SSM as env vars and override the command to write them to `/tmp` and then `exec node dist/server.js`, with `JWT_PRIVATE_KEY_PATH` and `JWT_PUBLIC_KEY_PATH` pointing at them. Use a new keypair generated just for AWS, not my local one. Keep the writing shell quiet, so no key reaches the logs.
- **Frontend.** `resolver 127.0.0.11` is harmless because API paths never reach nginx here. But `listen [::]:80` might fail if IPv6 is unavailable in the Fargate container **(verify at first boot)**. If it does, tell me before changing anything.

## Phase 2: AWS setup (console, in this order)

Check all console names against the current UI **(verify)**.

1. **Budget alert:** skipped, my decision on 2026-11-06. Check Billing → Credits and tell me what I have.
2. **VPC:** 2 AZs, 2 public and 2 private subnets, no NAT gateway.
3. **Security groups:**
   - `foc-alb`: port 80 from the CloudFront origin-facing managed prefix list (`com.amazonaws.global.cloudfront.origin-facing`). It uses up much of a security group's rule quota **(verify)**. While testing before CloudFront exists, allow my IP only.
   - `foc-tasks`: from `foc-alb` on ports 80, 3000, 3001, 3002 and 3003, and from itself for Service Connect.
   - `foc-rds`: 5432 and 3306 from `foc-tasks` only.
   - `foc-redis`: 6379 from `foc-tasks` only.
4. **ECR:** 5 repos (user, credit, supplier, order, frontend), plus one for the seed image. Add a lifecycle rule to keep only a few images.
5. **GitHub OIDC:** identity provider, plus an IAM role trusted only for `repo:AY2627S1-CS3219-P18@323009622/FoC@1359250594:ref:refs/heads/main`. Limit it to pushing to those ECR repos, ECS register/describe/update, and `iam:PassRole` on the task execution role and `foc-supplier-task`.
6. **Build CD (Phase 3)** and run it in build-only mode, so images exist before ECS needs them.
7. **S3:** one bucket, public read on objects only, and a task role `foc-supplier-task`, trusted by `ecs-tasks.amazonaws.com` and limited to `Put`, `Get` and `Delete` on that bucket.
8. **Parameter groups:** MySQL with `require_secure_transport=1`, and ElastiCache Redis 7 with `maxmemory-policy=noeviction`. Postgres needs none, because `rds.force_ssl=1` is already the default on 15+.
9. **Subnet groups** for RDS and ElastiCache, using the private subnets.
10. **RDS (4 instances):** `db.t4g.micro`, single-AZ, gp3 at minimum storage, not public, in `foc-rds`, automated backups off to save cost.
    - Set the initial DB name (`order_db`, `user_service`, `credit_db`, `supplier_service`), because the SQL scripts don't create the database.
    - **MySQL version (verify):** Compose's `mysql:8` tag floats. RDS MySQL 8.0 may now be in paid extended support, so check this before choosing. I expect to want 8.4.
    - Avoid URL-unsafe characters in order's password, since it goes into `DATABASE_URL`.
11. **ElastiCache (2 clusters):** design your own cache, Redis OSS 7.x, cluster mode disabled, `cache.t4g.micro`, 0 replicas, Multi-AZ off, TLS on, no AUTH token, backups off, custom parameter group, `foc-redis`. Not Serverless.
12. **SSM parameters** under `/foc/...`, all SecureString for secrets. I enter the values. Standard tier holds up to 4 KB, which fits an RSA 2048 PEM.
13. **Task execution role:** `AmazonECSTaskExecutionRolePolicy` plus `ssm:GetParameters` on `/foc/*`.
14. **ECS cluster** plus a Service Connect namespace. Log groups: `/ecs/foc/<service>` with 3-day retention.
15. **Task definitions.** Set `initProcessEnabled`. Workers get `stopTimeout: 30`, matching Compose's `stop_grace_period`. Use `NODE_ENV=production` everywhere except `user-service`, which uses `NODE_ENV=development`. In `user-service`, that setting only affects the OTP log fallback, the SMTP startup check and the refresh cookie's `Secure` flag, and it still runs the `prod` image. It still needs `SMTP_PORT=587`, because the config schema requires a port, while `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` stay empty. Set `DB_SSL=true`, `REDIS_TLS=true` and `NODE_EXTRA_CA_CERTS` on the backends. Set the task role to `foc-supplier-task` on `supplier-service`, `supplier-worker` and the seed task, and leave `PHOTO_STORE_ACCESS_KEY` and `PHOTO_STORE_SECRET_KEY` unset on them.

| Service | Image target | Port | Task size | Service Connect | Health path |
|---|---|---|---|---|---|
| `user-service` | `prod` | 3001 | 0.5 vCPU / 1 GB | Client + server `user-service:3001` | `/health` |
| `credit-service` | `prod` | 3003 | 0.5 / 1 | Client + server `credit-service:3003` | `/health` |
| `supplier-service` | `prod` | 3002 | 0.5 / 1 | Client + server `supplier-service:3002` | `/health` |
| `order-service` | `production` | 3000 | 0.5 / 1 | Client only | `/health` |
| `frontend` | `prod` | 80 | 0.25 / 0.5 | None | `/healthz` |
| `order-worker` | `production` | none | 0.5 / 1 | Client only | none |
| `credit-worker` | `prod` | none | 0.25 / 0.5 | None | none |
| `supplier-worker` | `prod` | none | 0.25 / 0.5 | None | none |

Service Connect tasks are larger because AWS recommends adding [256 CPU and at least 64 MiB](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-connect-concepts-deploy.html) for its proxy. Copy the full env list for each service from `compose.yaml` and `user-service/.env.example`; `user-service/src/config.ts` validates its variables at startup and exits if any is missing. `credit-worker` and `supplier-worker` still need `PORT` and `USER_SERVICE_URL` set, because config validation requires them even though they don't serve HTTP. Credit and its worker connect as `credit_app`, never the owner.

16. **Schema bootstrap (one-off Fargate tasks, before any service starts).** `user-service` touches its database on boot, so this comes first.
    - **User:** stock `postgres:16` image, applying `user-service/src/db/init.sql` from a pinned commit (the team repo is public).
    - **Credit:** `credit-service/src/db/init.sql`, then create `credit_app` with its SSM password, then `grants.sql`, run as the RDS admin login. `grant-app-role.sh` shows the sequence but expects the Compose paths.
    - **Supplier:** supplier image with command `npm run migrate`, which reads `src/db/init.sql`.
    - **Order:** nothing, as Prisma migrates on boot.
    - Use `sslmode=require` or stricter for `psql`.
17. **Target groups:** target type IP, health paths from the table above, deregistration delay 30s.
18. **ALB:** internet-facing, public subnets, `foc-alb`, idle timeout 60s. HTTP listener on 80 with default forward to frontend, and rules:
    - `/api/v1`, `/api/v1/*` → supplier
    - `/auth`, `/auth/*`, `/users`, `/users/*`, `/admin/audit-logs`, `/admin/audit-logs/*` → user. Other `/admin/*` paths are SPA routes, so they stay on the frontend. This is 6 paths, and an ALB rule may only take 5 **(verify)**, so it may need two rules
    - `/credits`, `/credits/*` → credit
    - `/orders`, `/orders/*`, `/socket.io`, `/socket.io/*` → order
19. **ECS services:** desired count 1, public IP on, `foc-tasks`, deployment settings from the decisions table, deployment circuit breaker with rollback on web services, health check grace period of at least 60s. Create in this order: user, credit, supplier, order, workers, frontend. **(verify)** A Service Connect client only learns endpoints that exist when its task starts, and user and credit each need the other, so force a new deployment of `user-service` afterwards.
20. **Supplier seed:** one-off task with the seed image, once S3 and supplier's database are ready.
21. **CloudFront distribution:** origin is the ALB DNS name, HTTP only. Viewer protocol redirects HTTP to HTTPS, all methods allowed, `CachingDisabled`, `AllViewer` origin request policy, error caching TTL 0. Then lock `foc-alb` down to the prefix list and remove my IP.

## Phase 3: CD (`.github/workflows/deploy.yml`, on the team repo)

- Runs on every push to the team repo's `main`.
- `permissions: id-token: write, contents: read`. Keep the role ARN in a repo variable. No long-lived AWS keys.
- Build 5 images with a matrix, reusing the buildx and cache pattern from `.github/workflows/ci.yml`. Tag with the git SHA. Build for linux/amd64.
- Also a manual run with an input for build-only versus deploy, needed for step 6 above, plus a choice of which services to deploy.
- One image can serve several services: order → `order-service` and `order-worker`; credit → `credit-service` and `credit-worker`; supplier → `supplier-service` and `supplier-worker`.
- Fetch the current task definition from AWS, swap only the image, register it, update the service, and wait for stability. Secrets and env stay in AWS, not the repo.
- Don't fail the run when a service is scaled to 0, because the stack is often off. Make clear in the output that nothing actually started.

## Phase 4: smoke test (through the CloudFront URL)

1. All target groups healthy. Check `credit-worker`, `order-worker` and `supplier-worker` logs for a clean Redis connection.
2. **Socket.IO through CloudFront first, as the main unknown.** The frontend connects over `wss://`. It should stay up past the 25s ping, and reconnect after the 15-minute token expiry. If it drops, look at CloudFront's origin timeouts and Socket.IO ping settings.
3. Register, read the OTP from the `[DEV EMAIL]` line in `user-service`'s CloudWatch logs, then log in.
4. Reload after login and stay logged in. The refresh cookie won't have `Secure`, which is expected in this mode, but it should still have `HttpOnly`.
5. Browse suppliers, with photos loading from S3 over HTTPS. Upload one as an admin.
6. Full order: requester creates, courier accepts and delivers, credits reserve and transfer. Confirm in the wallet and in `transaction_log`.
7. Live order push reaches a second browser.
8. BullMQ: a `queue:credit:transfer` job is consumed by `credit-worker`, with no new `dead_letter_jobs` rows.
9. Encryption is actually on: `pg_stat_ssl` for Postgres, the `Ssl_cipher` status for MySQL.
10. Going straight to the ALB URL times out.
11. Change a small thing and deploy through CD to prove the pipeline.

Debug until all of this works, and report honestly anything that doesn't.

## After the first deploy: ship `1fad383`

`1fad383` (order-service checks the supplier and delivery location exist on create and edit) isn't in `main`. It's on `claude/cs3219-ecs-fargate-migration-2b337e`, and I may have saved it as `order-supplier-check`. **First confirm it's still reachable** and tell me if it isn't, before any worktree cleanup. Then rebase it onto `main`, resolving conflicts in `order-service/src/app.ts`, `constants/errors.ts`, `controllers/orders.controller.ts` and `routes/orders.routes.ts`. Add `SUPPLIER_SERVICE_URL=http://supplier-service:3002` to order's task definition, and ship through CD as the first real change.

## Starting and ending a test run

The finished checklist is `docs/ecs-fargate-run-checklist.md`.

Write these up as a short checklist for me once the stack works.

**End:**
1. Wait for BullMQ queues to drain, because deleting Redis destroys anything queued, and the outbox row is already gone by then.
2. Set all ECS services to desired count 0.
3. Delete the ALB and both ElastiCache clusters.
4. Stop all 4 RDS instances. They restart by themselves after 7 days and bill again, so remind me.

**Start:** recreate the ALB and Redis clusters, start RDS, update `REDIS_HOST` values if the endpoints changed, scale services up, and paste the new ALB DNS name into the CloudFront origin.

Leaving only the tasks and RDS off still costs about $2/day (rough estimate), so stress the deletes.

**Full teardown when I'm done:** ECS services and cluster, ALB and target groups, CloudFront, ElastiCache, RDS (no final snapshot unless I ask), S3, ECR, SSM parameters, log groups, roles and OIDC provider, then the VPC last. Afterwards, confirm with Cost Explorer that nothing's still billing.

## Known limitations to leave alone

- CloudFront to ALB is plain HTTP, and another AWS customer's distribution could also reach the ALB. A secret header would fix the second part, but it's out of scope for test runs.
- ~~OTPs and email addresses appear in CloudWatch Logs, and real email delivery isn't tested. The refresh cookie has no `Secure` flag.~~ Resolved on 2026-11-10 by the Email decision above: real SMTP, and `NODE_ENV=production` on `user-service`.
- `user-service` has no `trust proxy`, so `req.ip` stored with refresh tokens will be the ALB's address.
- `order-redis` has no AOF equivalent, so a Redis failure loses queued credit jobs. Fine for throwaway data, not for real users. MemoryDB is the upgrade path.
- The README's "Known gap: no TLS" and "planned single-EC2 deployment" text is out of date. Only update it if I ask.

## First steps

1. Read this whole prompt, then run `git rev-parse main` and check `1fad383` is reachable.
2. Tell me in a few lines how you'll start.
3. Begin Phase 1, one change at a time.
