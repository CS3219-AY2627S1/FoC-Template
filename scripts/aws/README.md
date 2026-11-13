# CampusGo AWS demo

Account `807733922601`, profile `campusgo`, Region `ap-southeast-1`.

## Architecture

```text
Browser -> Nginx ECS service (public task IP, HTTP port 80)
            |-> Frontend ECS service
            |-> User ECS service ------> users database
            |-> Supplier ECS service --> suppliers database
            |-> Order ECS service -----> orders database
            |-> Credit ECS service ----> credit database

All four databases share RDS campusgo-db.
Backend messaging uses RabbitMQ on EC2 with persistent Docker volume storage.
```

Each of the six ECS services runs one task and has its own desired count. Backend
services can scale separately. Automatic scaling policies have not been enabled.
Cloud Map provides private DNS names that Nginx resolves dynamically. Frontend and
backend listener ports are restricted to the internal security group. Only the
Nginx entry point is public. There is no load balancer in this setup.

## Start, stop, and find the address

From the repository root in PowerShell:

```powershell
aws sso login --profile campusgo
./scripts/aws/power.ps1 -Action Status
./scripts/aws/power.ps1 -Action Stop
./scripts/aws/power.ps1 -Action Start
```

Status prints the current gateway task public IP. Use `http://<that-IP>`.
The address changes when the task is replaced; check it again after Start or a
gateway deployment. This is HTTP, so use demo accounts. The old CloudFront distribution and private origin have been deleted.
CloudFront is not part of this deployment.

Stop scales all six services to zero, waits, then stops EC2 and RDS. Storage
still incurs charges. RDS automatically restarts after seven days. If RDS is
backing up, rerun Stop once it is available. Never terminate the broker host
without preserving its RabbitMQ volume. Start can take several minutes.

## Original teammate code and AWS packaging

`api-gateway/`, the tracked `edge/` files, and `compose.yaml` are restored to the
repository HEAD versions. The team's routing configuration is not edited.
Local development retains the original edge -> API gateway path.

AWS image packaging is isolated in `scripts/aws/gateway/`. It copies the original
API router, substitutes Cloud Map names in the image, and binds its public API
listener to loopback port 8082. A separate included server listens on port 80,
forwards `/api/` to that original listener, and forwards other paths to the
frontend service. Both listeners run in ONE Nginx process in ONE ECS container.
The original private listener on 8080 is not exposed by the security group.
Private and unknown API routes still return 403.

Build from the repository root:

```powershell
docker build -f scripts/aws/gateway/Dockerfile -t 807733922601.dkr.ecr.ap-southeast-1.amazonaws.com/campusgo/api-gateway:separate-20261106 .
$env:AWS_PROFILE='campusgo'
docker push 807733922601.dkr.ecr.ap-southeast-1.amazonaws.com/campusgo/api-gateway:separate-20261106
```

Deploy a new task-definition revision with the resulting immutable image digest.
`deploy-services.ps1` only restarts the current six service revisions; it does not
build images, change credentials, or set up a new account.

The `campusgo-network-broker` stack owns Cloud Map, internal security groups and
the existing EC2 host. The local provisioning template now bootstraps only RabbitMQ. It is not reapplied
to the existing host because changing EC2 user data can interrupt the broker;
review infrastructure changes before applying them to persistent data. The public port-80
security group remains owned by `campusgo-single-task-network` (a historical stack
name); it now protects only the separate gateway task. The abandoned campusgo-app
service has been deleted; its old task definition is retained for history.

## Checks and demo data

`python scripts/aws/smoke-test.py http://<gateway-IP> --errand` checks registration,
login, refresh, the four API/database paths, private-route blocking, and an errand
through delivery and asynchronous credit settlement. It creates disposable demo
accounts and a completed test order; it prints no passwords or tokens.

The frontend uses a UUID v4 fallback based on `crypto.getRandomValues()` for HTTP
demo compatibility; HTTPS browsers continue to use native `crypto.randomUUID()`.
Type checking, the production build and fallback UUID validation passed.

The previously approved CSV import added 21 suppliers and 16 buildings.
`seed-demo.ps1` skips seeding if supplier records exist. Existing backend images,
databases and RabbitMQ data are retained.

See `ai/usage-log.md` for AI assistance disclosure. Human review remains pending.

Live revisions after this update: `campusgo-api-gateway:2` and
`campusgo-frontend:2`; the four backend revisions were retained. The full errand
smoke test passed at the gateway public IP. The frontend login screen and its
JavaScript/CSS assets loaded successfully after the frontend rollout.

## User-service trace header fix (deployed 9 November 2026)

The inspected running revision `campusgo-user:2` has no `OTEL_*` environment
settings. The application emits `X-Trace-Id` only when a valid active trace exists.
The proposed settings in `user-tracing.json` enable Deno tracing and W3C trace
propagation. The console exporter sends telemetry to stderr, which the existing
`awslogs` driver captures in CloudWatch; this increases log volume. It does not
configure a collector or a Tempo dashboard. `OTEL_DENO_CONSOLE=ignore` keeps
ordinary application console output from also being exported as OTEL log records.

Preview locally (no AWS calls):

```powershell
./scripts/aws/enable-user-tracing.ps1
```

After separate deployment approval:

```powershell
./scripts/aws/enable-user-tracing.ps1 -Deploy
```

The deployment script checks the reviewed source revision and completed rollout,
copies the existing task configuration, adds the six tracing settings, registers
a new revision, and updates only `user-service`. It preserves the application
image reference, existing environment settings, roles, resources and networking.
It prints the previous revision for rollback without printing the full task
definition. Revision `campusgo-user:3` was deployed with user approval; ECS reached
service stability. The live empty login POST returned HTTP 400 with a generated
`X-Trace-Id`, and the health endpoint returned HTTP 200 with the exact trace ID
sent in `traceparent`. No successful authenticated login was performed.
The default expected source revision deliberately remains `campusgo-user:2`;
review the current configuration before attempting another deployment.

After rollout, verify the health endpoint and an empty login POST through the
public gateway for `X-Trace-Id`, then check W3C `traceparent` propagation. An empty
login request should still return HTTP 400. Successful authenticated login is a
separate check. If needed, roll back using the printed previous task definition
with `aws ecs update-service`, after obtaining approval.

## Monitoring dashboards (10 November 2026)

Grafana, Prometheus, Tempo and the OpenTelemetry Collector now run in the separate
`monitoring-service` ECS service. All four backends export telemetry to it, and
RabbitMQ metrics are scraped through a private relay without restarting the broker.
Use `./scripts/aws/dashboards.ps1` to open both SSM tunnels, and
`./scripts/aws/dashboards.ps1 -Action Close` to close them. Grafana is available at
`http://localhost:3000`, RabbitMQ at `http://localhost:15672`.

See [monitoring setup and operations](monitoring/README.md) for one-time teammate
SSO/plugin setup, validation results, and rollback details. `power.ps1` includes
monitoring. Its metrics and trace history are ephemeral across task replacement
or shutdown; dashboards are provisioned from the image. CloudWatch logs are retained.
