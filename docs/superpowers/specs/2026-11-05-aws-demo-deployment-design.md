# AWS coursework demo deployment

## Purpose and approved scope

Deploy FoC as a short-lived coursework demonstration using ECS Fargate, Amazon MQ for RabbitMQ, and fresh externally supplied Neon PostgreSQL databases. Expose each backend deliberately for demonstrations and direct Swagger access. Do not use Ansible or Kubernetes. Do not provision AWS resources until the user has configured credentials and reviewed a Terraform plan.

## Architecture

- One ECS cluster, with separate services for UI, internal gateway, user, supplier, credit, and order.
- One internet-facing Application Load Balancer across public subnets in two availability zones.
- Public listeners: 80 -> UI:80; 5005 -> user:5005; 3001 -> supplier:3001; 3002 -> credit:3002; 3003 -> order:3002. Use the ALB hostname, not an assumed fixed IP.
- Each backend target group checks `/health`; each backend's `/docs` and `/openapi.json` are reached without prefix rewriting. Verify Swagger schema retrieval and Try it out during smoke tests.
- UI retains its existing API proxy through the internal gateway. Do not publish an ALB listener for the internal gateway.
- Private DNS service discovery supplies stable names for internal gateway and backend traffic. Override Docker-specific Nginx DNS defaults with the VPC resolver. ECS task registration must support multiple task addresses.
- Fargate tasks use public subnets and public IPs for outbound access to Neon, ECR, Secrets Manager and logs. Security groups admit application traffic only from the ALB or explicitly permitted internal task groups. No NAT gateway in this demo design.
- Amazon MQ uses RabbitMQ, private accessibility, and AMQPS on 5671. Permit only the backend task security group to reach its application endpoint. Start with a single-instance deployment for this disposable demonstration, choosing a currently supported engine version and instance size at implementation time. No public broker console by default.
- Neon is external to Terraform: use fresh deployment-only databases and distinct service credentials where practical. Require TLS. Do not modify existing development databases.
- CloudWatch receives container stdout/stderr with seven-day retention. Broker general logging is disabled to avoid AWS-created, unmanaged log groups with indefinite retention. Do not deploy the optional Compose Grafana/Loki stack.
- Omit the Compose-only gateway-demo service and its flag volume. File-based outage toggles are not available in this deployment; ECS operations or a separately reviewed demo mechanism can demonstrate failures.

## Credentials and state

- User configures AWS deployment credentials through a local named AWS CLI profile; prefer temporary credentials. Never ask for credentials in chat or place them in Git.
- Create Secrets Manager secret containers and task references through Terraform. Populate application secret values separately, using a secure local procedure. Database URLs, signing keys, RabbitMQ URL, and initial admin credentials must not be committed or embedded in images.
- Task execution role may read only required secrets. Task role has no application AWS permissions unless a verified application requirement needs them.
- Review Amazon MQ provider support before implementing credential provisioning: prefer a supported write-only password input; otherwise document explicitly that a sensitive Terraform input is stored in state. Do not claim `sensitive` prevents state persistence.
- Ignore local Terraform caches, state, saved plans, and real variable files; commit the provider dependency lock file and a nonsecret example variable file.
- First-user bootstrap may use local state on a trusted machine with protected storage; document that it must not be committed or shared. An encrypted, access-controlled S3 remote state backend with locking is preferred for team use and needs a separate bootstrap step.

## Terraform organization

Use a flat root under `deploy/terraform/`: versions.tf, providers.tf, variables.tf, networking.tf, ecr.tf, iam.tf, secrets.tf, mq.tf, ecs.tf, discovery.tf, load_balancer.tf, autoscaling.tf, monitoring.tf, outputs.tf, and terraform.tfvars.example. Avoid modules that merely wrap individual resources.

Represent application services in shared data to keep port mappings, image references, health checks, task definitions, and target groups consistent. Outputs include ALB base URL, direct documentation URLs, ECR repository URLs, secret identifiers, cluster/service names, and broker endpoint without credentials.

Provide explicit three-stage deployment sequencing: deploy_runtime=false creates repositories and empty secret containers; deploy_runtime=true with start_services=false provisions networking, broker and task definitions; start_services=true creates running ECS services only after images and complete secrets exist. This allows the provisioned broker endpoint to be inserted into secrets before task startup. Images use immutable release tags or digests, not mutable `latest`. Specify one consistent image CPU architecture and matching Fargate runtime architecture.

## Application readiness and scaling

- Audit actual per-service environment variables rather than assuming one shared JWT variable. User service currently uses ACCESS_TOKEN_SECRET.
- Remove deployment dependence on the hardcoded supplier Neon host by configuring DATABASE_URL directly in ECS. Leave local Compose behavior alone unless a separately tested change is necessary.
- Verify TLS and URL encoding for Neon and AMQPS; inspect client library support before declaring Amazon MQ compatible.
- Startup currently creates ORM tables. Preserve the project's explicit full-cutover policy for disposable deployment data; never add automatic database or queue deletion to routine startup or deployment.
- Keep all services at one task initially. Review deployment configuration for broker topology, startup behavior, and database connection budgets without expanding this work into an application concurrency-hardening project.
- Treat the embedded order expiry worker as a non-issue for the coursework deployment plan: it is not a deployment or scaling blocker. Retain the current worker in each order-service process. Existing conditional database updates, row locks, transactional outbox, and credit command deduplication provide meaningful safeguards. This is an accepted demo-scope decision, not a claim of experimentally proven concurrency safety.
- Do not write, run, or deploy the proposed expiry-worker concurrency, race, crash-recovery, or duplicate-delivery tests. Worker extraction, leader election, and worker-specific monitoring changes are out of scope.
- Select the demonstration backend after a baseline endpoint/load test. Enable request-count target tracking on that backend's direct ALB target group with min=1 and max=3. Derive the threshold from measurements, not a fabricated performance claim.
- Keep other services at one task during the demonstration to show independent scaling. Record task count, request rate, error rate, and latency. Demonstrate scale-out and eventual scale-in with a repeatable external load generator. Do not load-test infrastructure outside this deployment.
- Clearly label any artificial work or injected latency if introduced through a separate approved change. Scaling cannot be assumed to fix a database/downstream bottleneck.

## Security and limitations

The intentionally public backend ports preserve application authentication; expose documentation only with the team's informed demo consent. Make allowed source CIDRs configurable, defaulting to the demonstrator's explicit CIDRs rather than the entire internet. Include the load generator and professor's access network when configuring them.

HTTP is acceptable only for disposable demo data with no reused passwords; it does not protect browser credentials in transit. Explain this prominently in the runbook. TLS requires a domain and certificate and can be added without changing application services if the user supplies them.

This is not a high-availability production design: one initial task per service, single-instance broker, fresh disposable data, and no production migration guarantee. The ALB, MQ and other managed resources can incur charges even when no requests are served.

## Verification and handoff

1. Run Terraform formatting, initialization without backend, validation, and provider-supported configuration tests without AWS credentials where possible. Tests assert listener mappings, network isolation, task architecture, secret references, scale bounds, and deployment phase behavior.
2. Run existing gateway/UI configuration tests affected by any edits. Do not change expiry-worker behavior or add its proposed test suite; those tests are explicitly excluded from this deployment work.
3. User configures an AWS profile, checks account identity, selects region and source CIDRs, and reviews estimated resource inventory and costs.
4. Bootstrap ECR and secret containers; securely populate secrets and push versioned images.
5. Review a saved plan, then explicitly apply runtime infrastructure. Wait for broker readiness and ECS service stability.
6. Verify UI, all health endpoints, Swagger schemas, authenticated business workflows, and broker connectivity; inspect logs without exposing secret values.
7. Execute the measured scaling rehearsal and retain evidence for the presentation.
8. Document destroy steps, credential cleanup, externally managed Neon cleanup, ECR images, secret recovery windows, retained state, and any chargeable resources that survive. Confirm exact data targets before deletion.

## Documentation ownership

The pre-existing untracked `deploy/README.md` belongs to the user and must not be overwritten without agreement. Put the new operational runbook in `deploy/AWS.md`, link it from the tracked root README when implemented, and mention any conflicting older draft rather than silently replacing it.
