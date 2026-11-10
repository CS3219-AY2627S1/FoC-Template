# CHANGE-189 - Reporting-authenticated internal hold placement

Approved Yao Xiang, 2026-11-11, hfix/penalty-event-ordering: implement the agreed
internal hold endpoint, Reporting caller authentication, preserved participant
checks, disabled public mutation and necessary local/deployment integration.
Current profile/branch and authoritative source hashes match prior approved work.
Root/Order/frontend instructions loaded; Reporting has no nested instructions.
Existing CHANGE-185--188 work is preserved. D1 NTH1/NTH2 reporting/held funding and
NFR3 reliability are retained; this fixes the reviewed direct-hold boundary.

Contract: PUT /api/orders/internal/report-holds/{orderId}/{reportId}. Same body
requireAssignedCourier, reporterRole, submissionId and same six response facts.
Authorization remains the participant Firebase bearer token. Separate
X-Reporting-Service-Authorization carries Reporting's Google ID token (Bearer)
for the exact Order audience and configured runtime service account. Order verifies
signature, time, issuer, audience, verified service email and subject in addition
to existing role/ownership/hold transaction checks. The previous public placement
URL is removed; GET /api/orders/mine/active remains public-user authenticated.
Gateway's existing all-internal Order protection blocks the new route.

Reporting obtains cached/renewable ID tokens from its attached runtime identity
through ADC, not key files, and also uses X-Serverless-Authorization for Cloud Run
ingress. Application proof uses its own header because platform processing must
not strip the signature being verified. Existing runtime account is reused; scoped
provisioning grants Reporting run.invoker on Order. No new topic/account/migration.

Local Compose uses an explicit emulator-only shared development credential in that
same header. Both applications reject this mode outside local demo Firebase-emulator
configuration. Cloud never accepts the local credential and requires Google identity.
No browser receives the service credential. This is local test support, not production
authentication. New mode/audience/account/local settings documented in .env.example.

Affected source: Order internal controller/verifier/config and public query controller;
Reporting HTTP client/token provider; Compose/deployment settings, scoped IAM script,
contracts/OpenAPI/tests/handoff. No frontend change. Existing saga payloads, durable
submission, compensation, ownership and lifecycle semantics unchanged. The separate
stale-upload rejection race is not fixed in this task.

Cutover: pause linked report submissions, deploy both compatible services/settings,
wire scoped IAM and verify, then resume. Old Reporting binaries cannot use the removed
public URL. Rollback also requires coordinated binaries/settings; do not restore a
public unauthenticated placement path. No GCP or live data mutation authorized here.

Verification: RED client path/header contract; real signed-token/identity negatives;
missing/wrong service proof, missing user token, unrelated participant, public route
removal, requester/courier modes, local/cloud configuration gates, OpenAPI, targeted
and full backend checks, local Compose/gateway/provisioning tests. Human cloud
rollout remains an operator step.

## Verification and implementation complete (local source, 2026-11-11)

RED: two existing HTTP client tests failed on the expected new path before the
implementation. Focused contract checks then pass; full Order/common verify passes
734 Order and14 common tests, zero failures/errors/skips, with unchanged coverage
gates. Full Reporting verify passes111 tests with zero failures/errors/skips and
coverage gates. Real RSA signed-token tests cover signature, issuer/audience/account,
email verification, missing required claims and expiry. Other tests cover both
identities, unrelated/incorrect roles, old public404, local environment guards,
cached/refreshed ADC identity and failure before Order HTTP, and unchanged six-field
responses. Initial compile/setup omissions (annotation import and OpenAPI mock
collaborator) were corrected before the full passing run.

All21 mocked CI provisioning/wiring checks pass, including the new scoped Reporting
Run Invoker binding. Both Compose variants validate; scoped shell syntax and diff
checks pass. Generated OpenAPI independently confirms the internal operation,
required service header and absence of the former public operation. A harmless
request against the running local gateway (empty body, nonexistent IDs, no tokens)
returns the gateway's own404 for the internal path. The existing non-fatal delayed
Surefire fork shutdown diagnostic appeared in the successful Order run; no failed
or skipped tests and no coverage gate changes.

No actual Google metadata/JWK/IAM integration, cloud resource mutation or deployment
was performed. ADC/JWT tests use mocked runtime credentials and local signing keys;
HTTP contract tests use controlled services. Disposable database tests use no user
data. The running Order/Reporting application images were not rebuilt or restarted.
Human review, coordinated local/cloud rollout and deployed smoke checks remain.

| Project D1 reference | Requirement | Implementation | Test | Result |
| --- | --- | --- | --- | --- |
| NTH1/NTH2 | Reports hold eligible participant Orders without public direct-placement bypass | InternalReportHoldController, Reporting client/credentials and service verifier | Both identities, role/ownership contract, legacy404 | Passed locally |
| NFR3 | Reliable authenticated integration and preserved recovery | Existing hold transaction and creation/resolution sagas retained | Full734 Order/111 Report suites, signed-token negatives,21 wiring checks | Passed locally; cloud pending |

Source/class/data-flow ownership, header contract, environment settings, IAM command,
local rebuild, coordinated rollout and rollback are documented in
[internal-report-hold-auth.md](../docs/internal-report-hold-auth.md). Owner handoffs,
live API descriptions, ADR/index, context, active work, architecture, traceability,
learning and AI disclosure are updated. No frontend, persistent schema, penalty
policy, topic or event payload change. The stale-upload/HOLD_PENDING rejection race
remains separately listed in peer-service-api-feedback.md; it is not hidden by this fix.
