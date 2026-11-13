#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Codex (GPT-6), date: 2026-11-10
# Scope: EKS deployment orchestration, validation, and secret-safe setup.
# Author review: Not yet confirmed.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

mode=deploy
rerun_jobs=0
refresh_secrets=0

usage() {
  cat <<'EOF'
Usage: scripts/eks-deploy.sh [--validate | --render-only] [--rerun-jobs] [--refresh-secrets]

Modes:
  (default)          Deploy to the existing EKS cluster.
  --validate         Run AWS, cluster, image, secret, and manifest checks without changes.
  --render-only      Render and validate all EKS stages locally; AWS access is not required.

Options:
  --rerun-jobs       Replace successful initialization Jobs and run all three waves again.
  --refresh-secrets  Explicitly update foc-env and foc-tls from local inputs.
                     Coordinate database password changes with existing PostgreSQL volumes.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --validate)
      mode=validate
      ;;
    --render-only)
      mode=render
      ;;
    --rerun-jobs)
      rerun_jobs=1
      ;;
    --refresh-secrets)
      refresh_secrets=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [[ "$mode" == render && ( "$rerun_jobs" -eq 1 || "$refresh_secrets" -eq 1 ) ]]; then
  echo "--render-only cannot be combined with cluster mutation options." >&2
  exit 2
fi

AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-816435462502}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
EKS_CLUSTER_NAME="${EKS_CLUSTER_NAME:-foc-eks}"
IMAGE_TAG="${IMAGE_TAG:-9a6415d}"
NAMESPACE="${NAMESPACE:-foc}"
STORAGE_CLASS="${STORAGE_CLASS:-foc-gp3}"
FRONTEND_COOKIE_SECURE="${FRONTEND_COOKIE_SECURE:-true}"
FOC_ENV_FILE="${FOC_ENV_FILE:-deploy/k8s/eks/secrets.env}"
FOC_TLS_DIR="${FOC_TLS_DIR:-}"
SUPPLIER_SEED_FILE="${SUPPLIER_SEED_FILE:-data/csv/supplier-seed-data.csv}"
ROLLOUT_TIMEOUT="${ROLLOUT_TIMEOUT:-600s}"
JOB_TIMEOUT_SECONDS="${JOB_TIMEOUT_SECONDS:-600}"

default_registry="816435462502.dkr.ecr.ap-southeast-1.amazonaws.com/foc"
target_registry="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/foc"
default_tag="9a6415d"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required."
}

require_command kubectl
require_command sed
require_command grep
require_command mktemp
if [[ "$mode" != render ]]; then
  require_command aws
fi

[[ "$AWS_ACCOUNT_ID" =~ ^[0-9]{12}$ ]] || fail "AWS_ACCOUNT_ID must contain 12 digits."
[[ "$AWS_REGION" =~ ^[a-z]{2}-[a-z]+-[0-9]+$ ]] || fail "AWS_REGION is invalid."
[[ "$IMAGE_TAG" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "IMAGE_TAG contains unsupported characters."
[[ "$NAMESPACE" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]] || fail "NAMESPACE is invalid."
[[ "$STORAGE_CLASS" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "STORAGE_CLASS is invalid."
[[ "$FRONTEND_COOKIE_SECURE" == true || "$FRONTEND_COOKIE_SECURE" == false ]] ||
  fail "FRONTEND_COOKIE_SECURE must be true or false."
[[ "$JOB_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || fail "JOB_TIMEOUT_SECONDS must be an integer."

work_dir="$(mktemp -d)"
normalized_env="$work_dir/foc-env"
cleanup() {
  rm -rf -- "$work_dir"
}
trap cleanup EXIT

stages=(
  data
  jobs-wave-1
  jobs-wave-2
  jobs-wave-3
  jobs-notification
  apps
)

stage_path() {
  case "$1" in
    data) echo "deploy/k8s/eks/data" ;;
    jobs-wave-1) echo "deploy/k8s/eks/jobs/wave-1" ;;
    jobs-wave-2) echo "deploy/k8s/eks/jobs/wave-2" ;;
    jobs-wave-3) echo "deploy/k8s/eks/jobs/wave-3" ;;
    jobs-notification) echo "deploy/k8s/eks/jobs/notification" ;;
    apps) echo "deploy/k8s/eks/apps" ;;
    *) fail "Unknown deployment stage: $1" ;;
  esac
}

render_stage() {
  local stage="$1"
  if [[ "$stage" == apps ]]; then
    kubectl kustomize "$(stage_path "$stage")" |
      sed -e "s#${default_registry}#${target_registry}#g" \
          -e "s#:${default_tag}#:${IMAGE_TAG}#g" \
          -e "s#storageClassName: foc-gp3#storageClassName: ${STORAGE_CLASS}#g" \
          -e "s#value: \"false\"#value: \"${FRONTEND_COOKIE_SECURE}\"#g"
  else
    kubectl kustomize "$(stage_path "$stage")" |
      sed -e "s#${default_registry}#${target_registry}#g" \
          -e "s#:${default_tag}#:${IMAGE_TAG}#g" \
          -e "s#storageClassName: foc-gp3#storageClassName: ${STORAGE_CLASS}#g"
  fi
}

render_all() {
  local stage
  for stage in "${stages[@]}"; do
    render_stage "$stage" >"$work_dir/${stage}.yaml"
  done
}

validate_rendered() {
  local combined="$work_dir/all.yaml"
  local service
  cat "$work_dir"/*.yaml >"$combined"

  if grep -Eq 'image:[[:space:]]+foc-[^[:space:]]*:local' "$combined"; then
    fail "Rendered EKS manifests still contain a local FoC image."
  fi
  if grep -q 'imagePullPolicy: Never' "$combined"; then
    fail "Rendered EKS manifests still contain imagePullPolicy: Never."
  fi
  if grep -Eq 'type:[[:space:]]+NodePort|nodePort:' "$work_dir/apps.yaml"; then
    fail "EKS application Services must remain internal ClusterIP Services."
  fi

  for service in user-service supplier-service supplier-db order-service credit-service frontend-service notification-service; do
    grep -q "${target_registry}/${service}:${IMAGE_TAG}" "$combined" ||
      fail "Rendered manifests do not contain the expected ${service} ECR image."
  done

  local storage_claims
  storage_claims="$(grep -c "storageClassName: ${STORAGE_CLASS}" "$work_dir/data.yaml" || true)"
  [[ "$storage_claims" -eq 6 ]] ||
    fail "Expected six StatefulSet claims using ${STORAGE_CLASS}; found ${storage_claims}."

  for name in USER_SERVICE_URL SUPPLIER_SERVICE_URL NOTIFICATION_SERVICE_URL NODE_EXTRA_CA_CERTS COOKIE_SECURE; do
    grep -q "name: ${name}" "$work_dir/apps.yaml" ||
      fail "Frontend runtime setting ${name} is missing."
  done
  grep -q "value: \"${FRONTEND_COOKIE_SECURE}\"" "$work_dir/apps.yaml" ||
    fail "Rendered frontend COOKIE_SECURE value does not match FRONTEND_COOKIE_SECURE."
  grep -q 'secretName: foc-tls' "$work_dir/apps.yaml" ||
    fail "The application stage does not mount the foc-tls Secret."
}

render_all
validate_rendered

if [[ "$mode" == render ]]; then
  echo "All EKS Kustomize stages rendered and passed local validation."
  exit 0
fi

echo "Checking AWS identity and EKS context"
caller_account="$(aws sts get-caller-identity --query Account --output text)"
[[ "$caller_account" == "$AWS_ACCOUNT_ID" ]] ||
  fail "AWS identity belongs to account ${caller_account}, expected ${AWS_ACCOUNT_ID}."

cluster_endpoint="$(aws eks describe-cluster \
  --region "$AWS_REGION" \
  --name "$EKS_CLUSTER_NAME" \
  --query 'cluster.endpoint' \
  --output text)"
[[ -n "$cluster_endpoint" && "$cluster_endpoint" != None ]] ||
  fail "Could not resolve the ${EKS_CLUSTER_NAME} endpoint in ${AWS_REGION}."

current_context="$(kubectl config current-context)"
[[ "$current_context" == *"$EKS_CLUSTER_NAME"* ]] ||
  fail "Current kubectl context '${current_context}' does not identify ${EKS_CLUSTER_NAME}."
context_endpoint="$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')"
[[ "$context_endpoint" == "$cluster_endpoint" ]] ||
  fail "The active kubectl context points to a different cluster endpoint."

kubectl get namespace "$NAMESPACE" >/dev/null ||
  fail "Namespace ${NAMESPACE} is missing or inaccessible."
[[ "$(kubectl auth can-i get pods --namespace "$NAMESPACE")" == yes ]] ||
  fail "The active identity cannot read Pods in namespace ${NAMESPACE}."
kubectl get storageclass "$STORAGE_CLASS" >/dev/null ||
  fail "StorageClass ${STORAGE_CLASS} is missing or inaccessible."

echo "Checking required ECR images"
services=(user-service supplier-service supplier-db order-service credit-service frontend-service notification-service)
for service in "${services[@]}"; do
  if ! aws ecr describe-images \
    --region "$AWS_REGION" \
    --repository-name "foc/${service}" \
    --image-ids "imageTag=${IMAGE_TAG}" \
    --query 'imageDetails[0].imageDigest' \
    --output text >/dev/null; then
    fail "Missing ECR image foc/${service}:${IMAGE_TAG}."
  fi
  echo "  found foc/${service}:${IMAGE_TAG}"
done

required_nonempty_keys=(
  POSTGRES_USER
  POSTGRES_PASSWORD
  USER_SERVICE_INTERNAL_TOKEN
  SUPPLIER_POSTGRES_DB
  SUPPLIER_POSTGRES_USER
  SUPPLIER_POSTGRES_PASSWORD
  SUPPLIER_MIGRATION_PASSWORD
  SUPPLIER_RUNTIME_PASSWORD
  AUTH_TIMEOUT_SECONDS
  LOG_LEVEL
  ORDER_DB_USER
  ORDER_DB_PASSWORD
  CREDIT_DB_USER
  CREDIT_DB_PASSWORD
  NOTIFICATION_DB_USER
  NOTIFICATION_DB_PASSWORD
  NOTIFICATIONS_START_AT
  INITIAL_CREDIT_ALLOCATION
  CREDIT_RETRY_BACKOFF_SECONDS
)
admin_keys=(
  BOOTSTRAP_ADMIN_NUS_STUDENT_NUMBER
  BOOTSTRAP_ADMIN_EMAIL
  BOOTSTRAP_ADMIN_DISPLAY_NAME
  BOOTSTRAP_ADMIN_PASSWORD
)
all_env_keys=("${required_nonempty_keys[@]}" "${admin_keys[@]}")

normalize_env_file() {
  [[ -f "$FOC_ENV_FILE" ]] ||
    fail "Missing ${FOC_ENV_FILE}. Copy deploy/k8s/eks/secrets.env.example and set secure values."

  (
    local key
    for key in "${all_env_keys[@]}"; do
      unset "$key"
    done
    set -a
    # This is an operator-controlled local file and must use shell-compatible KEY=value syntax.
    # shellcheck disable=SC1090
    source "$FOC_ENV_FILE"
    set +a

    for key in "${required_nonempty_keys[@]}"; do
      [[ -n "${!key:-}" ]] || fail "${key} is required in ${FOC_ENV_FILE}."
      if [[ "${!key}" == *replace-with* || "${!key}" == *change-me* ]]; then
        fail "${key} still contains an example placeholder."
      fi
    done
    for key in "${all_env_keys[@]}"; do
      [[ "${!key:-}" != *$'\n'* ]] || fail "${key} must not contain a newline."
    done

    local admin_count=0
    for key in "${admin_keys[@]}"; do
      if [[ -n "${!key:-}" ]]; then
        admin_count=$((admin_count + 1))
      fi
    done
    [[ "$admin_count" -eq 0 || "$admin_count" -eq 4 ]] ||
      fail "Set all four BOOTSTRAP_ADMIN_* values, or leave all four empty."

    umask 077
    : >"$normalized_env"
    for key in "${all_env_keys[@]}"; do
      printf '%s=%s\n' "$key" "${!key:-}" >>"$normalized_env"
    done
  )
}

secret_exists() {
  kubectl --namespace "$NAMESPACE" get secret "$1" >/dev/null 2>&1
}

validate_secret_keys() {
  local secret="$1"
  shift
  local inventory
  local key
  inventory="$(kubectl --namespace "$NAMESPACE" get secret "$secret" \
    -o go-template='{{range $key, $value := .data}}{{printf "%s=%d\n" $key (len $value)}}{{end}}')"
  for key in "$@"; do
    grep -Eq "^${key}=[1-9][0-9]*$" <<<"$inventory" ||
      fail "Secret ${secret} is missing non-empty key ${key}."
  done
}

validate_secret_key_presence() {
  local secret="$1"
  shift
  local inventory
  local key
  inventory="$(kubectl --namespace "$NAMESPACE" get secret "$secret" \
    -o go-template='{{range $key, $value := .data}}{{printf "%s\n" $key}}{{end}}')"
  for key in "$@"; do
    grep -qx "$key" <<<"$inventory" ||
      fail "Secret ${secret} is missing key ${key}."
  done
}

validate_optional_secret_group() {
  local secret="$1"
  shift
  local inventory
  local key
  local populated=0
  inventory="$(kubectl --namespace "$NAMESPACE" get secret "$secret" \
    -o go-template='{{range $key, $value := .data}}{{printf "%s=%d\n" $key (len $value)}}{{end}}')"
  for key in "$@"; do
    if grep -Eq "^${key}=[1-9][0-9]*$" <<<"$inventory"; then
      populated=$((populated + 1))
    fi
  done
  [[ "$populated" -eq 0 || "$populated" -eq "$#" ]] ||
    fail "Secret ${secret} must set all BOOTSTRAP_ADMIN_* values, or leave all four empty."
}

apply_or_validate_secret_inputs() {
  local env_exists=0
  local tls_exists=0
  secret_exists foc-env && env_exists=1
  secret_exists foc-tls && tls_exists=1

  if [[ "$env_exists" -eq 0 || "$refresh_secrets" -eq 1 ]]; then
    normalize_env_file
    if [[ "$mode" == deploy ]]; then
      kubectl --namespace "$NAMESPACE" create secret generic foc-env \
        --from-env-file="$normalized_env" \
        --dry-run=client -o yaml | kubectl apply -f - >/dev/null
      echo "Configured foc-env from ${FOC_ENV_FILE}."
    else
      kubectl --namespace "$NAMESPACE" create secret generic foc-env \
        --from-env-file="$normalized_env" \
        --dry-run=client -o yaml >/dev/null
      echo "Validated local foc-env input."
    fi
  else
    echo "Reusing existing foc-env; database credentials were not changed."
  fi

  if [[ "$tls_exists" -eq 0 || "$refresh_secrets" -eq 1 ]]; then
    [[ -n "$FOC_TLS_DIR" ]] ||
      fail "Set FOC_TLS_DIR to independently managed deployment certificates; development certs are not selected automatically."
    require_command openssl
    for file in ca.crt user-service.crt user-service.key; do
      [[ -s "$FOC_TLS_DIR/$file" ]] || fail "Missing non-empty TLS file: ${FOC_TLS_DIR}/${file}."
    done
    openssl x509 -in "$FOC_TLS_DIR/ca.crt" -noout >/dev/null ||
      fail "${FOC_TLS_DIR}/ca.crt is not a readable X.509 certificate."
    openssl x509 -in "$FOC_TLS_DIR/user-service.crt" -noout >/dev/null ||
      fail "${FOC_TLS_DIR}/user-service.crt is not a readable X.509 certificate."
    openssl pkey -in "$FOC_TLS_DIR/user-service.key" -passin pass: -noout >/dev/null ||
      fail "${FOC_TLS_DIR}/user-service.key is invalid or encrypted."
    openssl verify -CAfile "$FOC_TLS_DIR/ca.crt" \
      "$FOC_TLS_DIR/user-service.crt" >/dev/null ||
      fail "user-service.crt does not verify against ca.crt."
    cert_public_key="$(openssl x509 -in "$FOC_TLS_DIR/user-service.crt" -pubkey -noout |
      openssl pkey -pubin -outform DER 2>/dev/null |
      openssl dgst -sha256)"
    private_public_key="$(openssl pkey -in "$FOC_TLS_DIR/user-service.key" -passin pass: -pubout 2>/dev/null |
      openssl pkey -pubin -outform DER 2>/dev/null |
      openssl dgst -sha256)"
    [[ "$cert_public_key" == "$private_public_key" ]] ||
      fail "user-service.crt does not match user-service.key."
    subject_alt_names="$(openssl x509 -in "$FOC_TLS_DIR/user-service.crt" \
      -noout -ext subjectAltName)"
    grep -Eq 'DNS:user-service([,[:space:]]|$)' <<<"$subject_alt_names" ||
      fail "user-service.crt must contain the DNS:user-service Subject Alternative Name."
    if [[ "$mode" == deploy ]]; then
      kubectl --namespace "$NAMESPACE" create secret generic foc-tls \
        --from-file="ca.crt=$FOC_TLS_DIR/ca.crt" \
        --from-file="user-service.crt=$FOC_TLS_DIR/user-service.crt" \
        --from-file="user-service.key=$FOC_TLS_DIR/user-service.key" \
        --dry-run=client -o yaml | kubectl apply -f - >/dev/null
      echo "Configured foc-tls from independently managed certificate files."
    else
      kubectl --namespace "$NAMESPACE" create secret generic foc-tls \
        --from-file="ca.crt=$FOC_TLS_DIR/ca.crt" \
        --from-file="user-service.crt=$FOC_TLS_DIR/user-service.crt" \
        --from-file="user-service.key=$FOC_TLS_DIR/user-service.key" \
        --dry-run=client -o yaml >/dev/null
      echo "Validated local foc-tls input."
    fi
  else
    echo "Reusing existing foc-tls; certificate material was not changed."
  fi

  if [[ "$mode" == deploy || ( "$env_exists" -eq 1 && "$refresh_secrets" -eq 0 ) ]]; then
    validate_secret_keys foc-env "${required_nonempty_keys[@]}"
    validate_secret_key_presence foc-env "${admin_keys[@]}"
    validate_optional_secret_group foc-env "${admin_keys[@]}"
  fi
  if [[ "$mode" == deploy || ( "$tls_exists" -eq 1 && "$refresh_secrets" -eq 0 ) ]]; then
    validate_secret_keys foc-tls ca.crt user-service.crt user-service.key
  fi
}

create_support_resource() {
  local kind="$1"
  local name="$2"
  local source_arg="$3"
  local output="$work_dir/${name}.yaml"
  if [[ "$kind" == "secret" ]]; then
  kubectl --namespace "$NAMESPACE" create secret generic \
    "$name" "$source_arg" \
    --dry-run=client -o yaml >"$output"
  else
    kubectl --namespace "$NAMESPACE" create configmap \
      "$name" "$source_arg" \
      --dry-run=client -o yaml >"$output"
  fi
  if [[ "$mode" == deploy ]]; then
    kubectl apply -f "$output" >/dev/null
  fi
}

apply_or_validate_secret_inputs

[[ -s "$SUPPLIER_SEED_FILE" ]] || fail "Missing supplier seed file: ${SUPPLIER_SEED_FILE}."
create_support_resource secret foc-supplier-seed \
  "--from-file=supplier-seed-data.csv=$SUPPLIER_SEED_FILE"
create_support_resource configmap foc-supplier-bootstrap \
  "--from-file=bootstrap.sql=supplier-service/database/bootstrap.sql"
create_support_resource configmap foc-supplier-grants \
  "--from-file=runtime-grants.sql=supplier-service/database/runtime-grants.sql"
create_support_resource configmap foc-kafka-topics \
  "--from-file=create-topics.sh=event-broker/create-topics.sh"

if [[ "$mode" == validate ]]; then
  echo "Validating rendered resources without modifying the cluster"
  for stage in "${stages[@]}"; do
    kubectl apply --dry-run=client -f "$work_dir/${stage}.yaml" >/dev/null
  done
  echo "AWS identity, EKS context, ECR images, configuration, and manifests are valid."
  exit 0
fi

wait_for_job() {
  local job="$1"
  local elapsed=0
  local succeeded
  local failed
  while (( elapsed < JOB_TIMEOUT_SECONDS )); do
    succeeded="$(kubectl --namespace "$NAMESPACE" get job "$job" \
      -o jsonpath='{.status.succeeded}' 2>/dev/null || true)"
    failed="$(kubectl --namespace "$NAMESPACE" get job "$job" \
      -o jsonpath='{.status.conditions[?(@.type=="Failed")].status}' 2>/dev/null || true)"
    if [[ "$succeeded" == 1 ]]; then
      echo "Job ${job} completed."
      return 0
    fi
    if [[ "$failed" == True ]]; then
      echo "Job ${job} failed." >&2
      kubectl --namespace "$NAMESPACE" describe job "$job" >&2 || true
      kubectl --namespace "$NAMESPACE" logs "job/${job}" --all-containers=true --tail=200 >&2 || true
      return 1
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  echo "Timed out waiting for Job ${job}." >&2
  kubectl --namespace "$NAMESPACE" describe job "$job" >&2 || true
  kubectl --namespace "$NAMESPACE" logs "job/${job}" --all-containers=true --tail=200 >&2 || true
  return 1
}

job_succeeded() {
  [[ "$(kubectl --namespace "$NAMESPACE" get job "$1" \
    -o jsonpath='{.status.succeeded}' 2>/dev/null || true)" == 1 ]]
}

run_wave() {
  local stage="$1"
  shift
  local jobs=("$@")
  local complete=1
  local job

  for job in "${jobs[@]}"; do
    if ! job_succeeded "$job"; then
      complete=0
    fi
  done
  if [[ "$complete" -eq 1 && "$rerun_jobs" -eq 0 ]]; then
    echo "Skipping ${stage}; all Jobs already completed. Use --rerun-jobs to replace them."
    return 0
  fi

  kubectl --namespace "$NAMESPACE" delete job "${jobs[@]}" \
    --ignore-not-found --wait=true >/dev/null
  kubectl apply -f "$work_dir/${stage}.yaml" >/dev/null
  for job in "${jobs[@]}"; do
    wait_for_job "$job"
  done
}

echo "Deploying databases and Kafka"
kubectl apply -f "$work_dir/data.yaml" >/dev/null
for stateful_set in user-db supplier-db order-db credit-db notification-db kafka; do
  if ! kubectl --namespace "$NAMESPACE" rollout status \
    "statefulset/${stateful_set}" --timeout="$ROLLOUT_TIMEOUT"; then
    kubectl --namespace "$NAMESPACE" describe "statefulset/${stateful_set}" >&2 || true
    kubectl --namespace "$NAMESPACE" get pods,pvc -o wide >&2 || true
    exit 1
  fi
done

run_wave jobs-wave-1 \
  user-migrate order-migrate credit-migrate supplier-bootstrap kafka-topics
run_wave jobs-wave-2 user-bootstrap supplier-migrate
run_wave jobs-wave-3 supplier-grants
run_wave jobs-notification notification-migrate

echo "Deploying APIs, workers, and frontend"
kubectl apply -f "$work_dir/apps.yaml" >/dev/null
deployments=(
  user-service
  supplier-service
  order-service
  order-worker
  credit-service
  credit-order-worker
  frontend-service
  notification-service
  notification-worker
)
for deployment in "${deployments[@]}"; do
  if ! kubectl --namespace "$NAMESPACE" rollout status \
    "deployment/${deployment}" --timeout="$ROLLOUT_TIMEOUT"; then
    kubectl --namespace "$NAMESPACE" describe "deployment/${deployment}" >&2 || true
    kubectl --namespace "$NAMESPACE" get pods -o wide >&2 || true
    exit 1
  fi
done

echo
echo "FoC deployment completed in namespace ${NAMESPACE}."
kubectl --namespace "$NAMESPACE" get pods,jobs,services,pvc
cat <<EOF

The frontend remains internal. For an HTTP-only operator check:
  kubectl -n ${NAMESPACE} port-forward service/frontend-service 3000:3000
  open http://127.0.0.1:3000
EOF
