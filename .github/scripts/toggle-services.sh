#!/usr/bin/env bash
set -euo pipefail

action=${1:?Usage: toggle-services.sh start|stop}
case "$action" in
  start) count=1 ;;
  stop) count=0 ;;
  *) echo 'Expected start or stop.' >&2; exit 1 ;;
esac

repository_root=$(cd "$(dirname "$0")/../.." && pwd)
cluster=$(terraform -chdir="$repository_root/infra/terraform/environments/prod" output -json deployment | jq -er '.cluster')
services=()
while IFS= read -r service; do
  services+=("$service")
done < <(aws ecs list-services --cluster "$cluster" --query 'serviceArns[]' --output json | jq -r '.[] | split("/")[-1]')
[[ ${#services[@]} -gt 0 ]] || { echo "No ECS services found in $cluster." >&2; exit 1; }
for service in "${services[@]}"; do
  aws ecs update-service --cluster "$cluster" --service "$service" \
    --desired-count "$count" --output json > /dev/null
done

aws ecs wait services-stable --cluster "$cluster" --services "${services[@]}"
aws ecs describe-services --cluster "$cluster" --services "${services[@]}" \
  --query 'services[].{Service:serviceName,Desired:desiredCount,Running:runningCount}' \
  --output table

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "Requested **$action** for all discovered services in **$cluster**; services are stable." >> "$GITHUB_STEP_SUMMARY"
fi
