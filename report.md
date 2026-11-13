# AWS coursework deployment implementation report

**Branch:** `feat/aws-demo-deployment`

**Implementation status:** Complete. Terraform, folder-local AWS setup and deployment instructions are implemented, independently reviewed, and locally validated. This is ready for your account-specific plan review, not a claim of a working live deployment.

**Deployment status:** No AWS resources have been provisioned, no credentials have been read, and no live AWS/Neon connectivity checks have been performed by the coding agent.

## Delivered

- Terraform under `deploy/terraform/`: six ECR repositories, four empty secret containers, separate Fargate services, private Cloud Map discovery, direct-port ALB routing, private Amazon MQ, per-service execution roles, seven-day logs, dashboard, and optional selected-backend scaling bounded to 1–3 tasks. Runtime infrastructure and application startup are separate explicit phases.
- `deploy/aws-env.sh`: a source-only Bash helper selecting a **repository-local** `foc-demo` AWS profile, clearing ambient credential/region/endpoint overrides and disabling EC2 metadata fallback.
- `deploy/tests/test_aws_env.py`: six credential-free helper tests. These are deployment-helper tests, not the excluded expiry-worker tests.
- `deploy/AWS.md`: numbered setup, secret preparation, image publishing, deployment, scaling and teardown instructions.
- Existing expiry-worker implementation is unchanged. Its concurrency behavior is an accepted demo non-blocker; no worker extraction, leader election or proposed expiry/concurrency/recovery test suite was added.
- Existing user-owned `deploy/README.md` is preserved. It may describe older self-hosted RabbitMQ / `.env` ideas; use `deploy/AWS.md` for this AWS deployment.

## Local verification

| Check | Result |
| --- | --- |
| `bash -n deploy/aws-env.sh` | Passed |
| `python -m unittest discover -s deploy/tests -v` | Passed: 6 tests |
| Runbook code-block syntax check | Passed: 15 Bash blocks (`bash -n`) and 4 Python snippets (`compile`); deployment commands not executed |
| Helper red/green checks | Original four tests failed before implementation, then passed; endpoint-isolation and legacy-credential-fallback regressions also failed before their fixes, then passed |
| `terraform -chdir=deploy/terraform init -backend=false -input=false -lockfile=readonly` | Passed; installed/locked AWS provider 6.71.0 |
| `terraform -chdir=deploy/terraform fmt -check -recursive` | Passed |
| `terraform -chdir=deploy/terraform validate` | Passed |
| `terraform -chdir=deploy/terraform test` | Passed: 8 mock-provider plan runs, 0 failures |
| Git ignore checks | Local credentials/secrets, Python caches, Terraform cache/state/plans/tfvars ignored; example tfvars and provider lock remain trackable |
| AWS account/deployment / image builds / Neon / broker connectivity | Not performed; require your credentials and explicit deployment actions |

The helper tests source it from another working directory, verify absolute folder-local paths, neutralize ambient credential/region/custom-endpoint overrides and legacy credential fallback, verify the source-only usage error, and check it does not print supplied sentinel credentials. No test needs actual AWS credentials.

## Your next steps

Follow **`deploy/AWS.md` in order**. The important phases are:

1. From the repository root in Bash, run `source deploy/aws-env.sh`. Use the guide's masked Python prompts to create ignored `.aws-local/config` and `.aws-local/credentials`, including the session token for temporary AWS credentials. These do not overwrite `~/.aws`.
2. Run `aws sts get-caller-identity` yourself and verify the intended coursework account before provisioning anything. Choose matching CLI/Terraform region and explicit source CIDRs for your laptop/professor/load generator.
3. Create fresh Neon deployment databases/users. Keep database URLs out of Git, Terraform input files, chat and screenshots.
4. Copy the Terraform example to ignored `terraform.tfvars`. Bootstrap only ECR and empty secret containers first.
5. Build/push six images with a new immutable tag using the guide's tracked Git archive build contexts. This avoids baking working-directory `.env` files into images, including supplier service's current insufficient `.dockerignore` rules.
6. Supply the broker password through a masked prompt into `TF_VAR_mq_password`. Enable runtime infrastructure with **`start_services = false`** so the private broker endpoint can be obtained without starting tasks with incomplete secrets.
7. Use masked prompts to prepare ignored per-service JSON secrets and upload them to Secrets Manager. They contain Neon URLs, a URL-encoded AMQPS URL, and the user service's signing/initial-admin configuration.
8. Set `start_services = true`, review/apply the new plan, and perform the documented UI/Swagger/business-flow checks. Only then calibrate optional request-count scaling on a direct backend listener.
9. Destroy the reviewed demo resources when finished; remove external Neon resources and revoke credentials separately. Do not delete local state before confirming AWS teardown.

## Where configuration and secrets live

| Setting | Location |
| --- | --- |
| AWS profile and temporary session token | Ignored repository-root `.aws-local/config` and `.aws-local/credentials` |
| Region, allowed source CIDRs, release tag, phase switches, scaling threshold | Ignored `deploy/terraform/terraform.tfvars`, based on the committed example |
| Application secret JSON preparation | Ignored `.aws-local/secrets/<service>.json` with mode 0600; then AWS Secrets Manager |
| Broker password supplied to Terraform | Current shell `TF_VAR_mq_password`; also persisted in state/saved plans because the installed provider has no write-only MQ password field |
| Actual application secret delivery | ECS task-start injection from Secrets Manager, not deployed `.env` files |
| Terraform local state, backups, cache and saved plans | Gitignored; protect filesystem access and encryption; one operator at a time |

**Folder-local is explicit, not automatic:** sourcing changes the current shell. Changing directories does not restore its previous AWS environment. Use a dedicated terminal/subshell and exit it afterwards. Profile files are plaintext at rest; gitignore alone does not secure them.

## Limitations and cost/security decisions

- Direct backend public ports are deliberate, source-CIDR restricted, and do not remove application authentication. The UI remains on port 80. Use the ALB hostname, not fixed IPs.
- HTTP is unencrypted. Use disposable credentials/data only, or add a domain and TLS before sending sensitive data.
- The MQ console is not public; laptop connectivity to private AMQPS is not expected. ECS backends connect within the VPC. Broker general logging is disabled to avoid unmanaged, indefinitely retained log groups; ECS application logs retain seven days.
- Amazon MQ 4.2 defaults unspecified queue types to quorum and has a default quorum redelivery limit of 20. Read-only review found compatible durable queue shapes and aio-pika AMQPS support, but no live broker compatibility test was performed.
- `mq.t3.micro` is deprecated/unavailable for new brokers. Review `mq.m7g.medium` and the selected engine in the intended region before applying; managed MQ is not assumed free-tier.
- At-least-once delivery, database/downstream bottlenecks, broker outages and finite Neon connection limits still exist. Request-count scaling does not prove a performance improvement without measurement.
- ECS copies secret values at startup. Secret rotation requires restarting affected tasks; existing containers do not automatically refresh injected values.
- Secrets Manager uses a deletion recovery window, so scheduled-deletion secrets can remain after destroy. Nonempty ECR repositories need deliberate image cleanup or reviewed `force_delete_images` enablement. Separately managed state storage and Neon resources are outside normal Terraform destroy.

## Integration review notes

- Runbook matches the additional `start_services` switch needed to break the broker-endpoint/secret/task-start dependency cycle.
- Initial admin keys are `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`; signing key is `ACCESS_TOKEN_SECRET`, not `JWT_SECRET`.
- Supplier requires an explicit asynchronous psycopg driver URL (`postgresql+psycopg://...`). The guide normalizes Neon URLs and requires TLS.
- Runbook variable/output names match the implementation. Local ignore rules were verified to protect credential/secret files, real tfvars, state/plans, Terraform cache and Python caches while retaining example tfvars and the provider lock file.
- Independent infrastructure review found no critical wiring/security defects. Its broker-log lifecycle finding was resolved by disabling unmanaged general logs, with a mock-plan regression assertion observed failing before the fix and passing afterwards.
- Broker credentials in Terraform initialize a new broker; changing the password variable is not a rotation procedure. The runbook now states this explicitly and warns against indiscriminate cleanup of shared AWS-created service-linked roles.
- Infrastructure-only mock checks do not demonstrate a successful AWS deployment, container build, Neon connection, broker connection, or scaling experiment. Those remain explicit operator steps in `deploy/AWS.md`.
