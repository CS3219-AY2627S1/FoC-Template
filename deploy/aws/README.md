# AWS staging deployment (Cloud Deployment N2H)

This directory defines the disposable AWS staging environment for Friend on Campus. Terraform
creates AWS infrastructure, Kustomize defines the Kubernetes runtime, and GitHub Actions builds
immutable ECR images and deploys them through GitHub OIDC. Compose and Minikube remain the normal
local development environments.

Jun Hui is the nominated editor for this Cloud Deployment N2H iteration. Gateway, User, Supplier,
Order, Credit, Admin, Chat and Notification owners must review changes affecting their image, runtime
configuration or route contract before merge.

## Architecture

```text
Browser
  -> CloudFront HTTPS hostname
  -> private ALB VPC origin
  -> Gateway ClusterIP
  -> User / Supplier / Order / Credit / Admin / Chat / Notification ClusterIP services
                                              |
                             private RDS PostgreSQL (seven databases/users)

User / Order / Credit / Admin / Chat / Notification <-> Amazon MSK (3 brokers / 3 AZs)
Chat <-> RabbitMQ StatefulSet on encrypted EBS
Chat -> private S3 attachment bucket through EKS IRSA
Supplier -> private S3 image bucket through EKS IRSA
External Secrets Operator     <-> AWS Secrets Manager through EKS IRSA
Pods and EKS control plane    -> CloudWatch logs, metrics, dashboard and alarms
```

External Secrets and the CloudWatch add-on use IAM Roles for Service Accounts (IRSA): their
Kubernetes service accounts exchange EKS-issued OIDC tokens for short-lived AWS credentials.
The NUS AWS organization explicitly denies the newer EKS Pod Identity API, so this environment
uses IRSA instead. No long-lived AWS keys are stored in Kubernetes or GitHub.

Only CloudFront is public. The ALB is internal, RDS is private, MSK has no public listener and
application Services are `ClusterIP`. The EKS API has a public authenticated endpoint because
GitHub-hosted runners have changing addresses; access is still limited to EKS access entries for
the two OIDC roles.

Kafka is the first stateful component configured for production-oriented availability: Amazon MSK
runs three provisioned brokers in three Availability Zones, topics use replication factor `3` and
minimum ISR `2`, and clients use private `SASL_SSL`/`SCRAM-SHA-512` connections. EKS no longer runs
the AWS Kafka broker. The cluster pins provisioned Standard brokers to `4.1.x.kraft`; MSK 4.2 is
currently Express-only. The default `kafka.m7g.large` size is required because T3 brokers do not
support KRaft mode. Kafbat remains a read-only client of MSK.

Other staging defaults still prioritize coursework cost over full production availability: one NAT
Gateway and one `db.t4g.micro` RDS instance remain single points of failure. EKS Auto Mode may
add/remove compute capacity for scheduled pods. Three always-on MSK brokers materially increase the
monthly cost; the USD 25 budget is only an alert, not a hard limit. Destroy staging when it is not
being demonstrated.

Gateway and the seven stateless application Deployments maintain at least two replicas. Their Pod
topology-spread constraints keep matching replicas within a skew of one across both Availability
Zones and worker hostnames. Database-backed Deployments do not surge during replacement: one of
their two replicas is replaced at a time, keeping the other available without adding a third
generation of database connection pools. This application redundancy does not make the single RDS
instance highly available; production still needs reviewed database capacity and Multi-AZ policy.

## Directory map

| Path | Purpose |
| --- | --- |
| `terraform/bootstrap` | State bucket consumer, GitHub OIDC provider and workflow roles |
| `terraform/staging-core` | VPC, NAT, EKS, ECR, RDS, three-AZ MSK, secret containers, monitoring and budget |
| `terraform/staging-edge` | CloudFront VPC origin, distribution and edge alarm |
| `k8s/staging` | AWS runtime overlay, workloads, HPA, private ingress and secret projection |
| `scripts` | State bootstrap, secret initialization, deployment, smoke/load tests and ALB discovery |

Terraform owns secret *containers* only. Secret values are created directly in Secrets Manager by
`configure-secrets.sh`, so plaintext values do not enter Terraform input, state, Git or workflow
logs. External Secrets Operator projects only each workload's required values into Kubernetes.

## Prerequisites and authentication

Install Terraform 1.14+, AWS CLI v2, Docker, `kubectl`, Helm 3 and `jq`. Configure an AWS SSO
profile; never create or paste long-lived access keys for this project.

```bash
aws configure sso --profile foc-staging-admin
aws sso login --profile foc-staging-admin
aws sts get-caller-identity --profile foc-staging-admin
export AWS_PROFILE=foc-staging-admin
export AWS_REGION=ap-southeast-1
```

The authenticated identity needs enough one-time authority to create the state bucket, OIDC
provider and scoped roles, then to bootstrap the initial Terraform stacks. Subsequent GitHub jobs
use short-lived OIDC sessions instead of stored AWS credentials.

## One-time bootstrap

1. Create the encrypted, versioned state bucket and ignored local backend files:

   ```bash
   deploy/aws/scripts/bootstrap-state.sh
   ```

2. Initialize and apply the bootstrap stack. Use this repository's exact `owner/repository` name.
   The committed owner and repository IDs match GitHub's immutable OIDC subject for this repository;
   a fork or replacement repository must override all three values:

   ```bash
   terraform -chdir=deploy/aws/terraform/bootstrap init \
     -backend-config="$PWD/.aws-local/bootstrap-backend.hcl"
   terraform -chdir=deploy/aws/terraform/bootstrap apply \
     -var-file="$PWD/.aws-local/bootstrap.tfvars" \
     -var="github_repository=AY2627S1-CS3219-P12/FoC-Team-12"
   terraform -chdir=deploy/aws/terraform/bootstrap output
   ```

   Re-run this bootstrap `apply` after an approved change to either GitHub workflow role. The
   operation updates the scoped IAM policies in place; it does not recreate the staging cluster.
   The MSK migration adds scoped Kafka and KMS management permissions, so this bootstrap apply must
   run before the MSK `plan-core` or `apply-core` workflow.

   If the AWS account already has a GitHub Actions OIDC provider, import that provider instead of
   creating a duplicate. The trust conditions accept only this repository's immutable GitHub owner
   and repository IDs and the named protected GitHub environments. Find replacement IDs through
   GitHub's repository API and pass `github_repository_owner_id` and `github_repository_id` when
   bootstrapping a different repository.

3. In GitHub, create protected environments `aws-staging-infra` and `aws-staging-deploy`. Require
   an approver for infrastructure. Add these repository/environment variables:

   | Variable | Value |
   | --- | --- |
   | `AWS_INFRA_ROLE_ARN` | `github_infra_role_arn` bootstrap output |
   | `AWS_DEPLOY_ROLE_ARN` | `github_deploy_role_arn` bootstrap output |
   | `AWS_BUDGET_EMAIL` | Address receiving AWS Budget alerts |
   | `AWS_STAGING_ENABLED` | Keep `false` until the first full deployment succeeds |

4. Run **AWS staging infrastructure -> apply-core** manually and approve it. Review a
   **plan-core** run first. This creates chargeable resources. If the Chat attachment bucket was
   created manually before Terraform, the apply workflow imports it automatically. For a manual
   apply, adopt it once before applying:

   ```bash
   terraform -chdir=deploy/aws/terraform/staging-core import \
     aws_s3_bucket.chat_attachments \
     foc-team-12-chat-attachments-070096877754-ap-southeast-1
   ```

   Reapply the bootstrap stack first when introducing the Chat attachment or Supplier image bucket
   to an existing environment so the scoped infrastructure role receives the new S3 permissions.
   The Supplier bucket is created by Terraform and must not be created manually. These resources
   can incur storage and request charges.

   The MSK plan adds a third public/application/database subnet and one provisioned broker in each
   of three Availability Zones. The existing EKS control plane remains on its original two-AZ
   subnet set because AWS does not permit expanding that set after cluster creation. The plan also
   creates a customer-managed KMS key and eight empty
   `AmazonMSK_*` SCRAM secret containers. It must not replace the VPC, EKS cluster, RDS instance or
   existing subnets. MSK provisioning commonly takes tens of minutes.

   The core stack creates a tiny `foc-capacity-bootstrap/capacity-bootstrap` pause workload before
   installing node-dependent add-ons. Its only purpose is to make a new EKS Auto Mode cluster
   provision initial compute deterministically; application workloads still control meaningful
   capacity and scaling.

5. Initialize runtime values from a trusted workstation. The SendGrid values are read from shell
   variables and are never printed. Optional bootstrap-admin and Gemini translation values are
   handled the same way.

   ```bash
   export SENDGRID_API_KEY='set-locally'
   export SENDGRID_FROM_EMAIL='verified@example.com'
   export ADMIN_BOOTSTRAP_EMAIL='student-id@u.nus.edu'
   export ADMIN_BOOTSTRAP_USERNAME='optional-admin'
   export ADMIN_BOOTSTRAP_PASSWORD='optional-strong-password'
   export GEMINI_API_KEY='optional-chat-translation-key'
   deploy/aws/scripts/configure-secrets.sh
   unset SENDGRID_API_KEY SENDGRID_FROM_EMAIL ADMIN_BOOTSTRAP_PASSWORD GEMINI_API_KEY
   ```

   Re-running the helper preserves existing secret versions. Supplying all three
   `ADMIN_BOOTSTRAP_*` values explicitly updates only the bootstrap identity, which provides a
   safe repair path for an invalid initial address without rotating database or signing keys.
   When `GEMINI_API_KEY` is supplied, the helper adds it and
   `CHAT_TRANSLATION_PROVIDER=gemini` to the existing Chat secret without printing the key.
   The helper rejects bootstrap addresses outside the eligible NUS student domains before writing
   them. Rotate any other value with an explicit `aws secretsmanager put-secret-value --secret-id
   ... --secret-string file://...` command, then restart only the affected deployment so External
   Secrets can project the new version.

   The helper also migrates an existing Kafka broker secret forward when new service identities
   are introduced: it adds only missing fields and never rotates credentials already in use. For
   AWS it copies those established passwords into KMS-encrypted `AmazonMSK_*` SCRAM secrets using
   MSK's required `{username,password}` structure. Run `apply-core` first so those containers exist.
   Runtime provisioning validates the required Chat and Notification identities before building
   images, then forces External Secrets to synchronize the current AWS version before Kafka starts.

   **Adding Notification to an existing staging environment.** Run **apply-core** first (it adds
   the `foc-notification-service` ECR repository and the empty `notification-service-secrets`
   container), then re-run this helper so it fills only the new secret's `DB_PASSWORD`, then run
   **provision-runtime**. Until then, merged changes that rebuild Notification fail the automatic
   deployment before any rollout, so staging keeps its current images. Order publishes
   `order.lifecycle.events` in staging (`ORDER_LIFECYCLE_EVENTS_ENABLED=true`); `kafka-init`
   creates the topic and its ACLs in every deployment before workloads roll out.

6. Run **AWS staging infrastructure -> provision-runtime**. It first associates the SCRAM secrets
   with MSK, then builds all eight deployed application images,
   pushes immutable tags to ECR, applies the platform, creates CloudFront and smoke-tests the HTTPS
   URL. The initializer creates topics with replication factor `3`, applies the existing
   least-privilege ACLs and grants the reconciliation identity; provisioning then changes MSK from
   bootstrap mode to `allow.everyone.if.no.acl.found=false`. Set `AWS_STAGING_ENABLED=true` only
   after this passes.

   `apply-core` also maintains two EKS Auto Mode static-capacity NodePools: one `amd64` on-demand
   worker in `ap-southeast-1a` and one in `ap-southeast-1b`. These establish a fixed two-worker,
   two-AZ baseline while the built-in dynamic pools remain available for load-driven burst
   capacity. Each static pool permits one temporary extra node during replacement, but normally
   maintains exactly one. The workflow waits for a Ready worker in each expected AZ and fails with
   NodePool/NodeClaim diagnostics if capacity cannot be provisioned. Static capacity prevents Auto
   Mode consolidation from reducing staging below two workers. The runtime overlay separately keeps
   Gateway and all seven stateless applications at two or more replicas and requires their replicas
   to spread across both zone and hostname failure domains.

   Inspect the baseline with:

   ```bash
   kubectl get nodepool foc-static-1a foc-static-1b
   kubectl get nodes -l friendoncampus.com/capacity=static \
     -L topology.kubernetes.io/zone,karpenter.sh/nodepool
   ```

   Automatic staging deployment is guarded by `/foc/staging/msk-runtime-ready`. `apply-core`
   creates it as `false`; only a completely successful MSK provision/lockdown marks it `true`.
   Until then CI may publish immutable images, but it deliberately skips the Kubernetes rollout
   instead of breaking the currently running single-broker deployment.

   The cutover removes the old single-broker StatefulSet only after MSK initialization and all
   application rollouts succeed. Kafka clients restart after topic and ACL reconciliation so a
   listener cannot remain stopped after a transient authorization failure during first-time ACL
   creation. The old broker PVC is intentionally retained as a short rollback aid.
   Existing transient records and consumer offsets are not copied into the new staging cluster;
   authoritative service databases and transactional outboxes remain the recovery sources.
   After the team verifies MSK topics, consumers and Kafbat, remove that orphaned staging PVC
   explicitly to stop paying for its EBS volume:

   ```bash
   kubectl -n foc-staging get pvc
   kubectl -n foc-staging delete pvc data-kafka-0
   ```

   Kafbat still runs inside EKS and now inspects MSK. Access it privately when needed:

   ```bash
   kubectl -n foc-staging port-forward service/kafka-ui 8090:8080
   # Open http://localhost:8090 and use the existing kafka-ui-secrets dashboard login.
   ```

   The `aws-staging-infra` GitHub environment variable `AWS_KAFBAT_VIEWER_ROLE_ARN` identifies the
   human operator IAM role that receives this private access. `apply-core` adopts an existing EKS
   access entry, maps it to the `foc-kafka-viewers` Kubernetes group and installs a namespace-scoped
   Role. The Role permits pod discovery and port-forward creation but not exec, Secret access,
   workload changes or public exposure. For the NUS sandbox, set it to the canonical IAM role ARN
   shown by `aws eks list-access-entries --cluster-name foc-staging`; do not use the temporary
   `arn:aws:sts::...:assumed-role/...` session ARN.

   Retrieve the separate dashboard login without copying it into Git or shell history:

   ```bash
   aws secretsmanager get-secret-value \
     --region ap-southeast-1 \
     --secret-id foc/staging/kafka-ui-secrets \
     --query SecretString \
     --output text | jq '{
       username: .KAFKA_UI_LOGIN_USERNAME,
       password: .KAFKA_UI_LOGIN_PASSWORD
     }'
   ```

   The workflow validates the edge Terraform and resolves the required AWS-managed CloudFront
   policies before building images. If runtime deployment and the private ALB already succeeded but
   only CloudFront failed, run **apply-edge** after correcting the edge configuration. This resumes
   the edge stack and smoke test without rebuilding images or redeploying Kubernetes workloads.

   Runtime provisioning pins the External Secrets chart and retries its download before invoking
   Helm. This isolates transient GitHub Releases/network timeouts from the Kubernetes installation;
   exhausting all download attempts still fails provisioning before any application rollout. The
   deployment recovers an interrupted pending Helm operation from the last deployed revision and
   performs atomic upgrades so an ordinary failure rolls back automatically. It then restarts the
   External Secrets controller so a newly added IRSA service-account annotation is injected into
   its pod even when Helm did not otherwise change the pod template.

   The database bootstrap temporarily grants the RDS master user membership in each application
   role while assigning database ownership, then revokes it. RDS master users are not PostgreSQL
   superusers and cannot assign ownership to an unrelated role without that temporary membership.
   Failed bootstrap and Kafka initializer jobs are detected immediately and print pod/job logs.

## Deployment and rollback

On successful main-branch CI, `.github/workflows/cloud-deploy.yml` determines affected images,
pushes immutable ECR tags, preserves current images for unchanged services, applies the overlay and
waits for rollouts. It smoke-tests through the CloudFront hostname. If rollout or smoke testing
fails, it restores the previous application images and exits failed. Application deployments and
infrastructure operations share one staging concurrency group, so two workflows cannot mutate the
cluster or its Helm releases simultaneously.

Cloud deployment does not replace the existing Docker Hub publishing workflow. Database migration
compatibility remains each service owner's responsibility: an image rollback cannot undo a Flyway
migration. Test forward/backward compatibility before merging a migration.

Useful commands after deployment:

```bash
aws eks update-kubeconfig --name foc-staging --region ap-southeast-1
kubectl -n foc-staging get pods,deployments,hpa,ingress
kubectl -n foc-staging rollout status deployment/gateway --timeout=15m
PUBLIC_URL=$(aws ssm get-parameter --name /foc/staging/public-url --query Parameter.Value --output text)
PUBLIC_URL="$PUBLIC_URL" deploy/aws/scripts/smoke-test.sh
```

## Logs, alarms and scaling evidence

EKS control-plane logs and Container Insights application/container logs are sent to CloudWatch
with short retention. The `foc-staging` dashboard includes pod count, ALB errors/latency, RDS
capacity and Kafka health signals. Alarms cover RDS storage/CPU, CloudFront 5xx and core runtime
availability. Use CloudWatch Logs Insights for cross-pod searches; use `kubectl logs` for immediate
diagnosis:

```bash
kubectl -n foc-staging logs deployment/order-service --since=15m
aws logs tail /aws/msk/foc-staging/broker --since 15m
kubectl -n foc-staging get events --sort-by=.lastTimestamp | tail -100
```

Gateway and all seven applications use HPA `2-3` at 70% CPU. The two-replica floor supplies normal
availability, while topology-spread constraints prevent replicas from sharing one node or AZ when
both failure domains are available. The deployment smoke test fails unless every stateless workload
has Ready replicas on at least two distinct worker nodes and two distinct Availability Zones. To
collect N2H evidence, run the load helper in one terminal and watch both pod and node scaling in
others:

```bash
PUBLIC_URL=$(aws ssm get-parameter --name /foc/staging/public-url --query Parameter.Value --output text)
PUBLIC_URL="$PUBLIC_URL" deploy/aws/scripts/load-test.sh
kubectl -n foc-staging get hpa,pods -w
kubectl get nodes -w
```

Capture CloudWatch CPU/pod graphs before, during and after load. HPA changes pod replicas; EKS Auto
Mode separately adds capacity if pending pods do not fit. Scaling is eventual and may take minutes.

## Guarded teardown and recreation

Routine teardown preserves the bootstrap bucket and OIDC roles but removes chargeable staging
resources, including the three MSK brokers. Run **AWS staging infrastructure -> destroy-staging** and type exactly
`DESTROY foc-staging`. The workflow destroys CloudFront first, deletes the Ingress/namespace and
waits for ALB/PVC cleanup, disassociates the externally managed MSK SCRAM identities, then destroys
core Terraform resources. RDS final snapshots, Kafka storage and ECR images are intentionally
disposable.

Verify cleanup in the AWS console and CLI, especially CloudFront distributions, load balancers,
EBS volumes, NAT Gateways, EKS clusters and RDS instances. The budget may lag and is not proof that
resources are gone. To recreate, run `apply-core`, `configure-secrets.sh` if secret versions were
deleted, then `provision-runtime`; Flyway migrations and Kafka initialization rebuild the runtime.

Permanent project retirement is separate: after all stack state is removed, delete the OIDC roles
and provider, empty all versions/delete markers in the state bucket, and delete the bucket. Do not
destroy bootstrap while staging or edge state still depends on it.

## Code-only verification

These checks do not contact AWS or create billable resources:

```bash
terraform fmt -check -recursive deploy/aws/terraform
for stack in bootstrap staging-core staging-edge; do
  terraform -chdir="deploy/aws/terraform/$stack" init -backend=false
  terraform -chdir="deploy/aws/terraform/$stack" validate
done
kubectl kustomize --load-restrictor=LoadRestrictionsNone deploy/aws/k8s/staging >/tmp/foc-aws.yaml
printf '\n---\n' >>/tmp/foc-aws.yaml
cat deploy/aws/k8s/staging/msk-initialize-job.yaml >>/tmp/foc-aws.yaml
docker compose config --quiet
python3 -m unittest discover -s .github/scripts -p 'test_*.py' -v
```

CI additionally runs ShellCheck, Kubeconform and workflow linting. A successful static check proves
syntax and internal consistency, not OIDC trust, AWS quotas, service health or teardown.

## Known staging decisions requiring production review

- The USD 25 budget threshold is below the likely monthly cost of three always-on provisioned MSK
  brokers; it is an alert, not a spending cap. Keep staging short-lived and review actual charges.
- The one-NAT design and single RDS instance remain availability gaps even though Kafka is now
  multi-AZ.
- RDS deletion protection and final snapshots are disabled because staging data is disposable.
- MSK is private, encrypted and three-AZ with RF3/minISR2. Topic/ACL changes remain the team's
  responsibility; AWS manages broker infrastructure, not event correctness or consumer retries.
- RabbitMQ is also a single staging StatefulSet and does not survive a node/AZ failure without
  rescheduling; production should use a managed or clustered broker.
- Chat attachments are private and encrypted in S3. Chat streams authorized downloads through its
  API, and its Pod receives short-lived AWS credentials through EKS Pod Identity; no AWS access
  key is stored in Kubernetes or GitHub.
- Supplier images are private and encrypted in a separate S3 bucket. Supplier Service validates
  uploads and streams public image responses through its API; its Pod receives narrowly scoped,
  short-lived credentials through IRSA, and browsers never receive S3 credentials or object URLs.
- The EKS API remains public for GitHub-hosted runners; a production platform should use private
  runners/network access and make it private-only.
- Compose and Minikube intentionally retain local `SASL_PLAINTEXT`; AWS staging uses
  `SASL_SSL`/`SCRAM-SHA-512` and KMS-encrypted credentials.
- Select production backup, multi-AZ, replication, disaster-recovery, log retention and alert
  notification policies before treating this design as production-ready.

