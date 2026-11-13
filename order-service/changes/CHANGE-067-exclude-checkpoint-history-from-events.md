# CHANGE-067: Exclude checkpoint history from Order events

- **Status:** Implemented; Maven verification blocked by local Java compiler failure
- **Date:** 2026-10-06
- **Scope:** Order Service only; no peer-service or database schema changes
- **Related decision:** ADR-016
- **Affected flows:** Completion, requester OPEN cancellation, expired accepted cancellation, and scheduled OPEN expiration

## Approved behavior

Outcome events contain the common event envelope, the current Order fields and repost-plan facts, and applicable event-specific facts. They no longer embed `order.checkpoints`. Order Service continues to persist and serve checkpoint history; completion still uses the accepted/delivered checkpoints internally to calculate `overdue` and `overdueAt` before creating the event.

The contract remains event version 1 because peer event consumers have not been implemented in the inspected repositories. Future consumers must implement the checkpoint-free v1 payload. If a consumer of the earlier shape is discovered, coordinate version compatibility before rollout.

## Reason and trade-offs

Including the growing history in every event increases payload size and duplicates Order Service's history API. Omitting it keeps events focused on outcome facts and prevents payload growth. A consumer cannot reconstruct history from the event alone and must query Order Service if it later needs a timeline.

## Affected artifacts

- Peer event contract and subscriber handoff.
- `OrderEventSnapshot`, `OrderTaskEventMapper`, and `OrderTaskEventFactory`.
- Event DTO/factory serialization tests and callers.
- Publisher class diagram, service contracts, architecture/sprint context, acceptance tests, current ADR/evolution/change indexes, Vincent handoff, active work, and AI usage disclosure.
- No checkpoint entity, repository, history endpoint, migration, topic, or peer-service source change.

## Verification

Added serialization assertions for completion, open cancellation, accepted cancellation, and expiry event payloads, and retained transition coverage that evaluates overdue from stored checkpoint history. `git diff --check` passed. Focused Maven tests did not execute: the local Java 21 compiler reports `Fatal Error: Cannot close compiler resources`; forked compilation also exits with a generic compilation failure. Rerun focused tests and full `mvn verify` in CI or a working Java 21 environment.
