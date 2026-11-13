# Operational logging

FoC services emit one JSON object per application log event. The event name is
in the `event` field; identifiers and measurements are top-level fields. Worker
logs are the operational source of truth for Kafka processing, while `/ready`
failures are the operational source of truth for API database readiness.

## Centralized logging scope

The centralized logger covers backend application processes only. The initial
collector must include these Compose services:

| Service | Process type |
| --- | --- |
| `user-service` | API |
| `user-migrate` | Migration job |
| `user-bootstrap` | Bootstrap job |
| `supplier-service` | API |
| `supplier-migrate` | Migration job |
| `supplier-seed` | Seed job |
| `credit-service` | API |
| `credit-migrate` | Migration job |
| `credit-order-worker` | Kafka worker |
| `order-service` | API |
| `order-migrate` | Migration job |
| `order-worker` | Kafka worker |
| `notification-service` | API |
| `notification-migrate` | Migration job |
| `notification-worker` | Kafka worker |

The initial collector must exclude `frontend-service`, all PostgreSQL services,
`kafka`, `kafka-topics`, `supplier-bootstrap`, and `supplier-grants`. Those
streams may be integrated later as separate infrastructure logging sources.

The collector should select services using the Docker Compose service label,
`com.docker.compose.service`, rather than container names. Several backend
services do not define an explicit `container_name`, and container names are
not a stable application identity across deployment environments.

This scope applies to centralized application-log collection. It does not
change the existing stdout behavior: backend processes continue to write
structured JSON to stdout, and the collector remains responsible for shipping
those records to the central logging backend.

## Vector collector

The root Compose file runs Vector as the initial backend log collector. Vector
reads Docker logs through the read-only Docker socket mount and passes only the
15 backend services listed above through the `select_backend` transform, using
the `com.docker.compose.service` label. It does not send frontend, database,
Kafka, or excluded provisioning-job records to the collector sink. Filtering in
the pipeline also lets a restarted collector discover backend containers that
were already running before it started.

The `normalize_backend_logs` transform parses each JSON application record from
Docker's `message` field, preserves useful Docker metadata, and adds
`compose_service`, `collector`, and `source_type` fields. The raw Docker label
map is removed after extracting the service name so unrelated labels and host
paths are not forwarded. Malformed records are kept with
`structured_log_parse_error: true` rather than being silently dropped.

Vector sends the normalized stream to Loki. The sink uses a disk buffer under
the persistent `vector-data` volume and blocks when that buffer is full, so a
temporary Loki outage does not immediately discard collected records. Vector's
internal warning and error logs are sent through a separate `foc-collector`
stream so delivery failures can be inspected without adding frontend,
database, Kafka, or other infrastructure application logs to the backend
stream. Both streams use only low-cardinality Loki labels: `source`, `service`,
`component`, `environment`, and `level`. Request, message, and domain
identifiers remain in the JSON log body.

Start the collector with `docker compose up vector` and inspect the normalized
records with `docker compose logs -f vector`. The collector requires access to
the Docker socket, so the socket mount must be protected like Docker API
credentials in deployments outside local development. Linux uses
`/var/run/docker.sock` by default. Docker Desktop users should set
`VECTOR_DOCKER_SOCKET` in `.env` to the host socket exposed by their Docker
context, for example `/Users/<user>/.docker/run/docker.sock`.

## Loki and Grafana

The root Compose file also runs Loki and Grafana. Loki stores the backend log
history in the persistent `loki-data` volume using its local filesystem
backend. Grafana is provisioned with the `FoC Loki` data source and connects to
Loki through the Compose service name, `http://loki:3100`; it does not use
`localhost` because Grafana runs in its own container.

Set `GRAFANA_ADMIN_PASSWORD` in `.env` before starting the stack. Start the
logging stack with `docker compose up vector loki grafana`, then open Grafana at
`http://127.0.0.1:3001`. Loki readiness is available at
`http://127.0.0.1:3100/ready`.

Useful initial Grafana Explore queries are:

```logql
{service="order-service"}
{component="worker", environment="development"} | json | event="worker_heartbeat"
```

### Grafana dashboard and alert rules

The Compose stack provisions a `FoC Backend Logs` dashboard in the `FoC` folder. It includes log volume by level, API errors by service and route, processing duration, recent backend logs, worker or delivery signals, and collector delivery failures. Dashboard changes belong in version control under `observability/grafana/provisioning/dashboards/`.

Grafana also provisions backend-only alert rules in the `FoC Alerts` folder from `observability/grafana/provisioning/alerting/foc-backend-alerts.yaml`:

- `order-worker`, `credit-order-worker`, and `notification-worker` heartbeat missing for two minutes
- retry exhausted, dead-lettered, sent-to-DLQ, or parked-for-DLQ events
- readiness check failures
- relay failures
- backend API 5xx responses
- Vector collector delivery failures

The rules use LogQL over Loki and are visible in Grafana under `Alerts & IRM`. They do not configure an external notification destination because that is deployment-specific. Configure a contact point and notification policy in the target environment before treating these alerts as paging signals. Provisioned alert rules are managed from the file rather than edited in the Grafana UI.

The current alert rules intentionally omit a duration-SLO alert because the service-specific threshold has not been agreed yet. Add that rule after the SLO and evaluation window are defined.

### Verification

After the full Compose stack is running, run the repository smoke test from the project root:

```bash
GRAFANA_ADMIN_PASSWORD='your-local-password' ./scripts/verify-observability.sh
```

The test checks Loki readiness, Grafana health, dashboard provisioning, all eight file-provisioned alert rules, the expected Loki labels, and at least one backend log delivered through Vector in the previous five minutes. It uses `GRAFANA_URL` and `LOKI_URL` when the services are exposed on non-default local addresses. Set `OBSERVABILITY_REQUIRE_BACKEND_LOGS=false` when testing only provisioning before any backend service has emitted a log.

This Compose Loki setup is for local development and evaluation. Production
should use authenticated transport, an authentication layer in front of Loki,
and durable object storage or a managed Loki-compatible service.

## Log envelope

Every structured backend application record uses log schema version `1` and
contains these fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `schema_version` | integer | Version of the logging envelope; currently `1`. |
| `timestamp` | ISO-8601 UTC string | Time the process created the record. |
| `level` | string | `DEBUG`, `INFO`, `WARNING`, `ERROR`, or `CRITICAL`. |
| `service` | string | Stable backend service identity. |
| `component` | string | Process role, such as `api`, `worker`, `migration`, `bootstrap`, or `seed`. |
| `service_version` | string | Build identifier from `APP_VERSION`, or `unknown`. |
| `environment` | string | Deployment environment, such as `development`, `test`, or `production`. |
| `logger` | string | Python logger name. |
| `event` | string | Lower-snake-case event name. |

Request, message, and domain identifiers such as `request_id`,
`correlation_id`, `event_id`, and `order_id` are optional top-level fields when
available. Application fields must not override envelope fields. Sensitive
values remain subject to the shared redaction rules.

Migration jobs emit `migration_started`, `migration_completed`, or
`migration_failed` with `component: "migration"` and a `mode` field. The
Supplier seed job emits `seed_preview_completed`, `seed_preview_rejected`,
`seed_import_completed`, `seed_import_rejected`, or
`seed_import_outcome_unknown` with `component: "seed"`. Its existing report
fields remain top-level structured fields in the emitted record so command
consumers can continue to inspect the JSON result without a second output
format.

## Worker signals

Kafka workers emit the following events with `worker`, `topic`, and
`consumer_group` where applicable:

| Event | Meaning |
| --- | --- |
| `worker_started` | The worker has created its Kafka and database clients and entered its loop. |
| `worker_heartbeat` | The loop is alive; emitted every 60 seconds. |
| `worker_shutdown` | Shutdown cleanup has started. |
| `worker_relay_completed` | At least one outbox or parked record was published; `count` is the batch size. |
| `*_relay_failed` | An outbox relay attempt failed and its transaction was rolled back. |
| `message_processing_completed` / `credit_event_processing_completed` | One delivery finished; includes `duration_ms`, `outcome`, and `attempts` where available. |
| `message_retry_exhausted` / `credit_event_retry_exhausted` | A delivery used all permitted processing attempts. |
| `message_sent_to_dlq` / `credit_event_sent_to_dlq` | Kafka confirmed quarantine publication. |
| `message_parked_for_dlq` | The Order worker stored a record locally because its DLQ was unavailable. |

The Credit worker's `credit_event_sent_to_dlq` event is emitted only after the
DLQ publish is confirmed and before the source offset is committed. A failed
publish therefore does not look like a successful quarantine.

The Notification Service API also emits `readiness_check_failed`, authentication
outcome events, notification read-status events, listener connection events,
and stream opened/closed/failed events. Stream and read-status events carry only
safe notification/user identifiers and counts; notification titles, bodies,
parameters, bearer tokens, and raw request bodies are excluded.

## Alert guidance

These are collector rules, not application-side timers:

| Condition | Suggested alert |
| --- | --- |
| No `worker_heartbeat` from an expected worker for 120 seconds | Page: worker stopped, wedged, or unable to emit logs. |
| Any `*_retry_exhausted`, `*_dead_lettered`, or `*_parked_for_dlq` event | Page or create a high-priority incident; inspect the event IDs, source offsets, and exception category. |
| DLQ events or parked records continue increasing for 5 minutes | Page: quarantine backlog is growing faster than it is being investigated or relayed. |
| Any `*_relay_failed` event, especially repeated failures | Warn on the first event; page when repeated for 5 minutes because the transactional outbox may be accumulating. |
| At least three `readiness_check_failed` events within two minutes | Page: the API is unavailable or its database/migration state is unhealthy. |
| `duration_ms` exceeds the service's normal processing SLO | Warn and investigate database, broker, or downstream latency. |

Alert rules should group by `service`, `worker`, `topic`, and `consumer_group`
and should retain `event_id`, `correlation_id`, `order_id`, and source partition
and offset when present. Alert payloads should never be used as a substitute
for these safe identifiers; credentials, bearer tokens, login input, and
database URLs remain excluded from structured logs.
