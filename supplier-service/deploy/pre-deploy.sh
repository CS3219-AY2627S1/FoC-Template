#!/usr/bin/env bash
# Uploads the seed CSV to the environment's config bucket; Cloud Run mounts it at /config.
# Run by scripts/ci/deploy.sh from the repository root with ENVIRONMENT and PROJECT_ID set.
set -euo pipefail
: "${ENVIRONMENT:?}" "${PROJECT_ID:?}"
gcloud storage cp data/csv/supplier-seed-data.csv \
  "gs://${PROJECT_ID}-foc-config-${ENVIRONMENT}/supplier-service/supplier-seed-data.csv" --quiet
