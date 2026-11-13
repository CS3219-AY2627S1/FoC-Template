# CHANGE-031: Make automatic repost selection creation-time only

- Date: 2026-09-30
- Status: Implemented; verification pending
- Scope: Order Service backend contract/domain and shared frontend

## Finding

The approved NTH4 context says an automatic repost plan is supplied for an
unaccepted order and that a requester may review a manual repost after expiry.
It did not explicitly state whether an `OPEN` order could be changed later.
The existing CHANGE-022 interpretation exposed editable automatic-repost
settings while viewing an `OPEN` order and configured them through a second
request. The developer clarified that the checkbox and all automatic-repost
details must be chosen atomically during creation; an unticked choice is
permanent for that order.

## Approved clarification

- Automatic repost is either enabled with its due time, credits, and delivery
  duration in the create-order request, or disabled with no plan.
- An `OPEN` order exposes a read-only summary of its creation-time choice.
  There is no later enable, disable, or edit operation.
- Only an `EXPIRED` order without an existing repost exposes the requester
  reviewed manual-repost action.
- Automatic repost execution and manual repost continue to create at most one
  linked order; Sprint 1 still defers broker/event publication.

## Implementation

- Extended the Order create DTO and frontend payload with the repost plan.
- Persisted the plan on the aggregate at creation and returned it in the view.
- Changed the former configure endpoint to return a clear conflict rather than
  mutate an existing order; the route remains for compatibility with stale
  clients.
- Removed post-creation editing controls from the frontend while retaining the
  expired-order manual repost controls.
- Added domain/application tests for creation-time plans and rejected later
  configuration.

## Boundary and compatibility

No peer-service source, supplier/credit contract, database schema, or repost
event behavior was changed. Existing Flyway columns already store the repost
plan, so no migration is required. Clients must move automatic-repost fields
to create; calls to the old configure route receive HTTP 409 conflict.

## Verification

`git diff --check` and static review are required. Java/Maven and frontend
Vitest/typecheck verification remain pending when the required runtimes are
available; runtime/browser verification is not claimed here.
