# AI Usage Log

## Minimal API Gateway implementation
Date: 2026-09-30
Time: 4:15 PM SGT
Tool: ChatGPT
Model: GPT-5.6-Luna

Exact prompt:
> Implement Phase 1: Minimal Working Gateway based on the Phase 0 inspection findings.
>
> Requirements:
> - Create a minimal Node.js + TypeScript + Express gateway under gateway/.
> - Use environment config with PORT default 8080, FRONTEND_ORIGIN default http://localhost:5173, USER_SERVICE_URL default http://localhost:3002, SUPPLIER_SERVICE_URL default http://localhost:3001.
> - Expose GET /health with { status: "UP", service: "api-gateway" } and do not proxy /health.
> - Configure CORS for allowed methods GET, POST, PUT, PATCH, DELETE, OPTIONS and headers Content-Type, Authorization.
> - Proxy /api/auth, /api/users, and /api/suppliers to the corresponding upstream services.
> - Preserve JSON request bodies safely when proxying using http-proxy-middleware.
> - Do not implement JWT auth, rate limiting, or database logic for this phase.
>
> Deliverables:
> - gateway/package.json
> - gateway/tsconfig.json
> - gateway/.env.example
> - gateway/src/config/env.ts
> - gateway/src/server.ts
>
> Also provide the exact curl verification commands for health, CORS preflight, auth forwarding, and supplier forwarding.

Key response:
Created the minimal gateway scaffold with a dedicated health endpoint, CORS setup, environment configuration, and reverse-proxy routing for the auth, user, and supplier APIs. The implementation uses http-proxy-middleware with a body-safe proxy interceptor and validates the build and runtime behavior with curl-based checks against the live user and supplier services.

Files affected:
- gateway/package.json
- gateway/tsconfig.json
- gateway/.env.example
- gateway/src/config/env.ts
- gateway/src/server.ts

Author review:
The output was reviewed and validated against the Phase 0 inspection findings and Phase 1 scope. The gateway build succeeds, the health endpoint responds with the required payload, and CORS preflight works. Route-forwarding was then adjusted to preserve the correct upstream API path prefixes so the gateway reaches the correct downstream endpoints.

## Gateway JWT authentication implementation
Date: 2026-09-30
Time: 4:15 PM SGT
Tool: ChatGPT
Model: GPT-5.6-Luna

Exact prompt:
> Implement Phase 2 of the API Gateway for the CS3219 campus errand platform.
>
> Scope:
> - Add `jsonwebtoken` to the Gateway.
> - Add `JWT_SECRET` to the Gateway environment configuration.
> - Implement Gateway JWT authentication middleware that reads Authorization: Bearer <token>, rejects missing or malformed Authorization headers with HTTP 401, verifies signature and expiration using the shared JWT secret, validates that the decoded token contains sub, jti, and exp, and stores the authenticated identity as req.user with id, jti, and exp.
> - Add Express TypeScript request augmentation for req.user typing.
> - Apply authentication selectively: public auth register/login; protected auth logout; /api/users/* protected; supplier routes unchanged.
> - Preserve reverse-proxy behavior and request body forwarding.
> - Do not add a Gateway token blacklist, Redis, role authorization, or business logic.
> - Use 2-space indentation for JavaScript/TypeScript.
>
> Also verify the expected behaviors for missing JWT, invalid JWT, valid JWT acceptance, public auth flows, protected route enforcement, and logout behavior through the User Service's revocation mechanism.

Key response:
Implemented the Gateway Phase 2 JWT auth middleware, added the required environment variable and TypeScript request augmentation, and applied auth selectively to public auth endpoints and protected user routes while leaving supplier routes unchanged. The middleware validates the Authorization bearer token, enforces 401 on malformed or invalid tokens, and attaches the decoded identity to req.user. The gateway build was verified and the protected-route checks were exercised against the live User Service and downstream revocation flow.

Files affected:
- gateway/package.json
- gateway/src/config/env.ts
- gateway/src/middleware/authMiddleware.ts
- gateway/src/types/express.d.ts
- gateway/src/server.ts

Author review:
The output was reviewed against the Phase 2 architecture constraints. It preserves the existing Gateway proxy behavior, adds JWT verification using the shared secret only, and keeps the implementation limited to authentication enforcement without introducing a second revocation model or role logic.

## Gateway security hardening and observability implementation
Date: 2026-09-30
Time: 4:33 PM SGT
Tool: ChatGPT
Model: GPT-5.6-Luna

Exact prompt:
> Implement Phase 3: Security Hardening & Observability for the API Gateway.
>
> Scope:
> - Add request tracing middleware that keeps existing X-Request-Id values or generates a new UUIDv4 when absent.
> - Attach the request ID to the response headers and forward it to downstream services via http-proxy-middleware.
> - Add a sanitized request logger that records `[ISO-Timestamp] [requestId] METHOD PATH -> STATUS (LATENCYms)` without logging tokens, passwords, request bodies, or credentials.
> - Ensure downstream connection failures return HTTP 502 with { "status": 502, "message": "Bad Gateway" } and do not leak internal Node.js or network errors to the client.
> - Keep the existing reverse proxy, CORS, and JWT authentication flows from Phase 1 and 2 unchanged.
> - Use 4-space indentation and keep the implementation minimal.
>
> Deliverables:
> - gateway/src/middleware/requestId.ts
> - gateway/src/middleware/logger.ts
> - updated gateway/src/server.ts
>
> Also provide curl verification commands for request ID reflection and simulated downstream outage handling.

Key response:
Implemented the Phase 3 Gateway hardening layer: request ID propagation middleware with UUID fallback and response header reflection, a sanitized logger that records only method/path/status/latency metadata, and proxy error handling that masks internal connectivity failures behind a uniform 502 Bad Gateway response. The Gateway continues to preserve the existing routing, CORS, and JWT authentication behavior while forwarding the request ID to upstream services.

Files affected:
- gateway/src/middleware/requestId.ts
- gateway/src/middleware/logger.ts
- gateway/src/server.ts
- gateway/src/types/express.d.ts

Author review:
The output was reviewed and validated against the Phase 3 requirements. The implementation preserves the existing Gateway topology, does not log sensitive information, forwards X-Request-Id cleanly, and ensures proxy outages are surfaced to clients as a sanitized 502 without exposing backend internals.

## Gateway Dockerization and orchestration implementation
Date: 2026-09-30
Time: 5:45 PM SGT
Tool: ChatGPT
Model: GPT-5.6-Luna

Exact prompt:
> Implement Phase 4: Dockerization & Orchestration for the API Gateway.
>
> Requirements:
> - Create gateway/Dockerfile and gateway/.dockerignore with a multi-stage node:20-alpine build.
> - Stage 1 runs npm ci, copies the source, builds with npm run build, and prunes production dependencies.
> - Stage 2 runs as non-root, copies only the dist output, production node_modules, and package manifests, and serves on port 8080.
> - Exclude node_modules, dist, .env, .git, and logs from the Docker build context.
> - Update the root compose configuration to include the gateway container using the actual service names and internal DNS targets.
> - Bind host port 8080:8080 and pass PORT, FRONTEND_ORIGIN, USER_SERVICE_URL, SUPPLIER_SERVICE_URL, and JWT_SECRET.
> - Keep the existing reverse proxy, JWT auth, request ID propagation, and sanitized logging behavior unchanged.
> - Use 2-space indentation and do not introduce new architecture or additional components.
>
> Deliverables:
> - gateway/Dockerfile
> - gateway/.dockerignore
> - updated root compose configuration
> - verification checklist covering health, request ID reflection, downstream proxying, and outage handling.

Key response:
Implemented the Phase 4 Dockerization layer for the Gateway: a two-stage Node Alpine Docker build, a production-safe .dockerignore, and a root Compose integration that connects the gateway to the actual user-service and supplier-service containers over the internal Docker network. The Gateway preserves its route separation, JWT enforcement, request ID propagation, and sanitized 502 handling while exposing the service on port 8080.

Files affected:
- gateway/Dockerfile
- gateway/.dockerignore
- compose.yaml

Author review:
The output was reviewed and validated against the finalized Phase 4 architecture. The container build is kept minimal, the internal network targets use the actual Compose service names, and the Gateway remains aligned with the already verified Phase 1–3 behavior without adding new infrastructure components.
