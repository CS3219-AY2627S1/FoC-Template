# CHANGE-081: Vincent's Sprint 2-3 scope and pending lifecycle design

- Date: 2026-10-08 (Asia/Singapore)
- Developer/approver: Vincent; identity and Order-owned scope explicitly confirmed.
- Branch: `sprint-2-3`.
- Status: Historical partial-approval record; subsequent explicit approvals resolved reset/history/schema in CHANGE-082 / ADR-025. Order slice implemented and locally verified; peer/cloud/browser gates pending.
- Classification: Scope transition and approved architecture/specification amendments.

## Sources and inspection

The user selected `Order Service Overall Doc.pdf` alongside Project D1, both at
the same directory level as FOC. The overall document contains sequences 1-12,
including abort/reopen/expiry, administration/holds and automatic/manual reposting.
Relevant sequence/class diagram images were visually inspected. This source is
not the missing previously recorded `Order Service Overall Doc - Updated.pdf`;
old approved ADRs remain relevant unless explicitly superseded by current approval.

- Overall PDF SHA256: `F0E925278FCCC0FCBB48F6C7BE1C23D908E15BEF75BB7C013EEC28C3F05DA602`.
- D1 SHA256: `C7381CB03CE40E64FAA1B1E9856CC99D13BF9295BA3159481C63A4AF42BFB5AC`.

Related requirements: Order F3/F5 acceptance authorization; F4.1.6/F7 completion;
F4.1.7-F4.1.11, F10/F11 cancellation/expiry/abort/reopening; F8/F9 current/history;
NTH2 User-owned penalties; NTH4 reposting. Exact scope/test mapping remains to be
completed before implementation; no requirement is marked verified by this record.

## Confirmed decisions (approved, not applied)

1. Vincent owns this branch's Order-side work. Peers remain read-only; their
   implementation/integration will be added and independently verified later.
2. Acceptance must wait for synchronous Credit courier-assignment confirmation.
   The existing proposed `PUT /api/credits/orders/{orderId}/courier-assignment`
   body `{"courierId":"..."}` may be mocked locally because the peer route is
   absent. This is a renewed contract-stub exception, not proof of a live account.
3. One current Order plus immutable courier-attempt history was explicitly
   selected. The user additionally requested a database UUID primary key distinct
   from business orderId. Detailed migration/key/reference design remains pending.
4. Only the assigned courier may abort an ACCEPTED task before IN_PROGRESS.
   Preserve the aborted attempt; requester sees OPEN before original expiry or
   EXPIRED at/after expiry, not an active ABORTED order.
5. Every abort publishes the accepted-cancellation fact for User penalties.
   An expired outcome additionally publishes the refund fact for Credit;
   before-expiry reopening does not publish a Credit refund/abort event.
6. Requester cancellation and expiry use the existing refund topic/outbox.
   Normal/automatic completion uses the existing completion event/outbox.
7. Reposting must create a new business orderId and reserve new credits before
   OPEN. Follow-up approval supersedes the earlier remove/overwrite request:
   retain the original EXPIRED row/old ID and the new repost row/new ID, linked
   together. Hide the original expired order from the requester's My Requests
   list only after its successful repost; retain history/refund references.
8. The minute-based scheduler completes DELIVERED tasks only after at least
   48 hours, using the normal completion workflow. It exists already; correctness
   and production scheduling availability still require verification.
9. Follow-up approval: abort must synchronously update Credit's courier assignment;
   do not rely on a later acceptance blindly overwriting the previous courier.
   The exact reset value, endpoint and stale-retry protection remain unapproved.
10. Follow-up clarification: abort after expiry keeps the current business orderId
    and changes its current state to EXPIRED, with a separate immutable ABORTED
    attempt for the aborting courier. This does not authorize duplicate live orders.
11. The old/new-row retention and requester visibility rule is now approved.
    Existing originalOrderId/repostedOrderId links can identify supersession;
    no additional boolean flag is necessary. The exact query change is not applied.

Items 3-5 supersede conflicting historical Sprint 1 policy in principle;
application, contracts, diagram/data design and tests are not synchronized yet.

## Unresolved decisions and risks

- Synchronous Credit update on abort is now approved in principle. Confirm whether
  this clears courierId to null, retains the reservation, and uses the existing
  proposed hold-for-reopen route or a revised assignment contract. FEEDBACK-004's
  assignment contract does not establish null/reset or guarded overwrite support.
  A delayed retry must not clear/replace a newer courier. Peer routes remain missing.
- Abort-to-EXPIRED with the SAME ID is explicitly confirmed. Repost creates a NEW
  business ID and now retains the old expired row. Publication confirmation is
  not confirmation of a completed refund.
  Pub/Sub retention/dead-letter behavior means retry is not an infinite business
  guarantee. Retain the old ID and self-contained refund payload in durable records
  and preserve courier history; failed reservation must leave the original intact.
- V2 currently gives order_event_outbox.order_id a foreign key to orders(id);
  checkpoints also reference that key. Retaining the old row avoids deleting
  these references. The separately approved internal UUID/history migration still
  needs detailed design; historical references must never be rewritten to the new ID.
- No allocation or user approval authorizes edits to Credit/User/Supplier/Admin.
- Actual consumers, trusted lifecycle authentication and Cloud Run cron behavior
  remain separate production gates. No automatic HTTP-to-mock fallback is approved.

## Changes and verification

Only workflow/approval records and the local profile are updated. The local
profile is currently tracked in Git despite historical instructions describing
it as ignored; no ignore/untrack operation is performed by this change. No
application source, tests, migrations, event schemas, API implementations,
frontend, Compose or infrastructure files are changed. A follow-up learning note
in the ignored learning/refund-events-and-order-history.md explains publication
versus refund completion and the current foreign-key constraint; it is not committed.
TOML parsing,
explicit pending-decision assertions, unique evolution ID, change-record existence
and `git diff --check` passed. No runtime tests are claimed.

## Next implementation gate

Resolve the remaining Credit reset contract; complete the detailed feature proposal and affected
contract/diagram/data/test chain; use a new Flyway migration (never edit V1/V2);
observe failing tests before code; verify clean and upgrade database paths,
authorization, repeated courier attempts, race boundaries, idempotency, outbox
delivery/retries, UI isolation and the 48-hour threshold. Keep Sprint 2-3 incomplete
until its applicable completion gates pass.

## Repost visibility implementation plan (not applied)

- Current Order.createRepost generates a new UUID and records originalOrderId.
  OrderRepostService.saveRepost reserves credits, links original.repostedOrderId,
  and saves both rows in the transaction. Keep this linkage rather than overwriting.
- The current requester repository query returns all the requester's rows and
  does not suppress reposted originals. Filter out EXPIRED rows with non-null
  repostedOrderId in the backend query before pagination/counting, not merely UI.
- An EXPIRED row with null repostedOrderId remains visible/repostable. A failed
  reservation/repost must not mark it superseded. The new row is a separate
  reservation/lifecycle even though it represents the same task lineage.
- Preserve old-ID outbox payloads and courier history independently of display.
  No live Pub/Sub subscription/consumer or eventual refund has been verified.
- Test automatic/manual success, reservation failure, repeated commands and
  requester pagination/totals. These obligations are not passing test evidence.
