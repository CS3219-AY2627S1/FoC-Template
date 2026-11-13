# Deploy the coursework demo to AWS

This is a **manual, disposable demo deployment**, not a production availability design. Terraform creates AWS infrastructure; Neon is supplied separately. No Ansible is needed.

**Nothing in this guide has been applied to an AWS account by the coding agent.** Read the plans before applying them. The load balancer, six Fargate services, public IPv4 addresses, private Amazon MQ, Cloud Map, Secrets Manager, logs, ECR storage, and data transfer can all incur charges. Amazon MQ can be a significant baseline cost even when idle. Do not assume free-tier coverage.

## 1. Prerequisites and boundaries

Use Bash on Linux/macOS, AWS CLI v2, Terraform >= 1.11, Python 3, Git, and Docker with Buildx. Run commands from the repository root unless shown otherwise.

- Choose one AWS account and region; examples use `ap-southeast-1`.
- Use your university IAM Identity Center (SSO) account and an assigned role with permission to manage the resources in the Terraform files, including IAM roles and service-linked roles if absent. SSO login does not grant extra permissions; confirm your university permits these resources. No manually copied access keys are needed.
- Obtain your demonstrator/load generator/professor's public IPv4 CIDRs. Allow only those sources initially. An address ending `/32` allows one IPv4 address. These rules intentionally apply to the UI and exposed backend ports.
- Provision fresh Neon deployment databases, not development databases. Prefer four separate databases/users: user, supplier, credit, order. The database users need table/index creation permissions because services create their tables at startup. Choose a Neon region close to AWS and review connection limits.
- Backend Swagger will be at `http://<ALB-hostname>:<port>/docs`. Use the hostname; ALB IP addresses can change.
- HTTP traffic is **not encrypted**. Do not use real personal data or reused passwords. This is an explicit disposable-demo trade-off; use a domain and HTTPS certificate before carrying sensitive traffic.

Do not reset shared databases or queues. A schema change follows this repository's explicit full-cutover policy: confirm exact deployment-only targets before any deliberate reset. Normal container startup and Terraform apply must not delete data.

## 2. Select a folder-local AWS profile

The helper changes **this Bash shell**, not AWS globally and not automatically when you change folders:

```bash
source deploy/aws-env.sh
umask 077
```

It selects profile `foc-demo`, with:

```text
<repository>/.aws-local/config
<repository>/.aws-local/credentials
```

The helper is an optional isolation convenience, not an AWS requirement. This guide uses it so the CLI and Terraform select the same project-local profile rather than your laptop's `~/.aws/config`. It clears ambient static credentials, session tokens, web-identity/container credential overrides, custom AWS endpoint overrides (including LocalStack), and region overrides. EC2 metadata and legacy Boto credential-file fallback are disabled. The helper never reads or prints credentials and does not log you in.

### First-time SSO setup

After sourcing the helper, configure the profile using AWS's browser-based wizard:

```bash
aws configure sso --profile foc-demo
```

Use these answers:

| Prompt | Answer |
| --- | --- |
| SSO session name | `foc-demo` |
| SSO start URL | Your university's `https://<university>.awsapps.com/start` URL |
| SSO region | The university's IAM Identity Center region; **not necessarily `ap-southeast-1`** |
| SSO registration scopes | Accept `sso:account:access` |
| AWS account and role | Select the intended coursework account and assigned deployment role |
| Default client region | `ap-southeast-1` |
| Default output format | `json` |

Find the SSO start URL and SSO region in the university access portal: select your account/role's **Access keys**, then the **IAM Identity Center credentials** instructions. You only need the SSO configuration values, not the displayed access keys. Ask your university administrator if these details or the required role are unavailable.

Approve the login in your browser. If the terminal is on a different device from your browser, use `aws configure sso --profile foc-demo --use-device-code` instead. Only approve login requests you initiated.

The wizard writes the SSO session and profile to `.aws-local/config`. SSO does not need a `.aws-local/credentials` file. If a previous access-key setup created credentials for `foc-demo` there, remove that profile's static credentials deliberately before switching to SSO; do not mix the two methods.

### Login and verify identity

In each new Bash terminal, run from the repository root:

```bash
source deploy/aws-env.sh
umask 077
aws sso login --profile foc-demo
aws sts get-caller-identity
```

For a browser on a different device, add `--use-device-code` to `aws sso login`. Repeat login when the SSO session expires; no access-key copying or session-token editing is needed.

**Check the returned account ID and role against your intended coursework account before proceeding.** Login and identity verification do not create deployment resources. Set Terraform's `aws_region` to the default client region, `ap-southeast-1`; the SSO region is independent.

**Only the profile configuration is project-local.** AWS still caches SSO tokens under `~/.aws/sso/cache`; the helper does not isolate that cache. Protect it as credential material and do not share it. `aws sso logout` clears cached SSO sessions across profiles, not just this project.

For stricter shell scoping, start a subshell before sourcing, then `exit` when finished. Opening a new terminal restores its normal environment; changing directories alone does not. Do not commit `.aws-local/` or share it in a report/screenshot. Local configuration and secret files are plaintext at rest; gitignore is not encryption or access control.

## 3. Configure Terraform and protect its state

```bash
cp deploy/terraform/terraform.tfvars.example deploy/terraform/terraform.tfvars
```

Edit `deploy/terraform/terraform.tfvars`:

- `aws_region`: match your local profile.
- `project_name`: use a short unique demo name; keep it stable after deployment.
- `allowed_ingress_cidrs`: explicit public source CIDRs.
- Leave `deploy_runtime = false` for bootstrap.
- Choose a unique immutable `image_tag`, such as `demo-20261105-1`. Do not use `latest`; never overwrite a previously published release tag.
- Keep `autoscaling_enabled = false` initially.
- Review `mq_engine_version` / `mq_instance_type` availability in your region. RabbitMQ 4.2 supports `mq.m7g` types. `mq.t3.micro` is deprecated and unavailable for new brokers; it is not a valid budget default. See the compatibility notes below.

The checked-in example contains no credentials. Real tfvars, state, saved plans and the Terraform cache are gitignored. **MQ credentials can be stored in Terraform state and saved plan files:** the AWS broker resource's ordinary password input is sensitive but not write-only. Hiding terminal output does not remove a password from state. Application secret values are uploaded outside Terraform to avoid that exposure.

Keep local state and its backups on a trusted encrypted machine, protect filesystem access, and never commit/upload it. `umask 077` limits new file permissions. Only one person should operate this local state at once. For team-managed state, first provision a separate encrypted S3 backend with narrowly scoped access and locking, then migrate state deliberately; no remote backend is automatically provisioned here.

```bash
terraform -chdir=deploy/terraform init
terraform -chdir=deploy/terraform fmt -check -recursive
terraform -chdir=deploy/terraform validate
terraform -chdir=deploy/terraform test
```

The tests use a mocked AWS provider; they do not deploy services and do not include the excluded expiry-worker test suite.

## 4. Bootstrap ECR repositories and empty secret containers

With `deploy_runtime = false`:

```bash
terraform -chdir=deploy/terraform plan -out=bootstrap.tfplan
# Inspect every proposed action and the selected account/region before applying.
terraform -chdir=deploy/terraform apply bootstrap.tfplan
terraform -chdir=deploy/terraform output ecr_repository_urls
terraform -chdir=deploy/terraform output secret_arns
```

This phase creates image repositories and **empty** backend secret containers, not usable application credentials or a running application. ECR and Secrets Manager can incur charges even at this phase.

## 5. Build and publish application images

Commit any application changes you want deployed first. The commands below use **tracked Git build contexts**, not the working directory. That prevents local `.env` files (notably the supplier service's current Docker ignore rules) from being copied into an image. The built application code comes from `HEAD`; uncommitted application changes are deliberately excluded.

Keep the Docker login token local to this folder too:

```bash
export DOCKER_CONFIG="$PWD/.aws-local/docker"
mkdir -p "$DOCKER_CONFIG"
chmod 700 "$DOCKER_CONFIG"
export IMAGE_TAG=demo-20261105-1  # Must match Terraform's image_tag.
export DEPLOY_REGION="$(terraform -chdir=deploy/terraform output -raw aws_region)"
export ECR_REGISTRY="$(terraform -chdir=deploy/terraform output -json ecr_repository_urls | python3 -c 'import json,sys; print(next(iter(json.load(sys.stdin).values())).split("/")[0])')"
aws ecr get-login-password --region "$DEPLOY_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"
```

Build/push each component for the Terraform task architecture (`linux/amd64` / `X86_64`):

```bash
python3 - <<'PY'
import json
import os
import subprocess

repos = json.loads(subprocess.check_output(['terraform', '-chdir=deploy/terraform', 'output', '-json', 'ecr_repository_urls']))
contexts = {
    'ui': 'ui', 'internal-gateway': 'internal-gateway',
    'user': 'user-service', 'supplier': 'supplier-service',
    'credit': 'credit-service', 'order': 'order-service',
}
tag = os.environ['IMAGE_TAG']
for service, context in contexts.items():
    image = f'{repos[service]}:{tag}'
    print(f'Building tracked HEAD:{context} -> {image}', flush=True)
    archive = subprocess.Popen(['git', 'archive', f'HEAD:{context}'], stdout=subprocess.PIPE)
    try:
        build = subprocess.run([
            'docker', 'buildx', 'build', '--platform', 'linux/amd64',
            '--provenance=false', '--tag', image, '--push', '-',
        ], stdin=archive.stdout)
    finally:
        archive.stdout.close()
    if archive.wait() != 0 or build.returncode != 0:
        raise SystemExit(f'Build/push failed for {service}; do not deploy this release.')
print('All six images published.')
PY
```

ECR repositories use immutable tags. For a new release use a fresh tag for all images and update `image_tag`. Do not rebuild into the old tag. The source build scripts/base images must also be available from their public registries.

## 6. Provision the private broker before starting tasks

Generate a unique broker password (prefer 24 or more random letters/digits) with at least 12 characters, at least four different characters, and no comma, colon or equals sign. Keep it available for later applies and destruction. Do not put it directly in tfvars or a shell command:

```bash
read -rsp 'Deployment-only RabbitMQ password: ' TF_VAR_mq_password; printf '\n'
export TF_VAR_mq_password
```

The value exists in the current shell environment and, after provisioning, potentially Terraform state. Do not use `set -x`, dump your environment, or screenshot the value. `mq_username` defaults to `focdemo`; if you change it, use the same username when preparing secrets.

The broker endpoint is generated by AWS, so it must exist **before** the backend JSON secrets can be completed. This is a staged provisioning operation, not permission to start ECS tasks with missing secrets. Edit `terraform.tfvars` to set `deploy_runtime = true` and **keep `start_services = false`**. This creates networking, the ALB, private MQ, and ECS task definitions, but no running ECS services.

```bash
terraform -chdir=deploy/terraform plan -out=infrastructure.tfplan
# Inspect account/region, costs, broker settings and all proposed actions.
terraform -chdir=deploy/terraform apply infrastructure.tfplan
terraform -chdir=deploy/terraform output -raw rabbitmq_endpoint
```

If your chosen region rejects the engine/type combination, query availability rather than guessing:

```bash
aws mq describe-broker-engine-types --engine-type RABBITMQ --region "$DEPLOY_REGION"
aws mq describe-broker-instance-options --engine-type RABBITMQ --region "$DEPLOY_REGION"
```

The private broker cannot be reached directly from your laptop. Its AMQPS endpoint is for the ECS backend tasks. Do not open the broker security group to the internet just to test it. Provisioning Amazon MQ can take several minutes.

Broker general logging is deliberately disabled: Amazon MQ otherwise creates log groups outside this Terraform root with indefinite retention. ECS application logs are managed with seven-day retention; broker metrics remain available through Amazon MQ/CloudWatch.

## 7. Prepare and upload Neon/application secrets

For each fresh Neon database, obtain a SQLAlchemy-compatible URL with TLS, for example:

```text
postgresql+psycopg://USER:URL_ENCODED_PASSWORD@HOST/DATABASE?sslmode=require&channel_binding=require
```

Use the URL your Neon connection panel supplies, changing only the scheme from `postgresql://` to `postgresql+psycopg://` when needed. Username/password components must be URL-encoded. In particular, supplier service needs the explicit `postgresql+psycopg` driver for its asynchronous SQLAlchemy engine. Its local Compose hardcoded hostname does not apply to ECS, where DATABASE_URL is injected directly.

Pooled Neon URLs may reduce server-side connection pressure, but do not remove the client connection budget. Four backends and extra replicas all create connection pools. Start at one task per service and watch Neon usage. Verify any provider-specific connection settings against the current Neon connection panel.

The following script asks for secret values through masked prompts. It builds a URL-encoded AMQPS URL for the default `/` virtual host, prepares local JSON files with mode 0600, then uploads them. It does not put secret values in AWS CLI arguments or Terraform state. The files remain sensitive and must stay in ignored `.aws-local/`.

```bash
python3 - <<'PY'
import getpass
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import quote, urlsplit

# The program arrives on stdin via a heredoc; read interactive fields from TTY.
sys.stdin = open('/dev/tty')


def output(name):
    return subprocess.check_output(['terraform', '-chdir=deploy/terraform', 'output', '-json', name])

arns = json.loads(output('secret_arns'))
endpoint = json.loads(output('rabbitmq_endpoint'))
if not endpoint:
    raise SystemExit('Create the broker with task startup disabled first.')
parsed = urlsplit(endpoint)
if parsed.scheme != 'amqps' or not parsed.hostname or parsed.port != 5671:
    raise SystemExit('Unexpected broker endpoint; inspect it before proceeding.')
username = input('Broker username [focdemo]: ').strip() or 'focdemo'
password = getpass.getpass('Same broker password used for Terraform: ')
if not password or password != os.environ.get('TF_VAR_mq_password'):
    raise SystemExit('Password must match the currently exported TF_VAR_mq_password.')
amqps = f'amqps://{quote(username, safe="")}:{quote(password, safe="")}@{parsed.hostname}:5671/%2F?heartbeat=60'
secret_dir = Path('.aws-local/secrets')
secret_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
for service in ('user', 'supplier', 'credit', 'order'):
    url = getpass.getpass(f'{service} Neon DATABASE_URL: ').strip()
    db = urlsplit(url)
    if db.scheme == 'postgresql':
        url = 'postgresql+psycopg' + url[len('postgresql'):]
        db = urlsplit(url)
    if db.scheme != 'postgresql+psycopg' or not db.hostname or 'sslmode=require' not in db.query:
        raise SystemExit(f'{service}: require a psycopg PostgreSQL URL with sslmode=require.')
    values = {'DATABASE_URL': url, 'RABBITMQ_URL': amqps}
    if service == 'user':
        values.update({
            'ACCESS_TOKEN_SECRET': getpass.getpass('Unique long random JWT signing secret: '),
            'INITIAL_ADMIN_USERNAME': input('Deployment admin username: ').strip(),
            'INITIAL_ADMIN_EMAIL': input('Deployment admin email: ').strip(),
            'INITIAL_ADMIN_PASSWORD': getpass.getpass('Unique deployment admin password: '),
        })
    if any(not value for value in values.values()):
        raise SystemExit('No secret values may be empty.')
    path = secret_dir / f'{service}.json'
    if path.exists():
        raise SystemExit(f'{path} already exists; review/reuse it deliberately instead of overwriting.')
    with path.open('x') as stream:
        json.dump(values, stream)
    path.chmod(0o600)
    subprocess.run([
        'aws', 'secretsmanager', 'put-secret-value', '--secret-id', arns[service],
        '--secret-string', f'file://{path.resolve()}',
        '--query', '{ARN:ARN,VersionId:VersionId}',
    ], check=True)
print('Secret values uploaded; no secret values printed.')
PY
```

Required JSON keys are exactly:

| Secret | Keys |
| --- | --- |
| user | DATABASE_URL, RABBITMQ_URL, ACCESS_TOKEN_SECRET, INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD |
| supplier, credit, order | DATABASE_URL, RABBITMQ_URL |

Do not use a shared `JWT_SECRET` variable; user service actually reads `ACCESS_TOKEN_SECRET`. Initial admin credentials are required on a fresh user database.

ECS injects secrets at **task startup**. Updating a secret version does not update existing container environments. Roll the affected services after a deliberate secret change. Terraform's RabbitMQ `user` block supplies the **initial** broker user only: changing `TF_VAR_mq_password` later does not rotate the existing broker password. Do not attempt a rotation by editing the JSON URL alone. Use a deliberate broker recreation for this disposable demo, or arrange private RabbitMQ administrative access and follow Amazon MQ's user-management procedure; then update all affected secrets and restart tasks.

## 8. Start services, then verify the deployment

Once all six image tags and all four complete secret values exist, edit `terraform.tfvars` to keep `deploy_runtime = true` and set `start_services = true`. Keep autoscaling disabled for the first deployment.

```bash
terraform -chdir=deploy/terraform plan -out=runtime.tfplan
# Confirm identity, region, image tag, source CIDRs and every resource action.
terraform -chdir=deploy/terraform apply runtime.tfplan
terraform -chdir=deploy/terraform output alb_url
terraform -chdir=deploy/terraform output documentation_urls
```

Wait for service stability and check each backend's health and OpenAPI schema:

```bash
python3 - <<'PY'
import json
import subprocess
from urllib.request import urlopen


def output(name):
    return json.loads(subprocess.check_output(['terraform', '-chdir=deploy/terraform', 'output', '-json', name]))

cluster, services = output('cluster_name'), output('service_names')
subprocess.run(['aws', 'ecs', 'wait', 'services-stable', '--cluster', cluster, '--services', *services.values()], check=True)
for service, docs in output('documentation_urls').items():
    base = docs.removesuffix('/docs')
    for path in ('/health', '/openapi.json'):
        with urlopen(base + path, timeout=15) as response:
            payload = json.load(response)
            if not payload:
                raise SystemExit(f'{service}{path} returned an empty response')
        print(f'{service}{path}: OK')
PY
```

Open the UI at the ALB URL and each direct `/docs` URL in a browser. Confirm Swagger loads its schema and its Try it out requests use the same public hostname/port. Complete login, supplier browsing, order placement and the resulting credit workflow with disposable accounts; health endpoints alone do not prove those flows work.

If a service fails, inspect ECS stopped-task reasons/events and the corresponding CloudWatch log group before retrying. Common causes: missing JSON key, wrong IAM secret access, unpublished image tag, wrong architecture, invalid Neon URL, missing initial-admin fields, broker URL/credentials, source CIDRs, or Cloud Map/DNS resolution. Do not print secret values while debugging. Expected direct ports: user 5005, supplier 3001, credit 3002, order 3003; order's **container** port is 3002.

The UI proxies normal API calls through the private gateway. Direct backend listeners bypass that gateway by design for demonstration/load testing, but do not bypass backend authentication. RabbitMQ, databases, and gateway have no public listeners. Compose's gateway-demo flag-volume helper is not deployed.

## 9. Optional measured independent scaling demonstration

The expiry worker is accepted as a **non-blocker** for this demo. It stays embedded and unchanged; there is no new worker service, leader election, or expiry/concurrency/recovery test suite.

Start with a read-only supplier endpoint through the supplier's **direct public listener**, not `/health` or `/docs`. Discover its actual path and authentication requirements from Swagger. Create enough disposable supplier data to make a meaningful request. Use an external load generator such as k6 or Locust from an allowed source CIDR. Never test another team's/database/account infrastructure.

1. Record the one-task baseline: request rate, errors, p95 latency, service CPU and DB connections.
2. Set `autoscaling_service = "supplier"`, `autoscaling_enabled = true`, and choose `requests_per_target` based on the measured **requests per minute per target**, not requests per second.
3. Review/apply the scaling plan. Generate sustained load long enough to cover CloudWatch metric periods, ECS scaling cooldowns and task startup.
4. Record that supplier scales from one up to three tasks while other services stay at one. Observe task count, ALB request count/healthy targets, latency/errors and Neon connection usage.
5. Stop load and allow time for eventual scale-in. Request-count scaling is policy-driven; it does not itself prove a throughput improvement. State the database/downstream bottleneck honestly if one appears. If you disable the autoscaling policy afterwards, Terraform intentionally ignores ECS desired-count drift; use an explicit reviewed ECS desired-count update to return the selected service to one task if necessary.

Traffic routed only through Nginx/Cloud Map will not contribute to the backend's direct ALB target-group request metric. Route the scaling load to that backend's public listener. Do not manufacture arbitrary result claims or hide artificial delays/CPU work. This implementation adds no artificial workload to the application.

## 10. Updates, teardown and secret cleanup

For an application update, build six images under a **new** immutable tag, change `image_tag`, plan, review, and apply. Do not reset databases/queues automatically. Keep the original tag available if you need a rollback that remains schema/message-compatible.

For a secret-only change, upload the reviewed JSON and force a new deployment of the affected service, or update task definitions through a reviewed Terraform release. Service names come from the `service_names` output; do not guess them.

At the end of the demonstration:

1. Confirm account identity, region and exact Terraform state. Keep `TF_VAR_mq_password` available; Terraform can require its input to evaluate the configuration even during destruction.
2. Disable autoscaling and/or stop demo traffic. If Neon data must be retained, export it deliberately before deletion.
3. Run `terraform -chdir=deploy/terraform plan -destroy -out=destroy.tfplan`, inspect every resource and any retention settings, then run `terraform -chdir=deploy/terraform apply destroy.tfplan` only when intentional.
4. Nonempty ECR repositories refuse deletion by default. Before the final destroy, either delete only the reviewed demo image digests or set `force_delete_images = true` in tfvars, review/apply that setting while the repositories still exist, then generate a fresh destroy plan. Do not delete all registries/account resources indiscriminately.
5. Verify there are no remaining demo ALBs, ECS tasks/services, MQ brokers, Cloud Map records/namespaces, log groups, ECR images/repositories or public IPv4 allocations. Some managed deletions take time. Check retained/scheduled-deletion Secrets Manager secrets and state-backend resources separately; Terraform destroy does not automatically delete a separately managed state bucket. AWS-created service-linked IAM roles can also remain; these may be shared by other workloads, so do not delete them indiscriminately.
6. Delete the **deployment-only** Neon project/databases separately in Neon if no longer needed. Terraform does not own them.
7. Log out of SSO (`aws sso logout`, which clears cached sessions across profiles), log out from ECR, unset the password environment variable, and remove local configuration/secret files only after any needed recovery/cleanup is complete. Keep state/backups encrypted until teardown is verified; deleting local state is not deleting AWS infrastructure.

```bash
docker logout "$ECR_REGISTRY"
unset TF_VAR_mq_password
# Review paths before removing .aws-local/ or local state files.
```

## Compatibility notes and sources

Read-only review found that user, credit and order use `aio_pika.connect_robust`, durable named queues, publisher confirms and per-consumer prefetch. Supplier connects with the same client and publishes to a fanout exchange. AMQPS URLs are supported by aio-pika; retain certificate verification. There is no hardcoded plaintext-only client transport in these entry points. This is a compatibility assessment, **not a live Amazon MQ connectivity test**.

Amazon MQ RabbitMQ 4.2 defaults unspecified queue types to quorum and has a quorum redelivery limit of 20; review this operational behavior when choosing an engine. The app's durable queue declarations are compatible in shape, but no live engine migration/delivery-limit experiment is claimed. The broker is new and disposable, not an in-place migration of your development queue data.

- [AWS: Configuring IAM Identity Center authentication with the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html)
- [AWS: RabbitMQ 4.2 compatibility and default queue behavior](https://docs.aws.amazon.com/amazon-mq/latest/developer-guide/rabbitmq-42.html)
- [AWS: RabbitMQ broker instance types and mq.t3.micro deprecation](https://docs.aws.amazon.com/amazon-mq/latest/developer-guide/rmq-broker-instance-types.html)
- [aio-pika: AMQP/AMQPS URL parameters](https://docs.aio-pika.com/url-parameters.html)
- [AWS: ECS service discovery](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-discovery.html)
- [AWS: ECS target-tracking scaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/target-tracking-create-policy.html)

`deploy/README.md` is an older user-owned draft and may describe self-hosted RabbitMQ / `.env` delivery. This guide describes the agreed AWS deployment: Amazon MQ and Secrets Manager. That draft has intentionally not been overwritten.
