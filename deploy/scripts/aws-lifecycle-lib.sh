#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Terra), date: 2026-11-06
# Scope: Generated implementation of AWS resource discovery and lifecycle helpers
# Author review: Verified correctness.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

stack_name="${1:-relay}"
aws_region="${AWS_REGION:-}"
[[ -n "$aws_region" ]] || { echo 'Set AWS_REGION before running this script.' >&2; exit 2; }
auth_stack="${AUTH_STACK:-relay-auth}"
storage_stack="${STORAGE_STACK:-relay-storage}"
edge_stack="${stack_name}-edge"
access_stack="${stack_name}-aws-access"
state_file="deploy/.${stack_name}-pause.env"
account_id="$(aws sts get-caller-identity --query Account --output text)"
aws_call() { aws --region "$aws_region" "$@"; }
confirm_lifecycle_action() {
  local answer
  if [[ ! -t 0 ]]; then
    echo 'An interactive terminal is required for confirmation. No changes were made.' >&2
    return 1
  fi
  if ! read -r -p 'Type CONFIRM to continue: ' answer || [[ "$answer" != CONFIRM ]]; then
    echo 'Confirmation not received. No changes were made.' >&2
    return 1
  fi
}
stack_exists() {
  local status
  status="$(aws_call cloudformation describe-stacks --stack-name "$1" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || true)"
  [[ -n "$status" && "$status" != DELETE_COMPLETE ]]
}
stack_output() {
  aws_call cloudformation describe-stacks --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text
}
resource_id() {
  aws_call cloudformation describe-stack-resource --stack-name "$stack_name" \
    --logical-resource-id "$1" --query StackResourceDetail.PhysicalResourceId --output text
}
stack_status() {
  aws_call cloudformation describe-stacks --stack-name "$1" --query 'Stacks[0].StackStatus' --output text
}
force_delete_failed_ecr() {
  local repo
  while IFS= read -r repo; do
    [[ -n "$repo" && "$repo" != None ]] || continue
    # Only repositories tracked as failed resources in this stack are removed.
    if aws_call ecr describe-repositories --repository-names "$repo" >/dev/null 2>&1; then
      aws_call ecr delete-repository --repository-name "$repo" --force >/dev/null
    fi
  done < <(aws_call cloudformation list-stack-resources --stack-name "$stack_name" \
    --query "StackResourceSummaries[?ResourceType=='AWS::ECR::Repository' && ResourceStatus=='DELETE_FAILED'].PhysicalResourceId" \
    --output text | tr '\t' '\n')
}
delete_stack() {
  local name="$1"
  stack_exists "$name" || return 0
  if [[ "$name" == "$stack_name" && "$(stack_status "$name")" == DELETE_FAILED ]]; then
    force_delete_failed_ecr
  fi
  aws_call cloudformation delete-stack --stack-name "$name"
  aws_call cloudformation wait stack-delete-complete --stack-name "$name"
}
empty_stack_ecr() {
  local repo digest
  while IFS= read -r repo; do
    [[ -n "$repo" && "$repo" != None ]] || continue
    while IFS= read -r digest; do
      [[ -n "$digest" && "$digest" != None ]] || continue
      aws_call ecr batch-delete-image --repository-name "$repo" \
        --image-ids "imageDigest=$digest" >/dev/null
    done < <(aws_call ecr list-images --repository-name "$repo" \
      --query 'imageIds[].imageDigest' --output text | tr '\t' '\n')
  done < <(aws_call cloudformation list-stack-resources --stack-name "$stack_name" \
    --query "StackResourceSummaries[?ResourceType=='AWS::ECR::Repository'].PhysicalResourceId" \
    --output text | tr '\t' '\n')
}
delete_ingress_and_wait() {
  local cluster alb_dns remaining
  cluster="$(stack_output "$stack_name" ClusterName)"
  aws_call eks update-kubeconfig --name "$cluster" >/dev/null
  alb_dns="$(kubectl -n relay get ingress relay -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)"
  kubectl -n relay delete ingress relay --ignore-not-found
  if [[ -n "$alb_dns" ]]; then
    for _ in $(seq 1 90); do
      remaining="$(aws_call elbv2 describe-load-balancers \
        --query "LoadBalancers[?DNSName=='$alb_dns'].LoadBalancerArn" --output text)"
      [[ -z "$remaining" || "$remaining" == None ]] && break
      sleep 10
    done
    [[ -z "$remaining" || "$remaining" == None ]] || {
      echo "ALB $alb_dns still exists; refusing to delete EKS yet." >&2; exit 1;
    }
  fi
  kubectl delete namespace relay --ignore-not-found --wait=false
}
# Capture only this stack's DB IDs before deletion, then resolve the final
# CloudFormation snapshots by those IDs after the stack is gone.
capture_db_ids() {
  local name
  for name in User Errand Credit Supplier; do
    printf -v "DB_$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')_ID" '%s' "$(resource_id "${name}Database")"
  done
}
latest_snapshot() {
  local snapshot
  snapshot="$(aws_call rds describe-db-snapshots --db-instance-identifier "$1" \
    --snapshot-type manual \
    --query 'sort_by(DBSnapshots[?Status==`available`],&SnapshotCreateTime)[-1].DBSnapshotIdentifier' \
    --output text)"
  [[ -n "$snapshot" && "$snapshot" != None ]] || {
    echo "No available snapshot for $1" >&2; return 1;
  }
  printf '%s' "$snapshot"
}
write_pending_state() {
  local name tmp id_var
  tmp="$(mktemp "${state_file}.XXXXXX")"
  chmod 600 "$tmp"
  {
    printf 'PAUSE_ACCOUNT_ID=%q\nPAUSE_REGION=%q\nPAUSE_STACK=%q\n' "$account_id" "$aws_region" "$stack_name"
    printf 'S3_BUCKET=%q\nSNAPSHOT_HISTORY=%q\n' "${S3_BUCKET:-}" "${SNAPSHOT_HISTORY:-}"
    for name in User Errand Credit Supplier; do
      id_var="DB_$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')_ID"
      printf '%s_DATABASE_ID=%q\n' "$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')" "${!id_var}"
    done
  } > "$tmp"
  mv -f -- "$tmp" "$state_file"
}
write_pause_state() {
  local name snapshot tmp
  tmp="$(mktemp "${state_file}.XXXXXX")"
  chmod 600 "$tmp"
  {
    printf 'PAUSE_ACCOUNT_ID=%q\nPAUSE_REGION=%q\nPAUSE_STACK=%q\n' "$account_id" "$aws_region" "$stack_name"
    printf 'S3_BUCKET=%q\nSNAPSHOT_HISTORY=%q\n' "${S3_BUCKET:-}" "${SNAPSHOT_HISTORY:-}"
    for name in User Errand Credit Supplier; do
      local id_var="DB_$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')_ID"
      printf '%s_DATABASE_ID=%q\n' "$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')" "${!id_var}"
      snapshot="$(latest_snapshot "${!id_var}")"
      printf '%s_DATABASE_SNAPSHOT_ID=%q\n' "$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')" "$snapshot"
    done
  } > "$tmp"
  mv -f -- "$tmp" "$state_file"
  printf 'Snapshot manifest: %s\n' "$state_file"
}
read_pending_state() {
  [[ -s "$state_file" ]] || { echo "Missing $state_file; cannot recover a partially deleted stack." >&2; exit 1; }
  # shellcheck disable=SC1090
  source "$state_file"
  [[ "$PAUSE_ACCOUNT_ID" == "$account_id" && "$PAUSE_REGION" == "$aws_region" && "$PAUSE_STACK" == "$stack_name" ]] || {
    echo 'Pause manifest belongs to a different account, region, or stack.' >&2; exit 1;
  }
  for name in USER ERRAND CREDIT SUPPLIER; do
    local key="${name}_DATABASE_ID"
    [[ -n "${!key:-}" ]] || { echo "Missing $key in pause manifest." >&2; exit 1; }
    printf -v "DB_${name}_ID" '%s' "${!key}"
  done
}
read_pause_state() {
  [[ -s "$state_file" ]] || { echo "Missing $state_file; cannot identify retained snapshots." >&2; exit 1; }
  # This local file is written by write_pause_state and contains shell-escaped values.
  # shellcheck disable=SC1090
  source "$state_file"
  [[ "$PAUSE_ACCOUNT_ID" == "$account_id" && "$PAUSE_REGION" == "$aws_region" && "$PAUSE_STACK" == "$stack_name" ]] || {
    echo 'Pause manifest belongs to a different account, region, or stack.' >&2; exit 1;
  }
  for name in USER ERRAND CREDIT SUPPLIER; do
    local key="${name}_DATABASE_SNAPSHOT_ID"
    [[ -n "${!key:-}" ]] || { echo "Missing $key in pause manifest." >&2; exit 1; }
  done
}
# Keep the distribution and domain, but stop serving requests while its origin is absent.
pause_edge() {
  if stack_exists "$edge_stack"; then
    printf 'Disabling CloudFront distribution in %s while preserving its domain.\n' "$edge_stack"
    aws_call cloudformation deploy --stack-name "$edge_stack" \
      --template-file infra/relay-cloudfront.yaml \
      --parameter-overrides DistributionEnabled=false
  fi
}
# Removes all active resources in the EKS stack; Snapshot policies preserve DB data.
pause_compute() {
  pause_edge
  delete_stack "${stack_name}-gateway"
  if stack_exists "$stack_name" && [[ "$(stack_status "$stack_name")" == DELETE_FAILED ]]; then
    read_pending_state
    delete_stack "$access_stack"
    delete_stack "$stack_name"
    write_pause_state
  elif stack_exists "$stack_name"; then
    # Keep prior snapshots identifiable through repeated pause/resume cycles.
    SNAPSHOT_HISTORY=""
    if [[ -s "$state_file" ]]; then
      read_pause_state
      SNAPSHOT_HISTORY="${SNAPSHOT_HISTORY:-} ${USER_DATABASE_SNAPSHOT_ID} ${ERRAND_DATABASE_SNAPSHOT_ID} ${CREDIT_DATABASE_SNAPSHOT_ID} ${SUPPLIER_DATABASE_SNAPSHOT_ID}"
    fi
    capture_db_ids
    S3_BUCKET="$(stack_output "$storage_stack" BucketName)"
    write_pending_state
    delete_ingress_and_wait
    empty_stack_ecr
    delete_stack "$access_stack"
    delete_stack "$stack_name"
    write_pause_state
  else
    delete_stack "$access_stack"
    read_pause_state
  fi
}