# AWS deployment

FoC runs in `ap-southeast-1` on one ECS EC2 host and a single-AZ PostgreSQL
instance. The gateway serves the frontend, terminates HTTPS, and proxies to five
backend services. SNS/SQS carries application events; private S3 buckets store
user, supplier, and order images.

The host is fixed at one instance. Host replacement causes downtime. Stopping
application services leaves EC2 and RDS running and incurring costs.

Local development uses [Compose](../../compose.yaml) and does not need Terraform.

## Configuration

Use the Terraform version in [`.terraform-version`](../../.terraform-version) and
the committed AWS provider lock file.

| File | Purpose |
| --- | --- |
| [terraform.tfvars](environments/prod/terraform.tfvars) | Production domain, email addresses, AMI, instance sizes, and bucket names. |
| [variables.tf](environments/prod/variables.tf) | Input descriptions and defaults. |
| [locals.tf](environments/prod/locals.tf) | Event routes and the derived publisher and consumer lists. |
| [service-config.tf](environments/prod/service-config.tf) | Service ports, resources, environment variables, secret bindings, and volumes. |
| [backend.tf](environments/prod/backend.tf) | S3 state key, region, and locking. |

`core_ami_id` pins an ECS-optimized AL2023 x86_64 image in the deployment region.
Check AWS's recommended image monthly and update it through a reviewed
infrastructure change. Keep the previous AMI ID for rollback.

`start_services` sets task counts **only when services are created**. After that,
use **Start or stop services**; Terraform and deployment preserve the live counts.
Keep realtime at one task: its shared SQS queue does not broadcast events to
multiple Socket.IO instances.

ECS Service Connect routes internal requests by service name and container port
(for example, `supplier:8081`). The gateway is a client; each backend exposes one
TCP endpoint. Every task reserves 64 MiB for its proxy. Proxy logs use the
`service-connect/` stream prefix in the service's CloudWatch log group.
JWT verification keys are still fetched through the public HTTPS gateway.

## First deployment

### 1. Configure AWS and GitHub

Create an S3 state bucket once, using a globally unique name:

```sh
state_bucket="YOUR-TERRAFORM-STATE-BUCKET"
aws s3api create-bucket --bucket "$state_bucket" --region ap-southeast-1 \
  --create-bucket-configuration LocationConstraint=ap-southeast-1
aws s3api put-bucket-versioning --bucket "$state_bucket" --region ap-southeast-1 \
  --versioning-configuration Status=Enabled
```

Create the GitHub OIDC provider and deployment role outside this stack. Set these
GitHub Actions repository variables:

| Variable | Value |
| --- | --- |
| `TF_STATE_BUCKET` | State bucket name. |
| `AWS_INFRASTRUCTURE_ROLE` | Deployment role ARN. |
| `VITE_CARTO_API_KEY` | Browser CARTO key, embedded in the frontend at build time. |

Configure required reviewers and a `main` deployment restriction on the
`production` environment. Add required reviewers to `terraform-approval`, which
approves the saved infrastructure plan. Require passing PR checks on `main`.

The deployment role's trust must allow audience `sts.amazonaws.com` and both
repository OIDC subjects:

```text
repo:AY2627S1-CS3219-P24@327339601/FoC@1365752578:ref:refs/heads/main
repo:AY2627S1-CS3219-P24@327339601/FoC@1365752578:environment:production
```

Verify those subjects if the repository or organization changes its OIDC settings.
The role needs access to Terraform's resources and state, plus `iam:PassRole` for
ECS execution and task roles. Admin initialization and supplier seeding also use
ECS task registration, launch, and status APIs.

### 2. Set production values and secrets

Edit `terraform.tfvars`: set the domain, email addresses, globally unique image
bucket names, and AMI ID. Use `start_services = false` for the initial creation.

Create these SSM **SecureString** parameters, prefixed with `<name_prefix>-`.
Terraform derives the required list from service bindings; the infrastructure
workflow checks it against SSM before approval:

| Suffix | Value |
| --- | --- |
| `jwt-private-key`, `jwt-public-key` | Application signing key pair. |
| `mail-username`, `mail-password` | SMTP credentials. |
| `initial-admin-email`, `initial-admin-password` | Initial administrator credentials; email must use `u.nus.edu` or `nus.edu.sg`. |
| `openai-api-key` | OpenAI API key for order-service AI features. |
| `grafana-otlp-url`, `grafana-otlp-traces-url`, `grafana-otlp-authorization` | Grafana OTLP endpoints and authorization header; see [Monitoring](#monitoring). |

**Set up databases** creates the service database-password parameters. Do not
create or rotate those manually as part of initial setup.

### 3. Run setup workflows

Run these GitHub Actions workflows from `main`, in order:

1. **Update infrastructure**: review and approve the saved plan, then apply it.
2. **Set up databases**: create service databases and credentials.
3. **Deploy Production**, selecting `all`: publish images and stage task
   definitions while the services remain stopped.
4. **Initialize Admin**: create the administrator and publish the user-created
   event so credit-service can open its account when started.
5. Point the public domain at `deployment.elastic_ip` from Terraform's outputs.
6. **Start or stop services**, selecting `start`: start all six services.
7. **Seed Suppliers**: load the catalog from the Supplier Service image.
8. Check HTTPS and application behavior as described below.

Both setup task definitions derive their settings from the owning service and
use its selected release image. They run once without service restart policies.
Admin initialization preserves an existing admin's password and fails if the
configured email belongs to a non-admin. Supplier seeding skips existing supplier
IDs. Both tasks use the staged service image and run Flyway migrations.

With AWS credentials and an initialized Terraform backend, the same setup tasks
can be launched from the repository root:

```sh
bash .github/scripts/run-setup-task.sh admin-init
bash .github/scripts/run-setup-task.sh supplier-seed
```

## Deploying changes

| Change | Action |
| --- | --- |
| Application release | Run **Deploy Production** from `main`; select one service or `all`. |
| Frontend or nginx release | Select `gateway` in **Deploy Production**. |
| Terraform change | Run **Update infrastructure** and review its saved plan before approval. |
| Task memory, environment, or secret binding | Apply infrastructure, then deploy the affected services. |
| Start or stop the app | Run **Start or stop services** with `start` or `stop`. |

Terraform creates task definitions but application deployment selects the active
revisions. An apply or restart alone does not activate new task settings.

Releases use immutable commit-SHA image tags. Rerunning a failed workflow retries
that commit and reuses its images; a new workflow run deploys the latest `main`.
Stopped services stay stopped, with the release staged for their next start.
Workflows share a production lock to prevent overlapping changes. The infrastructure
workflow also refuses to remove a queue that contains visible, in-flight or delayed
messages; inspect the queue rather than purging it to bypass the check.

CARTO configuration is compiled into the frontend. After changing
`VITE_CARTO_API_KEY`, create a new commit and deploy the gateway. An existing image
or runtime environment variable cannot update the compiled key. The key is visible
to browsers, so use a browser-appropriate CARTO key.

For local infrastructure work, copy
[backend.hcl.example](environments/prod/backend.hcl.example) to `backend.hcl`, set
the bucket name, and authenticate with AWS:

```sh
terraform -chdir=infra/terraform/environments/prod init -backend-config=backend.hcl
terraform -chdir=infra/terraform/environments/prod plan -out=tfplan
terraform -chdir=infra/terraform/environments/prod show tfplan
# Apply after reviewing the saved plan:
terraform -chdir=infra/terraform/environments/prod apply tfplan
```

### Release checks

Check the public keys without bypassing certificate verification:

```sh
curl --fail --silent --show-error https://YOUR-DOMAIN/api/.well-known/jwks.json
```

Then verify login, AI chat, errand creation, credit reservation, realtime updates,
and map tiles. Inspect ECS service events for failed starts or memory-related
restarts. ECS deployment stability alone does not confirm HTTPS or authentication
readiness.

### Rollback

ECS's circuit breaker attempts to restore the previous completed deployment when
a rollout fails. Services roll back independently, so inspect each affected
service after a partial failure.

Normally, revert the change on `main` and deploy again. For an emergency rollback,
wait for production workflows to finish, then use the exact task-definition ARN
from a known working release summary. Keep its ECR image available:

```sh
cluster=foc-prod
service=user
previous_task_definition='KNOWN-WORKING-TASK-DEFINITION-ARN'
aws ecs update-service --region ap-southeast-1 \
  --cluster "$cluster" --service "$service" \
  --task-definition "$previous_task_definition"
aws ecs wait services-stable --region ap-southeast-1 \
  --cluster "$cluster" --services "$service"
aws ecs describe-services --region ap-southeast-1 \
  --cluster "$cluster" --services "$service" \
  --query 'services[].{taskDefinition:taskDefinition,deployments:deployments}'
```

Confirm the intended revision is primary with rollout state `COMPLETED`, then
check the application. Fix or revert `main` before the next deployment.
For host changes, revert the configuration and review a new Terraform plan;
restoring the host configuration can cause another outage.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Task fails to start or deployment rolls back | ECS service events and the service's CloudWatch logs. |
| New task settings have no effect | Deploy the service after applying Terraform. |
| HTTPS or JWT verification fails | Public DNS, the JWKS endpoint, and `renew-certificate.service`. |
| Grafana receives no metrics | Exporter logs, the OTLP `/v1/metrics` URL, and a `Basic` authorization header. After changing SSM values, redeploy the Spring services. |
| Host does not register with ECS | `/var/log/host-bootstrap.log`, `/var/log/cloud-init-output.log`, and the systemd units below. |
| Admin or supplier setup fails | `/ecs/<name_prefix>/database-bootstrap`; the launcher prints the task ARN and log stream. |

Use SSM to inspect the host:

```sh
systemctl status docker metadata-firewall host-prepare ecs
systemctl status renew-certificate.service renew-certificate.timer
journalctl -u renew-certificate.service
```

The gateway initially serves a temporary certificate. The host requests a trusted
certificate after boot, checks twice daily, and retries failures every five minutes.
Successful issuance or renewal copies the certificate, reloads nginx, and saves
an archive to S3. A replacement host restores that archive during preparation.

## Monitoring


Application logs are retained for seven days under `/ecs/<name_prefix>/<service>`.
The four Spring services send metrics to Grafana Cloud once a minute. Container
Insights is disabled.

To configure Grafana metrics, create a Grafana Cloud access-policy token with
`metrics:write`. Set these SSM parameters:

- `grafana-otlp-url`: the stack's OpenTelemetry endpoint ending in `/v1/metrics`.
- `grafana-otlp-traces-url`: the same OTLP gateway ending in `/v1/traces`.
- `grafana-otlp-authorization`: `Basic ` followed by the base64 encoding of
  `<instance id>:<token>`, with no trailing newline. The token needs `metrics:write` and
  `traces:write`.

The four Spring services export HTTP traces directly to Grafana Cloud. Production
samples every request for this low-traffic deployment. Lower
`MANAGEMENT_TRACING_SAMPLING_PROBABILITY` in `service-config.tf` if traffic grows.
Order uses Spring-configured HTTP clients so calls to supplier, user and credit
share the incoming trace. This does not instrument the Node realtime service,
OpenAI SDK calls or SNS/SQS message processing. Setup tasks disable tracing.
After applying infrastructure and deploying the four services, make an API
request and use Grafana **Explore → Tempo** to search by service name.

For ECS, EC2, and RDS metrics, add a Grafana CloudWatch data source. Put Grafana's
AWS account ID and external ID in `grafana_cloudwatch_reader`, apply Terraform,
and use `deployment.grafana_cloudwatch_role_arn` as the data source's role ARN.
The role can read account CloudWatch metrics; log access is limited to this
application's log groups.

For Spring service metrics, import [foc-services.json](grafana/foc-services.json)
through **Dashboards → New → Import** and select the Grafana Cloud Prometheus data
source. It includes a service filter and refreshes every minute.

For the infrastructure overview, import [foc-overview.json](grafana/foc-overview.json) and select the Prometheus and
CloudWatch data sources. Use manual refresh or an interval of at least one minute.

## Local checks

These checks use mocked AWS providers and do not create cloud resources:

```sh
terraform -chdir=infra/terraform/environments/prod init -backend=false -lockfile=readonly
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform/environments/prod validate
terraform -chdir=infra/terraform/environments/prod test
```
