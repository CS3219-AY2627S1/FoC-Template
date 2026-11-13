# CHANGE-091: Field errors and a 30-minute new repost window

- Date / approver: 2026-10-09 / Vincent, explicit implementation request and
  confirmation to leave already-saved automatic plans unchanged.
- Status: implemented and locally verified; live/browser gates open; Sprint [~].
- Traceability: F1.1-F1.3, NTH4, NFR2/NFR3; ADR-028 timing refinement.

## User-approved design

Creation shows only actual invalid fields and their reasons inline, with an
accessible summary. Same supplier means identical supplier IDs, not similar
names. Reuse existing ErrorResponse details[field,message]; no peer contract
change. Authenticate normally, then validate local creation data before Supplier
validation and Credit reservation. Credit remains balance owner.

New automatic plans require repostDueAt >= original.expiresAt and
repostExpiresAt >= repostDueAt + 30 minutes. Manual submissions require expiry
>= submission time + 30 minutes. Quarter-hour selection remains UI-only; API
timestamps retain their precision. Disabled automatic fields are ignored.

Already-saved explicit-expiry plans are grandfathered: do not update, disable,
extend or migrate them. Keep ADR-028's late execution rule: the saved expiry must
still be future, without demanding 30 minutes remaining when the scheduler runs.
The earlier V4 treatment of plans WITHOUT any explicit expiry remains unchanged.

No schema migration, new endpoint, peer code, ledger/event change, background
retry worker, service credential or scheduler change. Existing outcome persistence,
ownership/version/replay guards and new repost business IDs stay intact.

## Tests first / completion

Test field-only creation failures, Supplier/Credit not called for invalid local
data, exact new-plan/manual boundaries, hydrated legacy plans and late automatic
execution, client/server inline error mapping and successful submission.
Run focused RED/GREEN then Order/frontend regressions. Results recorded below
and in Vincent active work; no production/live integration claim from mocks.

## Observed evidence and limitations

- Tests first: frontend automatic-minimum and same-ID/server-detail tests failed
  against the old implementation. Backend focused run: 10 tests, 4 failures;
  three identify missing detail/minimum rules; manual short expiry incorrectly
  reached save (fixture returned null). Added a save stub to make that negative
  case independent of the fixture. No false pass recorded.
- First complete regression: 202 tests, one existing elapsed-expiry fixture
  failed because it constructed a NEW two-minute plan. Corrected its due time
  to make an already elapsed 30-minute plan. Added a separate true legacy test
  using isolated SQL to reload and execute an old short-window saved plan.
- Final fresh source-only Java 21 wrapper offline verify: 207 tests, ZERO
  failures/errors/skips. Isolated Testcontainers PostgreSQL, no application DB
  changes. Includes real legacy plan reload/execution; exact manual/new automatic
  boundaries, local-validation-before-peer checks, security/contract regressions
  and OpenAPI export. JaCoCo 1387/1455 lines (95.33%) and 464/549 branches
  (84.52%); existing >=80% gates pass unchanged.
- Final frontend: 51 tests / 15 files pass. Lint has zero errors and 12 existing
  login/profile warnings; typecheck and production build pass. An added expiry
  assertion initially landed in the unrelated persisted-credit test; moved to
  the cleared-date test and reran the whole suite. Build retains the existing
  home package-lock warning. No peer-owned frontend cleanup.
- D1 and selected Overall hashes match. Git whitespace/scope checks pass.
  Large context outputs were truncated; historical records not fully rehydrated
  this turn. Do not claim the full workflow/context-completion gate passed.
  Historical generic drift/completion-script format findings are not waived.
- Live authenticated/responsive browser and real provider/cloud behavior were
  not retested. No application stack rebuild/reset, peer/source/infrastructure
  write, new background credential/retry or schema migration. Review/rebuild the
  Order/frontend images in the SAME existing Compose profile; preserve tunnel
  and application volumes. Sprint [~], learning remains ignored.
- Generated local evidence: target/change091-verification/ (ignored).
- Atomic verified source commits: d8d090e (Order backend/tests), 583729f
  (Order frontend/tests); documentation/disclosure separate, no push.
