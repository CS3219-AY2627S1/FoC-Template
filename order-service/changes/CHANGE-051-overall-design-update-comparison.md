# CHANGE-051: Updated Order Service overall design comparison

- Date: 2026-10-02
- Developer: Yao Xiang
- Status: Design source synchronized; implementation blocked pending feature-level approval
- Change type: Architecture or specification change
- Source: `../../../Order Service Overall Doc - Updated.pdf`
- Source SHA-256: `EFBA1503C7D50B5A6C1214F09ECBCD1FF453004E0A6CA3F3F9F717C78831EA40`

## Authority and comparison

The developer supplied a new overall design source and requested a comparison with the existing Order Service overall design. The updated source is newer than the previously fingerprinted `Order Service Overall Doc.pdf` and is treated as the current design source for this comparison. The previous source remains preserved as superseded history.

| Area | Previous design/repository record | Updated overall design | Repository implementation status |
|---|---|---|---|
| Sequence 5 | Completion consequence was synchronous or generic | Non-overdue completion commits Order state/checkpoint/outbox atomically, then publishes `publishOrderCompletionTask()` to Credit; settlement continues asynchronously | Not implemented; `OrderTransitionService` calls `CreditServicePort.settle` synchronously |
| Sequence 6 | Open cancellation/expiry had deferred or synchronous Credit outcome processing | Open cancellation publishes `publishOpenOrderCancellationTask()`; Credit releases asynchronously; expiry path remains | Not implemented; cancellation and expiry call `CreditServicePort.release` synchronously |
| Sequence 7 | Accepted cancellation/reopening was deferred or absent from Sprint 1 | Accepted cancellation publishes `publishAcceptedOrderCancellationTask()` to Credit and User; same order may reopen before original expiry, otherwise expires | Not implemented; no accepted-cancellation publisher or same-order reopen path exists |
| Sequence 8 | `OVERDUE` was a completion-time flag with synchronous outcome boundary | Completion publishes `publishOverdueOrderCompletionTask()` to Credit and User; Credit/User process independently | Not implemented; no overdue publisher or event payload exists |
| Cross-service communication | Generic outcome publication and open transport questions | Four typed publisher pairs publish to one broker; subscribers acknowledge independently | No messaging or broker implementation exists |
| Reliability | Command IDs and expected versions | Globally unique `eventId`, `eventVersion`, `orderVersion`, at-least-once delivery, deduplication, retries, dead-letter recovery, monitoring | Event metadata, outbox, retry, and recovery are absent |
| Contracts | Generic or synchronous Credit outcome expectations | `evaluateOpenEntry` and reservation remain synchronous; typed event subscriptions own completion/cancellation consequences | `CreditServicePort.settle/release` is synchronous and must not be treated as the updated contract |
| Class responsibilities | Generic outcome publisher | Four event-specific `I*Publisher` ports, matching publishers, typed payloads, broker, and independent subscribers | Publisher interfaces, payload classes, and adapters are absent |

## Required synchronization

- Updated source fingerprint and source path in `docs/project-d1-reference.md`, `docs/ai-project-context.md`, and `docs/ai-project-context.toml`.
- Updated Order architecture, overall architecture, service contracts, event registry, Sprint context, traceability, active work, change log, architecture evolution, and peer-feedback records.
- Preserved the previous synchronous Credit exception as historical context and marked it superseded for the updated design.
- No application code, implementation tests, peer-service source, frontend source, diagram binary, database migration, or deployment configuration was changed.

## Implementation gate

This source update is an architecture/specification change. Implementation remains blocked until a feature-level proposal is approved for the four typed events, broker choice, transactional outbox, event schemas/versioning, consumer contracts, authentication, retries, dead-letter recovery, observability, and migration from the current synchronous Credit mock/port. The current Sprint 1 documents still narrow implementation scope and must be explicitly reconciled before any event code is written.

## Verification

- Compared extracted text from the old and updated PDFs.
- Main PDF sources are text-extractable; Poppler is unavailable in this environment, so page image visual review remains pending.
- Current branch implementation was searched for publisher interfaces, event payloads, outbox records, broker adapters, and same-order accepted reopening; none were found.
