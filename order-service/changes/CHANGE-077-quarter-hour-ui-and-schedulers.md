# CHANGE-077: Quarter-hour Requester times and lighter scheduler scans

> The five-minute outbox recovery cadence recorded here was superseded by [CHANGE-078](CHANGE-078-hourly-outbox-recovery.md). Other CHANGE-077 behavior remains effective.

- Date: 2026-10-08
- Owner: Yao Xiang, Developer 1
- Status: Implemented; local deterministic checks passed; visual/deployed runtime checks pending
- Approval: User explicitly requested the UI minute choices and 15/5/1-minute scheduling intervals
- Decisions: ADR-022, ARCH-EVO-024

## Behavior

The shared frontend's Post Request, automatic repost plan and manual repost expiry use QuarterHourDateTimePicker under frontend/src/components/orders. Its date/hour/minute controls reuse the shared shadcn/Base UI primitives and allow only 00/15/30/45 minutes. Defaults and the minimum suggestion round up; the existing 30-minute minimum expiry remains enforced. Manual repost defaults also move into the future when the original expiry is old. Form validation rejects an invalid selection before posting; the existing API client still converts local values to UTC ISO timestamps. Requester ownership/authentication, numeric delivery duration and peer contracts remain unchanged.

OrderExpiryScheduler scans every 15 minutes. At CHANGE-077, OrderOutboxScheduler recovery was every five minutes while immediate after-commit dispatch stayed active; CHANGE-078 changes only that recovery interval to hourly. OrderAutoCompletionScheduler remains every minute, comparing the actual delivered checkpoint to its 48-hour cutoff. Application defaults, Compose overrides, .env.example, both deployment .env files and the Cloud Run env template specify the same cadence.

## Traceability

F1.1-F1.3/Sprint creation and F4.1.8/F10 scheduled expiry, NTH4 repost, F4.1.5/F5.1 completion and NFR3 verification are covered by this user-approved refinement. API timestamps and event schemas are unchanged; existing/direct API off-slot deadlines are selected by the DB due query and can expire on the next quarter-hour pass. The original Project D1/overall-design PDFs remain absent; effective approved Markdown contracts are synchronized. No peer source, database schema, migration or deployment billing change.

## Verification

- Test-first evidence: helper tests failed for missing rounding/validation and picker; Spring cron boundary test failed because expiry next ran at 10:02 instead of 10:15.
- Frontend tests cover minute choices/disabled state, rounding/invalid selections, creation ISO payload, and manual repost expiry/invalid-date prevention. Final frontend suite: 29 tests passed, zero failures/skips. Route type generation and TypeScript no-emit checks passed. Full lint passed with 12 pre-existing warnings outside changed files; final changed-file lint has zero warnings/errors.
- Focused scheduler/outbox suite: 12 tests, no failures/errors/skips.
- Full Maven verify: 125 tests, no failures/errors, six skipped PostgreSQL Testcontainers checks due to denied Docker named-pipe access. Fresh coverage: 90.82% lines and 81.19% branches; configured JaCoCo check passed on the fresh execution data. Local Java/Maven permission workarounds are the same as CHANGE-075; tracked build settings remain unchanged.
- Compose config --quiet passed using the CI placeholder ADC path; no container or cloud publication started. Both staging and production rendered env templates parse with the exact cron values.
- Browser setup found no connected browser; visual checks at 320-1920px and authenticated live walkthrough were unavailable and are not claimed.

## Remaining issues and recovery

Push and deploy the changed files to use the cadence. Existing root .env overrides can retain old schedules until updated. Cloud Run idle scheduling remains limited by the existing scale-to-zero/request CPU configuration. Topic IAM, subscribers and hosted integration/image checks are outside this turn's verification. Revert CHANGE-077 to restore the native arbitrary-minute controls and previous expiry/recovery defaults; do not round existing records or undo published events.
