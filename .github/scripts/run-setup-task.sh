#!/usr/bin/env bash
set -euo pipefail

name=${1:?Usage: run-setup-task.sh admin-init|supplier-seed}
repository_root=$(cd "$(dirname "$0")/../.." && pwd)
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
terraform -chdir="$repository_root/infra/terraform/environments/prod" output -json deployment > "$work_dir/deployment.json"

jq -e --arg name "$name" '.setup_tasks[$name] // error("Unknown setup task: " + $name)' \
  "$work_dir/deployment.json" > "$work_dir/setup.json"
cluster=$(jq -er '.cluster' "$work_dir/deployment.json")
AWS_REGION=$(jq -er '.region' "$work_dir/deployment.json")
export AWS_REGION
service=$(jq -er '.service' "$work_dir/setup.json")
revision=$(aws ecs describe-services --cluster "$cluster" --services "$service" \
  --query 'services[0].taskDefinition' --output text)
aws ecs describe-task-definition --task-definition "$revision" > "$work_dir/service.json"

image=$(jq -er --arg service "$service" '.taskDefinition.containerDefinitions[] | select(.name == $service) | .image' "$work_dir/service.json")
jq --arg image "$image" '.task_definition | .containerDefinitions[0].image = $image' \
  "$work_dir/setup.json" > "$work_dir/task-definition.json"
revision=$(aws ecs register-task-definition --cli-input-json "file://$work_dir/task-definition.json" \
  --query 'taskDefinition.taskDefinitionArn' --output text)
container=$name
log_group=$(jq -er '.containerDefinitions[0].logConfiguration.options["awslogs-group"]' "$work_dir/task-definition.json")
aws ecs run-task --cluster "$cluster" --task-definition "$revision" > "$work_dir/task.json"
jq '{tasks: [.tasks[].taskArn], failures}' "$work_dir/task.json"
task=$(jq -er '.tasks[0].taskArn' "$work_dir/task.json")
echo "$name logs: $log_group; task $task"
aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task"
aws ecs describe-tasks --cluster "$cluster" --tasks "$task" > "$work_dir/result.json"
jq '.tasks[] | {taskArn, stoppedReason, containers: [.containers[] | {name, exitCode, reason}]}' "$work_dir/result.json"
jq -e --arg container "$container" '[.tasks[0].containers[] | select(.name == $container) | .exitCode] == [0]' "$work_dir/result.json" >/dev/null
echo "$name completed."
