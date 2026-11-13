# Terraform state and operations

This directory is the main Terraform root module for the FoC infrastructure (VPC, the EC2 k3s node and its Elastic IP, IAM roles, the backups and photos S3 buckets, and the autostop/budget automation).

## Where state lives

State is stored remotely in an S3 bucket, not on any laptop.

- Bucket: `cs3219-g31-foc-tfstate-986918902548` (region `ap-southeast-1`).
- Key: `foc/terraform.tfstate`.
- The backend is declared in [`versions.tf`](versions.tf). Backend blocks cannot use variables, so the bucket name is written literally there and here.

The bucket is created once by the bootstrap module in [`../terraform-bootstrap`](../terraform-bootstrap), which keeps its own trivial local state.
See [that module's notes](#bootstrap-module) below.

### The state file is sensitive

Terraform state contains the AWS account ID, Elastic and private IPs, resource IDs, and other infrastructure detail.
Never commit a `*.tfstate` file, and never paste state (or its contents) into chat, issues, or PRs.
`infra/.gitignore` already blocks `*.tfstate`, `*.tfstate.*`, and `.terraform/`.

## How locking works

The backend uses native S3 locking (`use_lockfile = true`), so there is no DynamoDB table.
While an operation holds the lock, Terraform writes a `foc/terraform.tfstate.tflock` object in the bucket; it is removed when the operation finishes.
If a run is killed and the lock is left behind, clear it with `terraform force-unlock <lock-id>`, and only when you are certain nobody else is applying.

## One-time migration runbook

Run this once, in order, to move from the old local state to the shared S3 backend.

1. Make sure nobody else is running Terraform against this stack.
2. Create the state bucket: `scripts/tf-state-bootstrap.sh`.
3. The teammate who holds the local `terraform.tfstate`: pull the latest `main`, then run `scripts/tf-state-migrate.sh` and confirm that `plan` shows no changes.
4. Everyone else: `terraform -chdir=infra/terraform init` (no `-migrate-state`), then `terraform -chdir=infra/terraform plan` should show no changes.

## Day-to-day usage

Authenticate with the project AWS SSO profile first.
The helper scripts default to `AWS_PROFILE=nusisb_IsbUsersPS-986918902548`; export your own profile name to override it.

```
export AWS_PROFILE=nusisb_IsbUsersPS-986918902548
aws sso login
terraform -chdir=infra/terraform init
terraform -chdir=infra/terraform plan
```

Before you `apply`, read the plan.
Confirm there are no `destroy` or `must be replaced` lines for `aws_instance.node`, `aws_eip.node`, or the IAM roles (`foc-instance`, `foc-scheduler`, `foc-budget-action`); replacing any of those would take the live deployment down.

## Recovery

Versioning is enabled on the state bucket, so a corrupted or bad state can be rolled back.
Restore a previous version of `foc/terraform.tfstate` from the bucket's object versions (via the S3 console or `aws s3api list-object-versions` / `get-object`), then re-run `plan` to confirm.
Noncurrent versions are expired after 90 days; current versions never expire.

To clear a stale lock, use `terraform force-unlock <lock-id>`, only when you are sure no one is applying.

## IAM permissions on the state bucket

A user who runs Terraform needs, on the state bucket:

- `s3:ListBucket` on `arn:aws:s3:::cs3219-g31-foc-tfstate-986918902548`.
- `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on `arn:aws:s3:::cs3219-g31-foc-tfstate-986918902548/foc/*`.

`DeleteObject` is required so Terraform can remove the `.tflock` object after an operation.
Our SSO role (`nusisb_IsbUsersPS-986918902548`) is expected to already have these.

## Bootstrap module

[`../terraform-bootstrap`](../terraform-bootstrap) creates only the state bucket, with versioning, SSE-S3 encryption, all public access blocked, `BucketOwnerEnforced` ownership, a policy denying non-TLS access, and `prevent_destroy`.
Its bucket name is computed from `aws_caller_identity`, so it is account-specific.

That module keeps local state on purpose: it manages a single bucket, and its state is trivial.
If its local state is ever lost, re-import the bucket rather than recreating it:

```
terraform -chdir=infra/terraform-bootstrap import aws_s3_bucket.tfstate cs3219-g31-foc-tfstate-986918902548
```
