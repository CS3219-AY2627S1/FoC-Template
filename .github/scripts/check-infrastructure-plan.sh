#!/usr/bin/env bash
set -euo pipefail

plan=${1:?Usage: check-infrastructure-plan.sh plan.json}
: "${AWS_REGION:?Set AWS_REGION to the deployment region}"
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
jq -er '.planned_values.outputs.required_ssm_parameters.value[]' "$plan" > "$work_dir/parameters"
jq -r '.resource_changes[]? | select(.type == "aws_sqs_queue" and (.change.actions | index("delete"))) | .change.before.url' "$plan" > "$work_dir/queues"
while IFS= read -r parameter; do
  type=$(aws ssm describe-parameters --parameter-filters "Key=Name,Option=Equals,Values=$parameter" \
    --query 'Parameters[0].Type' --output text)
  [[ "$type" == SecureString ]] || { echo "Create $parameter as a SecureString before deploying." >&2; exit 1; }
done < "$work_dir/parameters"

while IFS= read -r queue; do
  counts=$(aws sqs get-queue-attributes --queue-url "$queue" \
    --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible ApproximateNumberOfMessagesDelayed \
    --query Attributes --output json)
  jq -e 'length == 3 and all(.[]; tonumber == 0)' <<< "$counts" >/dev/null || {
    echo "Refusing to remove a nonempty queue: $queue" >&2
    exit 1
  }
done < "$work_dir/queues"
