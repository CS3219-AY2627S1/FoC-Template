# AGENTS.md — FoC project conventions

Guidance for everyone working in this repository: teammates and AI coding agents alike.
Follow it so every service looks, builds, runs and deploys the same way. Service folders
may add their own `AGENTS.md` for service-specific notes; this file still applies.

`supplier-service/` is the reference implementation of these conventions.

## 1. Repository layout

- One top-level folder per deployable unit: `<name>-service/`, `frontend/`, `gateway/`.
- A folder becomes part of CI/CD as soon as its `Dockerfile` is non-empty.
- Shared, cross-cutting files live at the root: `compose.yaml`, `.env.example`,
  `infra/`, `scripts/ci/`, `.github/`, `docs/`.
- Do not import code from another service's folder. Services communicate through
  approved HTTP/event contracts. Shared library dependencies are allowed only
  through designated Maven modules: `foc-common/` currently contains courier
  penalty policy only. No shared entities, repositories or authentication code.
- Root `pom.xml` builds `foc-common` and its first consumer, `order-service`.
  Other backends retain standalone builds until explicitly adopting the library.
  A library has no Dockerfile and is not a deployable service.

## 2. Tech stack (use these versions)

| Concern | Standard |
| --- | --- |
| Language / runtime | Java 21 (Eclipse Temurin) |
| Framework | Spring Boot 4.1.1: `spring-boot-starter-webmvc`, `-validation`, `-actuator`, `-security`, `-security-oauth2-resource-server` |
| Build | Maven via the wrapper (`./mvnw`); never require a global Maven |
| Base package | `sg.edu.nus.foc.<name>` (e.g. `sg.edu.nus.foc.supplier`) |
| Database | Firestore via `com.google.cloud:google-cloud-firestore` (use `libraries-bom`) |
| API docs | `springdoc-openapi-starter-webmvc-ui` (mandatory, see section 6) |
| Tests | JUnit 5, Spring Boot Test, Testcontainers (`testcontainers-gcloud` Firestore emulator) |
| Coverage | JaCoCo `check` in `verify`: ≥ 80% line **and** branch (NFR3.1.1) |
| Frontend | Next.js 16 App Router, TypeScript, Tailwind CSS 4, shadcn/ui |

Generate a new service from https://start.spring.io (Maven, Java 21, Boot 4.1.1, group
`sg.edu.nus.foc`), then copy `pom.xml` extras, `Dockerfile` and `deploy/` from
`supplier-service/`.

## 3. Service folder skeleton

```text
<name>-service/
├── Dockerfile               # copy docs/templates/spring-boot.Dockerfile
├── README.md                # what it does, endpoints, how to run/test, design decisions
├── AGENTS.md                # optional service-specific notes
├── pom.xml, mvnw, mvnw.cmd, .mvn/
├── deploy/
│   ├── service.conf         # Cloud Run settings (HEALTH_PATH, EXTRA_FLAGS)
│   └── env.yaml             # extra Cloud Run env vars (optional)
└── src/
    ├── main/java/sg/edu/nus/foc/<name>/
    │   ├── <Name>ServiceApplication.java
    │   ├── config/          # @Configuration, @ConfigurationProperties
    │   ├── security/        # token validation, role lookup
    │   ├── <domain>/        # entities, repository, service, controller, DTOs
    │   └── error/           # @RestControllerAdvice + error envelope
    ├── main/resources/application.yaml
    └── test/java/...        # *Test (unit) and *IntegrationTest (Testcontainers)
```

## 4. Runtime contract (every backend service)

- Listen on `${PORT}` (default 8080): `server.port: ${PORT:8080}`.
- Stateless; all configuration comes from **environment variables**. Document every
  variable in the root `.env.example`.
- `GET /actuator/health` is public and reports readiness (Cloud Run and CI smoke tests
  use it). Enable `management.endpoint.health.probes.enabled: true`.
- Don't give any endpoint a path ending in `z` (e.g. `/healthz`). Cloud Run reserves such
  paths and answers 404 before the request reaches your container.
- Log to stdout. The cloud writes JSON logs (`LOGGING_STRUCTURED_FORMAT_CONSOLE=logstash`, with the
  level renamed to `severity` so Cloud Logging shows and filters it). Key-value pairs
  (`log.atInfo().addKeyValue("orderId", id)`) and MDC values become JSON fields you can query.
- Standard variables (compose sets them locally, `scripts/ci/deploy.sh` in the cloud):

| Variable | Meaning |
| --- | --- |
| `PORT` | HTTP port |
| `LOG_LEVEL` | root log level |
| `FIRESTORE_PROJECT_ID` | GCP project holding the database |
| `FIRESTORE_DATABASE_ID` | `<name>-<environment>` (`<name>-local` in compose) |
| `FIRESTORE_EMULATOR_HOST` | set only when using the emulator |
| `FIREBASE_AUTH_PROJECT_ID` | Firebase project that issues ID tokens |
| `FIREBASE_AUTH_EMULATOR_HOST` | set only when using the Auth emulator |
| `USER_SERVICE_MODE` / `USER_SERVICE_URL` | how to look up user roles (`mock` or `http`) |
| `MOCK_ADMIN_EMAILS` | emails granted admin while `USER_SERVICE_MODE=mock` |
| `CORS_ORIGINS` | comma-separated allowed browser origins |

## 5. Docker

- Use `docs/templates/spring-boot.Dockerfile` unchanged unless you have a reason:
  multi-stage (JDK build → JRE runtime), layered jar, non-root user, `EXPOSE 8080`.
- Standalone services use `docker build <folder>`. Services that depend on `foc-common` (Order,
  User) build from the repo root: `docker build -f order-service/Dockerfile .`. CI and staging
  pick the context with `scripts/ci/build-context.sh` (root when the Dockerfile copies
  `foc-common/` or `<service>/` paths); set the same in `compose.yaml`. Keep root
  `.dockerignore` restrictive.
  Tests are **not** run inside
  the image build; CI runs them separately (they need Docker for Testcontainers).
- Never bake data files or secrets into images. Mount files (e.g. seed CSVs) instead.

## 6. API conventions

- Base path `/api/<resource>` (plural): `/api/users`, `/api/suppliers`, `/api/orders`,
  `/api/credits`, `/api/admin`. The gateway routes on this prefix.
- JSON only. IDs are opaque strings. Timestamps are ISO-8601 UTC (`2026-09-25T08:00:00Z`).
- Lists are paginated: `?page=1&size=20` (1-based, `size` ≤ 100) and return
  `{ "items": [...], "page": 1, "size": 20, "totalItems": 42, "totalPages": 3 }`.
- Errors always use this envelope:

  ```json
  { "status": 403, "error": "FORBIDDEN", "message": "Only administrators can manage suppliers.",
    "path": "/api/suppliers", "timestamp": "2026-09-25T08:00:00Z",
    "details": [{ "field": "name", "message": "must not be blank" }] }
  ```

  | Status | `error` | When |
  | --- | --- | --- |
  | 400 | `VALIDATION_ERROR` | invalid body / query parameters (`details` lists fields) |
  | 401 | `UNAUTHENTICATED` | missing, invalid or expired token |
  | 403 | `FORBIDDEN` | authenticated but lacks the role |
  | 404 | `NOT_FOUND` | unknown resource |
  | 409 | `CONFLICT` | duplicate or state conflict |
  | 503 | `SERVICE_UNAVAILABLE` | a dependency is down |

- **Every endpoint must be documented in OpenAPI** (repo-wide rule, enforced by CI):
  - add `springdoc-openapi-starter-webmvc-ui` and serve the docs at `/api/<resource>/docs`
    (Swagger UI) and `/api/<resource>/v3/api-docs`
    (`springdoc.swagger-ui.path` / `springdoc.api-docs.path`); permit both paths in security;
  - annotate every operation with `@Operation(summary = ...)`, and document parameters with
    `@Parameter` and non-obvious responses with `@ApiResponse`;
  - copy `docs/templates/OpenApiDocumentationTest.java` into the service. It fails the build
    when an operation lacks a summary or a 2xx response, and it writes `target/openapi.json`,
    which CI publishes as the `openapi-<service>` artifact.
  An endpoint that isn't in the OpenAPI document doesn't count as done.

## 7. Authentication and authorisation

- The frontend signs users in with Firebase Auth and sends `Authorization: Bearer <ID token>`.
- Each service validates the token with Spring Security's OAuth2 resource server:
  issuer `https://securetoken.google.com/<FIREBASE_AUTH_PROJECT_ID>`, audience
  `<FIREBASE_AUTH_PROJECT_ID>`, Google's securetoken JWKS. The user ID is the `sub` claim.
- Roles (`requester`, `courier`, `admin`) come from the User Service
  (`GET /api/users/role-context` with the caller's token). Enforce them with `@PreAuthorize` on
  endpoints; never trust roles sent by the client.
- Prefer looking roles up only on endpoints that need them, with a short per-user cache, so reads
  keep working when the User Service is down (see `supplier-service` `CallerRoles`). A failed lookup
  answers 503, never 500.
- Compose and the cloud use `USER_SERVICE_MODE=http`. `mock` (everyone is a requester and a
  courier, and the emails in `MOCK_ADMIN_EMAILS` are admins) is for running one service on its own,
  and is the cloud's rollback switch in `infra/environments/<env>.env`.
- The cloud Firebase project (`cs3219-p28-auth`) enforces a password policy (8+ characters,
  upper- and lowercase letters, a number and a special character). The local Auth emulator
  does not.

## 8. Data

- One database per service per environment, and each service's runtime identity can only access
  its own. The default is Firestore (`<name>-local`, `<name>-staging`, `<name>-production`). A
  service may choose another store with a recorded decision: Order and Credit use PostgreSQL on
  the shared Cloud SQL instance (separate databases, users and Secret Manager passwords;
  order-service ADR-008), and the User Service uses MongoDB Atlas (`user-mongodb-uri-<env>` secret).
- There's no list to edit. A service whose `pom.xml` depends on `google-cloud-firestore` is
  detected automatically (`scripts/ci/list-services.sh --firestore`).
- CI's **Cloud infrastructure** check fails your PR until the service's identity, databases
  and access exist in staging and production. When it does, ask the CI/CD owner to run
  `infra/gcp/bootstrap.sh`, then re-run the job. Nothing reaches `main` half-provisioned.

## 9. Testing

- Standalone services use `./mvnw verify`. From the repo root, Order/common use
  `bash ./mvnw -pl order-service -am verify` (PowerShell: `.\mvnw.cmd -pl order-service -am verify`).
  Unit/integration tests and existing JaCoCo gates must pass. Changes to common or
  root Maven inputs conservatively select all Maven backends in CI.
- Integration tests use the Firestore emulator through Testcontainers; no shared or
  real databases in tests. Mock JWTs with `spring-security-test` (`jwt()`).
- Every test class covers at least one positive and one negative case (NFR3.1.3).

## 10. Frontend

- All UI lives in `frontend/`; it renders pages and calls services through the gateway
  using `useApi()` (`src/hooks/use-api.ts`). No business logic, no API routes, no direct
  database access.
- Pages for a feature go in `src/app/<feature>/`; shared feature components in
  `src/components/<feature>/`. Register the entry point in `src/config/navigation.ts`.
- Build UI from shadcn/ui components (`npx shadcn@latest add <component>` inside
  `frontend/`). This project uses the Base UI flavour: compose with `render={...}`, not
  `asChild`. Every page must work from 320 px to 1920 px wide (NFR2.1).
- `npm run lint` and `npm run typecheck` must pass (CI runs both; `typecheck` generates Next.js route types first).
- Configuration is read at request time (`src/lib/runtime-config.ts`), not via
  `NEXT_PUBLIC_*`, so one image serves every environment.
- In the cloud the UI is only used through the gateway. `src/proxy.ts` redirects direct
  visits to the frontend's own URL to `FOC_PUBLIC_URL` (the gateway). Keep API calls
  relative (`useApi()`) so they always go through the gateway.

## 11. Adding a new service (checklist)

1. Create `<name>-service/` following sections 2–3 and fill in its `Dockerfile`.
2. Add a block to `compose.yaml` (copy the template at the bottom).
3. Add `location /api/<resource>` to `gateway/templates/default.conf.template` and the
   `<NAME>_SERVICE_URL` default to `gateway/Dockerfile` / `gateway/deploy/env.yaml`.
4. Add any new env vars to `.env.example`.
5. Document every endpoint in OpenAPI and add `OpenApiDocumentationTest` (section 6).
6. In the cloud the new service gets internal ingress (only the gateway is public). If it calls other
   services, set `VPC_EGRESS=all-traffic` in its `deploy/service.conf` (see docs/ci-cd.md).
7. Open a PR; CI builds and tests it. If the **Cloud infrastructure** check fails, the CI/CD
   owner runs `infra/gcp/bootstrap.sh`, which provisions the new service's identity (and
   databases, if it uses Firestore). Then re-run the check (section 8).

## 12. Git workflow and secrets

- Branches: `<your-name>/<topic>`. Never push to `main`; merge via PR with **CI passed**.
- Commit messages: `feat:`, `fix:`, `test:`, `docs:`, `ci:`, `refactor:`, `chore:`.
- Never commit secrets: `.env`, service-account keys (`*.json`), `*.pem`. Local secrets go
  in `.env`; cloud secrets go in Google Secret Manager.
