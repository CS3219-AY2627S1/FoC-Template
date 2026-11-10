# AWS Coursework Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver locally validated Terraform and an actionable, folder-local AWS deployment runbook without provisioning resources.

**Architecture:** Independent Fargate services behind direct ALB listeners; internal Cloud Map DNS; private managed RabbitMQ; externally supplied Neon databases. Bootstrap repositories and empty secrets before runtime creation. Application secrets are uploaded outside Terraform.

**Tech Stack:** Terraform >=1.11, AWS provider 6.x, AWS CLI v2, Docker, Bash, Python standard-library tests.

## Global Constraints

- Public listeners: 80 -> UI:80; 5005 -> user:5005; 3001 -> supplier:3001; 3002 -> credit:3002; 3003 -> order:3002.
- No AWS apply, account inspection, credentials access, or other AWS mutations during implementation.
- Expiry worker is unchanged and a non-blocker; no proposed expiry/concurrency/recovery tests.
- Preserve the untracked user-owned deploy/README.md.
- Folder-local credentials, secrets, Terraform state/plans/caches and real tfvars are gitignored. Commit provider lock file.
- One initial task each; optional selected-backend request-count scaling with bounds 1–3.
- Use immutable image tags, matching x86_64 Fargate runtime, seven-day log retention, private AMQPS, and explicitly configured public source CIDRs.

## File and interface contract

Infrastructure lives in deploy/terraform/{versions,providers,variables,networking,ecr,iam,secrets,mq,ecs,discovery,load_balancer,autoscaling,monitoring,outputs}.tf with terraform.tfvars.example and tests/deployment.tftest.hcl.

Variables: aws_region (ap-southeast-1 default), project_name (foc-demo default), allowed_ingress_cidrs (required), deploy_runtime (false default), start_services (false default; start only after broker endpoint and secrets exist), image_tag (release tag required for runtime), mq_username (focdemo default), mq_password (sensitive; supplied via TF_VAR_mq_password), mq_engine_version and mq_instance_type (document current compatibility and allow overrides), autoscaling_service (supplier default), autoscaling_enabled (false default), requests_per_target (positive number, configurable after measurement).

Six image/service keys: ui, internal-gateway, user, supplier, credit, order. Build contexts: ui/, internal-gateway/, user-service/, supplier-service/, credit-service/, order-service/. Each backend gets an empty Secrets Manager secret; its JSON is injected with per-key ECS secret references. User requires DATABASE_URL, RABBITMQ_URL, ACCESS_TOKEN_SECRET, INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD. Other backends require DATABASE_URL and RABBITMQ_URL. The upload process must use the provisioned MQ endpoint and credentials, with URL encoding.

Outputs: ecr_repository_urls (map), secret_arns (backend-keyed map), cluster_name, service_names, alb_url, documentation_urls (backend-keyed map), rabbitmq_endpoint, aws_region. Runtime-only outputs are null/empty during bootstrap.

Folder-local shell interface: `source deploy/aws-env.sh` exports AWS_CONFIG_FILE and AWS_SHARED_CREDENTIALS_FILE under repository-root .aws-local/, AWS_PROFILE=foc-demo, and disables EC2 credential fallback. No credential values are written by this helper. It must reject/neutralize ambient credential overrides rather than silently use another account. Documentation explains sourcing changes the current shell, reopening/re-sourcing for other folders, and ephemeral-token setup.

## Task 1: Infrastructure configuration

**Files:** deploy/terraform/*.tf, deploy/terraform/terraform.tfvars.example, deploy/terraform/tests/deployment.tftest.hcl, .gitignore.

**Consumes:** approved design and contracts above. **Produces:** validated bootstrap/runtime plans, outputs consumed by deployment instructions.

- [x] Write mock-provider plan tests first for public listener mappings, bootstrap resource omission, secrets injection, runtime architecture, private broker, and bounded optional autoscaling. Run `terraform -chdir=deploy/terraform test` and observe missing implementation failures before implementing configuration.
- [x] Add provider/version declarations and initialize via `terraform -chdir=deploy/terraform init -backend=false`.
- [x] Inspect the installed AWS provider schema for MQ credentials and configuration support. Prefer supported write-only credentials; if unavailable explicitly document state exposure.
- [x] Implement the flat root using shared service metadata, empty external-populated secrets, least-scoped execution roles, and no application task-role permissions.
- [x] Gate all billable runtime resources with deploy_runtime; bootstrap creates only ECR repositories and secret containers. Require a real release tag and valid broker password for runtime through preconditions/validation.
- [x] Run `terraform -chdir=deploy/terraform fmt -check -recursive`, `terraform -chdir=deploy/terraform validate`, and `terraform -chdir=deploy/terraform test`; expected: all pass without credentials or AWS API calls.

## Task 2: Folder-local credentials and deployment handoff

**Files:** deploy/aws-env.sh, deploy/tests/test_aws_env.py, deploy/AWS.md, report.md.

**Consumes:** file/output/variable contracts above. **Produces:** tested local AWS isolation and safe end-to-end deployment instructions.

- [x] Write Python standard-library subprocess tests first: source helper from another working directory, assert credential paths resolve to this repository; ambient static credentials do not override the selected profile; running the helper without sourcing explains correct usage; no secret contents are printed. Run `python -m unittest discover -s deploy/tests -v`; expected initial failures because helper is absent.
- [x] Implement the source-only Bash helper and ignored .aws-local/ credential/config file setup procedure without creating actual credentials.
- [x] Verify actual service environment variables and current Amazon MQ/RabbitMQ client compatibility by reading repository code and AWS/provider documentation. Report deployment compatibility limitations without editing application behavior.
- [x] Write exact numbered instructions for local AWS configuration/session token support, identity verification, fresh Neon databases/TLS, getpass-based secret JSON preparation, ECR image build/push, phased plan/apply, smoke checks, optional scaling measurement, and teardown. Avoid putting secret values on command lines or in shell history. Warn that MQ password is stored in Terraform state if provider lacks write-only support.
- [x] Run shell syntax checks and the local helper tests. Record exact evidence and unperformed AWS/live checks in report.md. Do not claim a successful deployment.

## Task 3: Integration and review

**Files:** README.md, report.md, new deployment files as needed.

- [x] Link deploy/AWS.md from root README without overwriting the existing full-cutover warning.
- [x] Review implementation against the design and local runbook against actual variable/output names. Resolve discrepancies and unsafe bootstrap/destruction instructions.
- [x] Run all local Terraform/helper validations together and `git diff --check`. Check example credentials/state/plans are ignored while example tfvars and lock file are not.
- [x] Update report.md with branch, completed deliverables, exact verification outcomes, required user inputs, cost/security limitations, and no-resource-provisioned status.

## Progress

- Task 1: complete. Provider 6.71.0 schema confirms MQ password is sensitive but persisted in state (no write-only field). Eight mock-provider plan runs pass; fmt/validate pass. Added start_services=false phase to provision the MQ endpoint before populating application secrets and starting ECS.
- Task 2: complete. Folder-local AWS helper passes six credential-free tests, including endpoint-isolation and legacy-credential-fallback regressions. Bash syntax and all runbook Bash/Python snippets pass syntax checks. Deployment guide/report cover phased startup, tracked image builds, masked secret handling, Neon and teardown.
- Task 3: complete. Root README links the runbook/report; all eight Terraform mock runs and six helper tests pass. All 15 Bash blocks and four Python snippets in the guide pass syntax checks. Ignore rules verified. Independent Terraform review found no critical wiring/security defects; its broker-log lifecycle finding was resolved by disabling general logging with a red/green regression assertion. No AWS provisioning or application/expiry tests performed.
