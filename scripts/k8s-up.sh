#!/usr/bin/env bash
# Create the local kind cluster and start the FoC stack.
# Re-running is safe: database volumes are kept, and one-shot Jobs are replaced.

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

demo=0
if [[ "${1:-}" == "--demo" ]]; then
  demo=1
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--demo]" >&2
  exit 1
fi

if [[ "$demo" -eq 1 && ! -f demo-console/Dockerfile ]]; then
  echo "demo-console/ is not in this checkout, so --demo cannot build it." >&2
  exit 1
fi

for cmd in kind kubectl docker; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "$cmd is required." >&2
    exit 1
  fi
done

if [[ ! -f .env ]]; then
  echo "Copy .env.example to .env and set its values." >&2
  exit 1
fi

for cert in certs/ca.crt certs/user-service.crt certs/user-service.key; do
  if [[ ! -f "$cert" ]]; then
    echo "Missing $cert. Run ./scripts/generate-dev-tls.sh first." >&2
    exit 1
  fi
done

set +u
set -a
# shellcheck disable=SC1091
source .env
set +a
set -u

LOG_LEVEL="${LOG_LEVEL:-INFO}"
AUTH_TIMEOUT_SECONDS="${AUTH_TIMEOUT_SECONDS:-3}"
INITIAL_CREDIT_ALLOCATION="${INITIAL_CREDIT_ALLOCATION:-100}"
CREDIT_RETRY_BACKOFF_SECONDS="${CREDIT_RETRY_BACKOFF_SECONDS:-0.5,1,2,4}"
BOOTSTRAP_ADMIN_NUS_STUDENT_NUMBER="${BOOTSTRAP_ADMIN_NUS_STUDENT_NUMBER:-}"
BOOTSTRAP_ADMIN_EMAIL="${BOOTSTRAP_ADMIN_EMAIL:-}"
BOOTSTRAP_ADMIN_DISPLAY_NAME="${BOOTSTRAP_ADMIN_DISPLAY_NAME:-}"
BOOTSTRAP_ADMIN_PASSWORD="${BOOTSTRAP_ADMIN_PASSWORD:-}"

require() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Set ${name} in .env" >&2
    exit 1
  fi
}

require POSTGRES_USER
require POSTGRES_PASSWORD
require USER_SERVICE_INTERNAL_TOKEN
require SUPPLIER_POSTGRES_DB
require SUPPLIER_POSTGRES_USER
require SUPPLIER_POSTGRES_PASSWORD
require SUPPLIER_MIGRATION_PASSWORD
require SUPPLIER_RUNTIME_PASSWORD
require ORDER_DB_USER
require ORDER_DB_PASSWORD
require CREDIT_DB_USER
require CREDIT_DB_PASSWORD

if ! kind get clusters 2>/dev/null | grep -qx foc; then
  kind create cluster --name foc --config deploy/k8s/kind-config.yaml
fi
kubectl config use-context kind-foc >/dev/null

build() {
  echo "Building $1"
  docker build -t "$1" "$2"
}

pids=()
build foc-user-service:local ./user-service &
pids+=($!)
build foc-supplier-service:local ./supplier-service &
pids+=($!)
build foc-supplier-db:local ./supplier-service/database &
pids+=($!)
build foc-order-service:local ./order-service &
pids+=($!)
build foc-credit-service:local ./credit-service &
pids+=($!)
build foc-frontend-service:local ./frontend-service &
pids+=($!)
if [[ "$demo" -eq 1 ]]; then
  build foc-demo-console:local ./demo-console &
  pids+=($!)
fi

build_status=0
for pid in "${pids[@]}"; do
  wait "$pid" || build_status=1
done
if [[ "$build_status" -ne 0 ]]; then
  echo "Image build failed." >&2
  exit 1
fi

echo "Pulling published images"
docker pull postgres:16-alpine
docker pull apache/kafka:4.1.2
if [[ "$demo" -eq 1 ]]; then
  docker pull ghcr.io/kafbat/kafka-ui:latest
fi

images=(
  foc-user-service:local
  foc-supplier-service:local
  foc-supplier-db:local
  foc-order-service:local
  foc-credit-service:local
  foc-frontend-service:local
  postgres:16-alpine
  apache/kafka:4.1.2
)
if [[ "$demo" -eq 1 ]]; then
  images+=(foc-demo-console:local ghcr.io/kafbat/kafka-ui:latest)
fi

echo "Loading images into kind"
for image in "${images[@]}"; do
  echo "Loading ${image}"
  # kind load uses ctr --all-platforms, which fails on these manifest indexes.
  docker save "$image" | docker exec -i foc-control-plane ctr --namespace=k8s.io images import -
done

kubectl apply -f deploy/k8s/data/namespace.yaml

kubectl -n foc create secret generic foc-env \
  --from-literal="POSTGRES_USER=${POSTGRES_USER}" \
  --from-literal="POSTGRES_PASSWORD=${POSTGRES_PASSWORD}" \
  --from-literal="USER_SERVICE_INTERNAL_TOKEN=${USER_SERVICE_INTERNAL_TOKEN}" \
  --from-literal="BOOTSTRAP_ADMIN_NUS_STUDENT_NUMBER=${BOOTSTRAP_ADMIN_NUS_STUDENT_NUMBER}" \
  --from-literal="BOOTSTRAP_ADMIN_EMAIL=${BOOTSTRAP_ADMIN_EMAIL}" \
  --from-literal="BOOTSTRAP_ADMIN_DISPLAY_NAME=${BOOTSTRAP_ADMIN_DISPLAY_NAME}" \
  --from-literal="BOOTSTRAP_ADMIN_PASSWORD=${BOOTSTRAP_ADMIN_PASSWORD}" \
  --from-literal="SUPPLIER_POSTGRES_DB=${SUPPLIER_POSTGRES_DB}" \
  --from-literal="SUPPLIER_POSTGRES_USER=${SUPPLIER_POSTGRES_USER}" \
  --from-literal="SUPPLIER_POSTGRES_PASSWORD=${SUPPLIER_POSTGRES_PASSWORD}" \
  --from-literal="SUPPLIER_MIGRATION_PASSWORD=${SUPPLIER_MIGRATION_PASSWORD}" \
  --from-literal="SUPPLIER_RUNTIME_PASSWORD=${SUPPLIER_RUNTIME_PASSWORD}" \
  --from-literal="AUTH_TIMEOUT_SECONDS=${AUTH_TIMEOUT_SECONDS}" \
  --from-literal="LOG_LEVEL=${LOG_LEVEL}" \
  --from-literal="ORDER_DB_USER=${ORDER_DB_USER}" \
  --from-literal="ORDER_DB_PASSWORD=${ORDER_DB_PASSWORD}" \
  --from-literal="CREDIT_DB_USER=${CREDIT_DB_USER}" \
  --from-literal="CREDIT_DB_PASSWORD=${CREDIT_DB_PASSWORD}" \
  --from-literal="INITIAL_CREDIT_ALLOCATION=${INITIAL_CREDIT_ALLOCATION}" \
  --from-literal="CREDIT_RETRY_BACKOFF_SECONDS=${CREDIT_RETRY_BACKOFF_SECONDS}" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n foc create secret generic foc-tls \
  --from-file=ca.crt=certs/ca.crt \
  --from-file=user-service.crt=certs/user-service.crt \
  --from-file=user-service.key=certs/user-service.key \
  --dry-run=client -o yaml | kubectl apply -f -

# ConfigMaps reject the CP1252 seed file. A Secret holds the raw bytes.
kubectl -n foc create secret generic foc-supplier-seed \
  --from-file=supplier-seed-data.csv=data/csv/supplier-seed-data.csv \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n foc create configmap foc-supplier-bootstrap \
  --from-file=bootstrap.sql=supplier-service/database/bootstrap.sql \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n foc create configmap foc-supplier-grants \
  --from-file=runtime-grants.sql=supplier-service/database/runtime-grants.sql \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n foc create configmap foc-kafka-topics \
  --from-file=create-topics.sh=event-broker/create-topics.sh \
  --dry-run=client -o yaml | kubectl apply -f -

wait_job() {
  local job="$1"
  local elapsed=0
  local timeout=300
  while (( elapsed < timeout )); do
    local succeeded failed
    succeeded="$(kubectl -n foc get job "$job" -o jsonpath='{.status.succeeded}' 2>/dev/null || true)"
    failed="$(kubectl -n foc get job "$job" -o jsonpath='{.status.failed}' 2>/dev/null || true)"
    if [[ "$succeeded" == "1" ]]; then
      echo "Job ${job} completed"
      return 0
    fi
    if [[ -n "$failed" && "$failed" != "0" ]]; then
      echo "Job ${job} failed" >&2
      kubectl -n foc logs "job/${job}" >&2 || true
      return 1
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  echo "Timed out waiting for job ${job}" >&2
  kubectl -n foc logs "job/${job}" >&2 || true
  return 1
}

apply_wave() {
  local dir="$1"
  shift
  kubectl -n foc delete job --ignore-not-found --wait=true "$@"
  kubectl apply -k "$dir"
  local job
  for job in "$@"; do
    wait_job "$job"
  done
}

echo "Starting databases and Kafka"
kubectl apply -k deploy/k8s/data
for sts in user-db supplier-db order-db credit-db kafka; do
  kubectl -n foc rollout status "statefulset/${sts}" --timeout=300s
done

apply_wave deploy/k8s/jobs/wave-1 \
  user-migrate order-migrate credit-migrate supplier-bootstrap kafka-topics
apply_wave deploy/k8s/jobs/wave-2 user-bootstrap supplier-migrate
apply_wave deploy/k8s/jobs/wave-3 supplier-grants

echo "Starting APIs and workers"
kubectl apply -k deploy/k8s/apps
for deploy in user-service supplier-service order-service order-worker credit-service credit-order-worker frontend-service; do
  kubectl -n foc rollout status "deployment/${deploy}" --timeout=300s
done

if [[ "$demo" -eq 1 ]]; then
  echo "Starting the demo console"
  kubectl apply -k deploy/k8s/demo
  kubectl -n foc rollout status deployment/kafka-ui --timeout=300s
  kubectl -n foc rollout status deployment/demo-console --timeout=300s
fi

cat <<'EOF'

FoC is up in namespace foc.
  Frontend  http://127.0.0.1:3000
  Supplier  http://127.0.0.1:8081/ready
  Order     http://127.0.0.1:8082/ready
  Credit    http://127.0.0.1:8083/ready
EOF
if [[ "$demo" -eq 1 ]]; then
  cat <<'EOF'
  Kafka UI  http://127.0.0.1:8090
  Demo      http://127.0.0.1:8091
EOF
fi
