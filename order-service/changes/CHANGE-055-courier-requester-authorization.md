# CHANGE-055: Enforce requester and assigned-courier ownership

- Date: 2026-10-02
- Status: Implemented and verified
- Approver: User, by explicit instruction in the 2026-10-02 request
- Scope: Order Service only; no peer-service or frontend source changes

## User-approved rule

- Accepting an order requires a User Service-verified courier, an `OPEN` order with `courierId == null`, and a courier ID different from `requesterId`.
- Starting, picking up, delivering, and cancelling an `ACCEPTED` order require the authenticated courier ID to equal the order's assigned `courierId`.
- Cancelling an `OPEN` order and completing a `DELIVERED` order require the authenticated requester ID to equal `requesterId`.
- Accepted cancellation publishes the existing accepted-cancellation event first, then marks the order `ABORTED` and clears its courier assignment. Same-order reopening remains outside Sprint 1.
- Role verification occurs before command-receipt replay so callers cannot bypass requester/courier role checks by reusing a command ID.

## Discovery and classification

The aggregate already enforced assigned-courier ownership for start, pickup, and delivery, and requester ownership for open cancellation and completion. However, accepted cancellation authenticated as a requester and checked `requesterId`; acceptance did not reject an `OPEN` order with a non-null courier assignment; command-receipt replay occurred before role verification.

This is an **architecture/specification clarification** to the approved lifecycle authorization rules and accepted-cancellation actor in updated overall Sequence 7. The user's request explicitly approves these rules and directs implementation. No event contract, peer API, persistence schema, or frontend behavior changes.

## Effective design and alternatives

The effective rule is ownership authorization at two boundaries: User Service verifies the caller's role/identity, and the Order aggregate verifies that identity against the order owner or assigned courier. The domain remains authoritative for order-specific ownership and transition state. Existing assigned-courier checks for progress are retained.

Alternative: authorize only in the controller/User Service. Rejected because it would not bind the authenticated actor to the specific order assignment at the domain transition boundary. Alternative: store a new assignment/actor field. Not needed because `requesterId`, `courierId`, and the existing User Service identity result express the approved rule.

## Affected artifacts

- Implementation: `Order`, `OrderAssignmentService`, `OrderTransitionService`.
- Tests: aggregate ownership/assignment guards and accepted-cancellation publication authorization.
- Design: updated overall Sequence 7, Sprint 1 requirements and acceptance tests, service contracts, traceability, ADR-010.
- No database migration, event payload, API shape, peer-service source, or frontend source change.

## Verification

The initial focused authorization/event suite passed (15 tests); two further ownership/replay cases were then added and passed in the final full suite. Full `mvn verify` passed all 62 tests with no failures, errors, or skips; JaCoCo line and branch coverage gates passed. C: has no free space, so Maven/Surefire temporary files were redirected to `D:\tmp` on D:, which had 53 GB free. No Docker resources beyond the requested stopped-container prune were removed.
