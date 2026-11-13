# ADR-016: Exclude checkpoint history from Order events

> Payload supersession (2026-10-09): CHANGE-092 / ADR-031 replaces only refund/completion JSON bodies with exactly seven fields. Order/version metadata remains internal; completion overdue facts are no longer sent. Accepted-cancellation schema is unchanged. FEEDBACK-009 blocks current peer integration. Earlier rationale below is preserved history.

- **Status:** Accepted by the user's explicit request; implementation complete, Maven verification blocked locally
- **Date:** 2026-10-06
- **Owner:** Order Service
- **Related change:** CHANGE-067
- **Supersedes:** Checkpoint-history inclusion in the Order event snapshot from CHANGE-053/054

## Context

The four outcome event types carried a full Order snapshot including every checkpoint. Checkpoint history can grow over an Order's lifetime and is already available through Order Service history queries. Consumers need the resulting Order state and event-specific facts to perform settlement, refunds, and penalty/score actions; they do not need the full history.

## Decision

Keep the event's current Order fields, repost-plan facts, common event metadata, and completion `overdue`/`overdueAt` facts, but omit checkpoint history from the published JSON. `OrderEventSnapshot` will not have a `checkpoints` field. Checkpoints remain persisted by Order Service and remain available through its history API. Completion's overdue calculation continues to read the accepted and delivered checkpoints internally before creating its event.

The existing `eventVersion: 1` remains the current contract version because no peer event consumers were found in the inspected services; subscribers are future work and should implement the updated v1 shape. Before deployment, if a consumer is found to depend on the older checkpoint-bearing payload, coordinate a separate schema-version transition rather than silently changing that consumer's contract.

## Consequences

- Outcome payload size no longer grows with the number of checkpoint records.
- Subscribers receive enough information for current event actions but cannot reconstruct timeline history from a message; they must query Order Service if that is ever required.
- Order-owned status history, checkpoint persistence, and history endpoints do not change.
- No database migration is required. The transactional outbox continues to persist the smaller serialized event body with the Order transition.
- The unused event checkpoint-snapshot DTO and mapping methods can be removed.

## Synchronization

Update `docs/peer-service-api-feedback.md`, `docs/service-contracts.md`, project/sprint event context, acceptance criteria, the publisher class diagram, event DTO/mapper/factory, event serialization tests, CHANGE-053/054 supersession notes, architecture evolution, current change indexes, handoff, active work, and AI usage disclosure. Do not modify peer-service source.
