#!/usr/bin/env bash
# Isolated Git fixtures: shared library changes must not skip backend CI.
set -euo pipefail
repo_root=$(git rev-parse --show-toplevel)
temp_root=$(cd "${TMPDIR:-/tmp}" && pwd -P)
fixture=$(mktemp -d "$temp_root/foc-service-detection.XXXXXXXX")
cleanup() {
  # Only remove the absolute, uniquely created fixture beneath the temp root.
  if [[ -d $fixture && $fixture == "$temp_root"/foc-service-detection.* ]]; then
    rm -rf -- "$fixture"
  fi
}
trap cleanup EXIT
mkdir -p "$fixture/scripts/ci" "$fixture/order-service" "$fixture/credit-service" \
  "$fixture/frontend" "$fixture/foc-common"
cp "$repo_root/scripts/ci/list-services.sh" "$fixture/scripts/ci/"
cd "$fixture"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
git -c core.excludesFile=/dev/null init -q
git config core.excludesFile /dev/null
git config user.name 'CI fixture'
git config user.email 'ci-fixture@u.nus.invalid'
git config commit.gpgsign false
printf 'FROM scratch\n' | tee order-service/Dockerfile credit-service/Dockerfile frontend/Dockerfile >/dev/null
printf '<project/>\n' | tee order-service/pom.xml credit-service/pom.xml >/dev/null
printf '<project/>\n' >pom.xml
printf 'base\n' >foc-common/policy.txt
git add .
git commit -qm base
base=$(git rev-parse HEAD)

printf 'shared policy change\n' >>foc-common/policy.txt
git add .
git commit -qm shared
actual=$(bash scripts/ci/list-services.sh --changed-since "$base")
expected=$'credit-service\norder-service'
[[ $actual == "$expected" ]] || {
  printf 'Shared change selected [%s], expected [%s]\n' "$actual" "$expected" >&2
  exit 1
}
base=$(git rev-parse HEAD)

printf 'root build change\n' >>pom.xml
git add .
git commit -qm reactor
[[ $(bash scripts/ci/list-services.sh --changed-since "$base") == "$expected" ]]
base=$(git rev-parse HEAD)

printf 'ordinary change\n' >order-service/change.txt
git add .
git commit -qm order
[[ $(bash scripts/ci/list-services.sh --changed-since "$base") == order-service ]]
printf 'PASS: shared-only, root Maven and service-only change detection\n'
