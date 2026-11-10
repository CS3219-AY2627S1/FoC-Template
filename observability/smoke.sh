#!/usr/bin/env bash
# AI Assistance Disclosure: OpenAI Codex, 2026-11-10.
# Scope: Isolated real Docker/Alloy/Loki/Grafana checks for issue #66.
# Author review: Implementation review pending; plan approved by Ron.
set -euo pipefail

if [[ ${1:-} == --help ]]; then
  printf 'Usage: %s\nRequires Docker Compose, curl and Node.js 22+. Uses disposable projects and volumes.\n' "$0"
  exit 0
fi
[[ $# == 0 ]] || { printf 'FAIL: unexpected arguments; use --help.\n' >&2; exit 1; }
for dependency in docker curl node; do
  command -v "$dependency" >/dev/null || { printf 'FAIL: install %s first.\n' "$dependency" >&2; exit 1; }
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)' || {
  printf 'FAIL: Node.js 22+ is required.\n' >&2; exit 1;
}
docker info >/dev/null
docker compose version >/dev/null
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
run_id="foc-log-smoke-$(node -p 'require("node:crypto").randomUUID().slice(0, 12)')"
temp_dir=$(mktemp -d)
umask 077
export APP_COMPOSE_PROJECT="${run_id}-app"
export GRAFANA_ADMIN_USER=smoke_admin
export GRAFANA_ADMIN_PASSWORD="${run_id}-local-only"
export GRAFANA_PORT=0
fixture_names=()
compose() { docker compose --env-file "$temp_dir/env" -f "$script_dir/compose.yaml" -p "$run_id" "$@"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
cleanup() {
  result=$?
  trap - EXIT INT TERM
  set +e
  if [[ $result != 0 ]]; then
    compose logs --no-color --tail 30 alloy loki grafana >&2
  fi
  if (( ${#fixture_names[@]} )); then
    for fixture in "${fixture_names[@]}"; do
      docker rm -fv "$fixture" >/dev/null 2>&1 || result=1
    done
  fi
  compose down --volumes --timeout 10 >/dev/null 2>&1 || result=1
  rm -rf -- "$temp_dir"
  if [[ $result == 0 ]]; then
    printf 'PASS: collection, privacy, isolation, persistence and logging-only cleanup.\n'
  else
    printf 'FAIL: smoke check or owned-resource cleanup failed.\n' >&2
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf 'APP_COMPOSE_PROJECT=%s\n' "$APP_COMPOSE_PROJECT" > "$temp_dir/env"

printf 'Starting disposable logging stack %s ...\n' "$run_id"
compose config --quiet
compose up -d --wait --wait-timeout 120
grafana_url="http://$(compose port grafana 3000)"
wait_grafana() {
  for ((attempt=0; attempt<30; attempt++)); do
    if curl --silent --fail --max-time 3 "$grafana_url/api/health" >/dev/null; then return; fi
    sleep 1
  done
  fail 'Grafana did not become ready.'
}
wait_grafana
http_code=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 "$grafana_url/api/datasources/uid/foc-loki")
[[ $http_code == 401 ]] || fail 'Grafana data source unexpectedly accessible without login.'

node_image=node:22.23.3-alpine3.24
nginx_image=nginx:1.29-alpine
docker image inspect "$node_image" >/dev/null 2>&1 || docker pull "$node_image" >/dev/null
docker image inspect "$nginx_image" >/dev/null 2>&1 || docker pull "$nginx_image" >/dev/null
network="${run_id}_default"
start_fixture() {
  local service=$1 project=$2 name=$3
  fixture_names+=("$name")
  docker run -d --name "$name" --network "$network" \
    --label "com.docker.compose.project=$project" --label "com.docker.compose.service=$service" \
    --label "foc.logging.smoke=$run_id" --env "SMOKE_ID=$run_id" --env "SMOKE_SERVICE=$service" \
    "$node_image" node -e '
      const id = process.env.SMOKE_ID, service = process.env.SMOKE_SERVICE;
      setTimeout(() => {
        if (service === "supplier-service") console.log(JSON.stringify({level:"log",message:{event:"supplier.http.request.completed",requestId:id,status:200,durationMs:7}}));
        else console.log(`${id} ${service} plain text`);
        if (service === "credit-service") console.error(JSON.stringify({level:"warn",event:`${id}-credit-warning`}));
        if (service === "user-service") console.log(`${id}-credentials Bearer ${id}-token postgresql://dummy:${id}-secret@localhost/example`);
      }, 5000);
      setInterval(() => {}, 60000);
    ' >/dev/null
}
for service in user-service supplier-service order-service credit-service; do
  start_fixture "$service" "$APP_COMPOSE_PROJECT" "$run_id-$service"
done
start_fixture supplier-service "$run_id-unrelated" "$run_id-unrelated"
start_fixture user-migrate "$APP_COMPOSE_PROJECT" "$run_id-migration"
frontend="$run_id-frontend"
fixture_names+=("$frontend")
docker run -d --name "$frontend" --network "$network" \
  --label "com.docker.compose.project=$APP_COMPOSE_PROJECT" --label com.docker.compose.service=frontend \
  --label "foc.logging.smoke=$run_id" "$nginx_image" >/dev/null

# Real nginx: successful access goes to stdout; a missing file writes stderr too.
for ((attempt=0; attempt<20; attempt++)); do
  if docker exec "$run_id-user-service" node -e "fetch('http://$frontend/?private=$run_id-access', {signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; then break; fi
  sleep 1
done
docker exec "$run_id-user-service" node -e "fetch('http://$frontend/$run_id-missing', {signal:AbortSignal.timeout(5000)}).then(r=>{if(r.status!==404)process.exit(1)}).catch(()=>process.exit(1))"
docker logs "$frontend" > "$temp_dir/nginx-stdout" 2> "$temp_dir/nginx-stderr"
node - "$temp_dir" "$run_id" <<'NODE'
const fs = require('node:fs'), assert = require('node:assert/strict'), net = require('node:net');
const [dir, id] = process.argv.slice(2);
const access = fs.readFileSync(`${dir}/nginx-stdout`, 'utf8').split('\n').find(line => line.includes(`${id}-access`));
const diagnostic = fs.readFileSync(`${dir}/nginx-stderr`, 'utf8').split('\n').find(line => line.includes(`${id}-missing`));
assert.ok(access, 'nginx access canary must appear on stdout');
assert.ok(diagnostic, 'nginx missing-file diagnostic must appear on stderr');
const clientIp = access.split(/\s+/)[0];
assert.ok(net.isIP(clientIp), 'nginx access canary must contain a real client IP');
fs.writeFileSync(`${dir}/nginx-privacy.json`, JSON.stringify({clientIp, hasClientContext:diagnostic.includes(`, client: ${clientIp}`)}));
NODE

query() {
  curl --silent --show-error --fail --max-time 5 --user "$GRAFANA_ADMIN_USER:$GRAFANA_ADMIN_PASSWORD" \
    --get --data-urlencode "query={service_name=~\".+\"} |= \"$run_id\"" --data-urlencode limit=1000 \
    "$grafana_url/api/datasources/proxy/uid/foc-loki/loki/api/v1/query_range" > "$temp_dir/records.json"
}
check_records() {
  node - "$temp_dir/records.json" "$run_id" "$temp_dir/nginx-privacy.json" <<'NODE'
const fs = require('node:fs'), assert = require('node:assert/strict');
const [file, id, privacyFile] = process.argv.slice(2), report = JSON.parse(fs.readFileSync(file, 'utf8'));
const privacy = JSON.parse(fs.readFileSync(privacyFile, 'utf8'));
assert.equal(report.status, 'success');
const rows = report.data.result.flatMap(s => s.values.map(v => ({labels:s.stream,line:v[1]})));
for (const name of ['user-service','supplier-service','order-service','credit-service','frontend']) {
  assert.ok(rows.some(r => r.labels.service_name === name && r.line.includes(id)), `missing ${name}`);
}
const supplier = rows.filter(r => r.labels.service_name === 'supplier-service').map(r => JSON.parse(r.line));
assert.equal(supplier.filter(r => r.message?.requestId === id).length, 1, 'missing or duplicated nested Supplier record');
assert.ok(rows.some(r => r.labels.service_name === 'credit-service' && r.labels.stream === 'stderr'));
assert.ok(rows.some(r => r.labels.service_name === 'user-service' && r.line.includes('plain text')));
assert.ok(rows.some(r => r.labels.service_name === 'frontend' && r.line.includes(`${id}-missing`)));
assert.ok(rows.some(r => r.line.includes(`${id}-credentials`)), 'credential record must be retained with masking');
const all = JSON.stringify(report);
assert.ok(!all.includes(privacy.clientIp), 'nginx client IP leaked into collected logs');
if (privacy.hasClientContext) assert.ok(rows.some(r => r.labels.service_name === 'frontend' && r.line.includes(`${id}-missing`) && r.line.includes(', client: [REDACTED]')), 'nginx diagnostic client/request context was not masked');
for (const forbidden of [`${id}-access`, `${id}-token`, `${id}-secret`, `${id}-unrelated`, 'user-migrate']) assert.ok(!all.includes(forbidden), `leaked ${forbidden}`);
assert.ok(rows.every(r => r.labels.project === `${id}-app`));
assert.ok(rows.filter(r => r.labels.service_name === 'frontend').every(r => r.labels.stream === 'stderr'));
assert.ok(rows.every(r => !Object.keys(r.labels).some(k => /request.?id|operation.?id/i.test(k))));
NODE
}
wait_records() {
  for ((attempt=0; attempt<45; attempt++)); do
    if query 2> "$temp_dir/query-error" && check_records >/dev/null 2>&1; then return; fi
    sleep 1
  done
  cat "$temp_dir/query-error" >&2
  check_records
  fail 'Expected records did not arrive before the deadline.'
}
wait_records
sleep 3
query
check_records

# The config endpoint is internal; the existing fixture acts as a temporary client.
docker exec "$run_id-user-service" node -e '
  fetch("http://loki:3100/config", {signal:AbortSignal.timeout(5000)})
    .then(async r => { const s = await r.text(); if (!r.ok || !/retention_enabled: true/.test(s) || !/retention_period: (168h|1w)/.test(s)) throw Error("retention not configured"); })
    .catch(e => {console.error(e.message);process.exit(1)});
'
compose restart --timeout 10
# Docker reassigns a dynamic host port on restart; rediscover it for the test.
grafana_url="http://$(compose port grafana 3000)"
wait_grafana
wait_records
compose stop --timeout 10
docker exec "$run_id-user-service" node -e "fetch('http://$frontend/', {signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
printf 'Disposable application still serves requests while logging is stopped.\n'
