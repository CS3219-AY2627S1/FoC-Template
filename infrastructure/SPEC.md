<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-5), date: 2026-10-18
Scope: Structured and drafted the AWS deployment specification from the architecture,
security, cost, lifecycle, and verification decisions explicitly reviewed and approved by
@ron during the issue #44 grilling session. No AWS resources were created.
Author review: The recorded design decisions were reviewed and approved by @ron on
2026-10-18. Final document wording remains subject to pull-request review.
-->

# FoC AWS Demo Deployment Specification

| Item | Value |
| --- | --- |
| Status | Approved design; implementation pending |
| Tracking issue | [#44](https://github.com/Y2627S1-CS3219-P5/FoC/issues/44) |
| Primary region | `ap-southeast-1` (Singapore) |
| Environment | One cost-conscious demo environment |
| Infrastructure language | TypeScript AWS CDK |
| Destruction deadline | Before 11 December 2026 |

## 1. Purpose

Deploy the current stable FoC application to the NUS-provided AWS account without waiting
for Order Service or Credit Service. The deployment must expose the existing responsive
frontend and the current User and Supplier capabilities through one HTTPS browser origin.

The environment is a course demonstration environment. It uses production-shaped controls
where they provide clear learning or safety value, while deliberately avoiding expensive
high-availability infrastructure. It contains dummy accounts and demonstration Supplier
data only.

This specification is the authority for the AWS deployment increment. Existing service
specifications remain authoritative for application behavior and API contracts.

## 2. Goals

- Deploy the frontend, User Service, Supplier Service, and PostgreSQL-backed data.
- Preserve the tested nginx same-origin routing contract.
- Keep `/auth/verify`, backend health endpoints, and Supplier Swagger off the public route.
- Use managed container execution without managing EC2 hosts.
- Support repeatable database bootstrap, migrations, and Supplier seed import.
- Preserve administrator edits when the Supplier seed runs again.
- Provide HTTPS, rate limiting, health checks, logs, alarms, scaling, rollback, and teardown.
- Define infrastructure as reviewable TypeScript CDK code.
- Minimize idle cost and make forgotten resources visible and removable.
- Leave a clear extension path for Order Service and Credit Service.

## 3. Non-goals

- Order Service or Credit Service containers, routes, secrets, or databases.
- Kubernetes, Amazon EKS, or self-managed ECS capacity on EC2.
- Amazon API Gateway. nginx remains the application gateway.
- Moving the frontend to S3 or replacing nginx routing.
- Multi-region, multi-AZ database failover, read replicas, or disaster recovery.
- Production personal data, confidential data, or production user accounts.
- Public backend health checks, public Swagger, or public database access.
- Image upload or mutable Supplier asset storage.
- Distributed tracing, OpenTelemetry, NestJS Observe, or CloudWatch Application Signals in
  the first deployment.
- Fully automated deployment from GitHub in the first infrastructure increment.

## 4. Existing application contracts

### 4.1 Deployable components

| Component | Runtime | Port | Current responsibility |
| --- | --- | ---: | --- |
| Frontend | React/Vite build served by nginx | 80 | SPA and same-origin API gateway |
| User Service | Express/TypeScript | 3001 | Accounts, login, roles, audit, token verification |
| Supplier Service | NestJS/Drizzle | 3000 | Supplier reads, metadata, mutations, assets |

User Service and Supplier Service each expose an internal database-backed `GET /health`.
nginx currently uses `/` as its container health check and must gain a dedicated
`GET /healthz` response before cloud deployment.

### 4.2 Browser routing

nginx continues to own the public route mapping:

- `/api/v1/auth/login`, `/api/v1/auth/register`, and `/api/v1/whoami` to User Service.
- User administration and audit routes under `/api/v1` to User Service.
- `/api/v1/suppliers...` to Supplier Service.
- `/assets/suppliers...` to Supplier Service.
- All other non-API routes to the React SPA fallback.

nginx must not expose User Service `/auth/verify`, either backend `/health`, Supplier
`/api/docs`, or Supplier `/api/docs-json`.

### 4.3 Identity contract

The browser stores the User Service access token in per-tab `sessionStorage` and sends it
as `Authorization: Bearer <token>`. nginx forwards the header. Supplier Service forwards
the same header to User Service `GET /auth/verify` through internal service discovery.
User Service performs live account and role lookup for every verification.

The cloud browser route is same-origin through CloudFront and nginx. The cloud User Service
therefore uses an empty `CORS_ORIGINS` value. No generated CloudFront hostname needs to be
fed back into the User task definition. Local Vite development retains its existing
localhost CORS configuration.

### 4.4 Persistent and bundled data

- User and Supplier records persist in PostgreSQL.
- User audit records persist in PostgreSQL; audit checkpoint messages also go to the User
  Service CloudWatch log group.
- The approved 21-row Supplier CSV and six allowlisted images remain bundled in the
  Supplier image.
- The deployment does not introduce mutable object storage or image upload.

## 5. Target architecture

```text
Internet browser
      |
      | HTTPS on the generated *.cloudfront.net hostname
      v
CloudFront distribution + AWS WAF
      |
      | CloudFront VPC origin
      v
Internal Application Load Balancer
      |
      v
Frontend nginx ECS Fargate service
      |\
      | +---- Service Connect ----> User Service ECS Fargate service
      |
      +------ Service Connect ----> Supplier Service ECS Fargate service
                                           |
                                           +---- Service Connect ----> User /auth/verify

User Service -------- TLS ---------+
                                    v
                         Private RDS PostgreSQL
                                    ^
Supplier Service ----- TLS --------+
```

CloudFront is the only public application entry point. It uses its generated hostname and
default certificate because the team has no domain. The internal ALB is a CloudFront VPC
origin and is not internet-facing.

The first deployment has no custom domain. Consequently, browser-to-CloudFront traffic is
HTTPS, while CloudFront-to-internal-ALB and service-to-service HTTP remain private VPC
traffic rather than application-level TLS. Dummy-data scope and security groups make this
an accepted demo trade-off. A custom domain and end-to-end application TLS are required
before this design is used for real personal or confidential data.

## 6. AWS resource inventory

| Area | Resources |
| --- | --- |
| Edge | CloudFront distribution, CloudFront VPC origin, AWS WAF web ACL |
| Network | One VPC, internet gateway, two public subnets, two private subnets, route tables, security groups |
| Compute | ECS cluster, Service Connect namespace, three Fargate services, one-off deployment tasks |
| Ingress | One internal Application Load Balancer and frontend target group |
| Registry | Three private ECR repositories |
| Data | One private RDS for PostgreSQL instance, subnet group, parameter group |
| Secrets | RDS master, database roles, JWT, audit key, bootstrap administrator credentials |
| Operations | CloudWatch log groups, metrics, alarms, SNS email notification topic |
| Cost | Required resource tags and an AWS Budget alert when account permissions allow |

No resource for Order Service or Credit Service is created.

## 7. CDK organization

The infrastructure package lives under `infrastructure/` and uses a committed lockfile and
CDK context. It defines four conceptual stacks:

1. **Foundation** in `ap-southeast-1`: VPC, ECS cluster, Service Connect namespace, ECR.
2. **Data** in `ap-southeast-1`: RDS, database secrets, application secrets.
3. **Application** in `ap-southeast-1`: internal ALB, task definitions, services, logs,
   alarms, and scaling.
4. **Edge**: CloudFront, its VPC origin, and its WAF web ACL. CloudFront-scoped WAF
   resources are created through `us-east-1` as AWS requires, while the origin remains in
   Singapore.

Stateful Data resources are isolated from routine application deployments. Stack outputs
and explicit cross-stack inputs are used rather than copying ARNs into source files.

All stacks use predictable `foc-demo-*` physical names only where a stable name is
operationally useful. Every resource that supports tags receives:

- `Project=FoC`
- `Environment=demo`
- `ManagedBy=CDK`
- `Owner=<approved owner>`
- `Issue=44`

## 8. Network design

### 8.1 Subnets and routing

The VPC spans two Availability Zones:

- Fargate tasks run in public subnets with assigned public IPs so they can reach ECR,
  CloudWatch, Secrets Manager, and required AWS control-plane endpoints without a NAT
  Gateway.
- The internal ALB and RDS use private subnets.
- RDS remains single-AZ even though its subnet group spans two zones.
- The VPC has an internet gateway, which CloudFront VPC origins require, but private subnet
  route tables do not route inbound internet traffic to the ALB or RDS.
- No NAT Gateway or paid interface VPC endpoints are created initially.

Assigned public IPs do not grant application reachability. Security groups deny direct
internet ingress to every task.

### 8.2 Security-group matrix

| Target | Allowed inbound source | Port |
| --- | --- | ---: |
| Internal ALB | AWS-managed CloudFront origin-facing prefix list | 80 |
| Frontend task | ALB security group | 80 |
| User task | Frontend and Supplier task security groups | 3001 |
| Supplier task | Frontend task security group | 3000 |
| RDS | User and Supplier task security groups | 5432 |

No rule uses `0.0.0.0/0` for inbound application ports. Outbound access is permitted only
as broadly as required for image startup, logging, secret retrieval, database traffic, and
the known service calls.

The managed CloudFront origin-facing prefix list avoids a circular deployment dependency:
the ALB security group can be created before the VPC origin creates its service-managed
security group. A later hardening increment may replace this source with the specific
service-managed VPC-origin security group after verifying that CDK can update it without
breaking the edge stack.

### 8.3 Internal naming

ECS Service Connect provides these stable aliases:

- `user-service:3001`
- `supplier-service:3000`

This preserves the tested Compose contracts. nginx and Supplier Service must not contain
AWS-generated task IPs or load-balancer names.

## 9. CloudFront and WAF

### 9.1 Viewer and origin behavior

- Redirect HTTP viewers to HTTPS.
- Use the generated `*.cloudfront.net` hostname and default CloudFront certificate.
- Allow every HTTP method required by the REST APIs.
- Use the internal ALB as a CloudFront VPC origin.
- Do not expose the ALB through a public DNS address.
- Preserve `Authorization`, `Content-Type`, `Origin`, `Accept`, `If-Match`, query strings,
  response `ETag`, and response request-correlation headers where applicable.

Because the default CloudFront certificate is used, the stricter custom-certificate viewer
security policies are not selectable. This is accepted only for the temporary dummy-data
environment and is revisited when the team obtains a domain.

### 9.2 Cache policy

| Path | Cache behavior |
| --- | --- |
| `/api/*` | Disabled; forward required headers and all query strings |
| `/assets/*` | Cache immutable frontend and bundled Supplier assets |
| SPA HTML and routes | Uncached or short-lived so deployments are visible promptly |

Authentication, User responses, Supplier data, errors, and ETags must never be served from
a shared CloudFront cache.

### 9.3 WAF policy

The web ACL starts with:

- A global per-IP rate-based rule.
- A stricter scoped rule for login and registration.
- AWS managed common protections in count-only mode.

Exact rate windows and thresholds are deployment inputs derived from bounded testing. A
rate block returns a controlled HTTP 429 response. Managed protections move from count to
block only after sampled requests show that legitimate journeys are not affected.

WAF is a protection layer, not authentication. User and Supplier authorization remains
application-enforced.

## 10. ECS and container images

### 10.1 Runtime

- Launch type: Fargate.
- Operating system: Linux.
- CPU architecture: x86-64.
- Active desired count: one task per service.
- Active maximum: two tasks per service.
- Stopped desired count: zero tasks per service.
- Deployment controller: ECS rolling update.
- Deployment circuit breaker: enabled with automatic rollback.

CPU, memory, and scaling target percentages must be selected after the current containers
are measured under the existing integration workload. They are explicit blockers rather
than guessed values.

### 10.2 Health and shutdown

- nginx adds `GET /healthz`, returning only a lightweight success response.
- User and Supplier retain their database-backed internal `GET /health` endpoints.
- ECS container checks use the component's own health endpoint.
- The ALB target group checks frontend `/healthz`.
- User and Supplier health endpoints are never routed by nginx or CloudFront.
- ECS gives applications time to handle `SIGTERM` and drain before forceful termination.

### 10.3 ECR

Create one private ECR repository for each long-running component:

- `foc-demo-frontend`
- `foc-demo-user-service`
- `foc-demo-supplier-service`

Repositories use immutable tags, scan-on-push or registry basic scanning, encryption at
rest, and lifecycle rules retaining only a small approved number of recent images. Each
release receives the Git commit SHA as a tag and task definitions deploy the resolved
immutable digest. The same image is promoted; it is not rebuilt between release stages.

Supplier runtime tasks override the current image default command with
`node dist/main.js`. Seeding is performed only by the one-off seed task, not by every
service replica startup.

## 11. PostgreSQL design

### 11.1 Physical topology

Use one RDS for PostgreSQL instance:

| Property | Initial value |
| --- | --- |
| Engine | PostgreSQL 17.11 |
| Instance class | `db.t4g.micro` |
| Availability | Single-AZ |
| Storage | Encrypted `gp3` with storage autoscaling |
| Public access | Disabled |
| Transport | TLS required with `rds.force_ssl=1` |
| Deletion protection | Disabled for the disposable demo environment |

The account and region capability check confirmed PostgreSQL 17.11 and
`db.t4g.micro` availability on 2026-10-18.

Minimum storage, maximum autoscaled storage, and automated backup retention are selected
after the approved cost estimate. Backup retention must be short, between one and seven
days. No final snapshot is retained during the final course teardown.

### 11.2 Logical ownership

The instance contains separate logical databases and roles:

| Database | Migration role | Runtime role | Owner |
| --- | --- | --- | --- |
| `users` | `user_migrator` | `user_app` | User Service |
| `supplier` | `supplier_migrator` | `supplier_app` | Supplier Service |

Runtime roles cannot create or alter schema. A service cannot connect to the other
service's database. There are no cross-database foreign keys, joins, or shared tables.

Sharing the instance saves money but shares capacity, maintenance, and failure boundaries.
Separate RDS instances are the future production path if the services need independent
scaling or isolation.

### 11.3 Bootstrap, migration, and seed order

The release controller runs the following one-off tasks in order:

1. **Database bootstrap** connects using the RDS master secret and idempotently creates the
   two logical databases, migrator roles, runtime roles, passwords, ownership, and grants.
2. **User migration** runs `node dist/migrate.js` with only User migration credentials.
3. **Supplier migration** runs `node dist/database/migrate.js` with only Supplier migration
   credentials and the configured runtime role.
4. **Supplier seed** runs `node dist/database/seed/run.js` with Supplier runtime access.
5. The long-running ECS services are created or updated only after every task succeeds.

The Docker-entrypoint `init-roles.sh` behavior used by local PostgreSQL containers does not
run automatically on RDS. Implementation must provide the explicit idempotent bootstrap
task above. Its exact packaging may be a dedicated deployment task, but it must not become
a long-running service or give application tasks the master secret.

The Supplier seed remains the approved repeatable 21-row import. It inserts missing stable
IDs and skips existing records rather than upserting them, so reruns preserve administrator
names, locations, categories, status, timestamps, and versions.

### 11.4 Schema release compatibility

Migrations remain checksummed and forward-only. Every schema release uses an expand and
contract sequence:

1. Add schema compatible with the old application.
2. Deploy the new application.
3. Remove obsolete schema only in a later release after old tasks cannot return.

If an ECS release fails, application tasks can roll back while the forward migration stays
applied. No automated down migration runs against shared demo data.

## 12. Secrets and IAM

### 12.1 Secrets Manager

Store the following as separate secrets or clearly separated secret records:

- RDS master credentials.
- User migrator and runtime database credentials.
- Supplier migrator and runtime database credentials.
- User JWT signing secret.
- User audit HMAC key.
- Bootstrap administrator password.

Bootstrap administrator username and email are non-secret deployment inputs; the password
is generated. No secret value appears in Git, `.env.example`, CDK context committed to Git,
CloudFormation output, logs, image layers, or PR artifacts.

`AUDIT_HMAC_KEY` remains stable for the lifetime of the Data stack and has no automatic
rotation because changing it invalidates verification of existing audit records. It is
deleted together with the disposable audit database during final teardown. Other automatic
rotation is deferred until the applications can consume rotated credentials safely.

### 12.2 Roles

- Human deployment uses temporary NUS IAM Identity Center credentials.
- CDK deployment roles are created only through reviewed bootstrap permissions.
- Each ECS service has a separate task execution role and task role.
- Execution roles can pull only their required ECR images, publish to their log group, and
  inject only their required secrets.
- Long-running application task roles receive no AWS API permissions by default.
- Migration and bootstrap tasks have separate roles; only bootstrap can read the RDS master
  secret.
- GitHub receives no permanent AWS access key.

### 12.3 Runtime configuration

The CDK task definitions provide only the settings each process needs. Secret-backed values
are injected from Secrets Manager at task start rather than stored as literal environment
variables in CloudFormation.

**User Service runtime**

| Setting | Cloud value |
| --- | --- |
| `PORT` | `3001` |
| `DATABASE_URL` | User runtime-role URL from Secrets Manager; cloud connection requires TLS |
| `JWT_SECRET` | Generated secret |
| `JWT_ACCESS_TOKEN_TTL` | `1800` unless the User contract is deliberately revised |
| `ALLOWED_EMAIL_DOMAIN` | `u.nus.edu` |
| `CORS_ORIGINS` | Empty because browser traffic is same-origin through nginx |
| `AUDIT_HMAC_KEY` | At least 32 random bytes encoded as hexadecimal |
| `BOOTSTRAP_ADMIN_USERNAME` | Approved non-secret deployment input |
| `BOOTSTRAP_ADMIN_EMAIL` | Approved NUS email input |
| `BOOTSTRAP_ADMIN_PASSWORD` | Generated secret |

**Supplier Service runtime**

| Setting | Cloud value |
| --- | --- |
| `PORT` | `3000` |
| `DATABASE_URL` | Supplier runtime-role URL from Secrets Manager; cloud connection requires TLS |
| `USER_SERVICE_BASE_URL` | `http://user-service:3001` |
| `USER_SERVICE_VERIFY_TIMEOUT_MS` | `1000` |

**One-off tasks**

| Task | Additional configuration |
| --- | --- |
| User migration | User migrator `DATABASE_URL` |
| Supplier migration | Supplier migrator `DATABASE_URL`, `DATABASE_RUNTIME_ROLE=supplier_app`, `MIGRATIONS_PATH=drizzle` |
| Supplier seed | Supplier runtime `DATABASE_URL`, `SUPPLIER_SEED_CSV_PATH=/data/csv/supplier-seed-data.csv` |
| Database bootstrap | RDS master secret plus generated role secrets; never application secrets |

The current database clients must be verified against RDS TLS during implementation. If
their URL-only configuration cannot validate the RDS certificate chain, add an explicit
cloud database TLS configuration seam and bundle the current Amazon RDS CA certificate.
Local Compose remains compatible with its existing local database settings.

## 13. Observability

### 13.1 Logs

Container stdout and stderr go to separate CloudWatch log groups:

- Frontend: 14-day retention.
- Supplier Service: 14-day retention.
- User Service, including audit checkpoint messages: 30-day retention.

Applications continue to emit non-sensitive request-completion logs and server-generated
request IDs. Logs must not include bearer tokens, passwords, database URLs, secret values,
or complete sensitive request bodies.

The first deployment uses CloudWatch infrastructure metrics and application logs. It does
not install NestJS Observe, an OpenTelemetry collector, X-Ray instrumentation, or
Application Signals.

### 13.2 Metrics and alarms

Create alarms for:

- Unhealthy frontend ALB targets.
- ECS running task count below intended active count.
- Elevated ALB or application server errors.
- High ECS CPU or memory.
- Low RDS free storage.
- High RDS CPU or connection usage.
- ECS deployment failure events.

Exact thresholds and evaluation periods are deployment inputs established through testing.
Alarm notifications go through SNS to the configured `alertEmail`; the subscription must
be confirmed before the environment is considered operational.

## 14. Scaling and availability

When active, each ECS service starts at one task and may scale independently up to two
tasks using CPU and memory target tracking. Service Connect distributes internal calls
across healthy tasks. The internal ALB distributes frontend requests across frontend tasks.

Scaling limits control cost rather than promise high availability. The single-AZ RDS
instance is the principal shared failure boundary. RDS storage may grow automatically up
to the approved cap, but database compute does not resize automatically.

Stop mode sets all ECS desired counts to zero and stops RDS. RDS automatically restarts
after seven consecutive stopped days, so a long idle period requires either another
intentional stop or complete destruction. ALB, CloudFront, ECR storage, Secrets Manager,
and retained logs may still incur charges while services are stopped.

## 15. Release process

### 15.1 First deployment

The first infrastructure increment is deployed manually using the NUS SSO profile:

```text
authenticate
-> npm ci
-> cdk synth --strict
-> cdk diff
-> human review
-> cdk deploy
```

The complete application release is:

```text
existing PR CI passes
-> build three images once
-> tag with Git commit SHA
-> scan and push to ECR
-> resolve immutable digests
-> run database bootstrap
-> run User migration
-> run Supplier migration
-> run Supplier seed
-> update ECS services
-> wait for steady state and health
-> run smoke tests through CloudFront
```

Any failed prerequisite stops the release. ECS uses rolling replacement plus the
deployment circuit breaker. A failed task rollout returns to the most recent healthy task
definition; it does not reverse an already successful database migration.

### 15.2 Later GitHub deployment

After manual deployment is proven, a separate increment may add GitHub Actions deployment:

- Trigger only from protected `main` or manual workflow dispatch.
- Depend on the existing aggregate CI gate.
- Authenticate with GitHub OIDC to a narrowly scoped deployment role.
- Require a GitHub environment approval.
- Build once and deploy immutable digests.
- Run migrations and smoke tests with the same ordering as manual deployment.
- Never store long-lived AWS keys in GitHub secrets.

## 16. Operational commands

Implementation provides documented, non-interactive wrappers for:

| Command | Required effect |
| --- | --- |
| `deploy` | Preflight, synth, diff, approved deploy, migrations, seed, services, smoke tests |
| `start` | Start RDS, wait for availability, set active ECS desired counts, verify health |
| `stop` | Set ECS desired counts to zero, then stop RDS and report remaining billable resources |
| `status` | Show CloudFront URL, RDS/ECS state, task health, current digests, alarms, and estimated cost links |
| `destroy` | Require explicit confirmation, destroy stacks in dependency order, and verify no scoped resources remain |

Scripts use resource tags and explicit stack names rather than broad wildcard deletion.
`destroy` must state that demo data, secrets, images, and retained logs are permanently
removed and must not target resources outside the FoC demo stacks.

## 17. Cost controls

Deployment is blocked until all required inputs exist:

- `monthlyBudgetUsd`
- `alertEmail`
- `owner`
- Bootstrap administrator username and NUS email
- Approved storage, backup, compute, WAF, and alarm settings

Before provisioning, the implementer produces an AWS Pricing Calculator estimate covering
Fargate active hours, ALB, CloudFront, WAF, RDS, storage, Secrets Manager, CloudWatch, ECR,
and data transfer. The team leader confirms the threshold against the NUS tracking portal.

If account permissions allow, create an AWS Budget alert at approved actual and forecasted
percentages. The alert is not a real-time hard spending cap and does not replace the NUS
tracking portal. Do not create automatic destructive budget actions.

Cost controls include one active task per service, maximum two, single-AZ RDS, no NAT
Gateway, short log/backup retention, ECR lifecycle policies, stop/status scripts, tags, and
the mandatory final teardown.

## 18. Security requirements

- Only CloudFront is publicly reachable as an application entry point.
- CloudFront viewer traffic is HTTPS-only after redirect.
- Direct ALB and task access must fail.
- RDS is private, encrypted at rest, and requires TLS.
- Application roles never receive the RDS master credential.
- WAF limits global and authentication traffic before it reaches bcrypt processing.
- Managed WAF rules start in count mode to detect false positives.
- JWT and audit secrets remain out of images, Git, logs, and outputs.
- IAM grants are per task and least privilege.
- Images use immutable digests and vulnerability scanning.
- Real personal or confidential data is prohibited.
- Public Supplier Swagger and health routes are prohibited.
- CloudTrail remains the account-level source for AWS API auditing where permitted by the
  school account.

## 19. Verification and acceptance

### 19.1 Infrastructure checks

- `cdk synth --strict` succeeds without plaintext secrets.
- CDK tests verify subnets, security groups, public-access flags, encryption, retention,
  removal policies, task roles, WAF attachment, and scaling bounds.
- RDS has no public endpoint and accepts only approved task security groups.
- Direct internet requests to the ALB or task public IPs fail.
- CloudFront serves the SPA over its HTTPS hostname.
- CloudFront does not cache `/api/*` responses.
- Internal health, `/auth/verify`, and Swagger routes are not publicly reachable.

### 19.2 Release checks

- Repeating bootstrap and migrations is safe.
- Supplier seed reports 21 already-present records on a rerun and preserves a prior
  administrator edit.
- A deliberately unhealthy task revision triggers circuit-breaker rollback.
- Task restart preserves database state.
- Scaling to two tasks does not change session verification or Supplier behavior.
- Start, stop, status, and destroy wrappers are exercised in the demo account.

### 19.3 Application smoke checks

Run the existing API and browser journeys through the CloudFront hostname:

- Frontend loads on desktop and mobile viewports.
- A unique MEMBER registers and logs in.
- MEMBER can list, search, filter, sort, paginate, and view Supplier details.
- MEMBER mutation attempts return 403.
- ADMINISTRATOR creates, updates, archives, views archived data, and restores a Supplier.
- ETags and `If-Match` preserve the 412 stale-update contract.
- Logout clears the local token and later protected calls fail.
- Authorization and ETag headers survive CloudFront and nginx forwarding.
- WAF rate limits are verified with a bounded non-production test and normal journeys
  remain unaffected.

### 19.4 Observability checks

- Each service writes to only its expected log group.
- Logs contain request IDs but no bearer tokens or secrets.
- A forced unhealthy target changes the expected metric/alarm state.
- The configured alert email receives a controlled test notification.
- `status` identifies stopped, unhealthy, and unexpectedly running resources.

## 20. Failure behavior

| Failure | Required behavior |
| --- | --- |
| Database bootstrap or migration fails | Stop release; do not update services |
| Supplier seed fails | Stop release; do not start the new Supplier revision |
| New task cannot become healthy | ECS circuit breaker rolls back |
| Smoke test fails after healthy rollout | Mark release failed and manually roll back images; retain compatible schema |
| User Service unavailable | Supplier fails closed according to its existing 503 contract |
| RDS unavailable | Backend health becomes unhealthy; no false success |
| WAF managed rule false positive | Keep managed rule in count mode or revert it; retain rate controls |
| AWS permission denied | Report the exact missing capability; do not replace the design silently |
| Budget input absent | Do not provision |

## 21. Permission and capability preflight

Before CDK bootstrap or provisioning, run read-only checks for:

- Current caller identity and approved Singapore region.
- Ability to describe VPC, ECS, ECR, RDS, CloudFront, WAF, CloudWatch, Secrets Manager,
  SNS, Budgets, IAM, and CloudFormation capabilities.
- PostgreSQL engine and instance-class availability.
- Service quotas required by the design.
- Existing CDK bootstrap state.

CDK bootstrap is a reviewed, explicit mutation because it creates deployment support
resources and roles. A school permission restriction is a blocker to report to the team or
course administrators.

## 22. Implementation increments

1. **Preflight and cost approval**: validate permissions, collect deployment inputs, and
   approve the estimate.
2. **CDK foundation**: package, tests, VPC, registry, cluster, tags, and outputs.
3. **Data**: RDS, parameter group, secrets, bootstrap contract, migration tasks.
4. **Application**: task definitions, Service Connect, security groups, health checks,
   ALB, logs, scaling, and rollback.
5. **Edge**: CloudFront VPC origin, cache behaviors, WAF, generated HTTPS URL.
6. **Release tooling**: immutable builds, ordered jobs, smoke tests, start/stop/status.
7. **Final validation**: acceptance evidence, cost observation, recovery and teardown
   rehearsal.
8. **Optional later automation**: GitHub OIDC deployment after the manual path is proven.

Each increment is separately reviewable and must not include unfinished Order or Credit
resources.

## 23. Future Order and Credit extension

Future services join the same ECS cluster and Service Connect namespace, receive separate
task and execution roles, own their own database or schema boundary, publish separate ECR
images, and add explicit nginx routes. They must not read User or Supplier database tables.

Their arrival triggers a review of:

- Whether one shared RDS instance still provides acceptable isolation and capacity.
- Whether distributed tracing is now worthwhile.
- Whether asynchronous messaging is required.
- Whether scaling limits and task sizes remain appropriate.
- Whether the temporary generated CloudFront hostname should be replaced by a custom
  domain and stricter end-to-end TLS.

## 24. Approved trade-offs

| Decision | Benefit | Accepted consequence |
| --- | --- | --- |
| Fargate instead of EC2 | No host patching or capacity management | Less control and potentially higher steady-state compute cost |
| CloudFront default hostname | HTTPS without owning a domain | Unfriendly URL and constrained viewer TLS policy selection |
| nginx gateway | Preserves tested same-origin behavior | Frontend task remains in the API request path |
| Shared RDS instance | Lower cost | Shared capacity and failure boundary |
| Public-IP tasks with restricted security groups | Avoids NAT and endpoint charges | Requires careful security-group review |
| Single-AZ RDS | Lower cost | Database AZ failure causes downtime |
| One active task per service | Lower idle cost | No task-level redundancy until scaling occurs |
| No initial tracing | Lower complexity and telemetry cost | Cross-service diagnosis relies on request IDs and logs |
| Disposable data | Reliable final teardown | Demo accounts and edits are not retained after destruction |

## 25. Unresolved deployment inputs

These are not architecture decisions and must be supplied or measured before provisioning:

- NUS team budget and approved `monthlyBudgetUsd` alert threshold.
- Operational owner and confirmed alert email.
- Bootstrap administrator username and NUS email.
- ECS CPU/memory allocations and target-tracking percentages from measurement.
- WAF rate thresholds from bounded load testing.
- CloudWatch alarm thresholds and evaluation periods from baseline measurements.
- Initial and maximum RDS storage plus backup-retention days from the cost estimate.
- NUS permission-set support for CDK bootstrap and every required service.

Missing inputs block provisioning; they do not authorize guessed values.

## 26. Documentation and review requirements

- Architecture decisions are recorded in root `docs/adr/`.
- Infrastructure commands and recovery/teardown runbooks live under `infrastructure/`.
- AI assistance is disclosed in every generated document and in `ai/usage-log.md`.
- The specification PR contains documentation only.
- No AWS resource is created until this specification is reviewed and approved.

## 27. References

- [CloudFront VPC origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html)
- [CloudFront distribution certificates](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesGeneral.html)
- [CloudFront access restriction for ALB origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/restrict-access-to-load-balancer.html)
- [CloudFront-scoped AWS WAF web ACLs](https://docs.aws.amazon.com/waf/latest/developerguide/web-acl-creating.html)
- [ECS Service Connect](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/networking-connecting-services.html)
- [ECS outbound networking](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/networking-outbound.html)
- [ECS deployment circuit breaker](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html)
- [ECS with an Application Load Balancer](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/alb.html)
- [RDS authentication guidance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/database-authentication.html)
- [Stopping RDS temporarily](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_StopInstance.html)
- [ECR immutable tags](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-tag-mutability.html)
- [Secrets Manager best practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
- [AWS CDK v2 guide](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
