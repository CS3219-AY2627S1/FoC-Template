# CHANGE-170 - Report resolution and feedback hotfix

Date: 2026-11-01. Owner: Yao Xiang on hfix/report-service (confirmed in chat).
Status: verified locally; deployment and human review pending. AI assistance: OpenAI Codex.

## Approved scope

Fix the Report resolve response that returns HTTP 502 despite successful Order coordination. Keep stable command IDs, compensation, holds, authorization and private replies. Preserve meaningful business rejection messages for held aborts and related durable commands. Link the Admin Report's order summary to the Orders table with an exact order-ID search. New submissions allow only ORDER and GENERAL; retain historical COURIER/CREDITS records and resolution semantics. Add COURIER_BAD_ATTITUDE with approved positive magnitude 2 as an admin-confirmed report penalty, using existing final-outcome topics and maximum policy rules.

## Evidence and design

Staging logs show Order returning 200 while Reporting returns 502 in the same short request window. Report's coordinator currently forwards the entire downstream ResponseEntity after parsing JSON; forwarding framing/hop-specific headers with a reserialized body is unsafe. Return a fresh response containing only the downstream status and parsed JSON body. Test framing headers explicitly. Do not claim live redeployment verified this fix.

The compensation workflow loses OrderProblem's human-readable rejection before Credit is sent. Preserve that message only for known business failures and only when the durable row proves possible_effect=false. Unexpected errors retain a safe generic message; uncertain financial effects still compensate. Existing command receipts and outbox/event IDs stay stable.

Local follow-up: the default RETRY policy had a second validation catch which also replaced this message. Its PostgreSQL regression reproduced the exact generic toast. Preserve the trusted validation exception's message there too; temporary/authentication handling, remote Credit-code mapping and compensation-before-rejection remain unchanged. Terminal same-command replay retains the explanation, with no Credit execution/compensation and the Order still ACCEPTED. This is an implementation correction within the approved meaningful-error scope.

Read-only inspection on 2026-11-01 found the running local Reporting image already contains the fresh-response fix, but REPORT_RESOLUTION_ENABLED=false; the local Order database has no resolution journal rows. Both containers were launched with compose.yaml plus compose.http-peers.yaml. Those files do not forward Order's resolution settings or bootstrap Report compensation subscriptions. This configuration cannot establish a new coordinated resolution. It does not by itself explain the reported 502, and no root-cause claim or automatic activation is made. A fresh failed request/location is requested from the user. No application data was modified by these inspections.

The user then reproduced a fresh POST to the local gateway and confirmed 404. This establishes the disabled route as the current local failure. Complete the already approved local integration: enable both existing saga flags only in local Compose; pin the Report backend URL, demo topics/subscriptions and emulator-only push mode; make Report's outer Order timeout20s exceed Order's inner Report timeout5s; provision the two local compensation topics/push subscriptions through the existing emulator-only bootstrap. No cloud defaults, OIDC rules, peer backend behavior or funding rules change. This is required local configuration for the authorized resolution fix, not a new saga design. Recreate only Order, Reporting and frontend, preserving volumes. Existing no-GCP bootstrap guard remains mandatory.

The user explicitly approved two penalty points and new submission categories. Enum values for retired Report categories remain readable; new submissions reject them before uploads or hold placement. A PostgreSQL regression demonstrated V14's fixed policy constraint rejects the new case. New migration V19 expands only the Order and courier-attempt CHECK constraints; old migrations and data remain unchanged. No new topic, sibling User/Credit/Supplier service, or cloud mutation is needed. Backend targets: Order recovery, Report response/submission validation and foc-common policy. Frontend targets: shared existing Next.js components in ADMIN Reports/Orders and USER reporting; reuse styling and clients.

## Traceability and acceptance

| Requirement | Acceptance |
| --- | --- |
| NTH1/NTH3, approved Report saga | Fresh resolve response preserves 200/202 without downstream transport headers; retries reuse command ID |
| Order lifecycle/hold amendments, NFR3.1.3 | Held abort returns active-report explanation with no Credit call or compensation publication |
| Admin review amendment | Report order link prepopulates exact Orders-table search; detail View remains available |
| User category refinement | ORDER/GENERAL accepted; new COURIER/CREDITS rejected; historical records remain readable |
| NTH2, explicit policy amendment | Bad attitude adds 2, selectable by admin; existing maximum and deferred event semantics retained |

## Verification

### Local follow-up verification (supersedes earlier pending local notes)

- RETRY-mode PostgreSQL regression failed with the user's exact generic message before the correction. Its new terminal replay check proves the same ID returns the actionable report explanation without Credit execution, compensation or an event. Two frontend regressions reproduced generic historical hold messages; the shared reason-code formatter fixes both action and discovery notifications.
- Final unfiltered root `mvnw verify`:677 Order +13 common tests pass, zero failures/errors/skips; coverage gates pass. A prior focused run passed53 Order+13 common tests but failed the aggregate coverage gate because it covered only those classes; the subsequent unfiltered run resolves that verification limitation. Evidence: target/change170-retry-red.log, target/change170-retry-verify.log, target/change170-retry-full-verify.log.
- Frontend affected38 tests pass; ESLint and Docker production build including TypeScript pass. Evidence: target/change170-held-ui-red.log, change170-held-ui-green.log, change170-held-lint.log and change170-local-frontend-build.log.
- The real isolated harness passes eight scenario groups through actual HTTP, Nginx, PostgreSQL, Firestore and two-way Pub/Sub. It checks browser-route200/intact JSON/exact replay, hold release/private reply, final Order rollback, duplicate delivery, lost remote reply and delayed-original fencing. Only test data is used and disposable fixtures are removed. Evidence: reporting-service/target/change170-live-gateway-resolution.log and target/live-order-resolution-result.json.
- User's fresh local retry returned404, confirming disabled resolution routes as the current blocker. Both local Compose modes validate with explicit emulator-only settings. Emulator bootstrap ran twice successfully; both Report subscriptions have their expected topics and backend push URLs. Order/frontend images were rebuilt; Order, Reporting and frontend containers were recreated and are healthy. Generated OpenAPI through the local gateway now includes both real resolution routes. No volume was removed, no real report was resolved by the assistant, and no GCP resource or cloud activation changed.
- The specific inspected report remains AWAITING_COURIER_RESPONSE; the requester/admin must retry in their authenticated browser. The original502's precise cause is not proven by the newer404. Current isolated gateway resolution succeeds; do not claim a real-user resolution was completed. Stable request IDs must still be reused after uncertainty.

- Four frontend regressions reproduced the previous navigation/category/recovery behavior. The new penalty's real PostgreSQL test failed against V18's deferred-policy constraint before V19 was added.
- Report full Maven verify: 62 tests, zero failures/errors/skips; branch 81.63%, line 95.03%; coverage gates and generated OpenAPI pass. The new submission schema exposes only ORDER/GENERAL.
- Root full run executed 674 Order tests and found four version assertions expecting 18 instead of 19. Updated those latest-version expectations without weakening preservation checks. Added held-abort and archive cases; affected rerun verifies 42 Order tests plus 13 common tests, packaging and coverage gates. Current source-matched reports aggregate 676 Order and 13 common tests with zero failures/errors/skips. Order branch 81.02%, line 94.82%. Logs: target/change170-order-verify.log and target/change170-order-final.log.
- PostgreSQL validates clean/latest and older-schema upgrades, held abort's exact actionable message with no Credit call/outbox event, new policy persistence, highest-on-completion selection and archived-attempt readability. Existing saga compensation, atomicity and duplicate protections remain covered.
- Frontend full suite: 280 tests / 52 files pass. Lint and production build including TypeScript pass. Report Order links, initial exact-search table, saved-result recovery, absent-command retry, retired category links and two-point policy selection are covered. Logs: target/change170-frontend-final.log, target/change170-lint-final.log and target/change170-build.log.
- Context TOML and git diff whitespace checks pass. No User/Credit/Supplier implementation, infrastructure configuration, cloud data or running application stack was changed.

Deploy Order, Reporting and frontend to staging through the normal pipeline; Flyway applies V19 before Order startup. Staging resolution/hold-release and Google response handling still need a post-deployment smoke check. Old saved resolution commands should be checked/retried with their existing ID, not replaced with new mutations. User penalty consumers remain absent in the current checkout; publishing does not establish score application. Local containers were updated as described above; no commit/push/cloud deployment was performed.
