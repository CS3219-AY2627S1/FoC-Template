# Notification Service

Owner: XueTing (Notifications, see [TASK_SPLIT.md](../TASK_SPLIT.md)). Tell each user what happened
on their errands and credits. Own private notification persistence, inbox/deduplication, event
mapping and the retrieval UI/API. Order owns lifecycle facts, Credit owns balances, User owns
identity and profile data; this service only reacts to their published events. No Order state
changes, Credit arithmetic, Chat storage, email verification or Admin case policy.

## Invariants

- Consume only published events; never call another service, read its database or share its
  consumer group. Recipients come from the event itself. Producer owners approve wire changes.
- Every consumed event gets one inbox row (`notification_inbox`) in the same transaction as its
  notifications. A redelivery is a no-op; the same `eventId` with different content is rejected
  (`EVENT_ID_CONFLICT`) and nothing is stored. Acknowledge Kafka only after commit.
- A source event creates at most one notification per intended recipient, but genuinely repeated
  lifecycle occurrences (e.g. two reopen/accept cycles) stay distinct.
- Never notify the user who performed the action.
- Store only recipient, type, order link, small template values, source event and read state:
  no profile data, balances, tokens or full payloads. Message text is built when read.
- The recipient of every API call is the verified JWT `sub`. There is no user ID parameter; another
  user's notification is reported as not found.
- Valid but unmapped event types are recorded as `IGNORED`, so new producer events never block the
  consumer; invalid envelopes or versions are rejected, never silently dropped.

## Implementation

Use Java 17, Spring Boot, Maven Wrapper, PostgreSQL, JPA transactions, Flyway, Actuator, OpenAPI and
User-contract RS256/JWKS validation, as Order Service does. Never edit applied migrations. Read
[README](README.md) for behaviour and verification and [DESIGN.md](DESIGN.md) for the iteration plan
and the planned shared changes. Keep tests/README/CI current with the code; shared
gateway/Compose/broker/env/CI changes use the nominated editor/affected-review rule. Use the root
`$foc-iterate-feature` workflow, one bounded outcome with live UI where applicable.
