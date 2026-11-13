# Kafka and read-only UI on Minikube

For an ACL/topic-only update to the existing ready broker, use
`pwsh -File deploy/kafka/k8s/Apply-LocalKafka.ps1 -InitializeOnly` after shared-owner review.
It verifies that all non-initializer runtime scripts match, updates only `initialize.sh`, and runs
the existing idempotent Job. It does not provision/rotate credentials or redeploy the broker/UI.
Missing resources or runtime drift require normal reviewed reconciliation instead. This iteration
adds Chat's independent `chat-service-timeline` read access to existing Admin/User/Credit outcome
topics; it does not grant business publishers broker-admin permission or change core topics.

Shared editor: Darryl's infrastructure task. Jun Hui reviews the broker/UI setup; User, Order
and Credit owners review their connection configuration. No business event contracts change.

Admin's Kubernetes increment adds the existing `admin_service` broker identity and its own
`admin-kafka-client` Secret while preserving all older credentials. The initializer Job sets
`KAFKA_INIT_PARALLELISM=1` within its 512Mi budget; the shared script defaults to seven elsewhere.
No ACL/topic behavior changes. Review [Admin deployment](../../../admin-service/k8s/README.md).

The shared initializer retries idempotent create/config/ACL commands up to three times before
failing. Its regression test uses fake CLI executables, not a broker. From the repository root,
run only in a disposable container (PowerShell):

```powershell
docker run --rm --entrypoint bash -e KAFKA_INITIALIZER_TEST_ONLY=true --mount "type=bind,source=$((Get-Location).Path)/deploy/kafka,target=/opt/foc-kafka,readonly" apache/kafka:4.3.1 /opt/foc-kafka/k8s/test-initialize.sh
```

This extends the [course's Minikube/Docker/YAML workflow](https://sds-edu.github.io/SDS-Kubernetes-Guide/)
using a StatefulSet for Kafka's stable identity and persistent storage, a Deployment for the
stateless UI, ClusterIP Services, ConfigMaps, Secrets and an initialization Job. No Helm/operator,
cloud account, custom Dockerfile, new image publishing job or external Kafka server is required.

## Components and boundaries

| Component | Kubernetes resource | Image/source |
| --- | --- | --- |
| Broker/controller | One `kafka-0` StatefulSet pod; retained 5Gi PVC | [`apache/kafka:4.3.1`](https://hub.docker.com/r/apache/kafka) |
| Browser dashboard | One `kafka-ui` Deployment pod; no persistent data | [`ghcr.io/kafbat/kafka-ui:v1.5.0`](https://github.com/kafbat/kafka-ui) |
| Topics/permissions | One-shot `kafka-init-*` Job on every helper run | Same Apache image and existing `initialize.sh` |

Use the `foc-local` profile and namespace. Broker clients in that namespace use `kafka:9092`;
both bootstrap and advertised addresses stay inside Kubernetes. Kafka advertises its stable
`kafka-0.kafka-headless:9092` pod address; the headless Service also supplies the controller's
`kafka-0.kafka-headless:9093` identity before readiness, avoiding a startup/readiness DNS cycle. Kafka
and UI have no NodePort/public listener and are not routed through the application gateway.
Other namespaces must deliberately use qualified DNS names and suitable listener configuration.

The setup reuses the existing six topics, retention, three business identities, `kafka_ui`
read-only ACLs and `kafka-ui-browser*` group restriction. The UI also requires login, disables
dynamic configuration and uses read-only mode. It receives neither broker-admin credentials
nor Kubernetes API credentials. It can inspect event payloads: treat dashboard access as sensitive.

This is local D3 infrastructure: one broker, replication/min-ISR 1, SASL_PLAINTEXT authentication
without encryption and no failover. Do not scale this StatefulSet for extra brokers; that needs
a new quorum/replication design. A retained claim is not a backup. Resource requests/limits and
the 512Mi broker heap are laptop starting values, not measured production capacity guarantees.

Kubernetes-only CLI wrappers launch the official classes and libraries in the pinned Apache image,
avoiding slow build-tree/JMX discovery for short-lived tools on Windows Minikube. The existing
initializer batches equivalent ACL operations (without adding permissions); verification logic
is reused. Recheck `cli.sh` class mappings when
upgrading Kafka; these are not separate container images or replacements for Kafka itself.

## Apply or update

Helpers require PowerShell 7.2+ (`pwsh`) and Minikube. Run Docker Desktop in Linux-container
mode, then from the repository root:

```powershell
minikube start -p foc-local --driver=docker
pwsh -File deploy/kafka/k8s/Apply-LocalKafka.ps1
```

The helper selects the explicit context/namespace, creates missing credentials directly in the
cluster, normalizes the shared scripts into a ConfigMap, validates/applies the broker, waits for
readiness, runs the initializer, then starts the UI. Secrets are never exported to a file or printed.
Fresh passwords are cryptographically random; an existing broker Secret, client Secrets and UI
login are preserved. Existing storage without its broker Secret causes an error, not rotation.
Client/broker mismatches also fail rather than silently overwriting credentials. Partial setup
can be rerun. Jobs expire after one hour; initializer failures are not treated as success.

Kubernetes Secrets do not load Compose's `.env`. These are independent local credentials; you
do not need Jun Hui's personal passwords. The broker holds its configured identities; each client
Secret contains only its own credentials. Anyone allowed to read Secrets can recover their values;
base64 is not encryption. Use trusted local cluster access and do not commit Secret exports.

Reapply with the helper after editing configuration/scripts; its checksum rolls the broker only
when those inputs change. Update the pinned image version deliberately for a Kafka/UI upgrade,
check compatibility with retained Kafka data, then reapply and verify. Do not assume downgrading
an image safely downgrades stored metadata. Secrets are not automatically rotated or reloaded;
coordinate any deliberate credential change with all clients and restart affected pods.

Do not run `kubectl apply -f deploy/kafka/k8s` indiscriminately: the Job is a template and
`user-connection.patch.yaml` is an optional patch, not a standalone resource. The helper applies
the files in the required order and gives each initializer Job a unique name.

## Open the UI

In a separate terminal:

```bash
minikube -p foc-local kubectl -- --context=foc-local -n foc-local port-forward service/kafka-ui 8091:8080 --address=127.0.0.1
```

Open `http://127.0.0.1:8091`. Port 8091 avoids Compose's existing 8090 dashboard. Stop the tunnel
with Ctrl+C; reopen it after the selected UI pod is replaced. Closing the UI does not stop Kafka.

To retrieve your local dashboard login **privately**, run these yourself in Git Bash. Do not paste
their output into chats, screenshots, logs or Git:

```bash
minikube -p foc-local kubectl -- --context=foc-local -n foc-local get secret kafka-ui-secrets -o jsonpath='{.data.SPRING_SECURITY_USER_NAME}' | base64 --decode; echo
minikube -p foc-local kubectl -- --context=foc-local -n foc-local get secret kafka-ui-secrets -o jsonpath='{.data.SPRING_SECURITY_USER_PASSWORD}' | base64 --decode; echo
```

These are separate from your FoC student login and from Kafka's `kafka_ui` broker password.

## Connect services (separate from provisioning the broker)

User's new image must contain the approved `UserActivated` outbox publisher. Merge that feature
and obtain its verified CI-published SHA image first; the initial `d3-1` image cannot publish.
Do not mistake an enabled environment variable or broker readiness for implemented integration.

For an ad-hoc User rollout in the same namespace, after selecting that new image:

```bash
# Replace the image value with the exact Image from the successful CI run.
minikube -p foc-local kubectl -- --context=foc-local -n foc-local set image deployment/user-service user-service=arkanian4/foc-user-service:YOUR_VERIFIED_SHA_TAG
minikube -p foc-local kubectl -- --context=foc-local -n foc-local patch deployment user-service --type=strategic --patch-file=deploy/kafka/k8s/user-connection.patch.yaml
minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status deployment/user-service --timeout=300s
```

Replace the placeholder; do not execute it literally. The reviewed User, Credit and Order
Deployment files now retain their connection configuration across normal applies; the optional
User patch remains useful only for an older checkout. The Kafka helper itself never changes an
application Deployment or chooses an application image.

Credit and Order use `kafka:9092`, `SASL_PLAINTEXT`, `PLAIN`, their own usernames
(`credit_service` / `order_service`) and `KAFKA_PASSWORD` from `credit-kafka-client` /
`order-kafka-client`. User uses the equivalent `user-kafka-client` Secret. Supplier has no v1
Kafka contract. Apply this Kafka setup before deploying any of those enabled clients.

## Verification and acceptance

```powershell
pwsh -File deploy/kafka/k8s/Test-LocalKafka.ps1
```

This creates a uniquely named disposable namespace in the selected profile, with independent
Secrets and storage. It applies twice, verifies topic/config/ACL convergence, publishes as User
and consumes as Credit with the UI stopped, proves forbidden writes/groups are denied, logs in
to the real UI, checks read-only topic access, replaces only the disposable broker pod and proves
records/ACLs survive on the original PVC. Cleanup validates the namespace's ownership label before
deleting that exact namespace, including test storage. `-KeepResources` retains it for diagnosis.
No application service is deployed in the smoke namespace. Never invoke the fixture-producing
shared `verify.sh` against real business topics/consumer groups.
The full smoke test starts several Java command-line clients and applies initialization twice;
it can take tens of minutes on a constrained laptop. Kubernetes consumer/denial checks allow 60 seconds for client
startup; this changes test timing, not broker permissions or application retry settings.

For manual acceptance, open the real UI, sign in, inspect the six topics and their configurations,
and confirm mutation controls are unavailable. After the User feature/image is deployed, verify
a genuinely new account and inspect its `UserActivated` message. Verify broker-outage/recovery
on that real flow when appropriate. Do not bypass OTP verification, fabricate activation facts in
the application namespace or expect credits until Credit's consumer is integrated. Synthetic
broker smoke checks are not proof of the end-to-end credit allocation workflow.

Inspect state without revealing secrets:

```bash
minikube -p foc-local kubectl -- --context=foc-local -n foc-local get pods,svc,pvc,jobs
minikube -p foc-local kubectl -- --context=foc-local -n foc-local logs job/ACTUAL_INITIALIZER_JOB_NAME
```

On failures inspect pod events/readiness, Job logs, storage permissions, resources and broker/UI
authentication. Keep original Secrets, cluster ID and PVC. Retrying the helper does not delete
data. To stop the cluster, use `minikube stop -p foc-local`; do not delete the namespace/profile/PVC. Broker pod
replacement retains records but interrupts delivery briefly. Compose records are not migrated:
Compose and Kubernetes are independent Kafka installations.
