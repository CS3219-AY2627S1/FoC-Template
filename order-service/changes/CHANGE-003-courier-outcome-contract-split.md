# CHANGE-003: Split Courier Outcome Contract

Date: 2026-09-25

Status: Completed

Approved by: User

## Requested change

Update the persistent workflow from the supplied team conversation: split the generic `acceptCourierOutcomeFact` contract into outcome-specific functions and remove the `outcomeType` and `facts` arguments.

## Reason

The generic discriminator creates control coupling and the open-ended `facts` bag has no approved meaning. Explicit operations communicate intent and make each integration path independently testable.

## Project D1 references

This clarifies the integration used for Order Service outcome publication and User Service-owned penalty processing. It does not change the underlying Order Service lifecycle requirements or transfer penalty ownership from User Service.

## Affected requirements

The approved service-contract shape changes. Sprint 1 sequences 7-11 and their acceptance criteria remain unchanged because completion outcome publication, overdue evaluation, and penalty processing are deferred from the active slice.

## Affected services

- Order Service: future outbound port/adapter operations must be outcome-specific.
- User Service: future inbound receiver operations must match the explicit completed, overdue, and aborted contracts.

No sibling-service implementation was modified by this documentation update.

## Affected contracts

Replaced:

- `acceptCourierOutcomeFact(eventId, orderId, courierId, outcomeType, occurredAt, facts)`

With:

- `acceptCourierCompleted(eventId, orderId, courierId, occurredAt, orderVersion)`
- `acceptCourierOverdue(eventId, orderId, courierId, occurredAt, orderVersion)`
- `acceptCourierAborted(eventId, orderId, courierId, occurredAt, orderVersion)`

## Affected diagrams

The generic `submitCourierOutcomeFlag()` and `publishCourierOutcomeFlag()` names in the overall class diagram are now superseded by ADR-002. The raster diagram and overall PDF were not edited because no editable diagram source is present. They must be regenerated later and their fingerprints updated after review.

## Affected tests

No application tests exist or ran. Future contract tests must cover each named operation, deduplication by `eventId`, ordering/version behavior, and the absence of discriminator/property-bag routing.

## Implementation result

Updated the permanent context, service contract, architecture notes, glossary, source-conflict record, repository instructions, ADR index, and change log. Added ADR-002. No production code or Sprint 1 feature status changed.

## Verification

- The effective contract contains all three named operations.
- The generic `acceptCourierOutcomeFact` signature is removed from effective workflow documents and retained only in this historical change explanation.
- Sprint 1 scope and acceptance files are unchanged.
- The current branch matches Vincent's assigned `sprint-1/seq-7-to-11` branch.
- No production code was changed and no application test was applicable.

## Rollback or reversal considerations

A reversal would reintroduce the discriminator and property bag and must be recorded as a later approved contract decision. Do not rewrite ADR-002 or this historical change record.
