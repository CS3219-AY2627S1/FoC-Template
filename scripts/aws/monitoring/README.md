# Monitoring deployment and dashboard access

Status: deployed and verified on 10 November 2026. CloudFormation stacks
`campusgo-monitoring-images` and `campusgo-monitoring` own the image repositories
and monitoring service. RabbitMQ was not restarted. A separate private metrics
relay publishes 15692 only for the monitoring security group; the dashboard
tunnel reaches RabbitMQ's container directly.

Local validation completed on 10 November 2026: all four image targets built and
started using a shared network namespace, matching ECS task networking.
Prometheus `promtool check config` passed; Grafana and Tempo health checks passed.
Both Grafana datasource checks returned OK. The original image had five provisioned dashboards;
the dashboard refresh adds Overview and updates all service dashboards.
A synthetic OTLP trace was retrieved from Tempo and a synthetic metric with value
42 was queried from Prometheus. Test containers were removed afterward.
Images remain locally tagged `campusgo-monitoring-{grafana,tempo,collector,prometheus}:review`.
Live verification passed: all four scrape targets are up (collector, Prometheus,
RabbitMQ, RabbitMQ queues); application metrics are present for all four backends;
the public login response's trace ID was retrieved from Tempo. Both localhost
dashboard tunnels returned HTTP 200. The Session Manager plugin is installed
on this computer (version 1.2.896.0). Sustained-load/resource sizing has not been tested.

Completed backend task revisions: user 4, supplier 6, order 3, credit 3.
`application-rollout.json` records their previous revisions for rollback.

## Deployment

`stack.json` creates one `monitoring-service` Fargate service with four containers:
Grafana, Prometheus, Tempo, and OpenTelemetry Collector (1 vCPU, 2 GiB total).
Images bake in this repository's provisioned dashboards and datasource UIDs.
They share task networking: collector receives OTLP on 4318, while Tempo receives
collector exports on 4319 to avoid a port collision.

The security group admits Grafana port 3000 only from the broker security group
and OTLP 4318 only from the application security group. Public IP assignment is
for outbound image pulls in the existing subnets; no public ingress is allowed.
Grafana allows anonymous Viewer access behind the SSM tunnel and authenticated
administration through the Sign in link. The username is `admin`; CloudFormation
generates its password in Secrets Manager and outputs `GrafanaAdminSecretArn`.
Open that secret in the AWS console and choose **Retrieve secret value**. ECS injects
only the password key at startup using a dedicated monitoring execution role.
The retained secret and its encryption key survive task replacement. Do not put
passwords in task environment values, source files, command output, or chat.

The admin password is a bootstrap credential: changing it only inside Grafana is
not durable because Grafana storage is ephemeral. To rotate it, update the secret
and replace the monitoring task together. Automatic password rotation is not configured.
Provisioned dashboard files remain source-controlled; publish a rebuilt Grafana
image to update them. Anyone allowed to tunnel through the broker can view
dashboards. RabbitMQ keeps its existing login and permissions. Its bootstrap
username is `campusgo`; its password is the SecureString parameter
`/campusgo/rabbitmq/password` in Systems Manager Parameter Store, Singapore region.

This is a demo deployment with **ephemeral monitoring storage**. Replacing or
stopping the monitoring task loses metrics, traces, and Grafana UI state. The
dashboards themselves are rebuilt from source. Retention is capped at seven days
for metrics and 48 hours for traces within a task lifetime. Prometheus storage is
also capped at 5 GB. Durable storage requires a separate design; do not put
Prometheus's local TSDB on EFS/NFS.

`broker-metrics-relay.sh` is a separately approved host change. It creates an
Nginx relay bound to the broker's private address on 15692. The template admits
that port only from the monitoring security group. This does not restart RabbitMQ.
If RabbitMQ is recreated with a different container IP, recreate the relay after
inspection. The dashboard access script resolves RabbitMQ's IP each invocation.

## One-time teammate setup (Windows)

1. Install [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).
2. Configure the `campusgo` profile using the team's IAM Identity Center start URL,
   SSO region, assigned account and role:
   `aws configure sso --profile campusgo`. Use `ap-southeast-1` as the workload
   region. See [AWS SSO setup](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html).
3. Install the [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html),
   then reopen PowerShell. Verify `session-manager-plugin --version`.
4. Sign in using `aws sso login --profile campusgo` and verify with
   `aws sts get-caller-identity --profile campusgo`.

Each teammate needs an assigned SSO role; a local profile does not grant access.
That role needs scoped CloudFormation stack reads, ECS list/describe operations,
SSM StartSession/ResumeSession/TerminateSession, and SendCommand/GetCommandInvocation
for the RabbitMQ address lookup on the broker host and `AWS-RunShellScript` document.
The tunnel uses `AWS-StartPortForwardingSessionToRemoteHost`. No SSH keys or inbound
SSH rules are needed. SSO login must be repeated when the session expires.

## Open both dashboards

From the repository root:

```powershell
./scripts/aws/dashboards.ps1
# Grafana: http://localhost:3000
# RabbitMQ: http://localhost:15672

./scripts/aws/dashboards.ps1 -Action Close
```

The helper runs both tunnels in hidden background processes and keeps their
session IDs in temporary output files for targeted cleanup. If a tunnel fails,
close saved sessions before retrying. RabbitMQ uses the existing broker login;
Grafana provides anonymous viewing and admin sign-in through the SSO-protected tunnel.

`Close` stops and waits for this script's local tunnel process trees as well as
terminating their AWS sessions. It can recover leftover dashboard shell processes
even if the saved state file was removed. Other applications using the same ports
are not stopped. An immediate Open/Close/Open cycle was verified with HTTP 200
responses from both dashboards.

Alternatively, run these in **two PowerShell terminals** and leave both open.
Ctrl+C closes each foreground tunnel. The script never installs software or signs
in automatically, and fails clearly if a prerequisite or local port is unavailable.

```powershell
# Terminal 1
./scripts/aws/dashboard-access.ps1 -Dashboard RabbitMQ
# Open http://localhost:15672

# Terminal 2 (after the monitoring service is deployed)
./scripts/aws/dashboard-access.ps1 -Dashboard Grafana
# Open http://localhost:3000
```

Use `-LocalPort 13000` if the default conflicts with local development. Restart
the tunnel after an ECS task or RabbitMQ container is replaced. Use `-Check` to
check local prerequisites and AWS identity without opening a session.

The Windows access script selects the plugin's built-in TCP-loopback fallback for
its internal multiplexing socket. On this machine the normal AF_UNIX initialization
stalled after the SSM handshake; the TCP fallback was verified end to end. Only
the child process's temporary-directory environment is changed and then restored.

## Redeployment sequence

1. Validate the template and build the four Dockerfile targets from the repository
   root. Start Docker Desktop before building. Example:
   `docker build -f scripts/aws/monitoring/Dockerfile --target grafana -t campusgo-monitoring-grafana:review .`.
   Repeat for `tempo`, `collector`, and `prometheus`. Verify the upstream image
   tags are available and run their config validation before publishing.
2. Publish the reviewed images to ECR and supply immutable image digests for the
   four image parameters in `stack.json`. Create the monitoring CloudFormation
   stack with parameters discovered from `campusgo-network-broker` and the active
   user-service task's execution role. Do not reapply the broker's existing stack.
3. Separately approve/run the metrics relay script through SSM with the inspected
   `BROKER_PRIVATE_IP`. The inspected address was `10.0.17.76`; rediscover it before
   applying. The existing RabbitMQ volume and container must remain intact.
4. After monitoring readiness checks, apply `application-telemetry.json` to new
   revisions of user, supplier, order and credit tasks, also setting each task's
   `OTEL_SERVICE_NAME` to its service name. Preserve existing task settings and
   record each previous revision for rollback. This switches user-service from
   console export to the collector and enables export on the other services.
5. `power.ps1` now includes `monitoring-service` in daily start/stop operations.
   Monitoring shutdown loses the task-local history described above.
6. Verify Grafana `/api/health`, both datasource health checks, Prometheus scrape
   targets including RabbitMQ, and a trace generated through the public login
   endpoint appearing in Tempo. Verify both tunnels locally. A running ECS task
   alone does not establish that metrics and traces are working.

Rollback: restore the recorded application revisions, stop the monitoring ECS
service, and remove only `campusgo-metrics-relay` if that addition was approved.
Deleting the monitoring stack removes its ingress rules and discovery entry;
CloudWatch logs are retained. Do not remove or recreate RabbitMQ.

## Dashboard and login refresh

The Grafana image tag is `20261110-dashboard-fix`; the other three images retain
`20261110`. `deploy.ps1` accepts `-GrafanaImageTag` independently of `-ImageTag`
and resolves tags to immutable digests. The template owns the admin secret, its
KMS key, and the dedicated execution role. Deployment requires `CAPABILITY_IAM`.
The prior application execution-role parameter remains for caller compatibility
but no longer grants monitoring access to application secrets.

After a rollout, restart existing dashboard tunnels because they target the old
task IP, then refresh Grafana and sign in for administration, connections and Explore:

```powershell
./scripts/aws/dashboards.ps1 -Action Close
./scripts/aws/dashboards.ps1
```

Verified after the refresh on 10 November 2026: real password login succeeded and
`/api/user` confirmed Grafana administrator access; all six current dashboard titles
were returned by `/api/search`; Prometheus and Tempo datasource health checks passed;
all four Prometheus scrape targets reported `up=1`. The password was resolved by
AWS's `asm-exec` at runtime and never printed. CloudFormation template validation
passed; cfn-lint 1.41.0 reported only W2001 for the intentionally retained compatibility
parameter. cfn-guard compliance checks were not run.

Expired SSO: run `aws sso login --profile campusgo` before Open. Close always
releases the local active-state lock after stopping local tunnels. Unconfirmed
remote sessions are retained in `campusgo-dashboard-pending-cleanup.json` under
the temporary directory and retried by the next Close or Open after sign-in.
Queued remote cleanup does not prevent new local tunnels.

Application telemetry uses `OTEL_METRIC_EXPORT_INTERVAL=1000` (milliseconds).
The dashboard freshness threshold is 45 seconds; collector batching and Prometheus
scraping add latency beyond the export interval. Existing tasks need replacement
to pick up interval changes; rebuilding images is unnecessary for this setting.
