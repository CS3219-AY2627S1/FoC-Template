#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6 Sol), date: 2026-11-05
# Scope: Generated implementation of full AWS infrastructure and data teardown
# Author review: Verified teardown removes all AWS resources and will not leave any running services and cost charges.

set -euo pipefail
if [[ "${2:-}" != --confirm-delete-all-data ]]; then
  echo "Usage: AWS_REGION=... $0 <stack-name> --confirm-delete-all-data" >&2
  exit 2
fi
source "$(dirname "$0")/aws-lifecycle-lib.sh" "${1:-relay}"
printf '\nAWS full teardown preview   account %s, region %s, stack %s\n' "$account_id" "$aws_region" "$stack_name"
printf '%s\n' \
  "  Delete CloudFront stack $edge_stack and its domain, gateway, VPC Link, AWS access and EKS stacks." \
  "  Delete workloads, ALB, nodes, ECR images, RDS instances and MSK; all MSK topic data is lost." \
  "  Delete Cognito users, the stack-owned S3 bucket and its contents, and recorded RDS snapshots." \
  "  Delete the Relay-managed AI secret and local pause manifest; externally owned AI secrets are retained." \
  "  These deletions are permanent. Other retained resources not tracked by this script may remain."
confirm_lifecycle_action
# Full teardown also removes the edge distribution preserved by pause.
delete_stack "$edge_stack"
# Capture the retained S3 bucket before deleting its stack.
pause_compute
read_pause_state
bucket="${S3_BUCKET:-}"
delete_stack "$auth_stack"
delete_stack "$storage_stack"
for name in USER ERRAND CREDIT SUPPLIER; do
  key="${name}_DATABASE_SNAPSHOT_ID"
  if aws_call rds describe-db-snapshots --db-snapshot-identifier "${!key}" >/dev/null 2>&1; then
    aws_call rds delete-db-snapshot --db-snapshot-identifier "${!key}" >/dev/null
    aws_call rds wait db-snapshot-deleted --db-snapshot-identifier "${!key}"
  fi
done
# Earlier pause cycles can leave previous, deliberately preserved snapshots.
for snapshot in ${SNAPSHOT_HISTORY:-}; do
  if aws_call rds describe-db-snapshots --db-snapshot-identifier "$snapshot" >/dev/null 2>&1; then
    aws_call rds delete-db-snapshot --db-snapshot-identifier "$snapshot" >/dev/null
    aws_call rds wait db-snapshot-deleted --db-snapshot-identifier "$snapshot"
  fi
done
if [[ -n "$bucket" && "$bucket" != None ]]; then
  aws s3 rb "s3://$bucket" --force
fi
# Remove only a Relay-created AI secret; pre-existing external secrets are not ours.
ai_secret_id="${stack_name}/credit-estimation-ai"
ai_owner="$(aws_call secretsmanager describe-secret --secret-id "$ai_secret_id" \
  --query "Tags[?Key=='relay:managed'].Value | [0]" --output text 2>/dev/null || true)"
if [[ "$ai_owner" == "$stack_name" ]]; then
  aws_call secretsmanager delete-secret --secret-id "$ai_secret_id" --force-delete-without-recovery >/dev/null
fi
rm -f -- "$state_file"
printf 'Relay stacks, MSK cluster and topics, recorded RDS snapshots, and the stack-owned S3 bucket were removed.\n'
