# CHANGE-083: Updated diagram reconciliation and scheduler cadence

- Date/owner: 2026-10-08 / Vincent, branch `sprint-2-3`.
- Status: approved cadence implemented and locally verified; repost expiry/retry implementation incomplete, retry design awaiting explicit decisions.
- Authority: latest attached flowchart plus the user's four textual amendments. The text supersedes the older labels in the PNG; the source PNG is not overwritten.

## Pre-implementation gate

Scope is Order only, with minimal Order-specific shared configuration/AI disclosure entries. Sibling backend services remain read-only; learning is never staged. Selected D1/overall sources and ADR-025 history/abort/repost retention remain authoritative, except the explicitly approved timing amendments below. No missing HTTP provider is silently replaced by a mock in HTTP mode.

- D1 F6.4/F7: one minute-based scheduler invokes the existing latest-delivery >=48-hour completion selection/locked transition.
- D1 F10/F11: the same job invokes existing unassigned OPEN deadline selection and atomic EXPIRED/refund-outbox flow.
- ADR-013 event reliability: retain immediate AFTER_COMMIT dispatch; scan all pending/failed/expired-lease event kinds every 15 minutes.
- NTH4: requested explicit repost expiry and strict `repostExpiresAt > repostDueAt >= original.expiresAt` are approved product amendments, but the new durable retry persistence/API/authentication design is not yet approved.
- NFR3.1.1/NFR4: regression tests, unchanged >=80% line/branch coverage gate, structured logs and explicit unavailable integration evidence.

Approved scheduler design: replace the two scheduled components with one `OrderLifecycleScheduler`, one `order.lifecycle.cron` / `ORDER_LIFECYCLE_CRON` setting defaulting to `0 * * * * *`. Both checks use one captured timestamp, call the existing independently transactional lifecycle methods, and isolate failures so an expiry failure cannot prevent completion and vice versa. Do not merge both passes into one transaction. Replace only Order-owned timer lines in Compose, environment examples/deployment configuration, and test disable properties. Retire the two old scheduler settings with documented migration instructions. Outbox recovery defaults to `0 */15 * * * *`, without delaying successful immediate publication.

TDD files: scheduler/cadence unit tests first; existing lifecycle/domain/outbox/controller/integration tests remain regression evidence. After implementation run focused tests and full Java 21 Maven verify with fresh JaCoCo; isolated Docker tests only, never reset application volumes.

## Inspection findings / remaining design approval

- Current automatic repost derives expiry from execution time + delivery duration and has no explicit configured new expiry. Current domain manual repost bypasses normal creation validation. No durable repost failure/request state exists.
- Retry after a lost reservation response currently generates another business ID; a retry design needs one stable new ID and peer reservation reconciliation before claiming duplicate-free behavior.
- Proposed (not approved): durable retry request with stable candidate ID, per-attempt dependency error classification, temporary retries until success or configured expiry, no automatic permanent-error retries, insufficient-credit-only small requester message.
- Proposed (not approved): trusted Order service identity/delegation for unattended retries. A lifecycle secret is not a Firebase user bearer token; do not persist user tokens indefinitely or weaken peer authorization.
- Supplier validation currently discards `200 / valid:false`; Order-side validation must consume its body before creation/repost. Credit reservation errors need semantic classification rather than treating every 409 as insufficient credits.
- Credit assignment/reset providers and Credit/User event consumers are absent in inspected sibling source. Existing FEEDBACK-002/003/004/005 remain open; document reservation recovery requirements without inventing peer approval.

No runtime/browser/cloud behavior is verified by these inspections. Full implementation and Sprint completion remain `[~]`.

## Supplier contract repair (ordinary implementation correction)

Against the existing inspected Supplier contract, Order now consumes the validation response. HTTP 200/valid:false rejects with VALIDATION_ERROR; missing body/valid confirmation fails closed with DEPENDENCY_UNAVAILABLE. No Supplier contract/source is changed. Both new tests failed before this implementation because no exception was thrown. After the repair the full Java 21 Maven verify run passed **163 tests, 0 failures/errors/skips** and unchanged coverage gates, including isolated PostgreSQL tests. This is HTTP contract-stub verification, not live Supplier integration.

## Final evidence and handoff (2026-10-09)

- Final fresh JaCoCo: **1254/1343 lines (93.37%)**, **376/454 branches (82.82%)**, thresholds unchanged.
- Unchanged frontend Vitest/RTL baseline: **34 tests / 12 files passed**. No new expiry/retry/UI test exists yet; this does not verify the requested future behavior. Frontend lint/type/build were not rerun because no frontend source changed.
- Base and HTTP Compose static config checks passed with a temporary non-secret ADC placeholder path (no file mount/start). Normalized Order configuration: shared lifecycle `0 * * * * *`, recovery `0 */15 * * * *` in BOTH profiles; mock/http selection unchanged. An initial empty ADC override failed interpolation; the placeholder rerun passed. No containers/cloud settings deployed.
- Source contains exactly the shared lifecycle and outbox scheduled methods; retired scheduler classes are absent from rebuilt classes. Existing expiry selection is locked/unassigned; completion rechecks latest delivery under lock.
- D1 and selected overall PDF SHA256 match the existing manifest. The reusable automated drift helper could not consume the historical manifest columns; direct fingerprint comparison was used, not silently rewriting authority.
- Atomic implementation commits: `392104b` cadence/config/tests, `d21c450` Supplier validation/tests. Workflow/diagram/feedback disclosure follows separately. Learning and peer sources untouched.
- Updated target diagram/gap table: `docs/diagrams/order-lifecycle-reconciliation.md`. Original PNG/PDF untouched. No Mermaid rendering tool is installed; syntax/flow were reviewed, not visually rendered or browser-verified.
- Scope remains partial: explicit auto expiry, durable retry/status/message, Credit response semantics, background auth, live peers/subscribers/browser and idle Cloud Run timing. Full Sprint 2/3 completion is not claimed.

## Affected artifact chain

Changed: effective cadence requirements/product architecture, integration feedback
(Supplier interpretation and proposed reservation recovery), ADR/evolution,
editable diagrams, Order scheduler/adapter code and regression tests,
documentation/indexes/active-work/context/disclosure, Order-only deployment timer
configuration. Unchanged: original sources, external API/event schemas, persistence
data model/migrations, peer implementations, frontend source, workflow skill
instructions, learning, running databases and actual cloud resources.

## Cadence verification

New scheduler tests first failed compilation because the shared scheduler did not exist; after implementation all five focused tests passed. Full Java 21 Maven verify passed **161 tests, 0 failures/errors/skips**, including isolated PostgreSQL integration tests, and the unchanged JaCoCo line/branch gates. Two old four-test scheduler suites were replaced by one three-test combined suite; the lower total is this consolidation, not skipped tests. A separate Maven clean attempt failed on the pre-existing Windows-locked target/maven-archiver directory; regular verify rebuilt classes and packaged successfully. Generated class inspection showed only the shared lifecycle and outbox schedulers, not retired scheduler classes. No application DBs or peer sources were modified.
