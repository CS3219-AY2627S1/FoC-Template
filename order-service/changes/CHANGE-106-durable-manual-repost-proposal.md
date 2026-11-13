# CHANGE-106: Durable manual repost proposal

- Owner: Vincent, 2026-10-11.
- Branch: sprint-2-3-credit-service-concurrency-update-event-payload.
- Status: [~] APPROVED, implemented and automated verified; local rollout blocked.
  Vincent explicitly approves
  V8 original/candidate-ID migration and POST commands/{originalId}/repost on
  2026-10-11. The detailed design below is now effective, not speculative.
- Requirements: NTH4 manual repost, F10 expiry and approved F10.1.3 visibility
  override; ADR-025/028/030 existing repost/history/window rules; ADR-033/035
  command consistency/auth/lease rules. No new broker/event/financial policy.
- D1/selected Overall source SHA256 still match their persistent references.

## Approved existing architecture and observed implementation

Successful repost creates one NEW linked OPEN order; retain original EXPIRED and
its old-ID refund/history, hide it from requester list only on successful link.
Manual input requires quarter-hour UI selection and expiry >= submission+30min.
Current OrderRepostService.manual performs reservation inside a local transaction,
but does not register durable intent first. RepostControls has transient busy state,
new key per click and no command recovery. Durable commands currently support only
CREATE/ACCEPT/ABORT. order_commands.order_id is both target guard and Credit target.
V5 kind CHECK permits only those three; no candidate column exists for a command
whose guarded original and reservation target differ. Never rewrite V5.

## User-approved design — effective 2026-10-11

1. Add REPOST to the existing coordinator and browser command union. One immutable
   key binds actor, original order/version and submitted description/credits/duration/
   expiry. Keep server-owned pickup/delivery references frozen from the original.
2. Add new versioned Order migration V8: permit REPOST and add nullable candidate
   order UUID. For REPOST, order_id remains ORIGINAL (existing partial unique pending
   target index and repository guards); candidate_order_id is the NEW reservation/
   successor ID, generated once before unsafe I/O. Preserve all existing rows/IDs.
3. Lock original while registering/checking requester; validate EXPIRED/unlinked/
   version under the original lock before Credit I/O. Commit intent first, so a
   confirmed validation rejection can also be saved. Existing claim/lease allows one owner;
   other same-key submissions receive saved status and other reposts conflict.
4. Approved POST /api/orders/commands/{originalId}/repost takes existing
   ManualRepostRequest fields: commandId, actorId, expectedVersion, itemDescription,
   offeredCredits, deliveryTimeLimitMinutes, expiresAt. Return existing CommandView:
   202 PENDING or 200 COMPLETED with SUCCESS/REJECTED. Legacy POST
   /api/orders/{originalId}/repost delegates to coordinator; success retains normal
   Order JSON, unresolved202 saved command status; cannot bypass recovery.
5. Map internal REPOST to existing Credit RESERVE/CREATE gateway operation using
   saved candidate ID. Credit receives only requesterId/amount plus Authorization,
   Idempotency-Key and X-Command-Generation. Original ID/repost instructions stay in
   Order. No Credit implementation, DTO or topic change proposed.
6. Historical Credit lookup/same-key replay establishes remote result. Finalize
   under original lock and current claim, recheck ownership/state/link/version and
   candidate expiry, save new OPEN/checkpoint/receipt + original link + command
   SUCCESS atomically. Do not enforce a new sliding 30min window on every retry:
   validate it at initial submission, then require saved expiry still future.
7. Unknown timeout/local commit failure keeps PENDING. Minute recovery uses existing
   mechanism; no stored tokens/service credentials. AUTHORIZATION_REQUIRED offers
   owner Continue with fresh authorization. Expired candidate/invalidated original
   after possible remote effect needs existing conditional RESERVE compensation;
   only resolve rejection after confirmed reversal/fence, else reconciliation.
8. Confirmed terminal rejection keeps original EXPIRED/unlinked and saves latest
   safe repost failure message/code/time under original. Insufficient credits must
   not be guessed as refund delay. Unknown outcomes show pending, not failed.
9. UI retains account-scoped frozen key/input across reload/navigation; disables
   repost action/edited input while pending, shows processing until terminal
   success/rejection, Continue only for authorization. Success replaces linked old
   card with new order via existing requester-list helper and list refresh.
   Pending discovery gains REPOST label. Automatic repost remains deferred.

## Existing peer-service implementation / compatibility

Credit current reservation controller/service provides requester-owned RESERVE with
the paired headers, minimal body, new201/replay200 and durable outcome markers;
owner-authorized GET commands/{K} and POST commands/{K}/compensate. Source reviewed
at current Credit history (latest security change a2bab85). Classification:
MATCHES_APPROVED_CONTRACT for reused RESERVE wire operation; four actual Credit
REPOST recovery tests pass. Supplier validation checks existence/active/different
references, not opening hours; requester verification unchanged. No assumed new API.

## Alternatives and trade-offs

Recommended: extend existing coordinator with original/candidate identity. Reuses
security/recovery but needs migration, finalizer and UI/tests. Alternative: leave
repost legacy-only; smaller change but fails requested crash/reload guarantees.
Merely moving controllers cannot supply persistence/recovery. No broker proposal.

## Tests to write first after approval

- PostgreSQL clean/V7->V8 preservation; candidate stability, original guard and
  simultaneous same/different-key repost attempts; actor/input conflict rejection.
- Coordinator/API: initial/manual legacy route, timeout/lost response/local rollback,
  replay/new candidate saved once, terminal insufficiency + persistent message,
  deadline compensation, stale generation and owned fresh-token resume.
- Actual Credit/PostgreSQL integration: one reservation/one successor despite lost
  reply/restart; frozen expiry cannot be extended; no stranded late reservation.
- Frontend: pending disabled until terminal, same key/input after reload, only
  authorization Continue, success hides predecessor and shows successor; both
  modes/permissions and applicable responsive regressions.
- Backend/frontend regression, contracts, migration and coverage gates. This was
  the approved test-first plan; observed RED and current GREEN evidence below
  supersede the historical proposal-only stopping point.

## Expected artifacts and scope

Order command payload/store/coordinator, manual finalizer/domain helper/controller,
V8 migration; frontend repost controls/command hook/types/pending label and tests;
requirements/contracts/architecture/class-sequence/data/context/ADR/traceability/
change/active-work/learning/disclosure records. Peer source and deployment remain
unchanged. Explicit schema/design approval was received before implementation.

## Implementation and verification

V8, REPOST store/coordinator/fixed-ID finalizer, command/legacy routes and frozen
pending UI are implemented. Peers remain read-only; minimal Credit bodies unchanged.

- Observed RED: four new PostgreSQL tests rejected unsupported REPOST; frontend
  route test chose abort; three pending-control tests failed before implementation.
- Focused backend: 42 passed, zero failures/errors/skips, including 21 recovery and
  six migration tests. Earlier stale constructor/IDE-class failures were corrected
  through fixture fixes and isolated source builds, not counted as successful runs.
- Four new actual Credit/PG tests pass: real HTTP reservation/result/compensation
  with lost-reply proxy/local-commit fault injection, not financial-result stubs.
  User/Supplier validation in this harness uses fixtures, not live providers.
- Frontend: 90 tests/24 files pass; lint/typecheck passed (three pre-existing login
  unused-variable warnings, zero lint errors).
- Final fresh-source Java21/Maven3.9.16 verify:367 passed, zero failures/errors/skips;
  unchanged >=80% coverage gates pass:1972/2081 lines94.76%,836/1042 branches80.23%.
  All193 source/resource/test files match the tested snapshot. Includes16 actual
  Credit/PG/emulator tests,21 PG command tests,6 clean/upgrade migration tests and
  existing transition races. Source/test/V8/frontend commit:2c021b6.
- Final lint/typecheck, TOML, whitespace and smoke PowerShell parse pass. D1/Overall
  direct SHA256 match. Generic drift default manifest missing and completion helper
  historical-format incompatibilities (5 findings) remain; no generic pass claim.
- Local Docker image rebuild/start was attempted but engine API /info and container
  listing return500 and gateway is unavailable. Cancelled only task build clients;
  no daemon reset, deployment, cloud action or volume deletion. Consuming local
  V8 application/all-peer manual smoke and interactive desktop/mobile not verified.
- scripts/Test-ManualRepostIntegration.ps1 is the pending resume check, using real
  local services/emulators and fresh retained fixtures. It advances only its own
  Order expiry to test the actual scheduler, then checks old refund/new reservation,
  both route replays, one visible successor and cancellation/refund. Syntax passes;
  runtime is NOT marked passed. Browser/cloud/hosted CI and human migration review
  remain open; overall Sprint/strict completion stays[~]. Existing fork shutdown
  timeout warning persists despite Maven exit0/BUILD SUCCESS.

## Current list polling (unchanged)

OrderController GET mine?mode=requester&userId=UID&page=1&size=20 (My Requests),
mine?mode=courier&userId=UID&page=1&size=20 (My Errands), and
available?page=1&size=20 (Browse Errands), all under /api/orders; optional status
filter/pagination retained. CommandController GET commands/{key}?userId=UID reads
one pending action; commands?userId=UID&page=1&size=20 discovers pending actions.
Visible Order polling is 5 seconds; focus/initial check may run sooner.

Separate syntax-checked runtime smoke helper commit:172ea70. Its actual execution
remains pending on a healthy Docker engine; this hash is not a runtime pass.
