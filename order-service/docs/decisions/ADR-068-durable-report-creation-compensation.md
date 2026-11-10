<!-- AI Assistance Disclosure: OpenAI Codex, 2026-11-10. Durable report-creation compensation architecture documentation-->

# ADR-068 — Durable report creation uses rollback compensation

- Status: Accepted
- Date: 2026-11-10
- Approved by: user
- Change: CHANGE-184

## Context

Reporting previously allocated a random report ID, uploaded random-key evidence,
placed the Order hold, and only then saved the report. A crash or Firestore failure
could therefore leave an Order hold without any durable creation intent. Retrying
could duplicate evidence and allocate a different report ID.

## Decision

Use a durable Reporting submission journal and stable browser `submissionId`.
Journal, draft, manifest, report ID, and pending active-order reservation precede
all remote effects. Uploads are deterministic. Reporting makes one foreground
attempt to place the hold and activate the report.

Creation recovery is rollback-only. Reporting never completes a report in the
background and never queries Order to infer a hold. Any uncertain remote effect
is fenced and compensated. Order records a lifecycle/tombstone keyed by report ID
and serializes both placement and compensation against it, so compensation that
arrives before a late placement blocks that placement.

Durable Pub/Sub request/result messages are selected because compensation must
survive Reporting/Order restarts and cannot depend on a user bearer token. The
existing generic Order outbox and authenticated push conventions are reused, but
creation messages and persistence are separate from resolution compensation.

Inactive pre-hold journals expire after one hour. Owner cancellation is omitted.

## Consequences

- A user can safely retry an uncertain browser request with the same ID and input.
- Creation either becomes visible with its hold or converges to no report/no hold.
- A fenced submission is never reopened; a terminal rejection requires a new ID.
- Tombstones are retained audit data and prevent delayed hold placement.
- New broker/IAM/index/scheduler infrastructure and V20 are required.
- Existing resolution rollback semantics are unchanged.

## Rejected alternatives

- Background roll-forward after a confirmed or discovered hold: rejected because
  creation recovery must restore the failed business transaction.
- Service-authenticated hold query: rejected because it would support roll-forward
  and cannot by itself close the placement/compensation race.
- Client-only UUID: rejected because server durability and fingerprint binding are
  required.
- User-only cancellation: rejected because browser closure is not a reliable
  abandonment signal.

