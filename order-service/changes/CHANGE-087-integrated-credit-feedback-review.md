# CHANGE-087: Integrated Credit implementation and remaining peer feedback

- Date/developer: 2026-10-09 / Vincent.
- Branch/source: sprint-2-3-credit, integrated revision 09e04a0.
- Request: inspect integrated Credit routes/topic subscriptions and rewrite
  peer feedback so only outstanding provider work remains in the open list.
- Scope: Order documentation/context and authorized AI disclosure only.
  Credit/User/Supplier source, app/tests, migrations, frontend and cloud read-only.
- Requirements: acceptance F3/F4, completion F6.4/F7, histories F8/F9,
  cancellation/abort F10/F11, NTH4 and security/reliability NFR1/NFR3; effective
  contracts in ADR-013/019/025/027/028. No requirement/diagram/architecture override.

## Findings and result

CreditController has exact expected assignment PUT/JSON/courier bearer/bodyless
200 and hold POST/no-body/bodyless 200. Core PostgreSQL behavior exists, including
courier account validation, RESERVED checks, assignment conflict, reset retaining
funds, transactional refund/settlement and event deduplication. Refund/completion
push handler/schema/OIDC security and environment provisioning script exist.
These are no longer missing build requests; evidence status READY_FOR_VERIFICATION,
NOT VERIFIED. Existing provider tests inspected only; no execution claim.

Remaining FEEDBACK-003: null-assignment reset returns success before caller check;
no retained attempt proof for authorized replay/stale same-courier reset.
FEEDBACK-006: identical terminal REFUNDED/PAID reservation replays return 200;
Order ignores success body; remote-success/local-rollback recovery unagreed.
FEEDBACK-005: delegated background calls still unsupported; push OIDC is not
delegated requester authorization; background retries remain paused.
New FEEDBACK-007: Credit accepts ABORTED/refund semantics on accepted cancellation;
current ADR-025 emits OPEN/EXPIRED User penalties. It rejects current events and
must NOT be repaired by refunding OPEN. Peer/platform must agree safe legacy
subscription cutover; no Credit code/config changed here.

Actual scripts are provisioning intent, not cloud state. Separate configure-
credit-pubsub.sh, not bootstrap alone, creates subscriptions; script includes
incompatible legacy stream. Production gated off. Compose local hostname/push
identity does not establish a public authenticated delivery path.

## Artifacts and verification

Rewrite peer feedback; preserve stable IDs/history through Git and implementation
evidence appendix. Correct obsolete balance.version example and clarify explicit
repost expiry exists in Order API but not event snapshot. Synchronize current
profile/allocation/active/context/sprint/contracts; no source or diagram changes.

D1 and selected Overall SHA-256 match recorded values. Generic drift checker
returns exit 2 because existing manifest lacks its required column names; not a
drift pass. gcloud unavailable; no GCP/API/browser/ledger/Maven tests run.
Documentation verification: all 8 feedback JSON examples parse; context TOML
parses and asserts reviewed branch, paused retries and live-unverified state;
change-log links resolve; git diff --check passes; exact changed-path review
confirms Order documentation only. Results also recorded in active work.
User/platform review and live contracts remain gates; Sprint [~].

## Recovery and next action

### Focused financial verification and reset clarification follow-up (2026-10-09)

Vincent asks specifically to verify CANCELLED/EXPIRED refunds and COMPLETED
transfer, leaving accepted-cancellation alone. Existing provider tests executed
unchanged in Java 21 Docker with read-only source copy; dependencies cached,
all build output container-local, temporary Testcontainers PostgreSQL credit_test.
Command: ./mvnw -B -ntp clean test
-Dtest=CreditOrderEventConsumerTest,CreditOrderEventControllerTest,CreditServiceTest,JpaCreditRepositoryIntegrationTest.
PASS 27 tests: consumer 5, controller 3, service 7, persistence 12; zero failures,
errors or skips. Flyway V1/V2 applied. Refund releases reserved funds; completion
asserts requester total 50 -> 40 / reserved 10 -> 0 and courier 50 -> 60, with
duplicate processing not paying twice. Includes legacy handler cases; these do
NOT close 007. No full suite, verify/coverage, live Pub/Sub, push OIDC or full
Order-to-Credit integration claim. No peer source/config/test/application edits.

Corrected 003 explanation in feedback/learning: Order's current locked ACCEPTED
status/version guard, exact-200 reset and atomic command receipt prevent the
ordinary sequential abort/reaccept from replaying an already committed reset.
Failed reset leaves ACCEPTED; replayed completed command avoids Credit. Residual
Credit-only cleared-state caller/stale-direct-request protection remains distinct.
No retry worker or new generation contract implemented; no design override.

Documentation-only; no migration, data deletion or runtime change. Git preserves
the previous feedback for comparison; a reviewed forward documentation correction
can restore/update it without resetting user work. Annablee/platform resolve
003/006/007, User resolves 002, owners agree 005. Then execute authenticated peer,
consumer/ledger/duplicate/timeout tests before setting VERIFIED or completion.
