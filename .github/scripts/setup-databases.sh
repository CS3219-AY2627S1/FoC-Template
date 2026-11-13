#!/usr/bin/env bash
set -euo pipefail
umask 077

deployment_file=$1
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

prefix=$(jq -er '.parameter_prefix' "$deployment_file")
secret_file="$work_dir/database-password.json"
cluster=$(jq -er '.cluster' "$deployment_file")
capacity_provider=$(jq -er '.core_capacity_provider' "$deployment_file")
log_group=$(jq -er '.bootstrap_log_group' "$deployment_file")

echo "Bootstrap logs: $log_group"

# Host preparation installs packages before the ECS agent registers.
for attempt in $(seq 1 30); do
  hosts=$(aws ecs list-container-instances --cluster "$cluster" --status ACTIVE --query 'length(containerInstanceArns)' --output text)
  if [ "$hosts" -gt 0 ]; then break; fi

  if [ "$attempt" -eq 30 ]; then
    echo 'Core host did not register. Inspect host-prepare and /var/log/host-bootstrap.log through SSM.' >&2
    exit 1
  fi

  sleep 20
done

jq -r '.databases | keys[]' "$deployment_file" > "$work_dir/services"
while IFS= read -r service; do
  parameter="$prefix-database-$service"
  count=$(aws ssm describe-parameters --parameter-filters "Key=Name,Option=Equals,Values=$parameter" --query 'length(Parameters)' --output text)

  if [ "$count" -eq 0 ]; then
    aws secretsmanager get-random-password --password-length 32 --exclude-punctuation |
      jq --arg name "$parameter" '{Name: $name, Type: "SecureString", Value: .RandomPassword}' > "$secret_file"

    aws ssm put-parameter --cli-input-json "file://$secret_file" >/dev/null
    rm "$secret_file"
    echo "Created $parameter"
  else
    echo "Preserving $parameter"
  fi

  task_definition=$(jq -er --arg service "$service" '.bootstrap_tasks[$service]' "$deployment_file")
  echo "Setting up database for $service"

  aws ecs run-task --cluster "$cluster" --task-definition "$task_definition" \
    --capacity-provider-strategy "capacityProvider=$capacity_provider,weight=1" \
    --count 1 > "$work_dir/bootstrap-task.json"

  if ! jq -e '.failures | length == 0' "$work_dir/bootstrap-task.json" >/dev/null; then
    jq '.failures' "$work_dir/bootstrap-task.json" >&2
    exit 1
  fi

  task=$(jq -er '.tasks[0].taskArn' "$work_dir/bootstrap-task.json")
  echo "Bootstrap task: $task"

  aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task"
  aws ecs describe-tasks --cluster "$cluster" --tasks "$task" > "$work_dir/bootstrap-result.json"

  jq '.tasks[] | {taskArn, stoppedReason, containers: [.containers[] | {name, exitCode, reason}]}' "$work_dir/bootstrap-result.json"

  if ! jq -e '.tasks[0].containers[0].exitCode == 0' "$work_dir/bootstrap-result.json" >/dev/null; then
    stream="bootstrap/database-bootstrap/${task##*/}"
    aws logs get-log-events --log-group-name "$log_group" --log-stream-name "$stream" --query 'events[].message' --output text
    exit 1
  fi
done < "$work_dir/services"
