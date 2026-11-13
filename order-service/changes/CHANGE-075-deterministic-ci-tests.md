# CHANGE-075: Repair deterministic Order Service CI tests

- Date: 2026-10-08
- Developer: Yao Xiang, Developer 1
- Status: Implemented; local tests/coverage passed; hosted CI rerun required
- Change type: Test repair
- Related changes: CHANGE-067, CHANGE-068, CHANGE-071, CHANGE-074

## Evidence and scope

The user supplied the hosted CI output and its attached Maven log. Compose failed because GOOGLE_APPLICATION_CREDENTIALS_HOST was unset (CHANGE-074). Maven reported 123 tests with three failures and four errors. The final CI-passed job rejected these upstream failures as intended. This repair changes Order Service tests and tracking documents only; it preserves production behavior, API contracts, event payloads, and the 80% coverage requirement.

## Test repairs

- OrderAssignmentServiceTest fixes Instant.now() to its existing reference time for each test and closes the static mock afterwards. Acceptance fixtures no longer expire as the calendar advances. The Credit callback advances the mock clock to the expiry boundary instead of sleeping, so the test still checks rejection when Credit responds too late.
- OrderTaskEventFactoryTest uses the same Jackson 3 JsonMapper API as the runtime dispatcher/publisher. Its Instant fields serialize with supported Java-time handling; checkpoint-exclusion assertions remain intact.
- OrderOutboxDispatcherTest supplies the mandatory primitive fields in both legacy Order snapshots. Jackson 3 can deserialize these representative legacy payloads, allowing the tests to exercise compatibility routing and preservation of stable event IDs. Production deserialization remains strict.

## Traceability

The repaired acceptance tests cover Sequence 3's Credit-confirmation and expiry guards (CHANGE-068). Event snapshot and legacy routing tests cover the checkpoint-free event contract and Sequence 6 shared OPEN refund event (CHANGE-067/071). No Project D1 requirement, sequence/class responsibility, frontend behavior, peer endpoint, schema, or architecture decision changes. The approved Markdown contracts remain the reference; the original design PDFs are absent from this checkout.

## Verification

- Before the repair, the supplied CI log reports the seven failures/errors above.
- The three affected test classes pass: 13 tests, zero failures/errors/skips.
- Full suite: 123 tests, zero failures/errors, six skipped PostgreSQL Testcontainers checks because this sandbox cannot access the Docker named pipe.
- The first coverage check reported below 80% branch coverage because local target output still contained classes removed in earlier event refactors. After moving stale compiled output aside, the fresh build passed. Its isolated report measures 90.82% line coverage (1157/1274) and 81.19% branch coverage (341/420). The configured JaCoCo check passed against that fresh execution data; the 80% threshold is unchanged.
- Compose static validation returned exit code 0 with the placeholder ADC path. No credentials, Docker container, or Pub/Sub publication were needed.
- The workflow parses as YAML; git diff --check passes.
- Local verification uses wrapper-selected Maven 3.9.16 and Java 21, launched directly because the Windows wrapper cannot start in this sandbox. Source/target 21 overrides the release option locally because the sandbox denies access to the JDK ct.sym archive. CI toolchain settings and the POM are unchanged.

## Remaining verification

Push the changed workflow, tests, and tracking files and run hosted CI. The six PostgreSQL integration checks, Docker image build, actionlint, and GCP infrastructure checks were not verified in this session. No real Pub/Sub messages were sent.
