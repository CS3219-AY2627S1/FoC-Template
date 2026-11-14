#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
# Scope: ECS Fargate CD deploy step, per docs/ecs-fargate-session-prompt.md Phase 3. No requirements,
#        architecture, schema, or API decisions were made by the AI tool.
# Author review: George Yeo
#
# Points one ECS service at a new image: fetch its current task definition, swap only the image,
# register it, update the service, and wait for it to settle. Secrets and env stay in AWS.
#
# Usage: ecs-deploy.sh <ecs-service> <ecr-repository>
# Env:   AWS_REGION, ECS_CLUSTER, IMAGE_TAG, SELECTED_SERVICES ("all" or a comma-separated list)
set -euo pipefail

service="$1"
repository="$2"

report() {
  echo "$1"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    echo "- **${service}:** $1" >>"$GITHUB_STEP_SUMMARY"
  fi
}

# A leading "::notice" or "::error" makes GitHub show the message on the run page.
skip() {
  echo "::notice title=${service} not deployed::$1"
  report "not deployed. $1"
  exit 0
}

fail() {
  echo "::error title=${service} deploy failed::$1"
  report "FAILED. $1"
  exit 1
}

selected="$(echo "${SELECTED_SERVICES:-all}" | tr -d '[:space:]')"
if [ "$selected" != "all" ]; then
  case ",${selected}," in
    *",${service},"*) ;;
    *) skip "Not in the selected services." ;;
  esac
fi

workdir="$(mktemp -d)"

if ! aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$service" --output json \
  >"$workdir/service.json" 2>"$workdir/service.err"; then
  if grep -q ClusterNotFoundException "$workdir/service.err"; then
    skip "ECS cluster ${ECS_CLUSTER} doesn't exist yet. The image was still pushed."
  fi
  cat "$workdir/service.err" >&2
  fail "Could not read the service."
fi

status="$(jq -r '.services[0].status // "MISSING"' "$workdir/service.json")"
if [ "$status" != "ACTIVE" ]; then
  skip "The service doesn't exist yet (status: ${status}). The image was still pushed."
fi

current_definition="$(jq -r '.services[0].taskDefinition' "$workdir/service.json")"
desired_count="$(jq -r '.services[0].desiredCount' "$workdir/service.json")"

account="$(aws sts get-caller-identity --query Account --output text)"
image_base="${account}.dkr.ecr.${AWS_REGION}.amazonaws.com/${repository}"
image="${image_base}:${IMAGE_TAG}"

aws ecs describe-task-definition --task-definition "$current_definition" \
  --query taskDefinition --output json >"$workdir/current.json"

matches="$(jq --arg base "$image_base" \
  '[.containerDefinitions[] | select(.image | startswith($base + ":") or startswith($base + "@"))] | length' \
  "$workdir/current.json")"
if [ "$matches" != "1" ]; then
  fail "Expected 1 container using ${repository} in ${current_definition}, found ${matches}."
fi

# The read-only fields describe-task-definition returns aren't accepted when registering.
jq --arg base "$image_base" --arg image "$image" '
  del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities,
      .registeredAt, .registeredBy, .deregisteredAt)
  | .containerDefinitions |= map(
      if (.image | startswith($base + ":") or startswith($base + "@"))
      then .image = $image else . end)
' "$workdir/current.json" >"$workdir/new.json"

new_definition="$(aws ecs register-task-definition --cli-input-json "file://$workdir/new.json" \
  --query taskDefinition.taskDefinitionArn --output text)"

aws ecs update-service --cluster "$ECS_CLUSTER" --service "$service" \
  --task-definition "$new_definition" --query service.serviceName --output text >/dev/null

if [ "$desired_count" = "0" ]; then
  echo "::notice title=${service} scaled to 0::Updated to ${IMAGE_TAG}, but nothing started."
  report "updated to ${IMAGE_TAG}, but it's scaled to 0, so **nothing started**."
  exit 0
fi

if ! aws ecs wait services-stable --cluster "$ECS_CLUSTER" --services "$service"; then
  fail "The service didn't settle in time. Check its ECS events and logs."
fi

# A rollback also ends up stable, so check that the new definition is the one running.
running_definition="$(aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$service" \
  --query 'services[0].taskDefinition' --output text)"
if [ "$running_definition" != "$new_definition" ]; then
  fail "ECS rolled back to ${running_definition}. Check its ECS events and logs."
fi

report "deployed ${IMAGE_TAG} (${desired_count} running)."
