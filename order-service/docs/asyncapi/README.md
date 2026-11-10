# Order Service Pub/Sub documentation

CHANGE-158/ADR-055 supersedes the fixture-only description below. AsyncAPI1.4.0
documents four existing lifecycle/penalty sends plus opt-in compensation send and
result receive. Default transport remains off; no cloud rollout is implied.
The validator checks six DTO field sets, eight examples and source/config parity.

CHANGE-156 / ADR-054: the new compensation request/result protocol is an explicitly
approved fixture milestone with no live transport/receiver. Its proposed schemas
and reserved topics/handlers are in
[the peer handoff](../../concurrency/compensation-workflow-handoff.md). The live
AsyncAPI document intentionally continues to describe the four implemented
channels; add the new channels with verified producer/consumer/auth wiring before
live activation. Do not mistake fixture outbox intent for deployed Pub/Sub support.

CHANGE-155 / ADR-053: accepted-cancellation publisher, replay and snapshot schema removed. AsyncAPI1.3.0 retains four channels; published history is preserved. Check each deployment database for outstanding legacy rows before rollout. No schema migration or GCP deletion is performed. This supersedes older replay instructions below.

CHANGE-137 / ADR-046: admin completion of assigned active/held Orders reuses the
completion channel and optional highest selected addition. Null/empty penalties
emit no scoring event; normal requester/automatic scoring remains unchanged.
AsyncAPI document1.2.1 updates producer triggers only; payload versions/topics stay.

CHANGE-134 / ADR-044: admin cancellation reuses the refund/addition channels.
Addition schema now permits all six addition cases (including unresponsive3),
with one highest selected reason/amount. Seven-field envelopes, event versions,
topics and existing automatic flows stay unchanged. AsyncAPI document version1.2.0.
Consumers must support the expanded reason set; User subscriber remains pending.

CHANGE-130 / ADR-043: penalty appliedReason Java enum is now in the shared
foc-common Maven library. AsyncAPI reason strings, amounts, payload schemas,
topics and delivery semantics are unchanged; no schema version bump required.


Effective CHANGE-105 / ADR-036: local Docker uses the Pub/Sub emulator with
demo-foc-local/local-v1 topics, no ADC/tunnel. Cloud keeps injected staging/prod
topics and authenticated Google push. The same schemas/attributes apply.
Bounded asynchronous after-commit dispatch plus 15-minute recovery retains FAILED
after ten attempts; ADMIN redrive preserves event ID/payload. See
../local-live-testing.md for commands. Earlier local-cloud statements are historical.

Open [asyncapi.yaml](asyncapi.yaml) for the machine-readable **AsyncAPI 3.0.0**
document. It describes four existing lifecycle/penalty sends plus the opt-in
compensation send/result receive. REST is documented separately by OpenAPI/Swagger.
Vincent approved this documentation-only addition on 2026-10-10 (CHANGE-103).

## Open it in a browser

Open [AsyncAPI Studio](https://studio.asyncapi.com/) and load/paste
`order-service/docs/asyncapi/asyncapi.yaml`. The rendered document exposes topics,
triggers, message schemas, required fields, examples and Pub/Sub attributes.
This file contains examples, not credentials. Do not paste your `.env` or ADC file.

Alternatively, from **order-service**, with Node 24.11+ and npm 11.5.1+,
run the pinned CLI (optional local preview, not launched by this task):

```powershell
npx.cmd --yes @asyncapi/cli@6.2.0 start studio docs/asyncapi/asyncapi.yaml
```

The CLI may download tools to the npm cache; it does not add a project dependency.
It is not hosted at the application's Swagger URL and does not provision topics.
See the official [AsyncAPI CLI guide](https://www.asyncapi.com/docs/tools/cli/usage).

## Current outgoing contracts

| Default topic ID | Message / schema | When Order queues it | Intended consumer |
| --- | --- | --- | --- |
| `open-order-refund-dev-v1` | `OpenOrderRefundTaskEvent` / v2 | OPEN cancellation, unassigned OPEN expiry, or courier abort resulting in EXPIRED | Credit: release the old reservation |
| `order-completion-dev-v1` | `OrderCompletionTaskEvent` / v2 | Requester completion, >=48-hour automatic completion of DELIVERED | Credit: settle/transfer its reservation |
| `courier-penalty-addition-dev-v1` | `PenaltyScoreAdditionEvent` / v1 | ACCEPTED abort (+2), overdue requester/automatic completion (+1), or the highest stored/selected addition on admin cancellation | User: deduplicate and add transmitted amount |
| `courier-penalty-deduction-dev-v1` | `PenaltyScoreDeductionEvent` / v1 | On-time requester/automatic completion (-1); never admin resolution | User: deduplicate and subtract transmitted amount |

Penalty bodies contain exactly eventId, eventType, orderId, courierId,
penaltyAmount, occurredAt, appliedReason. Positive amount; event type determines
direction. The assigned/cancelling courier is the recipient. Enum reasons:
ACCEPTED_TASK_CANCELLATION, OVERDUE_DELIVERY and SUCCESSFUL_DELIVERY.
ADR-041 supersedes historical User penalty expectations below. Cross-topic
ordering is not guaranteed; consumer clamp/ledger policy remains pending.
Local topic names are courier-penalty-{addition|deduction}-local-v1.
Variables: ORDER_COURIER_PENALTY_ADDITION_TOPIC / ORDER_COURIER_PENALTY_DEDUCTION_TOPIC.

Actual addresses are `projects/{projectId}/topics/{topicId}`. Read configured
`PUBSUB_PROJECT_ID`, `ORDER_OPEN_REFUND_TOPIC`, `ORDER_COMPLETION_TOPIC` and
`ORDER_COURIER_PENALTY_ADDITION_TOPIC` / `ORDER_COURIER_PENALTY_DEDUCTION_TOPIC` for the target run. Defaults describe source
configuration, not verified deployed resources. Local-live isolation overrides
these names; production must configure its own approved topics. A topic name
ending in `v1` does **not** imply message schema v1.

Refund/completion bodies contain exactly seven fields:

```json
{
  "eventId": "439b595d-c954-3a96-b2b1-008688ba3a80",
  "eventType": "OpenOrderRefundTaskEvent",
  "orderId": "order-example-old",
  "orderStatus": "EXPIRED",
  "creditAmount": 5,
  "occurredAt": "2026-10-10T09:00:00Z",
  "courierId": null
}
```

The publisher sets **three string-valued Pub/Sub attributes** alongside data:
`eventId`, `eventType`, `eventVersion` (`"2"` for compact messages, `"1"` for penalty events).
AsyncAPI `headers` models that attribute map, not browser HTTP headers.
Compact `eventVersion`/`orderVersion` are internal/outbox metadata, not body fields.

Accepted-cancellation replay and snapshot schemas are removed by CHANGE-155.

## Publication, delivery and acknowledgment

1. The Order transaction commits state, checkpoint/receipt and durable outbox
   intent together. The outbox covers **all four** event types.
2. `OrderOutboxAfterCommitListener` tries immediate after-commit dispatch.
3. `GoogleCloudPubSubEventPublisher` serializes UTF-8 JSON into
   `PubsubMessage.data`, sets attributes and waits up to the configured timeout
   (default 10 seconds) for Google's **messageId**. No ordering key is set.
4. Only publication confirmation allows the outbox published marker. Failed or
   uncertain publication remains recoverable; retry uses the saved event ID.
5. A separate outbox scan runs every **15 minutes**, selecting due pending or
   expired-lease work (default batch 50). Claim lease is 2 minutes; retryAt uses
   bounded exponential delay capped at 5 minutes, but the scan cadence governs
   when scheduled recovery actually runs. Item failures do not stop later items.

The minute lifecycle job is separate: command recovery (mock-only), OPEN expiry,
then DELIVERED >=48-hour completion. It does not replace the outbox relay.

`eventId` is a deterministic name-based UUID of `eventType + ':' + commandId`.
It is neither the raw UI command/idempotency key nor Google's messageId.
Different abort/refund facts from one command have different event IDs.
Consumers need durable deduplication by business event ID. A crash after Google
accepts a message but before Order marks it published can cause a duplicate.
There is no claimed global ordering, exactly-once delivery or guaranteed refund.
Subscription retention, retry, dead-letter handling and alerts are deployment
responsibilities. In-process cron on idle/scale-to-zero Cloud Run is not a
guarantee of continuous execution (ADR-013).

Order does **not** wait for a financial business reply through Pub/Sub. The
publisher's returned messageId proves acceptance by Google, not Credit settlement.
Consequently the AsyncAPI send operations have no `reply` operation.

## Actual peer source inspected, not live-verified

On 2026-10-10, Credit's `OrderEventMessage` and `JsonOrderEventPayloadDecoder`
accept the compact seven-field body and require matching attributes with
`eventVersion="2"`. This matches the **payload shape**; it is not proof of live
financial correctness or a closure of old peer feedback.

Credit currently exposes two typed authenticated Pub/Sub push routes:

- `POST /api/credits/internal/order-events/open-refund`
- `POST /api/credits/internal/order-events/completion`

Google's subscription sends a **push wrapper** containing base64 `message.data`,
`message.attributes`, transport `messageId` and `subscription`. Order publishes
decoded JSON data, not this wrapper. Credit validates the configured subscription
and expected event type. Its controller returns **204 with no body** after handler
success; documents 400 invalid input, 401 invalid push identity, 409 state conflict,
503 unavailable persistence. Those are **Credit HTTP responses to Google**, not
Order's publication response. Push identity uses the approved Google token
validation, not a requester Firebase token. These routes belong in Credit's
OpenAPI; they are not invented receive operations in Order's AsyncAPI.

The User penalty addition/deduction consumer remains pending. Compact Credit
completion omits overdue facts; User receives the explicit scoring decision
through the penalty events instead of recalculating it from Credit completion. Preserve peer feedback/history
and do not interpret the older snapshot-consumer wording as current source proof.
No peer code or cloud resource was changed for CHANGE-103.

## Validate and keep it aligned

From **order-service**, with a supported Node runtime:

```powershell
npx.cmd --yes @asyncapi/cli@6.2.0 validate docs/asyncapi/asyncapi.yaml
python scripts/validate-asyncapi-contract.py
```

The second command needs **PyYAML and jsonschema** in your Python environment.
If your current Node is 22, the documentation-only validation was also checked
using a temporary Node package, without switching your installed Node:

```powershell
npx.cmd --yes --package=node@24.11.1 --package=@asyncapi/cli@6.2.0 asyncapi validate docs/asyncapi/asyncapi.yaml
```

The host npm may emit engine/deprecation notices while downloading tools; do not
install those tools as application dependencies. Parser validation exits 0 with
zero document errors/warnings and a non-blocking suggestion to use newer AsyncAPI
3.1.0. This document deliberately uses supported 3.0.0; schema versions 1/2 are
independent of the AsyncAPI format version.

The Python checker checks four DTO field sets, four topic defaults/variables, four send-only
operations, attribute/version shapes, current examples, negative schema cases and
source metadata/cadence parity. It reads files only. This is not a live broker,
consumer, financial ledger, authentication or end-to-end test. No CI job was added.

The schema rejects undocumented fields to expose producer-document drift; this
does not assert that Java consumers reject every unknown field. No formal Google
channel binding/schemaSettings is declared because no Cloud Pub/Sub schema registry
configuration was verified. The protocol/address/attributes still document the
actual transport. AsyncAPI is a description, not runtime schema enforcement.

## Implementation and authority references

- [ADR-031: compact body amendment](../decisions/ADR-031-compact-refund-completion-events.md)
- [ADR-013: durable outbox](../decisions/ADR-013-transactional-outbox.md)
- [ADR-021: real Pub/Sub and environment separation](../decisions/ADR-021-real-pubsub-dev-and-prod-topics.md)
- [ADR-025: abort history/repost IDs](../decisions/ADR-025-sprint-2-3-abort-history-and-repost-visibility.md)
- [Service contracts](../service-contracts.md) and [peer feedback](../peer-service-api-feedback.md)
- Source: `messagingpublisher/dto/`, `messagingpublisher/mapper/OrderTaskEventMapper`,
  four typed publishers, `GoogleCloudPubSubEventPublisher`,
  `GoogleCloudPubSubPublisherFactory`, `OrderTaskEventFactory`, `OrderOutboxDispatcher`,
  `OrderOutboxScheduler`, and `src/main/resources/application.yaml`.
- Existing runtime tests: `CompactOrderEventContractTest`, `OrderTaskEventFactoryTest`,
  `OrderTransitionEventPublishingTest`, `GoogleCloudPubSubEventPublisherTest`,
  `OrderOutboxDispatcherTest` and `OrderSchedulerCadenceTest`.
- Standard: [AsyncAPI 3.0 specification](https://www.asyncapi.com/docs/reference/specification/v3.0.0).

F4.1.5 completion, F4.1.7 cancellation, F4.1.8/F10 expiry, F11 credit outcomes,
F11.2/ADR-025 abort facts, F12's approved completion-time overdue amendment and
NFR consistency/verification remain traced through existing ADRs and tests.
This representation changes none of their behavior; Sprint stays `[~]`.


CHANGE-141 / ADR-048 producer refinement: ordinary completion reads the stored actual delivery outcome. A late delivery with an audited overdue waiver emits the unchanged Credit completion event only, with neither penalty addition nor successful-delivery deduction. On-time completion still emits the reward; unwaived late completion still emits overdue addition. Existing explicit admin resolution emits only its selected highest penalty. Event DTOs, IDs, versions, topics and subscriber contracts are unchanged.


CHANGE-146: addition/deduction topics and payloads unchanged. Apply penalty emits nothing. Completion/auto-completion emits only the highest stored/overdue addition, or successful reward if no penalty; admin cancellation only stored/explicit maximum, never overdue/reward. No replacement topic or consumer.


## Unified penalty stream ? CHANGE-185 (2026-11-10)

New score outcomes use courier-penalty-event-{local,dev,prod}-v1, eventVersion2 and courierSequence. Separate addition/deduction topics/routes remain only for unsequenced historical backlog drain. User durably buffers out-of-order events and applies contiguous positions. See [cutover and API contract](../penalty-event-cutover.md). Do not mix old first deliveries after activation; no automatic data/cloud cutover is performed by this patch.
