# CHANGE-054: Google Cloud Pub/Sub producer

> Current local transport/authentication and dev/prod topic rules are updated by CHANGE-073/ADR-021. This record preserves the original producer implementation decision.

> Current payload clarification: CHANGE-067/ADR-016 removes checkpoint history from event snapshots. The publisher still carries current Order/repost fields and event-specific facts; completion overdue calculation still uses persisted checkpoints internally.

- Date: 2026-10-02
- Developer: Yao Xiang
- Status: Implemented; build/tests/coverage passed; live broker verification pending
- Change type: Architecture or specification change plus implementation
- Related records: CHANGE-053, ARCH-EVO-010, ADR-009, FEEDBACK-002

## User approval

The user selected Google Pub/Sub and asked to start coding. This authorizes the Google Cloud Pub/Sub Java client for the four Order Service publishers. Topic IDs remain placeholders to be filled in each respective publisher. Changes remain limited to Order Service; Credit and User consumers are assumed future work and are not modified.

## Implemented design direction

- Use the Google Cloud Java Pub/Sub library managed by Google's Cloud Libraries BOM.
- In production, rely on Application Default Credentials. If `PUBSUB_EMULATOR_HOST` is set, build a plaintext gRPC channel with no credentials for the emulator.
- Publish JSON event bodies containing event metadata and the full Order snapshot, and add event type/ID/version as Pub/Sub attributes.
- A publisher returns to application orchestration only after Pub/Sub returns a message ID. A placeholder topic or publish failure maps to a dependency-unavailable response.
- Completion, OPEN cancellation, accepted cancellation, and overdue completion publish before Order status/checkpoint/receipt persistence.
- Overdue is computed at completion from the accepted and delivered checkpoints and the configured delivery limit; no new database field or migration is introduced.
- Accepted cancellation transitions to `ABORTED` and clears the courier after publication. Same-order reopening remains excluded by ADR-001.

## Failure semantics

If Pub/Sub fails or its confirmation times out, the status/checkpoint/command receipt are not written. A timeout may be ambiguous because Pub/Sub could have accepted the message while the acknowledgment was delayed. If a message is accepted and the later PostgreSQL commit fails, the event may be consumed while the Order retains its former state. No compensation event is currently specified.

## Affected implementation

- `messagingpublisher/interfaces/`: shared and event-specific producer interfaces.
- `messagingpublisher/publisher/`: Pub/Sub transport adapter and four typed publishers.
- `messagingpublisher/dto/` and `mapper/`: versioned event envelopes and Order/repost snapshots. Checkpoint history was initially included and is superseded by CHANGE-067/ADR-016.
- `OrderTransitionService`: publish-first ordering, overdue routing, and accepted-cancellation handling.
- `OrderController`: accepted-order cancellation endpoint.
- `OrderCheckpointRepository`: read ordered checkpoint history for completion overdue evaluation; CHANGE-067/ADR-016 removes history retrieval for event snapshots.
- `pom.xml`, `application.yaml`: Pub/Sub dependency and project/emulator/topic/timeout configuration.

## Verification

`mvn verify` passed: all 57 tests passed with no skips, and JaCoCo's configured 80% line and branch coverage checks passed. Maven was run with a temporary local repository and a preloaded Byte Buddy agent because the current JDK cannot self-attach Mockito's inline mock maker in this environment. The Maven wrapper itself fails in the current PowerShell environment. The topic IDs were subsequently configured in `application.yaml`; CHANGE-060 records local emulator message-ack verification. Live publication to Google Cloud remains unverified.
