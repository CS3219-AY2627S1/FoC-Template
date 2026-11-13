# CHANGE-102: Merge command recovery and lifecycle scheduling

- Date / approver: 2026-10-10 / Vincent.
- Branch: `sprint-2-3-credit-service-concurrency-update-event-payload`.
- Status: implemented and locally verified; Sprint `[~]`, live recovery `[!]`.
- Design: ADR-034; ARCH-EVO-039. Recovery -> expiry -> 48-hour completion,
  sequentially in one nontransactional every-minute scheduler; each phase catches
  failures independently. Lifecycle timestamp captured after recovery.
- Authority: F3/F4.1.1/F13 acceptance, F4.1.8/F10 expiry, F4.1.5/F5.1
  completion, NFR3/NFR4, ADR-020/026/033 and explicit technical
  amendment. No acceptance deadline bypass; command COMPLETED can mean rejection.
- Scope: existing scheduler and tests, relevant design/context/traceability,
  excluded learning, disclosure. No schema/peer/frontend/shared config change.
- Existing peer gap: FEEDBACK-010/003/006; no new API integration. HTTP recovery
  remains hard disabled. Stub tests do not verify real Credit consistency.
- TDD: first prove the obsolete independent timer exists (expected failing
  ownership assertion); then implement orchestration and verify all three phase
  ordering, time sharing, failure isolation and next-pass continuation.
- Verification: observed scheduler-ownership RED before production edits;
  first focused run also found a test-fixture verification before its second
  tick, corrected without weakening assertions. Final focused 28/28 pass,
  including 16 real PostgreSQL recovery tests with Credit contract stub. Full
  fresh-source Java 21 Maven 3.9.16 offline `verify`: 301 tests, zero failures,
  errors or skips; JaCoCo 1695 covered / 78 missed lines (95.60%), 622 covered /
  137 missed branches (81.95%). Unchanged >=80% gates pass. Docker 27.5.1 used
  isolated PostgreSQL 15 test containers, not application databases.
- Reproducibility: source-only copy `target/change102-verification` avoids stale
  deleted scheduler bytecode in the original target; source hashes match (zero
  mismatches). Logs: target/change102-red.log, change102-focused.log and
  change102-verify.log; XML/JaCoCo under the copy's target. Scheduled timers were
  disabled for deterministic integration tests; cron/ownership asserted directly.
- New PG cases: valid acceptance resolves and is not expired; expired acceptance
  is compensated before one refund; unresolved compensation blocks expiry until
  confirmed. Existing due/lease/owner/generation/race suites pass. Provider
  process-restart durability and live authorization are NOT verified.
- Workflow checks: source fingerprints manually match; generic drift helper
  fails existing manifest-column format. Generic completion helper fails on
  historical heterogeneous traceability/status tables and active-work text;
  these are not backend failures or claimed passes. No broad history repair.
- Source/test commit: `10fd76d`; documentation/disclosure commit: `7914810`.
  Learning remains excluded; personal profile is intentionally unstaged. No push.
- Rollback: restore separate timer and constructor/tests; do not delete data.
