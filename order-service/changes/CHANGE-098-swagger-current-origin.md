# CHANGE-098: Swagger API calls use the current origin

- Date / developer: 2026-10-10 / Yao Xiang, confirmed current branch order-service/sprint-1/yx-sprint-2-and-3.
- Trigger: user reports staging Swagger network/CORS failure and supplies its gateway URL.
- Classification: safe implementation detail within the approved gateway/OpenAPI runtime contract; not a new authentication or infrastructure design. Parent AGENTS OpenAPI requirement; NFR2/NFR3/NFR6. No new architecture approval claimed.

## Verified live evidence

Read-only public GETs on https://gateway-staging-374055363871.asia-southeast1.run.app:

- /api/orders/swagger-ui/index.html:200.
- /api/orders/v3/api-docs:200,16 paths, servers[0].url=http://order-service-staging-374055363871.asia-southeast1.run.app.
- /api/orders/v3/api-docs/swagger-config:200, specification URL remains /api/orders/v3/api-docs.

The generated server targets both a different host and HTTP from an HTTPS Swagger page, producing browser mixed-content/cross-origin failures. Source confirms gateway proxy Host is the backend host and X-Forwarded-Proto is the internal scheme; no explicit Order OpenAPI server existed. Browser's exact console error was not supplied, so the wrong published URL is verified while the exact browser rejection was inferred. Web browsing tool could not open the live UI; native HTTP GETs succeeded. No tokens or credentials accessed and no protected mutation called.

## Implemented behavior

CHANGE-098 sets an explicit relative OpenAPI server / through OpenApiConfiguration. Swagger now resolves API calls against the origin serving the specification, retaining /api/orders paths and Firebase authorization. Live staging docs previously advertised an HTTP backend host despite HTTPS gateway UI. This is an Order-only documentation routing implementation detail; no gateway, peer, CORS allowlist, forwarded-header trust, schema, frontend or deployment-env change.

A dedicated OpenApiConfiguration Spring bean returns an OpenAPI with one Server URL /. It does not depend on untrusted forwarded headers or hard-code staging/production domains. The existing OpenApiDocumentationTest imports that bean and requests docs with backend Host, gateway forwarded host and HTTP forwarded scheme; it must still expose exactly one relative server. Existing endpoint summaries, response checks and pending personal-status assertions are retained.

Relative server URLs are resolved against the OpenAPI document origin: https://swagger.io/docs/specification/v3_0/api-host-and-base-path/. Explicit current-origin metadata fixes this path without broadening browser access or changing Spring Security. Existing bearerAuth security definition and public-docs/protected-API policy remain.

## Verification

Tests first: one expected server-URL failure and one existing documentation pass (target/change098-red.log). Fresh source-only wrapper-selected Maven3.9.16/Java21 offline verify:253 tests,0 failures/errors/skips, including28 PostgreSQL tests; coverage96.00% lines (1441/1501),83.72% branches (468/559), unchanged >=80% gates pass. Generated target/openapi.json servers=[{url:"/",description:"Current gateway or service origin"}];160 current POM/source/test/resource files equal the fresh tested copy. Logs/reports target/change098-verify.log and target/change098-source-check/target/, evidence target/change098-evidence.json. git diff --check passes. No local application container rebuild or real authenticated browser request; no commit/push/cloud deployment. Staging remains unchanged until Order Service redeployment.

Database containers in the tests are isolated Testcontainers, not the user's running Compose databases. Runtime/cloud peer consumers and publication are not verified by these checks. No pre-push CI rehearsal, sibling matrix or cloud/IAM changes performed.

## Affected artifacts

Added production file: src/main/java/sg/edu/nus/foc/order/config/OpenApiConfiguration.java.
Updated test: src/test/java/sg/edu/nus/foc/order/api/OpenApiDocumentationTest.java; prior CHANGE-094 edits preserved.
Updated records: README.md; docs/architecture-evolution.md (ARCH-EVO-034); docs/architecture-order-service.md; docs/service-contracts.md; docs/ai-project-context.md/TOML; docs/current-sprint.md; docs/change-log.md; docs/requirements-traceability.md; docs/active-work/yao-xiang.md; ../ai/usage-log.md. Added ignored learning/swagger-current-origin.md and target verification scripts/copies/logs. Existing ADRs, business requirements, class/sequence/data diagrams, persistence and migration configuration remain effective: no business interaction/responsibility or data-model change.

## Apply and verify in staging

Merge/release the Order Service change through the existing approved CI/CD process, then deploy its new image to staging. No environment-variable, database or IAM change is required for this correction. Reopen the same gateway Swagger link; Servers should show /. Try-it-out Request URL must start with the HTTPS gateway origin. Use a valid staging Firebase ID token in Authorize; normal role/identity rules still apply. After successful deployment, re-read live docs and perform an authenticated browser query before marking staging behavior verified. The existing deployment pipeline should also carry this configuration into production on its normal production release.

Staging not changed in this task; all source/documentation remains uncommitted with prior work. Sprint stays [~].
