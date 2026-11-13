<!--
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-6.1 Terra), date: 2026-11-06
Scope: Generated implementation of local AWS emulation, Kubernetes, and troubleshooting documentation
Author review: Verified instructions are correct and differences between Floci emulation and AWS are clearly documented.
-->

# Local deployment and development

Choose one of the three paths below. Both deployment paths use Floci for
simulated AWS services; the Compose path runs application containers directly,
while the EKS path runs them in a local Kubernetes cluster.

## Prerequisites

- Run commands from the repository root with Docker and Docker Compose available.
- Use Node.js 24 and install workspace dependencies with `npm ci`.
- Review `.env.development`, which supplies the shared local Floci settings.
- For simulated EKS, install `kubectl` and make ports 443 and 4567 available.
- On Windows, use Linux Node/npm inside WSL (`source ~/.nvm/nvm.sh` if needed).

## 1. Simulated EKS deployment using Floci

```bash
npm run up:eks
```

Open the HTTPS CloudFront URL printed at the end of startup
(`https://<id>.cloudfront.localhost.floci.io`). The Floci API is at
https://localhost:4567. Import `floci/eks/.floci-ca.pem` into your browser or OS
trusted root store on the first run, then restart the browser. A one-page
certificate exception does not cover all application requests.

**What the script does:** `floci/eks/up.sh` starts the separate EKS Floci
container, whose initialization hook provisions Cognito, S3, Secrets Manager
credentials, four RDS databases, MSK, and a k3s-backed EKS cluster. The launcher
writes `floci/eks/.kubeconfig`, builds application images and pushes them to
Floci ECR, configures CoreDNS for Kafka, and creates Kubernetes runtime secrets
and service accounts. It initializes Kafka topics and database schemas,
deploys the host, four frontend remotes, APIs, notification service, and event
publishers, injects local AWS role/token settings, and installs KEDA and HPAs.
It also configures CloudFront, API Gateway, and an internal ALB, applies ingress,
and waits for rollouts and the public health check.

```bash
# Inspect pods
kubectl --kubeconfig floci/eks/.kubeconfig -n relay get pods

# Stop and remove the cluster, application, views, and database data
npm run down:eks
```

### EKS rebuild and retry options

```bash
# Reuse existing application images
SKIP_IMAGE_BUILD=1 SKIP_IMAGE_PUSH=1 npm run up:eks

# Retry deployment against an already healthy emulator with unchanged images
REUSE_FLOCI=1 SKIP_IMAGE_BUILD=1 SKIP_IMAGE_PUSH=1 npm run up:eks

# Rebuild the emulator and all application images without the build cache
npm run up:eks -- --no-cache
```

`--no-cache` always rebuilds and pushes application images, even when the skip
flags are set, and cannot be combined with `REUSE_FLOCI=1`.

## 2. Docker Compose deployment

```bash
npm run up:compose
```

Open http://localhost:8080. The Floci API is at http://localhost:4566.
Kubernetes and the EKS certificate setup are not required.

**What the script does:** `floci/docker/up.sh` starts the Compose Floci
container. Its initialization hook provisions Cognito, S3, Secrets Manager
credentials, four RDS databases, and MSK. The launcher discovers the pool/client
IDs, bucket name, database credentials, and Kafka endpoints, then writes the
ignored `floci/docker/.generated.env` file. It loads those settings alongside
`.env.development` and an optional `.env`, builds the Kafka initializer, and
starts the complete Compose application with its schema initialization and
event publishers. Finally, it recreates the host to refresh its proxy routing.
Use this launcher after recreating Floci; plain `docker compose up` cannot
discover the generated settings. Database containers are managed by Floci,
not declared as Compose database services.

```bash
# Force an uncached rebuild of Floci and application images
npm run up:compose -- --no-cache

# Stop and remove the application, views, infrastructure, and database data
npm run down:compose
```

## 3. Source development with npm run dev

Use this path when editing application code locally. It starts its own Compose
dependencies, so neither full deployment command is a prerequisite. Stop the
full Compose application before switching because it shares ports with source
processes. `npm run down:compose` performs that cleanup and deletes its database
data. EKS is separate, but running both environments uses additional Docker
memory.

```bash
npm run dev
```

Open http://localhost:8080. The host proxies the four frontend remotes and APIs
through the same browser origin.

| Script | What it starts or configures |
| --- | --- |
| `npm run dev` | Runs `dev-infra`, then runs `dev-fe` and `dev-be` together; stops the source process group if one fails. |
| `npm run dev-infra` | Uses the Compose launcher to start Floci, Kafka topic initialization, and the containerized Auth API on port 3004. Generates `.generated.env`, waits for topic initialization, and runs the supplier schema job. |
| `npm run dev-fe` | Starts Vite for the host on port 8080 and the supplier/user/errand/credit remotes on ports 5001–5004. |
| `npm run dev-be` | Loads `.generated.env`, selects host-accessible database/Kafka endpoints, and sets local Cognito, S3, AWS, internal-service, and event-topic settings. Prepares user/errand/credit schemas and starts the supplier/user/errand/credit APIs on ports 3000–3003, estimation on 3005, notifications on 3010, and both event publishers. |

Credit estimation needs AI provider settings and Redis. `dev-infra` starts only
its listed dependencies, not the Compose Redis service. Start a reachable Redis
instance and export its host URL (for example `REDIS_URL=redis://localhost:6379`)
and provider settings before `npm run dev`. See the
[estimation guide](../credit-estimation-service/README.md#run-and-verify).

Press Ctrl+C to stop source processes. Compose infrastructure remains running;
remove it and its database data when finished:

```bash
npm run down:compose
```

## Optional inspection views

Start views after the target environment is running. Replace `user` with
`kafka`, `errand`, or `credit`; EKS also supports `headlamp`. Use `all` to start
every view, though starting only what you need saves memory.

| Environment | Start | Stop | Kafka UI | User Studio | Errand Studio | Credit Studio | Headlamp |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Compose | `npm run views:compose -- user` | `npm run views:compose:stop -- user` | http://localhost:8081 | http://localhost:5555 | http://localhost:5556 | http://localhost:5557 | — |
| Floci EKS | `npm run views:eks -- user` | `npm run views:eks:stop -- user` | http://localhost:9081 | http://localhost:6555 | http://localhost:6556 | http://localhost:6557 | http://localhost:9082 |

`npm run views:eks -- headlamp` installs Headlamp, forwards it to localhost,
and prints an eight-hour cluster-admin login token for the local cluster.
Paste it into Headlamp to inspect pods and logs. Rerun the command for a new
token; stop the view with `npm run views:eks:stop -- headlamp`.
Compose views use the `ui` profile in `compose.override.yaml`; EKS views use
optional pods in `k8s/floci/views/`. The supplier service has no Prisma Studio.

## Cleanup and EKS certificates

Both teardown commands remove their optional views, Floci-managed database
containers, and database volumes. EKS teardown also removes k3s, port forwards,
and the generated kubeconfig. Removing or recreating Floci can reset RDS data.

EKS teardown retains the `relay-floci-eks-ca` volume and public certificate copy
at `floci/eks/.floci-ca.pem`. The volume stores only Floci's CA and server
certificate, so trusting the CA once covers subsequent startups, including the
CloudFront URL and https://localhost:4567. Keep the volume and its private key
local. To rotate the CA intentionally:

```bash
npm run down:eks
docker volume rm relay-floci-eks-ca
npm run up:eks
```

Import the new `.floci-ca.pem` into the trusted root store after rotation.

## Infrastructure details and AWS differences

`infra/relay-auth.yaml` and `infra/relay-storage.yaml` are shared with AWS.
Both local modes deploy `infra/relay-floci-db.yaml` for the VPC, subnets,
secrets, and four RDS instances. Only local EKS additionally deploys
`infra/relay-floci-eks.yaml`, which creates the EKS cluster and role using
the database stack's VPC and subnet outputs. The Compose Floci image does not
include the EKS template. The RDS definitions match `infra/relay-eks.yaml`
for instance class, storage, backup retention, and database names. The local
network and security group rules differ from AWS.
Local EKS also deploys the same `infra/relay-aws-access.yaml` used by AWS. Its two service-account roles for S3 and Cognito are emulated. Floci CloudFormation currently
stubs `AWS::IAM::OIDCProvider`, so the local init script creates that one
resource with the supported IAM API and passes its ARN to the shared template. The Floci script
passes the local cluster issuer, bucket, and pool IDs as parameters.
AWS can reuse a manually created OIDC provider; Floci creates one in its
local stack. Workload pods have no static AWS access keys. Floci does not inject OIDC role
settings from service-account annotations, so `floci/eks/inject-aws-access.sh`
patches the projected STS-audience token and AWS role environment variables
into local S3 and Cognito Deployments. AWS EKS injects those automatically.
Floci uses a local STS endpoint override for the token exchange.

Floci's CloudFormation emulator currently ignores the DB instance's gp3 storage,
seven-day backup retention, and security group properties. The initialization
script applies those values through the Floci RDS API after the stack deploys
and verifies the reported configuration. Floci still uses local PostgreSQL
containers; it does not provide AWS gp3 volumes or RDS backups.

## Floci EKS and AWS event infrastructure

| Area | Local Floci EKS | AWS deployment |
| --- | --- | --- |
| Broker provisioning | Floci's MSK API records a Provisioned cluster with three broker nodes and a KMS-backed SCRAM secret association, but launches one Redpanda sidecar. | `infra/relay-eks.yaml` creates three `kafka.t3.small` brokers in separate private subnets. |
| Client connection | Floci advertises a plaintext Kafka endpoint, so the local override sets `KAFKA_AUTH_MODE=none` and adds its hostname to CoreDNS. | The deploy script discovers the SASL/SCRAM bootstrap endpoint on port 9096. Clients authenticate with a Secrets Manager credential over TLS. |
| Replication | Floci's one broker can host only one copy. The local override creates topics with replication factor 1 and minimum in-sync replicas 1. | Each topic has replication factor 3 and minimum in-sync replicas 2. Outbox publishers request `acks=-1`; one broker may be unavailable while two in-sync replicas continue acknowledging writes. |
| AWS access | The local OIDC token injection remains for S3 and Cognito emulation. | User API and Auth API retain service account roles for S3 and Cognito. Kafka clients use SCRAM, not IAM. |
| Teardown | `npm run down:eks` removes the local cluster and Floci sidecars. | `deploy/scripts/pause-aws.sh` deletes EKS and MSK directly; RDS snapshots and separate Cognito and S3 stacks remain. |

Local tests verify topic creation and application event flow. Floci does not
verify TLS, SCRAM enforcement, three-broker storage, the two-replica acknowledgement minimum,
or broker failure behavior. Verify those against AWS MSK Provisioned before
relying on the replication guarantee.

Inspect the local cluster with
`kubectl --kubeconfig floci/eks/.kubeconfig -n relay get pods`.

The local EKS workload set includes credit estimation and an errand notification
Deployment that starts with one pod and can autoscale to four. The notification
service uses a separate Kafka consumer group per pod so
SSE subscribers on either pod receive events. For manual validation, open two
browser sessions, create an errand status change, and replace a notification
pod to check reconnection. Local Floci still does not validate MSK SCRAM/TLS.

### Local API Gateway differences

Local EKS routes `/api/auth`, `/api/user`, `/api/supplier`, `/api/errands`,
`/api/credit`, and `/api/notifications/stream` directly through Traefik to their
backend Services, mirroring production's ALB ingress. Host Nginx is not in this
API path. Compose still uses host Nginx, and `npm run dev` uses Vite's proxy;
both retain the same browser URLs and require no changes to Floci dependencies.

The EKS startup script creates a Floci REST API, REST VPC Link metadata and a
proxy integration between local CloudFront and the emulated ALB. Floci does not
create real VPC Link network interfaces or enforce AWS security groups. Its
CloudFront-to-gateway connection is local HTTP; the browser-to-CloudFront
connection still uses the Floci CA. API Gateway REST response streaming is
currently buffered in Floci. To preserve local notifications, the startup
script adds a local-only CloudFront behavior that sends the notification stream
directly to the emulated ALB. AWS sends that path through the streaming REST API.

Run `npm run up:eks`, trust the local CA as described above, and use the URL
printed by the script. Check the four remote frontends, login and refresh
cookies, supplier and errand operations, credits and profile images. Open two
browser sessions to check errand notifications, then replace the notification
pod and check that the stream reconnects. Run `npm run views:eks -- all` to
inspect pods in Headlamp. Floci EKS cannot validate the AWS VPC Link network,
API Gateway streaming limits, public TLS, IAM, security groups or ALB rewrites.

The EKS CI smoke tests use HTTP/2 because Floci's CloudFront-to-API-Gateway
proxy currently returns HTTP 502 for HTTP/1.1 requests. This local emulator
limitation does not validate the AWS endpoint's HTTP/1.1 behavior.

### Autoscaling

Both local EKS and AWS install KEDA 2.17.3 when the EKS startup/deployment
script runs. The credit API uses CPU, memory, and lag for the
`relay-credit-events` consumer group on `errand-events`. AWS connects to
MSK using SCRAM-SHA-512 and TLS with the existing runtime secret. Floci's
broker uses plaintext and no credentials; local testing cannot validate AWS
SCRAM, certificate validation, or MSK networking.

After startup, inspect `kubectl -n keda get pods`,
`kubectl -n relay get hpa,scaledobject`, and
`kubectl -n relay describe scaledobject credit-api`. Confirm the Kafka
trigger is ready and the external metrics API is available with
`kubectl get apiservice v1beta1.external.metrics.k8s.io`. Generate a
backlog on the errand topic and verify credit-api scales up and later down.
In Floci, the host and four remote frontends stay at one replica, with frontend
HPA minimum and maximum replicas both set to 1. Both outbox publishers remain at one.

CPU and memory utilization are percentages of Kubernetes **requests**, not
limits. AWS Node workloads request 512 MiB, so the 85% memory target is
approximately 435 MiB. Local EKS lowers those requests to 128 MiB so its single
emulated node can schedule the application and KEDA; its 85% target is
approximately 109 MiB. Local KEDA components request 64 MiB each. Both
environments retain the 768 MiB limit and 614 MiB Node old-space heap cap. The heap cap is not a limit on total process memory.
Local scaling therefore does not reproduce AWS memory thresholds exactly.
The API policies use CPU 65% and memory 85%, with 1-4 replicas (estimation 1-3).
They do not override HPA scale-up/down behavior; default downscale stabilization
is five minutes. Credit also uses a Kafka lag target of 100 messages per replica.
Additional AWS EKS nodes may increase costs.


### Credit estimation and Redis

Local EKS reads optional AI provider values and tuning settings from
`deploy/relay.aws.env`. Its CloudFormation stack creates the same four-field
Secrets Manager JSON secret as AWS. The launcher populates an uninitialized
secret from the file, reads the secret into Kubernetes, and warns instead of
failing if provider settings are missing. Floci secret state is local to the
emulator and does not validate AWS IAM, encryption, or persistence.

The upstream Redis image is pulled and mirrored through Floci ECR. It uses an ephemeral pod volume,
AOF enabled, and RDB snapshots disabled as in AWS. To fit the local node its
pod requests and limit are 128 MiB and its maxmemory is 90 MB, rather than
AWS's 512 MiB and 360 MB. Replacing the pod loses limiter history. The
estimation pod's readiness checks Redis even when AI credentials are absent.
