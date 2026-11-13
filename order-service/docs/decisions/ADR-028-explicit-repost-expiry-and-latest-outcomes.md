# ADR-028: Explicit automatic expiry and durable latest repost outcome

- Date/approver: 2026-10-09 / Vincent, explicit implementation request and
  follow-up selection to disable legacy no-expiry plans.
- Status: user-approved; implemented and locally verified by CHANGE-086.
- Related: NTH4, F1/F8/F9, NFR2/NFR3, ADR-022/025/026/027, ARCH-EVO-031.
- Supersedes only missing-expiry/client-local outcome limitations. Original
  PDFs/PNG and prior approvals are preserved. Full Sprint remains [~].

## Decision

New creation-time automatic plans require an explicit ISO UTC repostExpiresAt:
expiry > due >= original expiry. The existing quarter-hour frontend picker
provides 00/15/30/45 minutes; API timestamp precision is not narrowed.
Execution may be late, but only while the saved new expiry is still future.
Never derive it from execution time plus delivery duration. Post-creation
automatic settings remain immutable. Manual repost already has explicit expiry.

V4 adds nullable automatic expiry and safe latest failure code/message/time on
orders. Disable legacy enabled plans without explicit expiry, rather than invent
one. Preserve IDs/status/history/outbox and existing due/amount/duration/used data.
An enabled plan is constrained to valid timing in the database too.

For an eligible authorized manual/automatic attempt failure, keep the original
EXPIRED/unlinked and roll back the business attempt. A separate Spring service
records only a short safe outcome AFTER rollback using REQUIRES_NEW and a row
lock. Newer failure overwrites older; older callbacks and linked/non-EXPIRED rows
are guarded. Successful repost linkage clears outcome fields. Ownership/auth/
version/controller rejections before an eligible attempt cannot overwrite an
account's message. A DB outage can prevent outcome persistence; preserve the
original error and separately log that the result was not saved.

Order API returns these fields; My Requests reads them on reload/polling and
refreshes original version after a failed foreground attempt. Fields are not
financial ledger data or credentials. Existing peer request/event contracts
and broker topology stay unchanged. No permanent user token storage.

## Alternatives and boundaries

- Browser-only text disappears after reload/device change and fails the request.
- Committing the failed repost transaction risks partially saved business state.
- Persisting an attempt/task/candidate for background retry is a separate paused
  design, not implied by saving one latest message on the original order.
- Backfilling expiry from duration was explicitly rejected by Vincent.

All background retries and trusted peer credentials remain paused in EVERY mode
until peer agreement and user resumption. Existing automatic trigger can attempt
and save failure; this ADR adds no automatic retry worker or auth bypass.
Confirmed insufficient funds cannot distinguish delayed refund from true low
balance; never display a speculative refund explanation.

## Verification and migration recovery

CHANGE-086 records tests-first failures, complete current-source test/coverage,
frontend checks and isolated clean/V3-to-V4 migration/persistence tests. Provider
ledger/consumers, authenticated responsive browser, cloud and hosted CI remain
unverified; local tests do not constitute production completion.

Rebuild matching Order/frontend; startup Flyway expects version 4. Back up
non-disposable databases before deployment. No volume reset/down migration;
restore reviewed pre-upgrade backup or use a forward correction. Do not re-enable
legacy plans midway through an existing order or rewrite V1-V3.
