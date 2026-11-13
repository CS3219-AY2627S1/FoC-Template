# Chat Service blueprint

Shared proposed wire shapes and fixtures: [contract package](../docs/contracts/README.md).

The local Kubernetes package includes Chat, PostgreSQL and RabbitMQ workloads plus the reviewed
Gateway/User/Kafka/Chat network-policy paths. AWS staging deploys Chat with RDS, RabbitMQ, Kafka,
private S3 object storage and EKS Pod Identity behind the shared HTTPS gateway.

Owner: **Eldridge**. Status: runnable core chat; preferences, localized quick replies, JWT
security, lifecycle ingestion, durable messages, assignment privacy, private images, WebSockets
and RabbitMQ fan-out are implemented. Gemini-backed translation preserves message originals and
delivers completed translations through the existing live channel. Source: D3 slides
10-14, D1 N2H1 and agreed Admin integration.

## Implemented core chat

The Spring Boot service runs on port `8085` and owns its PostgreSQL schema through Flyway.
`GET /api/chat/preferences` returns the authenticated account's preferred Chat language, defaulting
to English without creating a row. `PUT /api/chat/preferences` stores `en`, `zh`, `ms` or `ta`.
`GET /api/chat/quick-replies` returns the five server-owned phrases localized to that preference.
All endpoints derive identity from the verified UUID `sub`, never a request parameter. Order
lifecycle facts create a chat on acceptance, append timestamped system activity, advance courier
assignment epochs on reassignment and lock it at a terminal state. The requester sees all epochs;
each courier sees only their own. Message writes are idempotent by conversation, sender and client
message ID, while lifecycle activity is idempotent by source event ID.

Text, localized one-tap quick replies and JPEG/PNG/WebP images up to 5 MiB are supported. Local
development defaults to PostgreSQL image bytes, while AWS staging stores private encrypted objects
under `attachments/{conversationId}/{attachmentId}` in S3. PostgreSQL retains authorization and
metadata, and every download is streamed through the authenticated Chat endpoint after participant
checks and checksum verification; the bucket is never public. REST commits durable history,
RabbitMQ fans committed messages across replicas and authenticated STOMP delivers them live.

For an explicit local S3 test, set `CHAT_ATTACHMENT_STORAGE=s3`, `CHAT_S3_BUCKET`,
`CHAT_S3_REGION` and temporary AWS credentials in the ignored root `.env`. Shared AWS staging does
not use those keys: the AWS SDK default credential chain receives short-lived credentials from the
Chat ServiceAccount's EKS Pod Identity. Keep `CHAT_ATTACHMENT_STORAGE=database` for ordinary local
work and CI.

Run all checks, including the PostgreSQL Testcontainers migration test:

```bash
cd chat-service
./mvnw --batch-mode --no-transfer-progress verify
```

Run against a private PostgreSQL database:

```bash
DB_HOST=localhost DB_PORT=5432 DB_NAME=chat_db DB_USER=chat_user DB_PASSWORD='local-secret' \
  CHAT_JWT_JWK_SET_URI=http://localhost:8081/.well-known/jwks.json ./mvnw spring-boot:run
```

Swagger UI is at `http://localhost:8085/swagger-ui/index.html`; health is
`http://localhost:8085/actuator/health`. Shared Compose and Gateway routes support local
end-to-end testing. Local Kubernetes manifests are under `chat-service/k8s`; the AWS overlay is
under `deploy/aws/k8s/staging` and its S3/IAM resources are Terraform-managed.

## Scope, ownership and architecture

Provide private errand chat, text/images, real-time delivery, translation preserving originals,
separate admin-participant case conversations and an event-derived errand timeline for Admin.
Chat exclusively owns its PostgreSQL conversations/permissions/messages/translation/timeline
projection. Images live in private S3 object storage; Redis caches translations. Chat never
calculates credit changes, bans users, decides Order transitions or writes another service DB.

Browser -> Gateway -> Chat REST/WebSocket; Admin -> Chat authenticated internal HTTP(S). Kafka
facts -> Chat inbox/projection. RabbitMQ provides Chat-internal STOMP fan-out and directed
translation jobs; it does not replace Kafka or become a browser trust boundary. Use Java 17,
Spring Boot, Maven, Flyway, OpenAPI and existing frontend conventions. Do not expose internal
evidence endpoints at the gateway. Translation uses Amazon Translate via AWS SDK per D3; secrets
come from deployment configuration, not bundles or images.

Read [Chat/Admin contract](../docs/integration/chat-admin-contract.md) for canonical internal paths,
timeline coverage, identity checks and recovery; [Admin spec](../docs/integration/admin-service-spec.md)
for case ownership; [core events](../docs/integration/event-communication-blueprint.md) for existing
wire formats. Do not duplicate these contracts with independently chosen payload names.

## Conversation types and authorization

| Type | Participants | Writable condition |
| --- | --- | --- |
| ERRAND | Requester and currently assigned courier | Accepted errand, until terminal state; exact assignment policy below |
| CASE | Assigned admin reviewer and one historical case participant | UNDER_REVIEW case and currently permitted participants |

One logical ERRAND chat per errand, created when it first becomes ACCEPTED. On terminal state,
preserve read-only participant history; reject new messages/uploads without mutation. Unrelated
users cannot enumerate messages, identities or image metadata. Admin entitlement alone does not
grant access to the ordinary errand chat: use separate authorized case conversation/evidence paths.

Assignment changes use the approved conservative rule:
keep one conversation ID but segment messages by assignment epoch; requester sees all its epochs,
courier only its own epoch. New courier cannot read the former courier's messages. Former courier
has read-only access to its epoch after withdrawal; current courier alone can write. This extends
D3's assigned-courier rule without exposing a former courier's messages to their replacement.
Until approved, stop that feature boundary; other scaffold/contract work can proceed.

Case conversations are unique by caseId/participantUserId and isolated from each other. Use the
existing Admin contract for reviewer checks, historical participants and resolved read-only state.
Do not lock case conversation merely because its errand reached a terminal state. Permission
revocation applies to REST, WebSocket subscriptions, message sends and attachment downloads.

## Kafka projection and evidence

Subscribe independently as `chat-service-timeline` to the topics in the Chat/Admin contract.
Order lifecycle stream requires full accepted/assignment/withdrawal/pickup/delivery/terminal facts,
not just the existing five Order credit commands. XueTing owns producer changes/checkpoints.
Credit retains ledger truth, Chat stores approved evidence copies; Admin/User outcomes are
case/operation-scoped. No claim that all User actions are already published.

Commit inbox + projection/permission changes atomically before ack. Same event ID/content is a
no-op; conflicting content is retained/rejected. Preserve historical delayed evidence. Use source
sequences/checkpoints to detect gaps; keep coverage UNKNOWN/INCOMPLETE until reconciled. Message
sequence is Chat-owned and separate from source lifecycle sequence. Never expose Kafka offsets as
proof of global completeness. Fail closed on unproven participant access when projection lags.

Producer history backfill restores missing records with original IDs/sequences; it does not
re-emit financial operations. Follow canonical export/checkpoint proposals in the shared contract.
Private timeline fields and admin notes are not ordinary chat messages. Evidence remains append-only.

## Proposed public REST and WebSocket contract

Gateway proposed prefixes `/api/chat/**`, `/ws/chat`, UI `/chat/**`; nominated gateway editor must
approve paths/port before wiring. Validate User JWT signature/issuer/audience/expiry/sub and
resource membership on each operation. Shared Admin service-auth profile applies to internal APIs.

| Method/path | Input/output |
| --- | --- |
| GET /api/chat/orders/{orderId}/conversation | Authorized ERRAND conversation reference and readOnly |
| GET /api/chat/conversations/{conversationId} | Authorized conversation reference, including CASE chats |
| GET /api/chat/conversations/{id}/messages?cursor=&limit= | Authorized paginated ordered message history |
| POST /api/chat/conversations/{id}/messages | clientMessageId UUID; text or owned uploaded attachment reference; stored message |
| GET/PUT /api/chat/preferences | Read or replace the caller's Chat preferred language (`en`, `zh`, `ms`, `ta`) |
| GET /api/chat/quick-replies | Server-owned localized quick replies for the caller's current Chat preference |
| POST /api/chat/conversations/{id}/attachments | Authorized multipart image upload; validates/stores bytes and returns attachment metadata |
| GET /api/chat/conversations/{id}/attachments/{attachmentId} | Recheck membership and stream private image bytes with the stored media type |
| POST /api/chat/conversations/{id}/messages/{messageId}/translations | targetLanguage; existing/pending translated result |
| GET /api/chat/conversations/{id}/messages/{messageId}/translations/{language} | Original retained; translation status/content |

These are proposed path signatures. Eldridge publishes exact OpenAPI schemas plus browser fixture
examples before Admin/Order UI implementation depends on them. History page default 20/max 100.
Message response includes id, conversationId, senderUserId, sequence, createdAt, text nullable,
attachment metadata nullable. A system activity entry has a null sender/client message ID plus its
sourceEventId, sourceSequence, lifecycle action and state transition; browsers cannot create one.
Sort/paginate by immutable per-conversation sequence. A participant sender comes from the verified
actor, never the supplied body. Proposed limits: 1-4000 text characters; one JPEG/PNG/WebP image
<=5 MiB per message. Owner/team approve limits and supported languages in analysis.

Server assigns sequence and commits message before responding/broadcasting. Unique
(conversationId, senderUserId, clientMessageId); same content returns original message, different
content returns 409. Exactly one stored message despite transport retries. Database is delivery
truth; WebSocket reconnection fetches missing messages by sequence.

Each user-authored errand message also writes a `ChatMessageSent` row to Chat's transactional
outbox in the same database transaction. The relay publishes it to `chat.events`, keyed by
conversation UUID, for Notification Service. The payload contains message/conversation/order,
sender/recipient IDs, the `TEXT`/`QUICK_REPLY`/`IMAGE` type, and a notification-only preview capped
at 160 characters. Images use the fixed preview “Image sent in chat”; image content and attachment
metadata never leave Chat. The complete message remains Chat-owned. Client-message idempotency
therefore creates at most one notification event.
Lifecycle `SYSTEM` entries do not publish this event because their existing `OrderTransitioned`
notifications already tell the affected user; emitting both would duplicate alerts.
Broadcast fan-out works across replicas; RabbitMQ only signals delivery and never replaces durable
history.

WebSocket authenticates at connection and checks membership on subscribe/send. Do not put access
tokens in URLs. Prefer an authenticated HTTP-issued single-use, short-lived WebSocket ticket;
ticket protocol needs Chat-owned contract tests. Message delivery can be WebSocket while mutation
uses REST; both share the same authorization and idempotency rules. 401 invalid identity; 404
hidden/missing conversation; 409 read-only/idempotency conflict; 413 oversize; Problem Details on REST.

Typed text, quick replies and images are distinct message forms. A quick-reply request sends one
stable key (`ON_MY_WAY`, `ARRIVED`, `RUNNING_LATE_5`, `WHERE_MEET`, `THANK_YOU`); Chat resolves and
stores the localized text, so the tap is an immediate ordinary send with the same authorization,
ordering and idempotency guarantees. Preferred language is account-wide within Chat and affects
future quick replies and automatic incoming-translation targets. Changing it never rewrites
message originals or existing translations.

## Images, translation and privacy

Private S3 bucket, server-generated keys scoped by conversation/upload; do not accept arbitrary
object URLs as owned attachments. Validate byte size and actual media signature, not extension.
The current implementation deliberately avoids presigned browser URLs: Chat rechecks participant
access and streams each download from S3, so object keys and AWS credentials never reach the UI.
Failed metadata transactions trigger best-effort object cleanup; define an approved retention and
orphan-reconciliation policy before introducing automatic deletion of valid chat history.

Incoming text and quick replies are translated automatically for an authorized recipient's
preferred language, or through an explicit authorized request for an allowed target language.
The original is immutable and translation state is PENDING/PROCESSING/READY/FAILED in PostgreSQL.
The unique message/language/provider/model constraint is both the durable cache and duplicate-job
guard. RabbitMQ carries directed jobs between Chat replicas; interrupted jobs are recovered and
provider failures retry at most three times. READY/FAILED changes are pushed to authorized
subscribers through the existing WebSocket destination, while the original remains readable.

Only message text is sent server-side to the Google Gemini API; images, lifecycle evidence,
identities and credentials are not sent. The UI must disclose third-party AI translation and let
the recipient reveal the preserved original. Keep `CHAT_TRANSLATION_PROVIDER=disabled` when no
approved `GEMINI_API_KEY` has been injected. The key belongs in `.env` locally and AWS Secrets
Manager in staging, never in Git or the browser bundle.

Do not implement message editing/deletion, arbitrary admin browsing, voice/video, email/SMS or a
second ledger/logging backend. Retain terminal chat/case history; exact retention periods, user
deletion policy and object lifecycle need approval before automatic cleanup. Do not manufacture
numeric Chat performance commitments absent from the D3 requirements.

## Verification and staged implementation

Automated: requester/courier isolation, reassignment epoch policy after approval, terminal read-only,
cross-case admin conversation denial, invalid/stale identity, concurrent message sequence, duplicate
send/conflict, reconnect recovery, invalid/oversize upload, private download, translation cache/
provider failure, duplicate/out-of-order Kafka evidence and full backfill recovery. Real-broker
integration must demonstrate events create permissions and evidence without manual DB writes.

1. `$foc-iterate-feature chat-service-contract: Approve participant-history policy, public schemas and shared timeline fixtures.`
2. `$foc-iterate-feature chat-service-foundation: Scaffold Chat database/backend/frontend and authenticated conversation shell.`
3. `$foc-iterate-feature chat-service-lifecycle: Derive conversation membership and read-only state from approved Order events.`
4. `$foc-iterate-feature chat-service-messaging: Deliver durable text messages and paginated/reconnecting live chat UI.`
5. `$foc-iterate-feature chat-service-images: Add authorized private image uploads and message attachments.`
6. `$foc-iterate-feature chat-service-translation: Add original-preserving translation with durable outcomes and Redis cache.`
7. `$foc-iterate-feature chat-service-evidence: Provide Admin timeline/eligibility, checkpoints and backfill APIs.`
8. `$foc-iterate-feature chat-service-case-conversations: Integrate isolated live admin-participant conversations.`
9. `$foc-iterate-feature chat-service-acceptance: Verify privacy, restart/replay, real-broker integrations and deployment checks.`

Timeline iteration can run before translation to unblock Darryl; do not make Admin depend on the
external translator. XueTing owns Order event completeness, Darryl owns case-access/admin-eligibility
contracts, Jun Hui owns broker/ACL/DLT and shared wiring. Add CI commands when runnable code exists;
run `./mvnw verify` (Windows: `./mvnw.cmd verify`) for the runnable implementation.

## Admin integration completion

The [approved completion protocol](../docs/integration/chat-admin-contract.md#integration-completion-refinements--9-november-2026)
defines read-only conversation recovery, ten-minute immutable timeline snapshots, per-operation
User/Credit outcome reconciliation and the durable resolution write barrier. Current verification
and deployment state live in [Admin readiness](../admin-service/INTEGRATION_READINESS.md).

Private CASE reads, images and live recipients recheck current Admin/User access. Authorized
reviewing admins may read without becoming writers. Only the assigned reviewer initiates a thread;
the idempotency identity binds actor/body. Actor-specific denial does not close a thread, and Order
terminal events close ERRAND threads only. An explicit current-reviewer initiation POST can restore
an unresolved CASE row locked by old Order handling, preserving its ID/history and refusing any
prepared closure. Reads do not reopen conversations.

`chat-service-timeline` independently consumes original `admin.events`, `credit.admin.events` and
`user.admin.events` with read-committed isolation. The transactional inbox retains original events;
authenticated producer exports reconcile the safe timeline/backfill view. Lifecycle and case-event
listeners commit through separate transactional beans before acknowledging. Invalid/conflicting
facts are durably retained in `chat_evidence_failures`, offsets remain unacknowledged, and relevant
coverage includes FAILED_INGESTION gaps. The Chat owner investigates original event/operation IDs
and restores the producer/projection before resuming; never delete evidence or invent a complete
checkpoint to clear a failure. Monitor consumer lag and this failure table in addition to readiness.

`AdminChatIntegrationTest` uses real disposable PostgreSQL with explicitly test-owned producer HTTP
fixtures. It checks current authorization/private images/live recipients, duplicate initiation,
legacy-lock recovery, Order/CASE isolation, closure draining, immutable paging, repeated courier
assignment periods, empty baselines and owner-operation completeness. Production credentials and
business data are never used by those fixtures.

## Current account authorization

Protected operations require the verified JWT's selected role to remain assigned to an ACTIVE
User account. Current User decisions are never cached; denial is 403 and dependency uncertainty
is 503. Existing resource and lifecycle rules still apply. See the
[current authorization contract and acceptance checks](../docs/integration/current-authorization.md).

Configure CHAT_USER_URL, CHAT_SERVICE_KEY_ID and
CHAT_SERVICE_PRIVATE_KEY (base64 PKCS8 RSA, separate from User's JWT key),
and pin the matching public key/subject in USER_SERVICE_TRUSTED_KEYS. Missing signing/trust
configuration fails closed even when administrative Kafka consumers are disabled.

## Dispute review workflow

See the [approved report freeze and finalization contract](../docs/integration/dispute-review-contract.md) for service ownership, retry barriers, timeline message/image evidence, credit dispositions and rollout requirements. Existing lifecycle and case states are retained.

## Asynchronous dispute coordination

Dispute writes use the [versioned Kafka contract](../docs/integration/dispute-kafka-contract.md). Reports and decisions remain pending until committed owner confirmations; HTTP timeouts are never success. Existing current-account and evidence read authorization remains enforced locally.
