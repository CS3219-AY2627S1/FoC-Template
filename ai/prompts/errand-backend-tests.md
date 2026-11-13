# Timestamp: 2026-10-24

# Key Prompt:

The Errand Courier Lifecycle, repository transactions, and outbox implementation are complete. Using the existing code as the source of truth, help me draft unit and integration tests for the author-defined lifecycle rules, error cases, concurrency behaviour, Supplier-event handling, and transactional outbox. Do not change the implementation or design new lifecycle behaviour.

CREATION AND VALIDATION

- Test the 200-character name limit and 5,000-character description and instruction limits, including accepted boundary values and rejected oversized values.
- Test that start time must be on or before the deadline and that the deadline must be in the future.
- Verify that inactive or unavailable Suppliers, unsupported service types, unverified users, missing profiles, and User service failures stop creation before credit reservation (where credit reservation is needed) and return the correct error.
- Test zero-credit creation and normal credit reservation, ensure that the Credit service is called with the correct amount, and verify that the Errand is created in `OPEN` state. Also ensure that every successful creation writes an `ErrandCreated` outbox event for the requester and assigned courier where present.
- When reservation or creation fails, verify that the pending row is removed, the `ErrandCreationFailed` outbox event is written, and the Credit service is called to release any reservation.

LIFECYCLE AND AUTHORIZATION

- Test requester-owned and visible read scopes and Supplier explore/mine views using the authenticated subject.
- Test requester cancellation from `OPEN`, and reject cancellation by another user or from an invalid or already-cancelled state.
- Test acceptance protection when the requester profile is missing and confirm that requester validation occurs before acceptance.
- Test invalid lifecycle deletion: missing errand, active state, wrong requester, and already deleted. Test successful deletion from `EXPIRED` and `CONFIRMED`.
- Test Supplier-triggered soft deletion of `OPEN` and `ACCEPTED` errands, no-op handling when there are no matching errands, and creation of one deletion outbox event per affected errand.

CONCURRENCY AND EXPIRY

- Exercise many concurrent attempts to accept different errands for the same courier. At most five may finish in the courier's `ACCEPTED`, `PICKED_UP`, or `DELIVERED` set.
- Verify that a sixth active errand is rejected and that concurrent acceptance cannot assign one errand twice.
- Reject acceptance when expiry is before or exactly equal to the current time.
- Check that the race condition between expiry and acceptance is handled correctly, where acceptance is rejected if the errand has already expired, and that the expiry worker does not remove errands that have been accepted that are still within their deadline.
- Verify that a successful acceptance writes its status-change outbox event and that rejected expired acceptance writes no success event.

TRANSACTIONAL OUTBOX

- Use database-facing integration tests for lifecycle changes that must be atomic with outbox writes.
- Verify stored payloads for creation, acceptance, cancellation, expiry, and completion, including their different event types and previous/new status values.
- Verify automatic expiry and pruning only for already-published outbox rows.
- Verify invalid and unauthorized transitions leave both state and outbox unchanged.

TEST SETUP AND EXCLUSIONS

- Use the existing Vitest configuration, `.env.test` setup, Prisma test database helpers, and current mocking conventions.
- Keep unit tests isolated and use the database only for repository concurrency or transactional-outbox behaviour.
- Do not add tests for states, events, errors, or requirements absent from the completed implementation, and do not modify production code to make generated tests pass.

# Usage Scenario:

Generated and debugged unit, concurrency, edge-case, and integration tests for the author-defined Errand creation order, lifecycle transitions, authorization, Supplier handling, locking, and transactional outbox.
