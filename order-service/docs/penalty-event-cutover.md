# Unified courier penalty event handoff (CHANGE-185 / ADR-069)

## Contract and ownership

New Order penalty/reward outcomes use one topic per environment:

| Environment | Topic | User push subscription |
| --- | --- | --- |
| Local | courier-penalty-event-local-v1 | user-courier-penalty-event-local-v1 |
| Staging | courier-penalty-event-dev-v1 | user-courier-penalty-event-dev-v1 |
| Production | courier-penalty-event-prod-v1 | user-courier-penalty-event-prod-v1 |

Topic suffix v1 names the infrastructure generation; eventVersion=2 names the new
wire schema. Attributes: eventId, eventType, eventVersion="2". Ordering key: courierId.
Both event types use the same authenticated push path:
`POST /api/users/internal/penalties/events`. The subscription must enable ordering.
The gateway already blocks public `/api/users/internal/` access. Google OIDC
signature/time/issuer/audience/expected push account validation remains mandatory
outside the explicitly local emulator. The envelope subscription must match configuration.

```json
{
  "eventId": "615809d9-c798-469b-8787-6934b05e6c18",
  "eventType": "PenaltyScoreAdditionEvent",
  "orderId": "order-example",
  "courierId": "courier-example",
  "penaltyAmount": 2,
  "occurredAt": "2026-11-10T10:00:00.123456789Z",
  "appliedReason": "COURIER_BAD_ATTITUDE",
  "courierSequence": 1
}
```

Deduction keeps type PenaltyScoreDeductionEvent, reason SUCCESSFUL_DELIVERY and
positive magnitude1. All amounts remain from foc-common. No new penalty policies,
report behavior, credit operation, frontend or automatic permanent suspension.

Order owns per-courier numbering across all orders. Source order is committed score
outcome order, not occurredAt sorting. Provisional admin penalty storage allocates no
sequence. A no-score outcome allocates none. Publication retries retain the same ID,
sequence, timestamp and payload. Different courier streams are independent.

## Data and processing

V21 adds courier_penalty_sequences and courier_penalty_event_sequences. It backfills
nothing and does not edit V1–V20. Normal Flyway startup applies it; expected latest
version21. A rollback-safe locked counter, event binding, outcome and outbox share
the business transaction. Never use nextval or assign numbers in the publisher.

User adds collections courier_penalty_streams, received_penalty_events and
penalty_event_inbox. Mongo transactions require a replica set, as existing dedupe
already does. Primary keys enforce event identity and courier/sequence-slot uniqueness;
no optional auto-created unique secondary index is relied on. Recommended recovery
query index: `courier_penalty_streams.createIndex({pending:1,lastAttemptAt:1})`.
Original canonical payload is retained because Mongo dates truncate nanoseconds.

An HTTP200 confirms durable receipt, not immediate score application. Out-of-order
messages are acknowledged after receipt commit and wait in the inbox. Score change,
processed marker, applied timestamp and cursor increment commit together. Recovery
drains up to100 positions per courier and visits50 pending couriers ordered by last
attempt time. Crashes/conflicts retry in fresh transactions; gaps are never skipped.
`USER_PENALTY_SEQUENCE_RECOVERY_DELAY_MS` defaults10000. Suspended/deactivated-account
behavior remains the existing User policy; the cursor never resets on admin unsuspend.

```mermaid
sequenceDiagram
    participant O as Order transaction
    participant P as Pub/Sub
    participant U as User inbox transaction
    participant S as User score transaction
    O->>O: Lock courier counter; outcome + numbered outbox
    O->>P: Publish same stored event on retry
    P->>U: May deliver sequence2 before1
    U->>U: Reserve event ID + sequence slot; mark pending
    U-->>P: ACK only after commit
    U->>S: Drain lastAppliedSequence + 1
    S->>S: Score + dedupe + cursor commit atomically
```

Class responsibilities: OrderTaskEventFactory requests a sequence from
CourierPenaltySequenceStore before mapping; typed addition/deduction publishers route
v2 to the unified topic and old null-sequence payloads to their original drain topics.
GoogleCloudPubSubEventPublisher supplies courier ordering keys; regional publisher
configuration and SDK retry-key resumption preserve transport usability. User's
PenaltyEventConsumer validates schema/policy/subscription; SequencedPenaltyProcessor
separates durable receipt from bounded recovery; PenaltySequenceStore owns Mongo
transactional state and scoring through the existing UserService.

## Provisioning and safe cutover

Scripts are modified, not executed against GCP by this coding task:

```bash
bash infra/gcp/configure-order-pubsub.sh staging
bash infra/gcp/configure-user-pubsub.sh staging
```

Repeat with production only when preparing production. The scripts create the new
topic/subscription and retain the two legacy topics/subscriptions for backlog drain.
Existing unified subscriptions with ordering disabled fail rather than silently
recreating and losing their backlog. CI checks new topic permissions and subscription
topic/endpoint/OIDC/ordering settings. No live cloud resource was created here.

1. Deploy the backward-compatible User receiver first (this patch still accepts v1).
2. Pause operations that create scoring outcomes; finish in-flight old Order revisions.
   Drain legacy SQL outbox PENDING/IN_PROGRESS/FAILED rows and both old subscription
   backlogs/dead-letter work. PUBLISHED proves broker acceptance, not User processing:
   reconcile processed IDs against expected outcomes before activating v2.
   Inspect provisional stored policies too: historical `COURIER_UNRESPONSIVE` values
   remain readable in Order, but User already rejects that retired publication reason.
   Resolve any such legacy outcome with the owners before cutover; this patch does
   not silently waive it or change penalty policy. An invalid numbered event would
   leave subsequent events for that courier waiting for reconciliation.
3. Provision unified topics/subscriptions, deploy Order V21/new producer and resume
   scoring operations only when the old stream is reconciled. An automatic main
   deployment must not be used to bypass this coordinated cutover.
4. Verify sequence1 and2, both directions, duplicate publication and the User cursor.
   New unsequenced legacy first deliveries after stream activation fail closed;
   known already-processed duplicates are acknowledged. Do not dual-publish an outcome.
5. Keep legacy resources until retention/reconciliation is agreed. Do not delete
   source outboxes, sequence bindings, receipts or cursors to make a test pass.

Code rollback after v2 activation requires stopping producers and reconciling queued
work; do not resume unsequenced publishers or renumber existing events. Retain V21 and
Mongo history. A missing sequence produces a per-courier warning and pending inbox.
Look up its source identity using the read-only query below. For FAILED publication,
use existing admin outbox redrive. For a broker-expired/dead-lettered event, recover
or republish the exact retained source payload and attributes; never invent a fresh
event ID or increment the counter. Do not skip the cursor past the missing event.

```sql
SELECT s.courier_id, s.courier_sequence, o.event_id, o.state, o.payload
FROM courier_penalty_event_sequences s
JOIN order_event_outbox o ON o.event_id = s.event_id
WHERE s.courier_id = 'courier-id' AND s.courier_sequence = 1;
```

## Verification

Required: reversed delivery at score floor, duplicate/conflicting identities,
concurrent publishers and consumers, rollback without gaps, durable crash recovery,
independent couriers, legacy cutover, nanosecond duplicate payloads and authenticated
push. Actual local results and unavailable runtime checks are recorded in CHANGE-185.
