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

- `POST /api/reports` — authenticated multipart submission (`report` JSON plus zero to five `photos`).
- `GET /api/reports/mine?view=submitted|against-me&page=1&size=20` — caller-scoped history.
- `GET /api/reports/mine/response-count` - caller-scoped aggregate of reports still awaiting that courier within the response window.
- `GET /api/reports/{id}` — details for the reporter, reported courier, or an administrator.
- `POST /api/reports/{id}/response` — one multipart courier response within 24 hours.
- `GET /api/reports?page=1&size=20&orderId=...&status=...` — admin-only, database-filtered and paginated.
- `GET /api/reports/{reportId}/attachments/{attachmentId}` — participant/admin private image stream.
- `POST /api/reports/{id}/resolve` — admin-only, required `{commandId,reply}`, delegates ORDER/COURIER hold resolution to Order (200/202); CREDITS/GENERAL resolve locally.
- `PUT /api/reports/internal/order-resolutions/{commandId}` — authenticated admin, callback-free atomic resolution for Order.
- `POST /api/reports/internal/order-resolution-compensations` — authenticated Pub/Sub restore/fence consumer with durable result outbox.
- `PATCH /api/reports/{id}/status` — retired unsafe flow, returns 409; use command-based resolution.
- Swagger UI: `/api/reports/docs`; OpenAPI JSON: `/api/reports/v3/api-docs`.

`ORDER` and `COURIER` submissions require the requester's own ACCEPTED, IN_PROGRESS, PICKED_UP or DELIVERED order with an assigned courier. OPEN and terminal orders cannot be reported. `CREDITS` and `GENERAL` reject `orderId` and go directly to admin review without Order lookup, hold or courier response. The separate completed/cancelled Order history APIs remain available but are not used by Report submission. Reporting generates the report ID first, then uses the atomic Order Service hold operation documented in `HANDOFF.md`; it never fetches an order and validates it separately. Couriers have one 24-hour response opportunity. Admins may resolve early after a UI warning. Legacy persisted `OPEN` **report statuses** are read as `READY_FOR_REVIEW`; this is distinct from Order eligibility.

The required Order APIs and resolution coordinator are now present after the user's main merge. Admin Reports uses actual APIs in all frontend modes. [HANDOFF.md](HANDOFF.md) and [the saga contract](docs/order-resolution-saga.md) describe deployment activation, topic/subscription identities, retry safety and remaining cloud checks.

## Configuration

In addition to the repository-standard runtime variables, set `REPORTING_STORAGE_BUCKET`, `STORAGE_PROJECT_ID`, `STORAGE_EMULATOR_HOST` (local only), `ORDER_SERVICE_URL`, and optionally `ORDER_SERVICE_TIMEOUT`. Compose uses Firestore `reporting-local`, Storage on port 9199, and service port 8086.

Resolution defaults disabled in the application. Staging explicitly enables both Order/Report resolution flags after authenticated push wiring and six READY indexes were verified on 2026-11-01. Deploy the updated configuration to activate it; production remains disabled. Other environments must configure the saga variables in root `.env.example` and matching Order settings, and install `firestore.indexes.json` for admin filtering and deadline reconciliation.

Cloud provisioning is scripted in `infra/gcp/configure-report-pubsub.sh staging|production prepare|wire`. It creates Report's runtime/push identities, grants Report result-topic publishing, and converts the existing subscriptions to authenticated push after both backends exist. Order's Publisher grants are preserved. See [the rollout sequence](HANDOFF.md#cloud-rollout-change-167-approved-2026-10-30) and subsequent staging activation record; deployment templates forward both services' settings. The existing project bootstrap remains responsible for Firestore/attachment buckets and their runtime permissions.

## Development

Run `./mvnw verify`. Start the full local stack with `docker compose up --build`; all browser traffic still goes through the gateway.


Verified 2026-10-29:54 Report tests and both coverage gates; actual Order/Report HTTP and two-way Pub/Sub rollback, duplication, lost-response and delayed-original handling pass. See the saga document for evidence and rollout limits.
