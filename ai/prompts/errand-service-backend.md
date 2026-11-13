# Timestamp: 2026-10-13
# Key Prompt:

F11
Support creation of a new errand by a requestor.
11.1
The system shall create an errand when a requestor submits all required errand information.


11.1.1
Required errand information shall consist of a name of no more than 200 characters, a description of no more than 5,000 characters, a deadline, an active supplier, a service type offered by that supplier, a target location, and a non-negative credit amount expressed in credits.


11.1.2
The system shall accept a supplier only when the supplier is active, i.e. supplier is operational and current time is within operating hours.


11.1.3
The system shall accept a service type only when it is offered by the selected supplier.


11.1.4
The system shall reject the submission and identify each missing or invalid field when the submitted information does not satisfy F11.1.1, F11.1.2, or F11.1.3.


11.1.5
After initial validation, the system shall send a credit reservation request to the Credit Service.


11.1.6
If the credit reservation request is rejected by the Credit Service, then the errand shall not be created.


11.1.7
For each successfully created errand, the system shall record the submission date and time as the errand’s start time by default.


11.1.8
For each successfully created errand, the system shall assign the initial lifecycle state of open, meaning that the errand is now available for courier acceptance.
F12
Support viewing of errands made by a requestor.
12.1
The system shall provide all errands created by a requestor on a map.


12.1.1
By default, the system shall display errands that have the following lifecycle states: delivered, picked-up, accepted, open, expired, cancelled, confirmed. 
12.2
The system shall allow filtering of errands made by a requestor.


12.2.1
The system shall support filtering of errands by their lifecycle states.
12.3
The system shall provide the lifecycle state of each errand made by a requestor.


12.3.1
When an errand has an assigned courier, the system shall provide the courier’s name and profile picture with the errand.
F13
Support cancellation of errands made by a requestor.
13.1
The system shall allow an authenticated user to only cancel errands submitted by that same user when their lifecycle state is open.


13.1.1
When an errand is cancelled, the system shall change the lifecycle state from open to cancelled.


13.1.2
The system shall send a credit release request to the Credit Service.
F14
Support deletion of errands made by a requestor.
14.1
The system shall allow an authenticated user to only delete errands submitted by that same user when their lifecycle state is cancelled, expired or confirmed.


14.1.1
The system shall reject deletion when the errand is in the open, accepted, picked-up or delivered state, and shall leave the errand unchanged.
14.2
The system shall reject deletion in specified invalid scenarios.


14.2.1
The system shall reject deletion when the errand does not exist.


14.2.2
The system shall reject deletion when the errand does not belong to the authenticated user.


14.2.3
The system shall reject deletion when the errand is in the open, accepted, picked-up or delivered state before deletion is completed.
14.3
The system shall ensure that deletion does not reverse, alter, or duplicate any credit transfer associated with the errand.
14.4
Repeating a deletion request for an already deleted errand shall not create additional changes or additional credit transfers.
F15
Support viewing of errands made by other requestors.
15.1
The system shall provide a user with all open errands, where another user is recorded as the requestor.


15.1.1
For each provided errand, the system shall provide an errand summary containing the errand name and supplier location.


15.1.2
The system shall not show any errands that are not in the open lifecycle state.
15.2
The system shall provide the complete errand information for an available errand when a user requests its details.


15.2.1
Complete errand information shall consist of the information specified in F11.1.1.

F18
Support errand expiry.
18.1
The system shall change an errand’s lifecycle from open to expired when its recorded deadline is reached and the errand has not been accepted.


18.1.1
The system shall exclude an expired errand from open-errand listings and shall not allow it to be accepted.


18.1.2
The system shall not change the errand’s lifecycle if its recorded deadline is reached but the errand is in the accepted, picked-up, delivered, confirmed, or cancelled states.


18.1.3
The system shall send a credit release request to the Credit Service.

Key implementation details:
1. Build the Errand Service as a TypeScript Express service in the npm workspace.
The workspace is @relay/errand-backend, using Prisma with PostgreSQL, Zod for request validation, and the shared @relay/contracts package for request, response, model, and error types. Requests authenticate through the User Service session; the service talks to the Credit, Supplier, and User services through internal HTTP clients and publishes lifecycle events through a transactional outbox to Kafka.

2. Model the errand lifecycle as OPEN -> ACCEPTED -> PICKED_UP -> DELIVERED -> CONFIRMED, with OPEN -> CANCELLED and OPEN -> EXPIRED as side exits.
The status is the ErrandStatus enum with OPEN as the default. Credit is reserved on create, released on cancel or expiry, and transferred to the courier on confirm. Record deletion is allowed only from CANCELLED, EXPIRED, or CONFIRMED.

3. Create errands through a fixed pipeline.
Validate the request, require a verified email, verify the requester profile exists, validate the supplier, insert a pending errand row, reserve credit, then atomically complete the errand and write an ErrandCreated outbox event. If credit reservation fails, no errand is created and the pending row is left for recovery.

4. Enforce supplier validation on creation.
ErrandService calls SupplierClient.validateSelection({ supplierId }) before the pending insert and credit reservation. The Supplier Service checks supplier existence, isOperational, and current operating hours.

5. Keep expiresAt optional with a 24-hour default.
The deadline field is expiresAt (the frontend requires and sends it), but server-side it stays optional; the repository applies a 24-hour default expiry when it is omitted.

6. Enrich courier name and profile picture on read.
The Errand contract carries courierProfile ({ username: string | null, profilePictureUrl: string | null }). A private internal endpoint GET /internal/user/profile/:sub, protected by the internal service token, resolves it through the User Service; the Errand backend's UserClient returns null on 404 and throws 503 on failure. Enrichment applies to requestor listings, detail views, supplier views, and lifecycle action responses, and is skipped when no courier is assigned. No migration is needed because profile details are fetched, not stored. S3_PUBLIC_ENDPOINT must be a browser-reachable address, and listing many errands triggers one User Service request per courier profile.

7. Allow cancellation by the requester only, and only while OPEN.
Anyone else gets 403 FORBIDDEN ("Only the requester who created this errand can cancel it"); a non-OPEN errand gets 409 INVALID_TRANSITION ("Only open errands can be cancelled"). A valid cancellation moves the errand to CANCELLED, and the Credit Service releases the reservation asynchronously via event.

8. Evaluate both deadlines lazily, on read.
expiresAt is the acceptance deadline: an overdue OPEN errand becomes EXPIRED and its reserved credit is released. confirmationDeadline is the post-delivery deadline, stored as a nullable DateTime (migration 20261018000000_add_confirmation_deadline, with an index on status and confirmationDeadline); it is set on delivery to the end of the delivery day in Singapore (23:59:59.999 Asia/Singapore), and a DELIVERED errand past it is auto-confirmed with its reserved credit transferred to the courier. No background worker exists; due errands are processed when an authenticated read occurs. confirmDeliveredErrands() updates conditionally (the previous status must still be DELIVERED, so reruns are safe and idempotent) and writes ERRAND_STATUS_CHANGED and ERRAND_COMPLETED to the outbox in the same transaction; the Credit Service consumes the single completion event for the idempotent transfer. processDueReadLifecycleTransitions() runs both checks before getErrands(), getErrand(), supplier errand views, and listBySupplier(); listOpenBySupplier() and acceptErrand() run expiry only; confirmErrand() runs confirmation only.

9. Expose the Errand API behind session middleware.
POST /api/errands (201), GET /api/errands?scope=mine, GET /api/errands (scope=visible), GET /api/errands/:id, GET /api/errands/suppliers/:supplierId/errands?scope=open|all, POST /api/errands/:id/accept|pickup|deliver|confirm|cancel|drop, and DELETE /api/errands/:id. Access control is enforced in the service layer: reads are limited to errands where the user is requester or courier (otherwise 404), validation failures return 400 with field-level errors, and User Service unavailability returns 503. Health endpoints are GET /health ({ status: 'ok' }) and GET /healthz, which reports unavailable until the user-deletion consumer connects.

10. Serialise acceptance so only one courier can accept an errand.
Acceptance locks by courier and by errand, where the courier lock preserves the maximum-assigned-errands protection and the errand lock serialises concurrent acceptance attempts for the same errand. A conditional database update that misses (Prisma P2025) returns "ERRAND ALREADY ACCEPTED" 409 instead of 500. The expected race result is the first courier 200 and the second 409.

11. Handle requester deletion by settling every errand.
OPEN becomes CANCELLED with ErrandCancelled (reserved credit released, no courier payment); ACCEPTED, PICKED_UP, and DELIVERED become CONFIRMED with ErrandCompleted (courier paid in full); terminal states are no-ops. Each errand is locked with the existing PostgreSQL advisory lock, and its status update and outbox event are written in one transaction, so duplicate Kafka delivery cannot cause duplicate settlement. Pending errands are removed and ErrandCreationFailed is emitted for them.

12. Handle courier deletion by reopening or auto-confirming.
ACCEPTED or PICKED_UP and not expired clears the courier and reopens the errand as OPEN, assuming a picked-up item is back at the origin pickup location; an expired assigned errand becomes EXPIRED with ErrandExpired and the reservation is released. A DELIVERED errand is not reopened and its credit is not returned to the requester, because the requester already has the item: it is auto-confirmed with ErrandCompleted (actorType: system, reason courier_deleted) and the courier's payment is recorded as a pending settlement. A single UserDeleted consumer processes both roles.

13. Protect acceptance against deleted requesters.
Before acceptance, the service verifies the requester profile: a missing profile returns 409 REQUESTER_DELETED, and an unavailable User Service fails closed with 503. The requester-profile invariant is also enforced at creation, so the guard cannot fire on a requester who was never deleted. The transactional deletion consumer remains the final protection for races.

14. Put credit settlement first in the deletion work.
Credit keeps a durable pending-settlement ledger (courier subject, errand ID, amount, source event ID, settlement reason, status, timestamps), with idempotency keyed on errand ID and source event ID, and closes balances to CLOSED instead of hard-deleting them. The ledger is order-aware in both directions: if UserDeleted arrives first, a later transfer routes to pending settlement instead of crediting a closed balance; if ErrandCompleted arrives first, the transfer credits the courier normally and a later UserDeleted moves that amount into pending settlement instead of deleting it. Closed accounts return 404 from normal credit queries and reject user-initiated reservations, transfers, and allocations.

15. Deploy deletion consumers from the latest offset, in the right order.
New Auth and S3 consumers deploy before the deletion reorder, each in its own consumer group with fromBeginning: false. The Errand consumer (group relay-errand-user-events) deploys only after its handler exists and is tested; it runs inside the existing errand-api process with no separate deployment, and /healthz reports unavailable until it connects. Failures go to the user-event DLQ with retries (ERRAND_USER_DELETION_FAILED). Historical replay is a separate controlled operation, never the default.


# Usage Scenario:
Generated initial implementation, decomposed into separate components, and fixed bugs for configuration