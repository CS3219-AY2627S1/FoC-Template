#!/usr/bin/env bash
# Lists deployable services: top-level folders with a non-empty Dockerfile.
# A service joins CI/CD automatically once its Dockerfile has content.
#
# Usage:
#   scripts/ci/list-services.sh                          # one per line
#   scripts/ci/list-services.sh --json                   # JSON array (for workflow matrices)
#   scripts/ci/list-services.sh --changed-since <ref>    # only services with changes since <ref>
#   scripts/ci/list-services.sh --firestore              # only services that use Firestore
#
# A service "uses Firestore" when its build declares the Firestore client library
# (google-cloud-firestore in pom.xml, or @google-cloud/firestore in package.json). Those
# services get <name>-<environment> databases from infra/gcp/bootstrap.sh.
#
# Shared CI/infra changes select every service; shared Java/root Maven changes
# conservatively select every Maven backend, but never deploy the library itself.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

json=false
since=""
firestore=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) json=true; shift ;;
    --changed-since) since="$2"; shift 2 ;;
    --firestore) firestore=true; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

uses_firestore() {
  grep -qs "<artifactId>google-cloud-firestore</artifactId>" "$1/pom.xml" ||
    grep -qs '"@google-cloud/firestore"' "$1/package.json"
}

services=()
for dir in */; do
  dir=${dir%/}
  [[ -s "$dir/Dockerfile" ]] || continue
  if $firestore && ! uses_firestore "$dir"; then continue; fi
  services+=("$dir")
done

if [[ -n $since ]]; then
  changed=$(git diff --name-only "$since"...HEAD)
  if ! grep -qE '^(\.github/|scripts/ci/|infra/)' <<<"$changed"; then
    shared_java=false
    if grep -qE '^(foc-common/|pom\.xml$|mvnw$|mvnw\.cmd$|\.mvn/|\.dockerignore$)' <<<"$changed"; then
      shared_java=true
    fi
    selected=()
    for svc in "${services[@]}"; do
      if grep -q "^$svc/" <<<"$changed" || { $shared_java && [[ -f "$svc/pom.xml" ]]; }; then
        selected+=("$svc")
      fi
    done
    services=(${selected[@]+"${selected[@]}"})
  fi
fi

[[ ${#services[@]} -eq 0 ]] && services=("")
if $json; then
  printf '%s\n' "${services[@]}" | jq -R . | jq -cs 'map(select(length > 0))'
else
  printf '%s\n' "${services[@]}" | sed '/^$/d'
fi
