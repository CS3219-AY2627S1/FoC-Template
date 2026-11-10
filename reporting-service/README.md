<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-5), date: 2026-10-13
Mode: Documentation generation.
Scope: Documented team-specified Reporting Service behavior, APIs, dependencies, storage, configuration, and verification.
Author review: I reviewed for correctness.
-->

# Reporting Service

Reporting Service owns report records and their private photo attachments. Firestore stores report and attachment metadata; Cloud Storage stores the photo bytes. Admin Service is only a future consumer and does not own or mutate this data.

See [HANDOFF.md](HANDOFF.md) for the complete implementation summary, API payloads, Order Service contract, dependencies, known gaps, and pre-merge checklist.

## API

- `POST /api/reports` — authenticated multipart submission with required browser UUID `submissionId` (`report` JSON plus zero to five `photos`).
- `GET /api/reports/submissions/{submissionId}` — caller-scoped durable creation status.
- `POST /api/reports/submissions/{submissionId}/resume` — retry the identical multipart submission with fresh authentication.
- `DELETE /api/reports/submissions/{submissionId}` — cancel a caller-owned pre-hold submission and release its pending order reservation.
- `GET /api/reports/mine?view=submitted|against-me&page=1&size=20` — caller-scoped history.
- `GET /api/reports/mine/response-count` - caller-scoped aggregate of reports still awaiting that courier within the response window.
- `GET /api/reports/{id}` — details for the reporter, reported courier, or an administrator.
- `POST /api/reports/{id}/response` — one multipart courier response within 24 hours.
- `GET /api/reports?page=1&size=20&orderId=...&status=...` — admin-only, database-filtered and paginated.
- `GET /api/reports/{reportId}/attachments/{attachmentId}` — participant/admin private image stream.
- `POST /api/reports/{id}/resolve` — admin-only, required `{commandId,reply}`, delegates ORDER/COURIER hold resolution to Order (200/202); CREDITS/GENERAL resolve locally.
- `PUT /api/reports/internal/order-resolutions/{commandId}` — authenticated admin, callback-free atomic resolution for Order.
- `POST /api/reports/internal/order-resolution-compensations` — authenticated Pub/Sub restore/fence consumer with durable result outbox.
- `POST /api/reports/internal/creation-compensation-results` — exact-identity Pub/Sub creation rollback result consumer.
- `POST /api/reports/internal/creation-recovery` — exact scheduler-identity rollback-only recovery tick.
- `PATCH /api/reports/{id}/status` — retired unsafe flow, returns 409; use command-based resolution.
- Swagger UI: `/api/reports/docs`; OpenAPI JSON: `/api/reports/v3/api-docs`.

`ORDER` and `ERRAND` submissions require the caller's eligible ACCEPTED, IN_PROGRESS, PICKED_UP or DELIVERED order with an assigned courier. OPEN and terminal orders cannot be reported. `GENERAL` rejects `orderId` and goes directly to admin review without an Order hold. Before any linked hold call, Reporting durably saves the stable report ID, normalized input fingerprint, deterministic evidence manifest and pending order reservation. Creation has no background roll-forward: an uncertain hold or failed activation fences the submission and uses Order creation compensation. Inactive `RECEIVED`/`EVIDENCE_STORED` journals expire after one hour. Existing report resolution remains a separate all-or-nothing saga.

The required Order APIs and resolution coordinator are now present after the user's main merge. Admin Reports uses actual APIs in all frontend modes. [HANDOFF.md](HANDOFF.md) and [the saga contract](docs/order-resolution-saga.md) describe deployment activation, topic/subscription identities, retry safety and remaining cloud checks.

## Configuration

In addition to the repository-standard runtime variables, set `REPORTING_STORAGE_BUCKET`, `STORAGE_PROJECT_ID`, `STORAGE_EMULATOR_HOST` (local only), `ORDER_SERVICE_URL`, and optionally `ORDER_SERVICE_TIMEOUT`. Durable linked creation also uses the `REPORT_CREATION_*` variables documented in root `.env.example`; its hold lease defaults to two minutes. Compose uses Firestore `reporting-local`, Storage on port 9199, and service port 8086.

Resolution defaults disabled in the application. Staging explicitly enables both Order/Report resolution flags after authenticated push wiring and six READY indexes were verified on 2026-11-01. Deploy the updated configuration to activate it; production remains disabled. Other environments must configure the saga variables in root `.env.example` and matching Order settings, and install `firestore.indexes.json` for admin filtering and deadline reconciliation.

Cloud provisioning is scripted in `infra/gcp/configure-report-pubsub.sh staging|production prepare|wire`. It provisions versioned resolution and creation compensation topics/subscriptions, endpoint-specific OIDC identities, and the one-minute creation recovery scheduler. Deploy Order V20 lifecycle fencing before enabling Reporting creation. Production stays disabled until staging failure/race tests pass. The existing project bootstrap remains responsible for Firestore/attachment buckets and their runtime permissions.

## Development

Run `./mvnw verify`. Start the full local stack with `docker compose up --build`; all browser traffic still goes through the gateway.


Verified 2026-10-29:54 Report tests and both coverage gates; actual Order/Report HTTP and two-way Pub/Sub rollback, duplication, lost-response and delayed-original handling pass. See the saga document for evidence and rollout limits.


## CHANGE-189 / ADR-071 - Internal Reporting hold placement (2026-11-11)

Approved Yao Xiang on hfix/penalty-event-ordering. Implemented PUT /api/orders/internal/report-holds/{orderId}/{reportId}; removed public placement alias, retained eligible-Orders GET. Reporting supplies a runtime service ID token separately from the delegated Firebase participant token; Order verifies both identities before unchanged scoped SQL hold logic. New client credential cache/verifier/settings and deployment/local auth wiring reuse existing identities and gateway protection; no new schema/topic/key/frontend or saga change. Full verify passes734 Order,14 common,111 Report tests with coverage/no skips;21 mocked wiring checks, both Compose variants, shell syntax, generated OpenAPI and local gateway404 check pass. No cloud/local-application restart or data change. Coordinate both deployments with linked submissions paused and wire scoped Run Invoker; deployed Google/IAM smoke pending. Separate stale-upload recovery race remains pending. [Contract/classes/sequence/rollout](../order-service/docs/internal-report-hold-auth.md).
