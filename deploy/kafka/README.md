# Shared Kafka foundation

For the same broker and read-only UI inside Minikube, use the
[Kubernetes setup](k8s/README.md). Compose and Kubernetes use separate data and credentials.

This directory provides the local event broker required by the
[version-1 event blueprint](../../docs/integration/event-communication-blueprint.md). Kafka is
shared transport infrastructure: it carries facts between services, while PostgreSQL remains each
service's private source of truth. Kafka does not replace database transactions, constraints, or
service ownership.

This foundation provisions the broker, topics and access controls only. Event integration is not
complete until the User, Order and Credit owners implement their transactional outbox relays,
idempotent consumers/inboxes, retries and DLT forwarding. Supplier has no version-1 event contract
and therefore receives no Kafka identity.

## Local topology

- Image: pinned `apache/kafka:4.3.1` JVM image.
- Mode: one combined broker/controller using KRaft; ZooKeeper is not used.
- Containers connect to `kafka:9092`.
- Host-side debugging connects to `127.0.0.1:29092`.
- Both client listeners use local-only `SASL_PLAINTEXT` with the `PLAIN` mechanism.
- Broker data is stored in the Compose `kafka-data` named volume.
- Automatic topic creation is disabled; `kafka-init` creates all resources explicitly.
- A pinned [Kafbat UI](https://ui.docs.kafbat.io/) dashboard is available at
  `http://localhost:8090` for authenticated, read-only inspection.
- Replication factor and minimum in-sync replicas are both `1`. This survives a local container
  restart but provides **no broker redundancy**.

`SASL_PLAINTEXT` authenticates clients but does not encrypt passwords or records. The external
listener is bound to Mac/host loopback so it is not exposed to the wider network. This is a local
development setup, not a production security design.

## Credentials and future client contract

Copy `.env.example` to `.env` and replace every Kafka placeholder with a distinct local password:

```text
KAFKA_ADMIN_PASSWORD=...
KAFKA_BROKER_PASSWORD=...
KAFKA_USER_SERVICE_PASSWORD=...
KAFKA_ORDER_SERVICE_PASSWORD=...
KAFKA_CREDIT_SERVICE_PASSWORD=...
KAFKA_NOTIFICATION_SERVICE_PASSWORD=...
KAFKA_ADMIN_SERVICE_PASSWORD=...
KAFKA_UI_BROKER_PASSWORD=...
KAFKA_UI_LOGIN_USERNAME=...
KAFKA_UI_LOGIN_PASSWORD=...
```

`KAFKA_NOTIFICATION_SERVICE_PASSWORD` is required by Compose, but the broker treats it as optional
so an existing Kubernetes or AWS broker Secret without it still starts; the `notification_service`
identity then cannot authenticate until the password is provisioned.

Never commit `.env`. Use distinct values without quotes, backslashes or line breaks. The broker
writes a runtime-only JAAS file under `/tmp`; passwords are not written to the repository or Kafka
data volume. The UI login credentials protect the browser dashboard, while
`KAFKA_UI_BROKER_PASSWORD` authenticates its separate `kafka_ui` client identity to Kafka.

Future Docker-based adapters use:

```text
KAFKA_BOOTSTRAP_SERVERS=kafka:9092
KAFKA_SECURITY_PROTOCOL=SASL_PLAINTEXT
KAFKA_SASL_MECHANISM=PLAIN
KAFKA_USERNAME=<service identity>
KAFKA_PASSWORD=<that service's secret>
```

Host-side clients use `localhost:29092` instead. Compose configures the core service adapters and
Admin. Admin uses Spring standard Kafka client properties, with the same local SASL/PLAIN settings
and its dedicated `admin_service` identity. Credit administrative correction consumption is still
pending; broker permissions alone do not implement it. See the
[Admin runtime handoff](../../admin-service/RUNTIME_INTEGRATION.md) for the activation review gate.

## Topics

| Topic | Partitions | Retention | Purpose |
| --- | ---: | ---: | --- |
| `user.events` | 3 | 7 days | User activation facts |
| `order.events` | 3 | 7 days | Order lifecycle facts |
| `credit.events` | 3 | 7 days | Credit outcomes |
| `user.events.DLT` | 1 | 30 days | Failed User-event delivery |
| `order.events.DLT` | 1 | 30 days | Failed Order-event delivery |
| `credit.events.DLT` | 1 | 30 days | Failed Credit-event delivery |
| `order.lifecycle.events` | 3 | 7 days | Order lifecycle facts for Notification; producer pending |
| `order.lifecycle.events.DLT` | 1 | 30 days | Failed Order lifecycle-event delivery |
| `chat.events` | 3 | 7 days | Privacy-minimal user-authored Chat message facts |
| `chat.events.DLT` | 1 | 30 days | Failed Chat-message notification delivery |
| `admin.credit.commands` | 3 | 7 days | Admin correction requests; Credit consumer pending |
| `credit.admin.events` | 3 | 7 days | Credit correction outcomes; producer pending |
| `admin.credit.commands.DLT` | 1 | 30 days | Credit-owned command recovery |
| `credit.admin.events.DLT` | 1 | 30 days | Admin-owned outcome recovery |
| `admin.events` | 3 | 7 days | Original Admin case lifecycle facts, keyed by case ID |

All topics use `cleanup.policy=delete`. Keys and JSON envelopes must follow the shared blueprint:
User UUID for User facts, Order UUID for Order facts, and the corresponding aggregate UUID for
Credit outcomes. The fixed retention values are provisional local defaults, not an agreed
production data-retention policy.

## Access controls

| Identity | Allowed operations |
| --- | --- |
| `admin_service` | Write/describe `admin.credit.commands`, `credit.admin.events.DLT`, `admin.events`; read/describe `credit.admin.events`; Read group `admin-service-credit`; cluster idempotent write; Write/Describe transactional IDs with prefix `admin-case-events-` |
| `credit_service` (additional) | Read/describe `admin.credit.commands`; Read group `credit-service-admin`; write/describe `credit.admin.events`, `admin.credit.commands.DLT` |
| `user_service` | Write/describe `user.events`; cluster idempotent write |
| `order_service` | Write/describe `order.events` and `order.lifecycle.events`; read/describe `credit.events` as group `order-service`; write/describe `credit.events.DLT`; cluster idempotent write |
| `credit_service` | Read/describe `user.events` and `order.events` as group `credit-service`; write/describe `credit.events`, `user.events.DLT` and `order.events.DLT`; cluster idempotent write |
| `notification_service` | Read/describe `credit.events`, `order.lifecycle.events` and `chat.events` as group `notification-service`; write/describe their DLTs; cluster idempotent write. It cannot write source event topics or join another service's group |
| `chat_service` | Read/describe `order.lifecycle.events` as group `chat-service-lifecycle`; write/describe `chat.events`; cluster idempotent write |
| `kafka_ui` | Read/describe the project topics and their configurations; describe consumer groups, including MSK health groups; use only `kafka-ui-browser*` groups; no group membership, offset reset or Kafka mutations |
| `foc_admin` | Broker initialization and local diagnosis (super-user) |
| `foc_broker` | Broker-to-broker traffic (super-user) |

ACLs deny every unlisted operation. The initializer is idempotent: rerunning it preserves records
and converges topic retention settings and ACL entries.

## Start, inspect and stop

From the repository root, start the broker, initializer and dashboard together:

```bash
docker compose up -d --wait kafka-ui
```

Or start only the broker and initializer when the dashboard is unnecessary:

```bash
docker compose up -d --wait kafka
docker compose run --rm kafka-init
docker compose ps kafka
```

Open `http://localhost:8090` and sign in with `KAFKA_UI_LOGIN_USERNAME` and
`KAFKA_UI_LOGIN_PASSWORD` from the local `.env`. Select **foc-local** to inspect brokers, the
topics, partitions, configurations, message keys/envelopes, consumer groups and lag. The UI uses
both Kafbat's read-only mode and broker ACLs: it cannot produce records, create/delete topics,
change retention, reset business offsets or join a service's consumer group.

List or describe topics with the authenticated health-check client configuration:

```bash
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --command-config /tmp/foc-kafka-health.properties \
  --list

docker compose exec kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --command-config /tmp/foc-kafka-health.properties \
  --describe --topic user.events
```

List ACLs:

```bash
docker compose exec kafka /opt/kafka/bin/kafka-acls.sh \
  --bootstrap-server localhost:9092 \
  --command-config /tmp/foc-kafka-health.properties \
  --list
```

Stop Kafka while preserving its named volume:

```bash
docker compose stop kafka
docker compose stop kafka-ui
docker compose rm -f kafka kafka-init kafka-ui
```

Starting it and rerunning the initializer restores the broker with the existing records. To reset
Kafka completely, first stop/remove those two containers, run `docker volume ls` to identify the
project's exact `kafka-data` volume, and remove **only that exact volume** with `docker volume rm`.
Do not use `docker compose down -v` on the normal project merely to reset Kafka; that would also
delete the team's PostgreSQL volumes.

## Manual produce and consume

These commands generate temporary client files inside the broker container and never print the
passwords. Start the consumer first, then run the producer in another terminal.

Credit consuming User events:

```bash
docker compose exec kafka bash -lc '
  source /opt/foc-kafka/lib.sh
  write_client_properties /tmp/credit.properties credit_service "$KAFKA_CREDIT_SERVICE_PASSWORD"
  /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 \
    --consumer.config /tmp/credit.properties --topic user.events \
    --group credit-service --from-beginning --property print.key=true
'
```

User publishing a keyed test envelope:

```bash
docker compose exec -T kafka bash -lc '
  source /opt/foc-kafka/lib.sh
  write_client_properties /tmp/user.properties user_service "$KAFKA_USER_SERVICE_PASSWORD"
  /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 \
    --command-config /tmp/user.properties --topic user.events \
    --reader-property parse.key=true --reader-property key.separator="|" \
    --command-property enable.idempotence=true --command-property acks=all
' <<'EOF'
1fd9b5c8-16cc-4460-a1cc-bc5ce0347a97|{"eventId":"ea5f45d9-8911-40c4-b9c4-83f33b8492d8","eventType":"UserActivated","eventVersion":1,"aggregateType":"User","aggregateId":"1fd9b5c8-16cc-4460-a1cc-bc5ce0347a97","aggregateVersion":1,"occurredAt":"2026-10-17T00:00:00Z","producer":"user-service","correlationId":"ea5f45d9-8911-40c4-b9c4-83f33b8492d8","causationId":null,"actor":{"type":"SYSTEM"},"data":{"operationId":"573a3b84-2c96-4da0-940d-08a43420f0db","userId":"1fd9b5c8-16cc-4460-a1cc-bc5ce0347a97","activatedAt":"2026-10-17T00:00:00Z"}}
EOF
```

## Automated smoke verification

Run:

```bash
./deploy/kafka/Test-LocalKafka.sh
```

The script uses an isolated Compose project and disposable Kafka volume. It validates Compose,
starts an authenticated broker and login-protected dashboard, runs the initializer twice, checks
every topic/configuration/ACL, performs authorized keyed produce/consume, proves service and UI
mutation boundaries, verifies dashboard login and cluster visibility, restarts Kafka, confirms the
dashboard reconnects and verifies the record/configuration survived. It then removes only its
disposable project and volume. Set `KEEP_KAFKA_SMOKE_STACK=1` only when diagnosing a failure
manually.

## Kubernetes handoff

The Compose broker and dashboard do not exist inside the `foc-local` Kubernetes network. A pod
cannot connect to Compose's `kafka:9092` DNS name. The Kubernetes owner must separately deploy a
broker with persistent storage and a Kubernetes Service, create credentials as Secrets, and set
each participating application's Kafka client variables to that in-cluster Service address.

The [Kubernetes setup](k8s/README.md) now provides that separate broker, the same pinned Kafbat
dashboard and a local-only port-forward workflow. It creates independent Kubernetes Secrets;
do not copy local `.env` credentials into YAML or expose the dashboard through the public gateway.

## Delivery reliability responsibilities

The broker's topics and DLTs alone do not make delivery reliable. Each service adapter must later:

1. Commit its business change and complete event into a transactional outbox in one PostgreSQL
   transaction.
2. Publish the stored key/envelope using `acks=all` and idempotent production.
3. Consume with the assigned stable group and an inbox keyed by `eventId`.
4. Apply the business effect and inbox completion atomically, then acknowledge Kafka.
5. Retry transient failures using the team-approved policy, and only then forward the original
   keyed record and metadata to the source topic's DLT.

Kafka delivery is at least once, so consumers must remain idempotent. A DLT existing at broker
startup does not implement retry or forwarding; those are application-side behaviors.

## Troubleshooting

- **`set: pipefail: invalid option name` on Windows:** the bind-mounted shell scripts have CRLF
  line endings. Save every `deploy/kafka/*.sh` file with LF endings, then restart Kafka and rerun
  its initializer. The root `.gitattributes` keeps these scripts LF on future Git checkouts.
  This is a script-formatting issue; do not delete any database or Kafka volumes to fix it.
- **Authentication failed:** ensure `.env` contains all five Kafka passwords and recreate the
  broker after changing them. Existing broker processes do not reload JAAS automatically.
- **Cannot log into the dashboard:** check the two `KAFKA_UI_LOGIN_*` values, then recreate only
  `kafka-ui`; changing these values does not require deleting Kafka data.
- **Dashboard says the cluster is offline:** inspect `docker compose logs kafka-ui`, confirm Kafka
  is healthy and ensure `KAFKA_UI_BROKER_PASSWORD` matches the value used when Kafka was created.
- **Topic/group authorization failed:** confirm the service is using its own identity and assigned
  consumer group. Inspect ACLs with the admin command above.
- **Cannot connect from host:** use `localhost:29092`, not `kafka:9092`, and confirm the port is not
  already occupied. Containers must use `kafka:9092`.
- **Kafka is unhealthy:** run `docker compose ps kafka` and
  `docker compose logs --tail=200 kafka kafka-init`; check credentials, listener configuration and
  available Docker disk space.
- **Initializer exited:** exit code `0` is expected for the one-shot container. Rerun it with
  `docker compose run --rm kafka-init` after the broker becomes healthy.
- **Disk usage grows:** retention is time-based, not an immediate hard size cap. Inspect the
  `kafka-data` volume and Docker disk allocation before deleting anything.

## Team review required before D4/production

The following choices are intentionally unresolved and must be agreed by User, Order, Credit and
infrastructure owners before production-like deployment:

- Confirm or replace the provisional **7-day normal / 30-day DLT retention** policy.
- Agree the exact timings and multiplier for the blueprint's three retry attempts.
- Decide when local `SASL_PLAINTEXT` becomes encrypted `SASL_SSL` and how certificates rotate.
- Select long-term metrics, dashboards and alerts for lag, outboxes, inboxes, retries and DLTs.
- Review production Kafka topology, storage classes, disruption handling and credential rotation
  separately; the single-broker local Kubernetes setup is not a production availability design.
- Choose production broker count, replication/min-ISR, backup/recovery objectives and tested
  disaster-recovery procedure.
- Establish event-schema compatibility checks and the governance process for `eventVersion`
  changes.

Changes to this shared foundation require one nominated implementer plus review from the affected
User, Order and Credit owners.

## Case sanctions integration

See [sanctions ownership, behavior, recovery and verification](../../admin-service/SANCTIONS_INTEGRATION.md).
