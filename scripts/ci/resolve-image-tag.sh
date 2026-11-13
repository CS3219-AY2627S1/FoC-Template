#!/usr/bin/env bash
# Prints the commit SHA whose images are currently tagged <environment> (e.g. staging), so
# production can promote exactly the build that staging verified.
#
# Usage: scripts/ci/resolve-image-tag.sh <environment> [service]   (service defaults to gateway)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=SCRIPTDIR/../../infra/gcp/project.env
source "$ROOT/infra/gcp/project.env"

ENVIRONMENT=${1:?environment required}
SERVICE=${2:-gateway}
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/$SERVICE"

# All tags of the image, grouped by digest; pick the 40-hex tag sharing a digest with $ENVIRONMENT.
tags=$(gcloud artifacts docker tags list "$IMAGE" --format json)
digest=$(jq -r --arg env "$ENVIRONMENT" '.[] | select(.tag | endswith("/tags/" + $env)) | .version' <<<"$tags")
[[ -n $digest ]] || { echo "no image tagged '$ENVIRONMENT' for $SERVICE" >&2; exit 1; }

sha=$(jq -r --arg digest "$digest" \
  '.[] | select(.version == $digest) | .tag | split("/tags/")[1] | select(test("^[0-9a-f]{40}$"))' <<<"$tags" | head -n1)
[[ -n $sha ]] || { echo "no commit tag found for digest $digest" >&2; exit 1; }
echo "$sha"
