# CHANGE-108: Pending command display after browser storage loss

- Status: APPROVED by Vincent, 2026-10-11 ("Yes I agree proceed"); implementation [~].
- Date: 2026-10-11; requester: Vincent, current matching concurrency branch.
- Classification: material frontend design refinement plus additive owner-facing
  command response/access projection. Detailed approval received before code/tests.
- Related existing approvals: ADR-033/035 command recovery, ADR-037 manual repost;
  existing creation/acceptance/abort/F10 repost and NFR2 responsive/NFR3/NFR4 gates.
- Evolution: ARCH-EVO-044. No new broker interaction, peer API or financial rule.

## Existing design and inspected limitation

useOrderCommand restores only local IndexedDB intent. PendingOrderCommands polls
the owned command list, but renders separate labels/messages, not order cards.
CommandView has key/kind/orderId/status/reason but no pending display details.
CREATE/REPOST immutable descriptions/supplier references/amount/duration/expiry
already exist in saved CommandRequest. ACCEPT/ABORT target existing Orders.
Pending acceptance is not yet in courier /mine. Normal GET-by-ID can deny the
unassigned courier after expiry; do not loosen general read permissions to render
the pending command. Existing key/lease/guard/compensation behavior stays intact.

## Proposed owner-only display contract

Add nullable displayDetails to owner-facing CommandView, generated after existing
identity/command-owner checks. Fields: itemDescription, pickupSupplierId,
deliverySupplierId, offeredCredits, deliveryTimeLimitMinutes, expiresAt; for
ACCEPT/ABORT also current committed orderStatus and version. Existing orderId is
the actual target for ACCEPT/ABORT, original for REPOST and candidate for CREATE;
never treat a CREATE candidate as an already-created order.

CREATE/REPOST displayDetails come from frozen saved command input; ACCEPT/ABORT
details come from the existing target Order under command-owner authorization,
not a general read-access grant. Missing original target produces a safe pending
fallback, not a forged card. Never expose raw command payload, identity tokens,
lease/owner/hash, peer diagnostics or another user's command. Supplier references
are resolved using existing frontend supplier lookup; no new backend peer calls.
No persistence migration is expected: inputs and target Orders already exist.
Credit bodies/headers/result/compensation/event contracts remain unchanged.

## Proposed frontend design

- A shared account-scoped discovery/cache polls existing paginated list API every
  five seconds while visible, covers all relevant pages and clears on account
  change. Cards also retain local intent for a submission not yet discoverable.
- Match existing-order commands by kind + orderId and preserve the original key.
  Accept: OPEN card with Acceptance pending or Continue with authorization.
  Abort: ACCEPTED card with Abort pending or Continue with authorization.
  Disable competing card actions while unresolved. ABORTED attemptId history is
  read-only; never attach a live command to that historical snapshot.
- My Errands can show a pending acceptance's existing OPEN target from its owned
  display projection even before assignment. Deduplicate against normal cards by
  business orderId; label pending acceptance, never imply it is already accepted.
  Pending tasks remain discoverable outside the selected board page/status filter.
- CREATE/REPOST stay in Requests in progress as submitted-detail summaries, not
  fake Order cards. A pending repost's original remains a normal EXPIRED card;
  disable another repost until resolved. No successor card before confirmed save.
- Resume uses POST /commands/{sameKey}/resume with fresh user authentication,
  no new UUID/body. Polling remains read-only except existing local same-key
  resubmission when submission was not recorded. Remote-only discovery must not
  invent/resubmit frozen input on a missing-key response.
- A command disappearing from a pending page is NOT proof of success. For a
  previously known key, fetch owned terminal result, then clear pending and
  refresh normal lists. Network/discovery failure must retain known pending state.
- Preserve desktop/mobile UI primitives, account boundaries and role/mode guards.
  No global prohibition on independent new orders is introduced by this proposal;
  new-key duplicate creation after storage loss needs separate explicit policy.

## Options, trade-offs and approval

1. Keep the existing separate panel: no contract change, but poor action context
   and no submitted details after local loss.
2. Recommended: owner-only safe display summary plus shared discovery/card binding.
   More UI/cache/contract tests, but works without IndexedDB and does not grant
   unrelated order access or duplicate recovery handlers.
3. Fetch each target through normal GET: fewer DTO changes, extra requests and
   insufficient authorization after expiry; cannot supply uncreated order details.

Vincent explicitly approves option2, including the response/access extension and
rendering/recovery rules. ADR-038 defines the effective design before code/tests.

## Planned test-first verification and synchronization

Backend owner-only summary/source fields, no raw payload/secrets, list/status
contracts, read after courier eligibility/deadline changes, missing target;
frontend empty IndexedDB recovery, pending accept/abort card state/Continue/same
key, creation/repost details without fake cards, no duplicates/history binding,
pagination/filter coverage, stale response/account switch/failed refresh, terminal
transition and no terminal inference from list absence. Run focused then relevant
backend/frontend regressions, lint/typecheck, responsive/manual checks.

Expected areas: CommandView/OrderCommandService/OpenAPI/tests; shared command
discovery hook/context, useOrderCommand, pending panel, cards/actions and errands/
my-errands/my-requests/repost controls/tests; ADR/contract/context/traceability,
class/sequence/evolution/change/active-work and required disclosure after approval.
Peers, schema, outbox, event payloads, infrastructure and automatic repost unchanged.
Historical proposal verification: source inspection only, no tests written/run.
Source authority PDF fingerprints unchanged; current Sprint/rollout gates remain.

## Implementation gate (2026-10-11)

Current sprint: Sprint 2/3, existing concurrency/recovery extension [~].
Feature: server-discovered pending cards and submitted creation/repost summaries.
Project D1 references: F1 creation, F3/F4.1.1 acceptance, F4.1.9/F11.2 abort,
F2/F8/F9 personal views, F10/F10.1.3 and NTH4 repost; NFR2/3/4.
Relevant amendments: ADR-033/035/037 durable recovery; ADR-038 display projection.
Relevant FRs: preserve committed lifecycle, original/successor IDs and ownership.
Relevant NFRs: responsive web, authenticated ownership, reliable concurrency/recovery.
Relevant sequence diagram: ADR-038 discovery/status/resume sequence.
Relevant class diagram: ADR-038 CommandView/display/discovery/card chain.
Relevant service contracts: owned Order command status/list/resume, additive displayDetails.
Actual peer-service APIs inspected: existing Order store/coordinator/read policy; external APIs unchanged.
API mismatches or gaps: projection previously missing; approved additive Order-only contract.
Affected backend components: CommandView and OrderCommandService projection.
Affected frontend components: discovery provider, command hook, panel/cards/actions/three boards.
Frontend directory and structure inspected: src/App Router, shared primitives/hooks/auth/API/tests, Next installed docs.
Affected application role and USER mode: existing USER requester/courier guards; no ADMIN privilege extension.
Desktop and mobile-web behavior: existing responsive card grid and wrapping detail summaries.
External services involved: existing supplier-name lookup only; no new peer operation.
Data owned by Order Service: commands, immutable inputs, committed target Orders.
Data owned by other services: identity/roles, supplier catalogue, Credit balances unchanged.
In-scope behavior: owner projection, shared five-second visible discovery, same-key resume, terminal refresh.
Out-of-scope behavior: automatic repost, financial recovery rules, schema/infrastructure/peer changes.
Assumptions: existing owner checks precede external command responses; absent target remains summary fallback.
Open questions: none within approved slice; existing live rollout/workflow gates remain.
Detailed design approval status: Vincent approved option2 and ADR-038.
Interaction decisions awaiting approval: none; existing query/polling and synchronous resume unchanged.
Tests to write first: projection ownership/source safety; remote pending card/summary/same-key/terminal/account tests.
Files expected to change: backend DTO/coordinator/tests; shared frontend provider/hook/cards/boards/tests; design records.

## Implemented slice and verification (2026-10-11)

Backend source/test commit9f2e054; frontend source/test commit942b790. Additive
CommandView.DisplayDetails covers six submitted display fields plus nullable
committed status/version; existing owner checks and general read policy unchanged.
Shared page/account provider covers all pending pages, matches kind+target,
retains known pending on read failure, fences late account responses, confirms
terminal keys before clearing. My Requests/My Errands/Browse restore actual
pending targets; dedup against live cards only, not ABORTED attempt snapshots.
History never mounts a live command hook. Existing abort/progress/repost controls
are disabled while unresolved. CREATE/REPOST stay separate submitted summaries.
Conditional IndexedDB cleanup protects newer keys and occurs before terminal
list refresh can unmount a card. Continue uses same key/no invented input.

| Acceptance criterion | Automated evidence |
| --- | --- |
| Owned details only; frozen input vs committed target | OrderCommandDisplayTest; OrderCommandSecurityTest |
| Persisted discovery across lost response, expired target and final rejection | OrderCommandRecoveryIntegrationTest.savedPendingProjectionSurvivesLostResponsesAndUsesCommittedTargetOrFrozenInput |
| Exact additive Swagger schema; general read access unchanged | OpenApiDocumentationTest; OrderReadAccessPolicyTest |
| Cleared local intent restores proper OPEN/ACCEPTED cards and same-key Continue | order-command-discovery.test.tsx; actual hook/actions integrated |
| CREATE/REPOST details without fake successor cards; EXPIRED form blocked | shared discovery summary and actual RepostControls tests |
| Filters/pages/history/dedup/network/account isolation | shared discovery and real MyErrandsPage filter tests |
| Terminal confirmation, browser-key protection and board refresh | shared discovery and order-command-storage.test.ts |

Observed RED:3 backend assertions, frontend missing-module contract, history
hook binding and conditional browser-key cleanup assertions. Intermediate frontend
fixture errors (existing repost label and missing AbortSignal) corrected. Final:
Java21 Maven offline verify373 tests,0 failures/errors/skips;16 actual Credit HTTP
tests, real isolated PostgreSQL and emulator. User/Supplier harness fixtures are
not verified live providers. JaCoCo95.37% lines/80.27% branches; existing gates pass.
Current-run XML totals exclude four stale reports. Maven BUILD SUCCESS/exit0;
Surefire fork shutdown timeout warning after tests recorded separately.
Frontend103 tests/26 files, lint0 errors/three unrelated existing login warnings,
typecheck and final production build pass. External package-lock warning unchanged.
Patch checks pass. No deployment, peer source, financial payload, schema, event or
infrastructure change. Root D3 file remains untouched. Learning updated in existing
ignored learning directory. No migration required.

Responsive layout primitives inspected (shared card/sm/md grids/wrapping summaries),
but authenticated interactive browser320–1920, live storage deletion, mode/ADMIN
smoke, consuming container rebuild and cloud rollout not performed. Existing
strict workflow-format/manifest/human gates remain; retain[~], not feature/Sprint[x].
