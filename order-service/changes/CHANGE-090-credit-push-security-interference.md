# CHANGE-090: One-time Credit push-security interference

Date: 2026-10-09. Approver/developer: Vincent. Branch: sprint-2-3-credit.
Status: approved repair locally verified; Credit owner/live financial checks pending.
Verified source/test commit: 198cd7c. No push.

## Permission and ownership

Vincent explicitly approved the proposed narrow Credit security fix and regression
tests and requested this interference Markdown. This is a one-time exception to
the Order-only boundary, not a transfer of Credit ownership or blanket peer-edit
permission. Annablee remains the Credit owner. Prior diagnosis is FEEDBACK-008.

## Pre-implementation gate

Current sprint: Sprint 2-3, financial integration still [~].
Feature: restore authenticated Pub/Sub push without Firebase user-role lookup.
Project D1 references: cancellation/expiry credit return and completion credit
transfer; existing financial outcome paths, not a new product requirement.
Relevant amendments: effective event outcomes and ADR-029 local-live connector.
Relevant FRs: F4.1.7 cancellation, F4.1.8/F10 expiry, F4.1.5/F5.1 completion;
existing EV-7 financial outcome references include F7.1/F10.1.4.
Relevant NFRs: NFR3.1.1 existing 80% line/branch gate; NFR3.1.3 positive/negative tests.
Relevant sequence diagram: approved Order lifecycle cancel/expire/complete branches.
Relevant class diagram: Order outbox publisher -> Credit push controller/consumer.
Relevant service contracts: existing Google-authenticated wrapped push, 204 success.
Actual peer-service APIs inspected: Credit SecurityConfig, push validator/properties,
controller/envelope/consumer, User role provider, Credit user APIs and existing tests.
API mismatches or gaps: FEEDBACK-008, push chain inherits global Firebase converter.
Affected backend components: Credit security configuration, new security test only.
Affected frontend components: none; backend-only security repair explicitly scoped.
Frontend directory and structure inspected: shared Next.js routes/config/components,
auth/API helpers and package/configuration inspected; no overlapping changes found.
Affected application role and USER mode: unchanged; service identity is not a USER.
Desktop and mobile-web behavior: unchanged; existing balance polling remains intact.
External services involved: Google Pub/Sub push; User role lookup for user APIs only.
Data owned by Order Service: lifecycle and durable outcome/outbox references, unchanged.
Data owned by other services: Credit balances/ledger and User roles, unchanged.
In-scope behavior: independent push converter; actual bearer-filter regression tests.
Out-of-scope behavior: financial rules, consumer routing, schema, endpoints, cloud,
IAM, anonymous push, mock roles, delegated repost auth or background retry work.
Assumptions: existing approved Google push identity configuration remains correct.
Open questions: live ledger/retry/DLQ success requires verification after Credit rebuild.
Detailed design approval status: Vincent approved this exact exception on 2026-10-09.
Interaction decisions awaiting approval: none for this repair; peer delegation paused.
Tests to write first: valid signed push bypasses RoleProvider; invalid identity rejected;
ordinary Firebase API still checks roles and fails closed when lookup is unavailable.
Files expected to change: Credit security config/test; Order tracking/handoff/learning;
AI disclosure. No deployment/application database mutation.

## Why interference is necessary

The live push decoder validates the Google service token, but Spring Security then
automatically selects the shared JwtAuthenticationConverter bean. That converter
calls FirebaseRoleAuthoritiesConverter, forwarding the service token to User's
role-context route. User correctly rejects it; Credit fails before consuming the
refund event. Order cancellation and Pub/Sub publication do not prove a refund.

## Exact approved repair

Give only pubSubPushSecurityFilterChain a fresh, explicit JwtAuthenticationConverter
instead of inheriting the Firebase-role converter. Keep its existing Nimbus decoder
and signature, lifetime, issuer, audience, verified email and service-account checks.
Keep the business security chain and Firebase role converter unchanged.

Classification: implementation detail restoring the already-approved service-token
authentication boundary. No architecture, financial contract or broker change.

## Credit files changed and files deliberately untouched

1. `credit-service/src/main/java/sg/edu/nus/foc/credit/security/SecurityConfig.java`:
   only the first (push) chain explicitly selects a fresh converter. No new global
   converter bean is registered and no token validator is weakened.
2. `credit-service/src/test/java/sg/edu/nus/foc/credit/security/PubSubPushSecurityTest.java`:
   new regression suite, signed RSA JWTs with a local public-key server, actual
   production filter-chain methods and validators, HTTP Authorization headers.
   Only the Google key-server address and test collaborators are substituted;
   the financial consumer is mocked in these security tests. They are not proof
   of Google delivery or a real refund. Existing financial/JPA tests are separate.

Credit controllers, consumers, DTOs, role lookup, financial services, repositories,
migrations, application settings and POM remain unchanged. No Order application,
frontend, gateway, Compose, cloud resources, IAM or application volumes changed.

The existing push decoder is retained. The repair is exactly:

```java
.jwt(jwt -> jwt.decoder(pubSubPushJwtDecoder(properties))
        .jwtAuthenticationConverter(new JwtAuthenticationConverter()))
```

The second (user) chain retains its Firebase converter and role/ownership guards.
Default push conversion creates an authenticated service principal from a token
already validated by the existing decoder. It does not grant customer roles.

## Test-first evidence

An initial test-fixture stubbing error was corrected without production edits.
The meaningful pre-fix run then executed 15 cases: 14 passed; the valid signed
push failed with AuthenticationServiceException through
FirebaseRoleAuthoritiesConverter, exactly reproducing the live failure. Production
was changed only after this red result. Final green/coverage evidence follows.

Security assertions cover valid push while User lookup is unavailable; wrong
signature, issuer, audience, email, unverified email, expired JWT and Firebase
issuer; missing/malformed token; ordinary courier role lookup; non-courier denial;
User lookup outage returning 503; service token rejected by user APIs; and caller
identity mismatch returning 403. Invalid push never calls User or the consumer.

Why older tests missed it: an injected MockMvc `jwt()` authentication bypasses
the bearer decoder/converter. These regressions send the bearer header instead.

## Runtime handoff and rollback

From FoC-P28, rebuild only Credit using the existing local-live overrides:

```powershell
docker compose -f compose.yaml -f compose.http-peers.yaml -f compose.local-live.yaml up -d --build --no-deps credit-service
```

Do not recreate the tunnel (its URL would change) or reset application databases.
Inspect Credit/ingress logs for financial push returning 204 and confirm the
original cancelled/expired reservation becomes REFUNDED, reserved credits fall
and available credits rise exactly once. Completion must settle to its assigned
courier exactly once. Existing failed messages may retry or already be in the DLQ;
fixing authentication does not automatically redrive a DLQ. Preserve event IDs and
coordinate any DLQ replay/reconciliation with the owner; do not invent new refunds.

Rollback only this SecurityConfig converter selection and rebuild Credit. No
database rollback/migration is needed; rollback reintroduces the authentication
bug. Annablee must review this narrow exception before production promotion.

## Verification and handoff

- Pre-fix focused run: `bash ./mvnw -B -ntp -Dtest=PubSubPushSecurityTest test`:
  15 cases, 14 pass / 1 expected converter error / zero skips after fixture repair.
- Post-fix full `verify`: 80 tests, zero failures/errors/skips. Repeated from clean
  source-only copy (no host target or old execution data):
  `bash ./mvnw -o -B -ntp clean verify`, Java 21.0.12.1, disposable Docker runner
  and isolated Testcontainers PostgreSQL 15 with existing V1/V2 migrations.
  BUILD SUCCESS at 2026-10-09T07:22:26Z; 80 tests, zero failures/errors/skips.
- Fresh JaCoCo: 844/884 lines = 95.48%; 231/270 branches = 85.56%. Existing 80%
  gates/exclusions/POM unchanged. Package and OpenAPI tests/export also pass.
- XML reports, jacoco.xml and openapi.json copied to local temporary evidence
  directory `foc-credit-security-0e0d3c904df9474ab44d1ba7a7cd06e5` under `%TEMP%`.
  These generated artifacts are not committed. Testcontainers clean their own
  databases; disposable runners removed after extraction. No application DB reset.
- Source scope/whitespace and context TOML checked. D1/Overall PDF fingerprints
  match; the generic source-drift checker still rejects the historical manifest
  column format (exit 2), not claimed passed. No Order/frontend suites rerun:
  neither application source changed. No full pre-push rehearsal requested.

Only local security and Credit regression gates pass. Real Google delivery, original
cancelled-order refund, completion transfer, duplicate delivery and backlog/DLQ
recovery have NOT been verified. Running application image was not rebuilt or
restarted. FEEDBACK-008 stays READY_FOR_VERIFICATION; Sprint remains [~]. See the
handoff command above, Vincent active work and the feedback record. No peer design
decision was made on the owner's behalf and no production promotion is authorized.
