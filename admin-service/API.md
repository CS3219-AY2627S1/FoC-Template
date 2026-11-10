# Admin Service API and dependency contracts

Version 1. Admin Service owns dispute cases about errands, their status history and the audit
log of dashboard actions (backlog N2F3, N2NFR3). It reads errand, credit and identity
information only through other services' versioned HTTP APIs and never reads their databases.

Status: health checks, current-session administrator authorization, the disputed-errand
workflow, participant reports and statements, and the audit log are implemented.

## Conventions

- Base paths `/v1/admin` (administrators) and `/v1/disputes` (errand participants). The edge
  proxy routes `/v1/admin/disputes*`, `/v1/admin/audit-log*` and `/v1/disputes*` here; every
  other `/v1/admin/*` path stays with its owning service.
- Every request needs `Authorization: Bearer <access token>`. On every request the service calls
  User Service `GET /v1/users/me` and requires an `ACTIVE` account; `/v1/admin` routes also
  require system role `ADMIN` or `SUPER_ADMIN` (N2F1.1, N2NFR1.1-1.3).
  - Missing, malformed, expired or revoked session: `401 UNAUTHENTICATED`.
  - Ordinary User: `403 FORBIDDEN`.
  - User Service unavailable or returning an unusable response: `503 AUTH_UNAVAILABLE`.
    Nothing is read or written.
- JSON uses camelCase. Timestamps are UTC ISO 8601. Identifiers are UUIDs.
- Errors use the shared envelope
  `{"error": {"code", "message", "correlationId", "fieldErrors"}}`. Messages never echo request
  input. A safe `X-Correlation-ID` header is accepted and always returned.
- Lists take `page` (default 1) and `pageSize` (default 20, maximum 50) and return
  `{"items": [...], "page", "pageSize", "total"}`.

## Operations

| Method and path | Behaviour |
| --- | --- |
| `GET /health/live` | The process is running. Needs no database. |
| `GET /health/ready` | The Admin database is reachable and migrated; otherwise `503 SERVICE_NOT_READY`. |

## Disputes

A dispute holds its errand in Order's `DISPUTED` state until it ends. Participants no longer
fail errands themselves: the reporter selects what went wrong, both participants may send
administrators private details, and an administrator accepts the dispute (the errand fails and
Credit returns the reward to the requester) or rejects it (the errand returns to its earlier
state). The reporter may withdraw while the dispute is still `OPEN`. Only one dispute may be
open per errand; after it ends, a new one may be opened while the errand is still active. This
service never moves credits; Order applies the errand change and Credit follows the errand.

| Method and path | Behaviour | Success |
| --- | --- | --- |
| `POST /v1/admin/disputes` | An administrator records a dispute about an errand. Requires an `Idempotency-Key` UUID header. | `201` + dispute |
| `GET /v1/admin/disputes` | Newest first; optional `status` and `orderId` filters. | `200` + page |
| `GET /v1/admin/disputes/{disputeId}` | One dispute with its history and every participant statement. | `200` |
| `POST /v1/admin/disputes/{disputeId}/transitions` | Review, accept or reject the dispute. | `200` + dispute |
| `GET /v1/admin/audit-log` | Dashboard action records, newest first; optional `actorId`, `targetId` and `outcome` filters. | `200` + page |

### Legacy disputes

Disputes recorded before disputed errands are kept as recorded and returned with
`"legacy": true`. They may have `"problem": null`, keep their original `description`, and may
have the earlier status `RESOLVED`. They never held their errand, so they do not count towards
the one-open-dispute rule. They cannot be withdrawn, and accepting or rejecting an open one
records the decision only: the errand and its credits stay as they are.

### The selected problem

Every dispute records one problem: `ITEM_UNAVAILABLE`, `ITEM_DAMAGED`, `UNABLE_TO_PICK_UP`,
`UNABLE_TO_DELIVER`, `PARTICIPANT_UNREACHABLE` or `OTHER`. `problemDetails` is required for
`OTHER` (trimmed, 1-500 characters, shown to both participants as "Other: ...") and optional
otherwise. An accepted dispute fails the errand with this problem as its failure reason.

### Opening a dispute

1. A replay of the same `Idempotency-Key` and an identical body returns the recorded dispute
   with `200` and does not call Order. A key reused with a different body returns
   `409 IDEMPOTENCY_KEY_REUSED` (N2NFR3.3).
2. The dispute ID is derived from the creator and the key. The service calls Order's internal
   `POST /v1/internal/orders/{orderId}/disputes` with that ID, its `ORDER_SERVICE_SECRET` and
   the caller's bearer token. Order moves `ACCEPTED`, `PICKED_UP` or `DELIVERED` to
   `DISPUTED`. Another open dispute returns `409 DISPUTE_ALREADY_OPEN`; any other state
   returns `409 REPORT_NOT_ALLOWED`; Order `404` returns `422 ORDER_NOT_FOUND`; Order
   unavailable or a rejected credential returns `503 ORDER_UNAVAILABLE`. Nothing is stored.
3. The dispute is recorded as `OPEN` with `version` 1, its first history entry and an audit
   entry, in one transaction. If this fails after Order held the errand, repeating the request
   with the same key reuses the same dispute ID, which Order treats as a replay, and records it.

### Recording a dispute as an administrator

Request: `{"orderId": uuid, "problem": Problem, "problemDetails": string | null,
"description": string, "evidenceRefs": [string]}`. `description` is the administrator's
private case notes (non-blank, at most 2,000 characters); `evidenceRefs` is optional (at most
10 references of at most 200 characters each). The errand is held as above with
`actorType: "ADMIN"`; such a dispute has no reporter and cannot be withdrawn.

Dispute: `{"disputeId", "orderId", "problem", "problemDetails", "description", "evidenceRefs",
"status", "resolutionReason", "reporterRole", "createdBy", "createdAt", "updatedAt", "version",
"history": [...], "statements": [...]}`. `reporterRole` is `REQUESTER` or `COURIER` for a
participant report and `null` when an administrator recorded the dispute (`description` is then
set; it is `null` for participant reports). History entries are
`{"sequence", "fromStatus", "toStatus", "actorId", "reason", "occurredAt"}`. Statements are
`{"statementId", "authorId", "authorRole", "body", "createdAt"}`, oldest first.

### Changing status

Request: `{"toStatus": "UNDER_REVIEW" | "ACCEPTED" | "REJECTED", "reason": string | null,
"expectedVersion": int}`.

| From | Allowed to | By | Reason | Errand |
| --- | --- | --- | --- | --- |
| `OPEN` | `UNDER_REVIEW` | Administrator | Optional | Unchanged |
| `OPEN` | `WITHDRAWN` | The reporter, through `POST /v1/disputes/{id}/withdraw` | Required | Returns to its earlier state |
| `UNDER_REVIEW` | `ACCEPTED` | Administrator | Required | `FAILED` with the selected problem; the reserved reward returns to the requester |
| `UNDER_REVIEW` | `REJECTED` | Administrator | Required | Returns to its earlier state |

- Any other move returns `409 INVALID_TRANSITION`; a missing reason returns
  `422 REASON_REQUIRED`; reasons are at most 1,000 characters. A stale `expectedVersion`
  returns `409 VERSION_CONFLICT` (N2NFR3.4, N2NFR4.5). The dispute is unchanged.
- Accepting and rejecting lock the dispute, then call Order's internal `.../accept` or
  `.../restore` with the administrator's token, then record the change. A concurrent change
  waits for the lock and then sees the new version, so a withdrawal and the start of a review
  never both succeed. If the errand no longer matches the dispute, Order's 409 becomes
  `409 ERRAND_CHANGED` and the dispute is unchanged.
- If recording fails after Order changed the errand, the response is
  `409 DECISION_INCOMPLETE`. Repeating the same request completes it: Order treats a repeat for
  the same dispute as already done.
- Each change appends a history entry with the previous and new status, actor, reason and time,
  and audits `DISPUTE_TRANSITION` (or `DISPUTE_WITHDRAW`) plus `ERRAND_DECISION` (target
  `ORDER`) when the errand changed (N2F3.3.4, N2F3.6).

## Participant disputes

| Method and path | Behaviour | Success |
| --- | --- | --- |
| `POST /v1/disputes` | Report a problem with an errand you take part in. Requires an `Idempotency-Key` UUID header. | `201` + report |
| `GET /v1/disputes` | Without `orderId`: disputes you reported. With `orderId`: every dispute about that errand, if you are its requester or courier. Newest first. | `200` + page |
| `POST /v1/disputes/{disputeId}/statements` | Send administrators more details while the dispute is `OPEN` or `UNDER_REVIEW`. Requires an `Idempotency-Key` UUID header. | `201` + report |
| `POST /v1/disputes/{disputeId}/withdraw` | The reporter withdraws an `OPEN` dispute with a reason. | `200` + report |

Report request: `{"orderId": uuid, "problem": Problem, "problemDetails": string | null}`.
Statement request: `{"body": string}` (trimmed, 1-2,000 characters; any number per participant).
Withdrawal request: `{"reason": string, "expectedVersion": int}` (1-1,000 characters).

- The service asks Order `GET /v1/orders/{orderId}` with the caller's own token and reads
  `requesterId` and `courierId` from the participant view. A caller who is neither returns
  `422 ORDER_NOT_FOUND` when reporting or listing, and `404 DISPUTE_NOT_FOUND` for a dispute's
  statements, so non-participants learn nothing (N2F3.2.2).
- Opening follows [Opening a dispute](#opening-a-dispute) with `actorType: "USER"`.
- Either participant may send statements; the other participant cannot select a problem but
  can explain their side. A closed dispute returns `409 DISPUTE_CLOSED`; the database refuses a
  statement that races a decision.
- Only the reporter may withdraw, and only while the dispute is `OPEN`: others receive
  `404 DISPUTE_NOT_FOUND`, and once an administrator starts the review the reporter receives
  `409 WITHDRAWAL_NOT_ALLOWED` and should send a statement instead.

Report: `{"disputeId", "orderId", "ownReport", "reporterRole", "problem", "problemDetails",
"status", "resolutionReason", "statements", "createdAt", "updatedAt", "version"}`. Both
participants see every dispute about their errand, including ones an administrator raised
(`reporterRole: null`), with its selected problem, status and reason (the withdrawal, accept or
reject reason), so reasons should be written for both to read. `statements` holds only the
viewer's own statements `{"statementId", "body", "createdAt"}`. Participants never see the
administrators involved, administrator notes or evidence, the status history or the audit log
(N2F3.2.5).

### Audit log

Every dispute create, participant report, statement, withdrawal, status change and errand
change, successful or rejected where the administrator acted, appends
`{"auditId", "actorId", "action", "targetType", "targetId", "outcome": "SUCCESS" | "REJECTED",
"errorCode", "correlationId", "occurredAt"}` (N2F3.6). The runtime database role cannot update
or delete history or audit rows (N2NFR3.2).

## Dependencies on other services

Admin Service itself uses only these contracts:

| Owner | Contract | Used for | Status |
| --- | --- | --- | --- |
| User | `GET /v1/users/me` | Current session, role and account status | Existing |
| Order | `GET /v1/admin/orders/{orderId}` | Confirm the errand exists before recording a dispute | Proposed; Order owner review |
| Order | `POST /v1/internal/orders/{orderId}/disputes`, `.../{disputeId}/restore` and `.../{disputeId}/accept` | Hold the errand in DISPUTED, return it, or fail it; requires `X-FoC-Service-Secret` | Internal; added for disputed errands |
| Order | `GET /v1/orders/{orderId}` | Confirm the caller takes part in the errand before accepting a report | Existing |

The dashboard pages call these owning-service contracts directly from the browser:

| Owner | Contract | Backlog | Status |
| --- | --- | --- | --- |
| Order | `GET /v1/admin/orders` with optional `orderId`, `participantId`, repeated `state`, `supplierId`, `createdFrom`, `createdTo` and `overdue` filters | N2F2.1-2.2, N2F3.1 | Proposed extension of the existing endpoint |
| Order | `GET /v1/admin/orders/{orderId}` and `GET /v1/admin/orders/{orderId}/history` | N2F2.3 | Proposed; allows administrators, not other users, past the participant check |
| Order | `GET /v1/admin/orders/analytics` and `GET /v1/admin/orders/analytics/users/{userId}` | N2F4.1-4.4 | Proposed |
| Credit | `GET /v1/admin/credit/reservations/{orderId}` | N2F3.4.2 | Proposed |
| Credit | `GET /v1/admin/credit/analytics` | N2F4.5 | Proposed |
