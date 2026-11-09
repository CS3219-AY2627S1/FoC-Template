#!/usr/bin/env bash
# deploy.sh failure handling, with fake gcloud/curl (no cloud access): a failing service keeps its
# previous revision while the others still roll out, Order waits for the gateway and its providers,
# and only services that were deployed and passed the smoke test get the environment tag.
set -euo pipefail
repo_root=$(git rev-parse --show-toplevel)
temp_root=$(cd "${TMPDIR:-/tmp}" && pwd -P)
fakes=$(mktemp -d "$temp_root/foc-deploy-test.XXXXXXXX")
cleanup() {
  # Only remove the absolute, uniquely created directory beneath the temp root.
  if [[ -d $fakes && $fakes == "$temp_root"/foc-deploy-test.* ]]; then
    rm -rf -- "$fakes"
  fi
}
trap cleanup EXIT

# `gcloud run deploy <svc>-staging` fails for services in FAIL_DEPLOY; everything else succeeds.
cat >"$fakes/gcloud" <<'EOF'
#!/usr/bin/env bash
echo "gcloud $*" >>"$FAKE_LOG"
if [[ $1 == run && $2 == deploy && " $FAIL_DEPLOY " == *" ${3%-staging} "* ]]; then exit 1; fi
exit 0
EOF
# Requests to a path in FAIL_SMOKE fail.
cat >"$fakes/curl" <<'EOF'
#!/usr/bin/env bash
for path in $FAIL_SMOKE; do [[ $* != *"$path"* ]] || exit 22; done
exit 0
EOF
printf '#!/usr/bin/env bash\necho https://tagged.example\n' >"$fakes/jq"
printf '#!/usr/bin/env bash\ncat\n' >"$fakes/envsubst"
chmod +x "$fakes"/*

services=(gateway user-service supplier-service credit-service order-service frontend)

check() {
  local name=$1 fail_deploy=$2 fail_smoke=$3 want_status=$4 want_attempted=$5 want_tagged=$6
  local status=0 attempted tagged untagged
  : >"$fakes/log"
  FAKE_LOG="$fakes/log" FAIL_DEPLOY="$fail_deploy" FAIL_SMOKE="$fail_smoke" PATH="$fakes:$PATH" GITHUB_OUTPUT="" \
    bash "$repo_root/scripts/ci/deploy.sh" staging 0123456789abcdef "${services[@]}" >"$fakes/out" 2>&1 || status=$?
  attempted=$(sed -n 's/^gcloud run deploy \([a-z-]*\)-staging .*/\1/p' "$fakes/log" | xargs)
  tagged=$(sed -n 's#^gcloud artifacts docker tags add [^ ]*/\([a-z-]*\):.*#\1#p' "$fakes/log" | xargs)
  # Every attempted rollout, failed or not, drops its revision tag afterwards.
  untagged=$(sed -n 's/^gcloud run services update-traffic \([a-z-]*\)-staging .*--remove-tags.*/\1/p' "$fakes/log" | xargs)
  if [[ $status != "$want_status" || $attempted != "$want_attempted" || $tagged != "$want_tagged" ||
        $untagged != "$attempted" ]]; then
    printf 'FAIL: %s\n  exit      %s (want %s)\n  attempted [%s]\n       want [%s]\n  tagged    [%s]\n       want [%s]\n  untagged  [%s]\n' \
      "$name" "$status" "$want_status" "$attempted" "$want_attempted" "$tagged" "$want_tagged" "$untagged" >&2
    cat "$fakes/out" >&2
    exit 1
  fi
  printf 'PASS: %s\n' "$name"
}

all="gateway user-service supplier-service credit-service order-service frontend"
check "every service deploys and is tagged" "" "" 0 "$all" "$all"
check "a failed Order rollout doesn't stop the frontend" order-service "" 1 \
  "$all" "gateway user-service supplier-service credit-service frontend"
check "Order is skipped when a provider fails" credit-service "" 1 \
  "gateway user-service supplier-service credit-service frontend" "gateway user-service supplier-service frontend"
check "a failed smoke test tags nothing" "" /api/suppliers/ 1 "$all" ""
