# CHANGE-157: Repair compensation integration fixture configuration

- Date/requester: 2026-10-26 / Vincent, explicit request to reproduce and fix
  the upstream Order Maven verify failure.
- Classification: implementation/test-fixture detail within CHANGE-156/ADR-054;
  no architecture, business rule, peer contract or production security change.
- Traceability: F1/F3/F11/F13, NTH4 compensation durability/concurrency and
  NFR3.1.1 coverage/NFR3.1.3 negative-test requirements; existing diagrams and
  approved fixture-only live gate remain authoritative.

## Observed failure and intended repair

Actual upstream CI run205 at c097c95 reports Order559 tests,0 failures,10 errors,
0 skipped. All10 errors are OrderCompensationPostgresIntegrationTest context
startup failures. The innermost cause is `Order messaging mode must be cloud or
emulator.` The fixture incorrectly configures `order.messaging.mode=mock`.
Outbox fault-injection stack traces earlier in the job are passing negative tests,
not the failing assertion. The coverage report is not reached in that CI run.

Use supported cloud configuration with an explicit fixture transport boundary,
so real PostgreSQL/Flyway/locks/Order services run but no ADC, broker or cloud write
is attempted. Add an inexpensive context regression against the integration test's
actual annotation values; preserve rejection of unsupported mode and all existing
10 database scenarios. Do not change coverage thresholds, skip flags or production
publisher validation. Test-first evidence and final verification recorded below.

## Verification [x] - local Maven repair; remote rerun pending

- CI evidence: https://github.com/Y2627S1-CS3219-P-28/FoC-P28/actions/runs/40270130331/job/121400978683
- Initial local full verify attempted with Java21: common12 pass; Order470 tests,
  0 failures,15 errors,31 skipped because Docker was unavailable. This is an
  environment failure, not a successful reproduction of CI's context error.
- Docker Desktop subsequently reports server27.5.1 after user opened it.
- Configuration RED: `target/change157-config-red.log` runs2 tests,1 expected
  failure,0 errors/skips; the actual fixture annotation reproduces the unsupported
  mock mode, while the negative guard test passes.
- Repair uses supported cloud mode with blank emulator host and a mocked
  PubSubPublisherFactory/Publisher returning a fixture message ID. Ordinary event
  serialization/dispatch remains real; no Google connection/ADC is used. A new
  database-fixture test confirms publication uses only this boundary.
- Focused GREEN: `target/change157-focused-green.log` passes13 tests (11 real
  PostgreSQL scenarios plus2 configuration cases),0 failures/errors/skips. Includes
  clean V15 startup, V14 upgrade, final-commit/compensation races and original
  compensation cases. Credit/compensation results remain explicit fixtures.
- Full CI-equivalent Java21 root verify PASSES, exit0: common12 + Order562 =574
  tests,0 failures/errors/skips. Evidence `target/change157-full-verify.log`.
  Includes16 existing real Credit HTTP/ledger/emulator recovery cases and all11
  new compensation PostgreSQL fixture cases. The new Credit compensation protocol
  is still unverified and disabled.
- Fresh Order coverage: LINE3090/3262=94.73%, BRANCH1447/1786=81.02%; common and
  Order unchanged coverage gates pass. Previous execution data is backed up under
  each module's target; no class-mismatch warning or stale coverage credit used.
- Local Surefire emits its30-second post-System.exit(0) fork shutdown warning;
  Maven still exits0 and packages both modules. This remains a local JVM shutdown
  diagnostic, not the reported CI configuration failure or a test skip.
- Fix commit `a1053c7` contains two test files only. Production source/config,
  coverage thresholds, CI workflow and peers unchanged. No push performed;
  hosted CI must rerun after the user pushes the fix.
- Preserve pre-existing automatic-repost review edits. No peer, frontend,
  application runtime, database or deployment changes authorized by this repair.
