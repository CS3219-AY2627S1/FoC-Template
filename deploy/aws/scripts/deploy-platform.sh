#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:=ap-southeast-1}"
: "${EKS_CLUSTER_NAME:=foc-staging}"
: "${EXTERNAL_SECRETS_CHART_VERSION:=2.14.0}"
: "${RDS_HOST:?RDS_HOST is required}"
: "${RDS_MASTER_SECRET_ARN:?RDS_MASTER_SECRET_ARN is required}"
: "${ALB_SECURITY_GROUP_ID:?ALB_SECURITY_GROUP_ID is required}"
: "${EXTERNAL_SECRETS_ROLE_ARN:?EXTERNAL_SECRETS_ROLE_ARN is required}"
: "${GATEWAY_IMAGE:?GATEWAY_IMAGE is required}"
: "${USER_IMAGE:?USER_IMAGE is required}"
: "${SUPPLIER_IMAGE:?SUPPLIER_IMAGE is required}"
: "${ORDER_IMAGE:?ORDER_IMAGE is required}"
: "${CREDIT_IMAGE:?CREDIT_IMAGE is required}"
: "${ADMIN_IMAGE:?ADMIN_IMAGE is required}"
: "${CHAT_IMAGE:?CHAT_IMAGE is required}"
: "${NOTIFICATION_IMAGE:?NOTIFICATION_IMAGE is required}"
: "${CHAT_S3_BUCKET:?CHAT_S3_BUCKET is required}"
: "${CHAT_SERVICE_ROLE_ARN:?CHAT_SERVICE_ROLE_ARN is required}"
: "${SUPPLIER_S3_BUCKET:?SUPPLIER_S3_BUCKET is required}"
: "${SUPPLIER_SERVICE_ROLE_ARN:?SUPPLIER_SERVICE_ROLE_ARN is required}"
: "${MSK_BOOTSTRAP_SERVERS:?MSK_BOOTSTRAP_SERVERS is required}"

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
profile_args=()
if [[ -n ${AWS_PROFILE:-} ]]; then profile_args=(--profile "$AWS_PROFILE"); fi

retry() {
  local max_attempts=$1
  local delay_seconds=$2
  shift 2

  local attempt=1
  until "$@"; do
    if ((attempt >= max_attempts)); then
      echo "Command failed after $attempt attempts: $*" >&2
      return 1
    fi
    echo "Command failed on attempt $attempt/$max_attempts; retrying in ${delay_seconds}s: $*" >&2
    sleep "$delay_seconds"
    attempt=$((attempt + 1))
  done
}

recover_pending_helm_release() {
  local release=$1
  local namespace=$2
  local status
  local revision

  status=$(helm status "$release" --namespace "$namespace" --output json 2>/dev/null \
    | jq -r '.info.status // empty' 2>/dev/null || true)

  case "$status" in
    pending-install|pending-upgrade|pending-rollback)
      revision=$(helm history "$release" --namespace "$namespace" --output json \
        | jq -r '[.[] | select(.status == "deployed")] | last | .revision // empty')
      if [[ -z $revision ]]; then
        echo "Helm release $namespace/$release is $status and has no deployed revision to restore." >&2
        return 1
      fi

      echo "Recovering Helm release $namespace/$release from $status using deployed revision $revision."
      helm rollback "$release" "$revision" \
        --namespace "$namespace" --cleanup-on-fail --wait --timeout 10m
      ;;
  esac
}

job_diagnostics() {
  local namespace=$1
  local job=$2

  kubectl -n "$namespace" get job "$job" -o wide || true
  kubectl -n "$namespace" get pods -l "job-name=$job" -o wide || true
  kubectl -n "$namespace" describe job "$job" || true
  kubectl -n "$namespace" logs "job/$job" --all-containers=true --tail=300 || true
}

wait_for_job() {
  local namespace=$1
  local job=$2
  local timeout_seconds=$3
  local deadline=$((SECONDS + timeout_seconds))
  local conditions

  while ((SECONDS < deadline)); do
    conditions=$(kubectl -n "$namespace" get job "$job" \
      -o jsonpath='{range .status.conditions[*]}{.type}={.status}{"\n"}{end}' 2>/dev/null || true)
    if [[ $conditions == *"Complete=True"* ]]; then
      return 0
    fi
    if [[ $conditions == *"Failed=True"* ]]; then
      echo "Job $namespace/$job failed." >&2
      job_diagnostics "$namespace" "$job"
      return 1
    fi
    sleep 5
  done

  echo "Timed out waiting ${timeout_seconds}s for job $namespace/$job." >&2
  job_diagnostics "$namespace" "$job"
  return 1
}

wait_for_secret_key() {
  local namespace=$1
  local secret=$2
  local key=$3
  local timeout_seconds=$4
  local deadline=$((SECONDS + timeout_seconds))
  local value

  while ((SECONDS < deadline)); do
    value=$(kubectl -n "$namespace" get secret "$secret" \
      -o "go-template={{index .data \"$key\"}}" 2>/dev/null || true)
    if [[ -n $value && $value != '<no value>' ]]; then
      return 0
    fi
    sleep 5
  done

  echo "Secret $namespace/$secret did not receive required key $key within ${timeout_seconds}s." >&2
  return 1
}

webhook_endpoint_ready() {
  local ready_endpoints
  ready_endpoints=$(kubectl -n external-secrets get endpointslice \
    -l kubernetes.io/service-name=external-secrets-webhook \
    -o jsonpath='{range .items[*].endpoints[*]}{.conditions.ready}{"\n"}{end}' \
    2>/dev/null || true)
  [[ $ready_endpoints == *true* ]]
}

aws "${profile_args[@]}" --region "$AWS_REGION" eks update-kubeconfig --name "$EKS_CLUSTER_NAME" >/dev/null

sed "s|RDS_HOST_REPLACED_BY_DEPLOY_SCRIPT|$RDS_HOST|g" \
  "$root/deploy/aws/k8s/staging/namespace-storage.yaml" | kubectl apply -f -

chart_dir=$(mktemp -d)
trap 'rm -rf "$chart_dir"' EXIT
retry 4 15 helm pull external-secrets \
  --repo https://charts.external-secrets.io \
  --version "$EXTERNAL_SECRETS_CHART_VERSION" \
  --destination "$chart_dir"
external_secrets_chart="$chart_dir/external-secrets-$EXTERNAL_SECRETS_CHART_VERSION.tgz"

recover_pending_helm_release external-secrets external-secrets
helm upgrade --install external-secrets "$external_secrets_chart" \
  --namespace external-secrets --create-namespace --atomic --cleanup-on-fail --wait --timeout 10m \
  --set serviceAccount.name=external-secrets \
  --set-string "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn=$EXTERNAL_SECRETS_ROLE_ARN"

# Helm can update the ServiceAccount annotation without changing the Deployment template. Restart
# the controller so an existing pod is recreated with AWS_ROLE_ARN and the projected IRSA token.
kubectl -n external-secrets rollout restart deployment/external-secrets
for deployment in external-secrets external-secrets-webhook external-secrets-cert-controller; do
  kubectl -n external-secrets rollout status "deployment/$deployment" --timeout=10m
done
retry 12 5 webhook_endpoint_ready

export AWS_REGION RDS_HOST RDS_MASTER_SECRET_ARN ALB_SECURITY_GROUP_ID
export GATEWAY_IMAGE USER_IMAGE SUPPLIER_IMAGE ORDER_IMAGE CREDIT_IMAGE ADMIN_IMAGE CHAT_IMAGE NOTIFICATION_IMAGE
export CHAT_S3_BUCKET
export CHAT_SERVICE_ROLE_ARN
export SUPPLIER_S3_BUCKET
export SUPPLIER_SERVICE_ROLE_ARN
export MSK_BOOTSTRAP_SERVERS
rendered=$(mktemp)
secret_resources=$(mktemp)
runtime_resources=$(mktemp)
trap 'rm -f "$rendered" "$secret_resources" "$runtime_resources"; rm -rf "$chart_dir"' EXIT
"$root/deploy/aws/scripts/render-k8s.sh" > "$rendered"

# Apply secret synchronization before workloads so missing credentials fail early.
awk 'BEGIN{RS="---"} /kind: (ClusterSecretStore|ExternalSecret)/ {print $0 "---"}' \
  "$rendered" > "$secret_resources"
# Do not send the same ExternalSecrets through their validating webhook again during the later
# workload apply. Besides being redundant, that second pass previously made a transient webhook
# timeout fail provisioning after every secret had already synchronized successfully.
awk 'BEGIN{RS="---"} !/kind: (ClusterSecretStore|ExternalSecret)/ && NF {print $0 "---"}' \
  "$rendered" > "$runtime_resources"
# The admission webhook can briefly time out while EKS networking or webhook endpoints converge.
# Reapplying this declarative subset is safe and avoids restarting the entire provisioning workflow.
retry 5 10 kubectl apply -f "$secret_resources"
secret_sync_token=$(date +%s)
for name in user-service-secrets user-mail-secrets supplier-service-secrets order-service-secrets \
  credit-service-secrets admin-service-secrets chat-service-secrets notification-service-secrets \
  kafka-broker-secrets chat-kafka-client notification-kafka-client kafka-ui-secrets rds-master; do
  retry 5 10 kubectl -n foc-staging annotate "externalsecret/$name" \
    "force-sync=$secret_sync_token" --overwrite >/dev/null
  if ! kubectl -n foc-staging wait --for=condition=Ready "externalsecret/$name" --timeout=5m; then
    echo "External Secret $name did not become ready; collecting diagnostics." >&2
    kubectl get clustersecretstore aws-secrets-manager -o wide || true
    kubectl -n foc-staging get externalsecrets -o wide || true
    kubectl -n foc-staging describe "externalsecret/$name" || true
    kubectl -n external-secrets logs deployment/external-secrets --tail=200 || true
    exit 1
  fi
done
wait_for_secret_key foc-staging kafka-broker-secrets KAFKA_CHAT_SERVICE_PASSWORD 120
wait_for_secret_key foc-staging kafka-broker-secrets KAFKA_NOTIFICATION_SERVICE_PASSWORD 120

kubectl -n foc-staging delete job database-bootstrap --ignore-not-found
kubectl apply -f "$root/deploy/aws/k8s/staging/database-bootstrap.yaml"
wait_for_job foc-staging database-bootstrap 900

kubectl -n foc-staging create configmap kafka-scripts \
  --from-file=lib.sh="$root/deploy/kafka/lib.sh" \
  --from-file=initialize.sh="$root/deploy/kafka/initialize.sh" \
  --dry-run=client -o yaml | kubectl apply -f -

cli_dir=$(mktemp -d)
trap 'rm -f "$rendered" "$secret_resources" "$runtime_resources"; rm -rf "$chart_dir" "$cli_dir"' EXIT
for name in kafka-topics.sh kafka-configs.sh kafka-acls.sh kafka-broker-api-versions.sh \
  kafka-console-producer.sh kafka-console-consumer.sh kafka-get-offsets.sh; do
  cp "$root/deploy/kafka/k8s/cli.sh" "$cli_dir/$name"
done
kubectl -n foc-staging create configmap kafka-cli --from-file="$cli_dir" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f "$runtime_resources"
kubectl -n foc-staging rollout status statefulset/rabbitmq --timeout=20m

job="msk-init-$(date +%s)"
sed "s/name: msk-init/name: $job/" "$root/deploy/aws/k8s/staging/msk-initialize-job.yaml" \
  | kubectl -n foc-staging create -f -
wait_for_job foc-staging "$job" 1200

# During first-time cutover, adding ACLs incrementally can briefly deny a consumer before its own
# ACL is installed. Spring then stops that listener while the Pod itself remains Ready. Restart all
# Kafka clients only after the initializer has converged every topic and ACL so no listener remains
# silently stopped. Repeating this during later provisioning is safe and gives clients a clean
# authenticated session against the reconciled broker policy.
for deployment in user-service order-service credit-service admin-service chat-service \
  notification-service kafka-ui; do
  kubectl -n foc-staging rollout restart "deployment/$deployment"
done

for deployment in user-service supplier-service order-service credit-service admin-service chat-service \
  notification-service gateway kafka-ui; do
  kubectl -n foc-staging rollout status "deployment/$deployment" --timeout=20m
done

# The successful MSK initialization and application rollout are the cutover point. Remove the old
# single-broker workload but retain its PVC for an explicit, reviewed cleanup after verification.
kubectl -n foc-staging delete statefulset kafka --ignore-not-found
kubectl -n foc-staging delete service kafka kafka-headless --ignore-not-found
kubectl -n foc-staging delete configmap kafka-config --ignore-not-found

kubectl -n foc-staging get ingress gateway
echo 'Staging workloads are healthy on Amazon MSK. The private ALB may need several minutes to become Active.'
