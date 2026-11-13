#!/usr/bin/env bash
# Requires images for all five changed services at the supplied immutable tag.
# Run after CI passes. Provisioning requires an infrastructure administrator.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
[[ $# == 2 ]] || { echo "usage: $0 staging|production IMAGE_TAG" >&2; exit 2; }
environment=$1
tag=$2
[[ $environment == staging || $environment == production ]] || exit 2
# Public boundary FIRST; providers SECOND; transport THIRD; Order producer LAST.
bash scripts/ci/deploy.sh "$environment" "$tag" gateway
bash scripts/ci/deploy.sh "$environment" "$tag" user-service supplier-service credit-service
bash infra/gcp/configure-compensation-pubsub.sh dev
bash infra/gcp/configure-compensation-pubsub.sh "$environment"
bash scripts/ci/deploy.sh "$environment" "$tag" order-service
set -a
source infra/gcp/project.env
set +a
for service in user-service supplier-service credit-service order-service; do
  ingress=$(gcloud run services describe "$service-$environment" --project "$PROJECT_ID" --region "$REGION" \
    --format=json | jq -r '.metadata.annotations["run.googleapis.com/ingress"] // "all"')
  [[ $ingress == internal ]] || { echo "Unsafe ingress for $service-$environment: $ingress" >&2; exit 1; }
done
echo "Rollout completed. Verify application outcomes and monitor compensation outboxes/DLQs."
