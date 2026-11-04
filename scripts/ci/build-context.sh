#!/usr/bin/env bash
# Prints the Docker build context for a service: the repository root when its Dockerfile copies
# repo-relative paths (its own folder, or the shared foc-common library), otherwise the service folder.
# CI and the staging deploy both call this, so the image CI builds is the image that ships.
#   scripts/ci/build-context.sh order-service   ->  .
#   scripts/ci/build-context.sh supplier-service  ->  supplier-service
set -euo pipefail

svc=${1:?usage: build-context.sh <service>}
dockerfile="$svc/Dockerfile"
[[ -f $dockerfile ]] || { echo "No $dockerfile" >&2; exit 1; }

if grep -Eq "^(COPY|ADD)[[:space:]](.*[[:space:]])?(\./)?($svc|foc-common)/" "$dockerfile"; then
  echo .
else
  echo "$svc"
fi
