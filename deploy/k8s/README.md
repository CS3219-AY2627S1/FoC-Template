# Local Kubernetes (Minikube)

The current local Kafka dispute preview is recorded in [Admin readiness](../../admin-service/INTEGRATION_READINESS.md#kafka-replacement--10-november-2026). Its selected deployment files pin locally built images based on `8a986a27` plus the approved Kafka changes. Build/load those exact tags before applying elsewhere; the registry table below is historical. The gateway tunnel remains `http://127.0.0.1:8089`. Follow [Kafka runtime reconciliation](../../admin-service/k8s/README.md#current-kafka-preview); keep existing credentials and PVCs.

For the historical Admin integration completion, four selected Deployment files used local
`foc-{user,chat,credit}-service:local-61c7062-completion-20261109-v2` and
`foc-admin-service:local-61c7062-completion-20261109-v3` builds from this worktree. Order is back
on its published image (table below), which already contains that build's Order changes.
Build each with its existing Dockerfile and run `minikube -p foc-local image load <tag>`
before applying it. No image is published by that operation. The Docker Hub table below records
the retained published baseline; consult [Admin readiness](../../admin-service/INTEGRATION_READINESS.md)
for current build, owner review, deployment and business acceptance results. Gateway/Supplier and
unrelated services retain their existing images. Credentials and PVCs are preserved.

This setup follows the [course guide](https://sds-edu.github.io/SDS-Kubernetes-Guide/): Minikube
with the Docker driver, YAML Deployments/Services, NodePort access and explicit scaling/rollouts.
Docker Desktop's own Kubernetes feature is not needed. Cloud remains separate work. For the
optional in-cluster broker and dashboard, see [Kafka on Kubernetes](../kafka/k8s/README.md).

Shared editor: Darryl's Kubernetes task. Each service owner reviews their deployment; Jun Hui
reviews gateway/shared networking. Databases and credentials remain service-private.

Admin's incremental deployment, local images, private credentials/storage and verification are
documented in [Admin Minikube](../../admin-service/k8s/README.md). The shared scope includes User's
existing service-auth support, gateway routing and Admin Kafka/network permissions. Earlier
Compose runtime review does not constitute Kubernetes owner signoff.

## Cluster and images

Start Docker Desktop with Linux containers, then use Git Bash from the repository root:

```bash
minikube start -p foc-local --driver=docker
minikube -p foc-local kubectl -- --context=foc-local get nodes
minikube -p foc-local kubectl -- --context=foc-local apply -f deploy/k8s/namespace.yaml
```

Resume the existing profile without deleting it. The default `minikube` profile is a different
cluster; commands explicitly select `foc-local`.

All Deployments use versioned Docker Hub images under `arkanian4`, following section 2 of the
course guide. Publishing uploads application images, not running containers, database data or
Kubernetes Secrets. After [CI setup](../../.github/DEPLOYMENT.md), merged service changes are published
automatically. Maintainers can still build/push initial or manual releases with:

```bash
docker login
docker build -t arkanian4/foc-gateway-service:d3-2 gateway-service
docker push arkanian4/foc-gateway-service:d3-2
```

Repeat the build/push pattern for each service, using the tag in its Deployment. Teammates using
the published images do not need to build or push. Kubernetes downloads them on first use;
`IfNotPresent` reuses cached images. Use a new tag for changed builds, update the Deployment and
apply it again. Do not replace a published release tag. Public repositories allow teammates to
pull without credentials; private repositories additionally require an `imagePullSecret`.

| Component | Published image |
| --- | --- |
| User | `arkanian4/foc-user-service:sha-ce035eee7ff4eda6972fa4554714051b6314b209-r42501172138-1` |
| Gateway | `arkanian4/foc-gateway-service:sha-ce035eee7ff4eda6972fa4554714051b6314b209-r42501172138-1` |
| Supplier | `arkanian4/foc-supplier-service:d3-1` |
| Credit | `arkanian4/foc-credit-service:sha-ce035eee7ff4eda6972fa4554714051b6314b209-r42501172138-1` |
| Order | `arkanian4/foc-order-service:sha-4dd402ca4359b4612e084eda1822e117f784a50e-r42644545436-1` |
| Chat | `arkanian4/foc-chat-service:sha-ce035eee7ff4eda6972fa4554714051b6314b209-r42501172138-1` |
| Admin | `arkanian4/foc-admin-service:sha-ce035eee7ff4eda6972fa4554714051b6314b209-r42501172138-1` |

Runtime passwords/signing keys are created separately in each teammate's cluster. They are not
included in images or Git. Never add them to application resources or frontend build settings.

The six workflow images above were verified in successful CI run `42501172138`, attempt 1, for
committed revision `ce035eee7ff4eda6972fa4554714051b6314b209`. They replace the runtime-only local
Admin/Chat/Gateway builds during the explicitly approved foc-local reconciliation. Uncommitted
Admin client edits are not included in these published images. Current pins are in the deployment
files; a later successful CI run does not automatically select or deploy another version.

## Apply a CI-published service update

CI can build/publish merged service changes automatically; see
[CI setup and image naming](../../.github/DEPLOYMENT.md). One-time Docker Hub credentials must be
configured before publishing works. The `d3-*` images above remain initial releases; a new CI
image does not automatically replace them in these Deployment files or your running cluster.

Each time a teammate merges an update:

1. Open GitHub **Actions → CI → the run for that merge**. Wait for the complete run to succeed.
2. In its **Summary**, find **Published order-service** (or the affected service). Copy the complete
   **Image** value, including the generated `sha-...` tag. If no image was selected, there is
   nothing new to deploy for that service in that run.
3. Pull the latest `main` without overwriting local work. In the affected service's
   `k8s/deployment.yaml`, replace only the `image:` value with the copied value.
4. With Docker Desktop and `foc-local` running, apply and verify. For Order, from the repo root:

```bash
minikube start -p foc-local --driver=docker
minikube -p foc-local kubectl -- --context=foc-local apply -f order-service/k8s/deployment.yaml
minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status deployment/order-service --timeout=300s
pwsh -File deploy/k8s/Test-LocalDeployment.ps1 -Service order
```

Use `user-service`, `supplier-service`, `credit-service` or `gateway-service` for other Deployment
file folders. The gateway's Kubernetes Deployment name is `gateway`, not `gateway-service`.
The smoke helper accepts `gateway`, `supplier`, `credit`, or `order`; verify User through the
gateway helper and its own guide. Reopen any browser port-forward after its target pod is replaced.

Keep the selected image tag in version control through your team's normal reviewed commit/PR
process. Otherwise pulling/reapplying an older Deployment can undo your local update. You do not
need to build/push the image yourself, recreate Secrets, reapply database manifests or delete any
storage. This routine assumes the initial cluster setup below is already complete. Future new
dependencies (such as Kafka) need their own reviewed deployment/configuration, not just a new tag.

## Incremental deployment

Start with [User Service](../../user-service/k8s/README.md), including its local secrets.
Then deploy the gateway:

```bash
minikube -p foc-local kubectl -- --context=foc-local apply -f gateway-service/k8s
minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status deployment/gateway --timeout=300s
minikube -p foc-local service gateway -n foc-local
```

Keep the tunnel open on Windows. Gateway health does not mean all downstreams are deployed;
check their routes independently. Missing services can fail on their own routes while User pages
work. Use the gateway as the normal browser entry once available.

For a stable origin throughout a login session, run in a separate terminal:

```bash
minikube -p foc-local kubectl -- --context=foc-local -n foc-local port-forward service/gateway 8088:8088
```

Open `http://localhost:8088`. If Compose occupies that port, stop only its gateway or choose
another local port. All packaged frontends must use the same browser origin to share the session.
Port-forward attaches to one pod; reopen it after a rollout replaces that pod.

Continue one service at a time: [Supplier](../../supplier-service/k8s/README.md),
[Credit](../../credit-service/k8s/README.md), [Order](../../order-service/k8s/README.md),
[Chat](../../chat-service/k8s/README.md), then
[Notification](../../notification-service/k8s/README.md), whose guide also switches on Order's
lifecycle events once the topic exists.
Their guides create private credentials, wait for their databases, deploy and verify independently.
All four use cluster-internal Services rather than extra public NodePorts; the gateway is the
normal entry. User's NodePort remains available for the original manual exercise.

## Updates, scaling and future Order work

Use one application replica initially to fit a local laptop. This is a chosen starting count,
not an autoscaling rule. Practice the guide's scale/rollout commands on the stateless gateway:

```bash
minikube -p foc-local kubectl -- --context=foc-local -n foc-local scale deployment/gateway --replicas=2
minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status deployment/gateway --timeout=300s
minikube -p foc-local kubectl -- --context=foc-local -n foc-local get pods -l app=gateway
minikube -p foc-local kubectl -- --context=foc-local -n foc-local scale deployment/gateway --replicas=1
```

For a release, build/push a new image tag, update the service's Deployment YAML and apply it.
Use `rollout status`, `rollout history` and, for an application regression, `rollout undo`.
Reflect a rollback in the YAML too; otherwise the next apply reinstates the bad release.
Image rollback does not roll back database migrations: check compatibility before rollback.
Never scale a PostgreSQL StatefulSet to create database replicas without a replication design.

Order already has stable DNS, PostgreSQL storage, JWT settings and `/api/orders/**` gateway
forwarding. Future endpoints under that prefix need an Order image update, not new gateway
routes. A future separate frontend path needs a deliberate route. Kafka listener/publisher
adapters will require coordinated broker deployment and connection configuration; this cluster
does not pretend those integrations already exist. Credit uses no demo profile here.

Kafka and its read-only UI can be added without replacing application/database pods:

```powershell
pwsh -File deploy/kafka/k8s/Apply-LocalKafka.ps1
```

The [Kafka guide](../kafka/k8s/README.md) covers independent Kubernetes credentials, internal
listeners, retained broker storage, isolated verification and application-adapter prerequisites.
The Kafka helper does not upgrade application images or enable missing service integrations.

The smoke checks cover deployment, public routes, missing/invalid-token rejection and retained
migration records. They do not prove authenticated business flows or ledger/event integration.
User's default `MAIL_PROVIDER=noop` does not deliver verification codes: configure the documented
mail provider with local Secrets before testing new-account login; do not bypass verification.

## Recovery and data

For enforced pod-to-pod restrictions, see [NetworkPolicies](network/README.md). The normal
Kindnet cluster needs a policy enforcement provider; creating policy objects alone is not proof.
The optional helper validates a disposable allow/deny test before isolating application pods,
preserves existing storage/images, and documents rollback and administrative-access limitations.

Each PostgreSQL StatefulSet remains at one replica and uses its own retained claim from Minikube's
default StorageClass. Claim retention is not a backup: deleting a PVC/profile may remove data.
Compose volumes are independent.

Stop with `minikube stop -p foc-local`; do not delete the namespace/profile to stop workloads.
Keep signing/database secrets stable. Never commit key files or exported Secret YAML, and do not
change an initialized PostgreSQL password by merely replacing its Kubernetes Secret.

Startup/readiness use each application's existing `/actuator/health`. Applications can retry
after initial database/DNS startup failures. Avoid dependency-based liveness restart loops.
Use `get pods`, `describe pod` and `logs` in `foc-local` to diagnose failures.
