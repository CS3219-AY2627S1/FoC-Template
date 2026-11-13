#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Terra), date: 2026-11-06
# Scope: Generated implementation of AWS infrastructure deployment, image publishing, and Kubernetes rollout
# Author review: Verified that images match docker compose and kubernetes workload configs, secrets are not exposed, and each stack is deployed in correct order.

# Secret-bearing commands must not be exposed by inherited shell tracing.
set +x
set -euo pipefail

# Creates/updates the AWS foundation, publishes the existing Docker images, then
# applies the Relay Kubernetes objects. Required non-infrastructure values are
# read from deploy/relay.aws.env (see deploy/relay.aws.env.example).

cd "$(dirname "$0")/../.."
sha256sum() { node deploy/scripts/config-tools.mjs hash "$@"; }
step() { printf "\n[%s] %s\n" "$(date '+%H:%M:%S')" "$*"; }
stack_name="${1:-relay}"
aws_region="${AWS_REGION:-${2:-}}"
if [[ -z "$aws_region" ]]; then
  echo "Usage: AWS_REGION=ap-southeast-1 $0 <stack-name> [region]" >&2
  exit 2
fi

env_file="deploy/relay.aws.env"
if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file. Copy deploy/relay.aws.env.example and fill it in." >&2
  exit 2
fi
# shellcheck disable=SC1090
set -a
source "$env_file"
set +a

# Check before provisioning or modifying any AWS infrastructure.
source deploy/scripts/ai-secret.sh
AI_SECRET_ID="${stack_name}/credit-estimation-ai"
ai_aws() { aws --region "$aws_region" "$@"; }
ai_secret_preflight strict

required=(COGNITO_ISSUER COGNITO_JWKS_URI COGNITO_CLIENT_ID COGNITO_USER_POOL_ID S3_ENDPOINT S3_PUBLIC_ENDPOINT S3_BUCKET)
for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || { echo "Missing $name in $env_file" >&2; exit 2; }
done

# A pause deletes the EKS stack; the manifest identifies the four DB snapshots.
snapshot_args=()
resuming=0
state_file="deploy/.${stack_name}-pause.env"
if [[ -s "$state_file" ]]; then
  # shellcheck disable=SC1090
  source "$state_file"
  current_account="$(aws sts get-caller-identity --query Account --output text)"
  [[ "$PAUSE_ACCOUNT_ID" == "$current_account" && "$PAUSE_REGION" == "$aws_region" && "$PAUSE_STACK" == "$stack_name" ]] || {
    echo "Pause manifest belongs to another account, region, or stack." >&2; exit 1;
  }
  for name in User Errand Credit Supplier; do
    key="$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')_DATABASE_SNAPSHOT_ID"
    [[ -n "${!key:-}" ]] || { echo "Missing $key in $state_file" >&2; exit 1; }
    snapshot_args+=("${name}DatabaseSnapshotId=${!key}")
  done
  if ! aws cloudformation describe-stacks --region "$aws_region" --stack-name "$stack_name" >/dev/null 2>&1; then
    resuming=1
  fi
fi

# Fail before provisioning billable resources when Docker is unavailable.
if ! docker info >/dev/null 2>&1; then
  echo 'Docker API unavailable. Start Docker Desktop or the Docker daemon and verify docker info from this shell.' >&2
  exit 1
fi

# A third MSK AZ changes ClientSubnets, which replaces an existing two-AZ
# cluster. Do not let an ordinary redeploy discard its Kafka data implicitly.
existing_msk_arn="$(aws cloudformation describe-stack-resource --region "$aws_region" \
  --stack-name "$stack_name" --logical-resource-id MskCluster \
  --query 'StackResourceDetail.PhysicalResourceId' --output text 2>/dev/null || true)"
if [[ "$existing_msk_arn" == arn:* ]]; then
  existing_brokers="$(aws kafka describe-cluster-v2 --region "$aws_region" \
    --cluster-arn "$existing_msk_arn" \
    --query 'ClusterInfo.Provisioned.NumberOfBrokerNodes' --output text)"
  if [[ "$existing_brokers" != 3 ]]; then
    echo "Existing MSK cluster has $existing_brokers brokers. Changing from two AZs to three replaces it and loses its Kafka data." >&2
    echo 'Migrate Kafka data first, or explicitly pause the deployment and accept a fresh MSK cluster before rerunning deploy.sh.' >&2
    exit 1
  fi
fi

# A retained or pre-existing secret can be reused by a newly created stack.
# Keep the resource enabled if this stack already owns it.
existing_ai_secret_arn=''
if (( AI_SECRET_EXISTS )); then
  ai_stack_error="$(mktemp)"
  if aws cloudformation describe-stack-resource --region "$aws_region" --stack-name "$stack_name" \
      --logical-resource-id AiProviderSecret >/dev/null 2>"$ai_stack_error"; then
    :
  elif grep -qi -e 'does not exist' -e 'not exist' -e 'not found' "$ai_stack_error"; then
    existing_ai_secret_arn="$(ai_aws secretsmanager describe-secret --secret-id "$AI_SECRET_ID" --query ARN --output text)"
  else
    cat "$ai_stack_error" >&2
    rm -f "$ai_stack_error"
    exit 1
  fi
  rm -f "$ai_stack_error"
fi

step "Create or update Relay foundation: VPC, EKS, RDS, MSK, and ECR"
aws cloudformation deploy \
  --region "$aws_region" \
  --stack-name "$stack_name" \
  --template-file infra/relay-eks.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    "KubernetesVersion=${KUBERNETES_VERSION:?Set KUBERNETES_VERSION in deploy/relay.aws.env}" \
    "ProfileImageBucketName=${S3_BUCKET}" \
    "CognitoUserPoolId=${COGNITO_USER_POOL_ID}" \
    "ExistingAiProviderSecretArn=$existing_ai_secret_arn" \
    ${snapshot_args[@]+"${snapshot_args[@]}"}

output() {
  aws cloudformation describe-stacks --region "$aws_region" --stack-name "$stack_name" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

# Populate only an absent/placeholder secret; keep initialized values on redeploy.
ai_secret_initialize
ai_secret_export_values

cluster_name="$(output ClusterName)"
aws eks update-kubeconfig --region "$aws_region" --name "$cluster_name"

access_stack="${stack_name}-aws-access"
issuer_url="$(aws eks describe-cluster --region "$aws_region" --name "$cluster_name" --query cluster.identity.oidc.issuer --output text)"
issuer_host="${issuer_url#https://}"
[[ "$issuer_url" == https://* && -n "$issuer_host" ]] || { echo 'EKS OIDC issuer unavailable' >&2; exit 1; }
account_id="$(aws sts get-caller-identity --query Account --output text)"
oidc_arn="arn:aws:iam::${account_id}:oidc-provider/${issuer_host}"
existing_oidc_arn=""
if ! aws cloudformation describe-stack-resource --region "$aws_region" --stack-name "$access_stack" --logical-resource-id ClusterOidcProvider >/dev/null 2>&1; then
  if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$oidc_arn" >/dev/null 2>&1; then
    existing_oidc_arn="$oidc_arn"
  fi
fi
msk_arn="$(output MskClusterArn)"
step "Create or update service-account AWS access roles"
aws cloudformation deploy --region "$aws_region" --stack-name "$access_stack" \
  --template-file infra/relay-aws-access.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    "ClusterIssuerUrl=$issuer_url" "ClusterIssuerHost=$issuer_host" \
    "ExistingOidcProviderArn=$existing_oidc_arn" \
    "ProfileImageBucketName=$S3_BUCKET" "CognitoUserPoolId=$COGNITO_USER_POOL_ID"
access_output() {
  aws cloudformation describe-stacks --region "$aws_region" --stack-name "$access_stack" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

registry="$(output HostRepositoryUri)"
registry="${registry%%/*}"
# Docker Desktop's WSL credential helper can fail while saving ECR tokens.
# Keep ECR credentials in a private temporary config for login/push only.
# A fresh --config directory has no Docker Desktop context. Preserve its endpoint.
docker_endpoint="${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}"
ecr_docker_config="$(mktemp -d)"
chmod 700 "$ecr_docker_config"
rendered=""
cleanup() {
  [[ -z "$rendered" ]] || rm -f -- "$rendered"
  rm -rf -- "$ecr_docker_config"
}
trap cleanup EXIT
aws ecr get-login-password --region "$aws_region" |
  docker --host "$docker_endpoint" --config "$ecr_docker_config" login --username AWS --password-stdin "$registry"

build_and_push() {
  local output_name="$1" service="$2"
  shift 2
  local repository_uri image_uri local_id remote_manifest remote_config remote_digest source_image
  repository_uri="$(output "$output_name")"
  image_uri="$repository_uri:${IMAGE_TAG:-latest}"
  local build_args=("$@")
  if [[ "${NO_CACHE:-0}" == "1" ]]; then build_args+=(--no-cache); fi
  if [[ "$service" == redis ]]; then
    # Redis has no project-specific image layer: mirror the upstream image.
    echo 'Pulling upstream Redis image...' >&2
    docker pull --platform linux/amd64 redis:7-alpine >&2 || return 1
    source_image=redis:7-alpine
  else
    echo "Building $service (Docker cache enabled unless NO_CACHE=1)..." >&2
    KAFKA_BROKERS=bootstrap USER_DATABASE_URL=bootstrap ERRAND_DATABASE_URL=bootstrap CREDIT_DATABASE_URL=bootstrap \
      SUPPLIER_DATABASE_URL=bootstrap SUPPLIER_DATABASE_PORT=5432 SUPPLIER_DATABASE_PASSWORD=bootstrap \
      DOCKER_DEFAULT_PLATFORM=linux/amd64 \
      docker compose -f compose.yaml --env-file "$env_file" --project-name relay-aws-build \
        build ${build_args[@]+"${build_args[@]}"} "$service" >&2 || return 1
    source_image="relay-aws-build-$service:latest"
  fi
  local_id="$(docker image inspect "$source_image" --format '{{.Id}}')"
  local_id="${local_id#sha256:}"
  remote_manifest="$(aws ecr batch-get-image --region "$aws_region" \
    --repository-name "${repository_uri#"$registry"/}" \
    --image-ids "imageTag=${IMAGE_TAG:-latest}" \
    --query 'images[0].imageManifest' --output text 2>/dev/null || true)"
  remote_config=""
  if [[ -n "$remote_manifest" && "$remote_manifest" != None ]]; then
    remote_config="$(node -e 'try { const m=JSON.parse(process.argv[1]); process.stdout.write((m.config?.digest ?? "").replace(/^sha256:/, "")) } catch {}' "$remote_manifest")"
    if [[ -z "$remote_config" ]]; then
      # Buildx may push an OCI image index with an amd64 child manifest.
      child_digest="$(node -e 'try { const m=JSON.parse(process.argv[1]); process.stdout.write(m.manifests?.find(x => x.platform?.architecture === "amd64" && x.platform?.os === "linux")?.digest ?? "") } catch {}' "$remote_manifest")"
      if [[ -n "$child_digest" ]]; then
        child_manifest="$(aws ecr batch-get-image --region "$aws_region" \
          --repository-name "${repository_uri#"$registry"/}" \
          --image-ids "imageDigest=$child_digest" \
          --query 'images[0].imageManifest' --output text 2>/dev/null || true)"
        remote_config="$(node -e 'try { process.stdout.write((JSON.parse(process.argv[1]).config?.digest ?? "").replace(/^sha256:/, "")) } catch {}' "$child_manifest")"
      fi
    fi
  fi
  if [[ "$remote_config" != "$local_id" ]]; then
    echo "Pushing changed image $service..." >&2
    docker tag "$source_image" "$image_uri" || return 1
    docker --host "$docker_endpoint" --config "$ecr_docker_config" push "$image_uri" >&2 || return 1
  else
    echo "Skipping unchanged ECR image $service." >&2
  fi
  remote_digest="$(aws ecr describe-images --region "$aws_region" \
    --repository-name "${repository_uri#"$registry"/}" \
    --image-ids "imageTag=${IMAGE_TAG:-latest}" \
    --query 'imageDetails[0].imageDigest' --output text)"
  [[ "$remote_digest" == sha256:* ]] || { echo "No ECR digest for $service" >&2; return 1; }
  printf '%s@%s' "$repository_uri" "$remote_digest"
}

step "Build images and push only changed content to ECR"
host_image="$(build_and_push HostRepositoryUri host \
  --build-arg "AWS_ENDPOINT_URL=${COGNITO_AWS_ENDPOINT:-https://cognito-idp.${aws_region}.amazonaws.com}" \
  --build-arg "COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID" \
  --build-arg "COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID")"
supplier_frontend_image="$(build_and_push SupplierFrontendRepositoryUri supplier-frontend)"
user_frontend_image="$(build_and_push UserFrontendRepositoryUri user-frontend)"
errand_frontend_image="$(build_and_push ErrandFrontendRepositoryUri errand-frontend)"
credit_frontend_image="$(build_and_push CreditFrontendRepositoryUri credit-frontend)"
supplier_api_image="$(build_and_push SupplierApiRepositoryUri supplier-api)"
user_api_image="$(build_and_push UserApiRepositoryUri user-api)"
user_auth_api_image="$(build_and_push UserAuthRepositoryUri user-auth-api)"
user_event_publisher_image="$(build_and_push UserEventPublisherRepositoryUri user-event-publisher)"
errand_event_publisher_image="$(build_and_push ErrandEventPublisherRepositoryUri errand-event-publisher)"
errand_api_image="$(build_and_push ErrandApiRepositoryUri errand-api)"
credit_api_image="$(build_and_push CreditApiRepositoryUri credit-api)"
credit_estimation_image="$(build_and_push CreditEstimationRepositoryUri credit-estimation-api)"
redis_image="$(build_and_push RedisRepositoryUri redis)"
errand_notification_image="$(build_and_push ErrandNotificationRepositoryUri errand-notification)"
# Topic init uses the credit image; the digest-pinned image must exist in ECR.
aws ecr describe-images --region "$aws_region" \
  --repository-name "$(output CreditApiRepositoryUri | sed "s|^$registry/||")" \
  --image-ids "imageDigest=${credit_api_image##*@}" >/dev/null

step "Read RDS and MSK credentials from Secrets Manager"
secret_value() {
  aws secretsmanager get-secret-value --region "$aws_region" --secret-id "$(output "$1")" --query SecretString --output text
}
secret_field() {
  printf '%s' "$1" | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      try {
        const value = JSON.parse(input)[process.argv[1]];
        if (typeof value !== "string" || !value) throw new Error();
        process.stdout.write(value);
      } catch {
        console.error("Secret is missing a required field or is invalid JSON.");
        process.exitCode = 1;
      }
    });
  ' "$2"
}
password_from_secret() {
  secret_field "$1" password
}
user_password="$(password_from_secret "$(secret_value UserDatabaseSecretArn)")"
errand_password="$(password_from_secret "$(secret_value ErrandDatabaseSecretArn)")"
credit_password="$(password_from_secret "$(secret_value CreditDatabaseSecretArn)")"
supplier_password="$(password_from_secret "$(secret_value SupplierDatabaseSecretArn)")"
msk_scram_secret="$(secret_value MskScramSecretArn)"
msk_username="$(secret_field "$msk_scram_secret" username)"
msk_password="$(password_from_secret "$msk_scram_secret")"
# Restored snapshots retain their old master password; new CFN secrets do not.
# Synchronize the master passwords before migration jobs connect.
if [[ "$resuming" == 1 ]]; then
  for name in User Errand Credit Supplier; do
    password_var="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')_password"
    db_id="$(aws cloudformation describe-stack-resource --region "$aws_region" \
      --stack-name "$stack_name" --logical-resource-id "${name}Database" \
      --query StackResourceDetail.PhysicalResourceId --output text)"
    aws rds modify-db-instance --region "$aws_region" --db-instance-identifier "$db_id" \
      --master-user-password "${!password_var}" --apply-immediately >/dev/null
    aws rds wait db-instance-available --region "$aws_region" --db-instance-identifier "$db_id"
  done
fi
step "Apply Kubernetes configuration and service accounts"
kubectl apply -f k8s/base/namespace.yaml
config_existed=0
kubectl -n relay get configmap relay-runtime >/dev/null 2>&1 && config_existed=1
configmap_result="$(kubectl create --dry-run=client -f k8s/base/configmap.yaml -o json | node deploy/scripts/config-tools.mjs config | kubectl apply -f -)"
printf '%s\n' "$configmap_result"
config_changed=0
[[ "$configmap_result" == *unchanged* || "$config_existed" == 0 ]] || config_changed=1
rendered="$(mktemp)"
sed \
  -e "s|ROLE_USER_API|$(access_output UserApiRoleArn)|g" \
  -e "s|ROLE_USER_AUTH_API|$(access_output UserAuthRoleArn)|g" \
  k8s/base/serviceaccounts.yaml > "$rendered"
kubectl apply -f "$rendered"

for attempt in $(seq 1 60); do
  msk_state="$(aws kafka describe-cluster-v2 --region "$aws_region" --cluster-arn "$msk_arn" --query ClusterInfo.State --output text)"
  [[ "$msk_state" == ACTIVE ]] && break
  sleep 10
done
[[ "$msk_state" == ACTIVE ]] || { echo "MSK cluster did not become ACTIVE (state: $msk_state)" >&2; exit 1; }
msk_brokers="$(aws kafka get-bootstrap-brokers --region "$aws_region" --cluster-arn "$msk_arn" --query BootstrapBrokerStringSaslScram --output text)"
[[ -n "$msk_brokers" && "$msk_brokers" != None ]] || { echo 'MSK SCRAM bootstrap brokers unavailable' >&2; exit 1; }
kubectl -n relay delete deployment kafka --ignore-not-found
kubectl -n relay delete service kafka --ignore-not-found
existing_origin="$(aws cloudformation describe-stacks --region "$aws_region" --stack-name "${stack_name}-edge" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionDomainName'].OutputValue" --output text 2>/dev/null || true)"
if [[ -n "$existing_origin" && "$existing_origin" != None ]]; then
  initial_origin="https://$existing_origin"
else
  initial_origin=https://pending.invalid
fi
runtime_existed=0
kubectl -n relay get secret relay-runtime >/dev/null 2>&1 && runtime_existed=1
runtime_result="$(kubectl -n relay create secret generic relay-runtime \
  --from-literal=USER_DATABASE_URL="postgresql://relay:${user_password}@$(output UserDatabaseEndpoint):5432/relay?schema=public&sslmode=require&sslrootcert=/etc/ssl/certs/rds-global-bundle.pem&sslaccept=strict" \
  --from-literal=ERRAND_DATABASE_URL="postgresql://relay:${errand_password}@$(output ErrandDatabaseEndpoint):5432/relayerrand?schema=public&sslmode=require&sslrootcert=/etc/ssl/certs/rds-global-bundle.pem&sslaccept=strict" \
  --from-literal=CREDIT_DATABASE_URL="postgresql://relay:${credit_password}@$(output CreditDatabaseEndpoint):5432/relay?schema=public&sslmode=require&sslrootcert=/etc/ssl/certs/rds-global-bundle.pem&sslaccept=strict" \
  --from-literal=SUPPLIER_DATABASE_URL="postgresql://relay:${supplier_password}@$(output SupplierDatabaseEndpoint):5432/relay" \
  --from-literal=SUPPLIER_DB_HOST="$(output SupplierDatabaseEndpoint)" \
  --from-literal=SUPPLIER_DB_PORT=5432 \
  --from-literal=SUPPLIER_DB_PASSWORD="$supplier_password" \
  --from-literal=KAFKA_BROKERS="$msk_brokers" \
  --from-literal=KAFKA_USERNAME="$msk_username" \
  --from-literal=KAFKA_PASSWORD="$msk_password" \
  --from-literal=AWS_REGION="$aws_region" \
  --from-literal=AWS_DEFAULT_REGION="$aws_region" \
  --from-literal=COGNITO_ENDPOINT_URL="${COGNITO_AWS_ENDPOINT:-https://cognito-idp.${aws_region}.amazonaws.com}" \
  --from-literal=AUTH_PUBLIC_ORIGIN="$initial_origin" \
  --from-literal=COGNITO_ISSUER="$COGNITO_ISSUER" \
  --from-literal=COGNITO_JWKS_URI="$COGNITO_JWKS_URI" \
  --from-literal=COGNITO_CLIENT_ID="$COGNITO_CLIENT_ID" \
  --from-literal=COGNITO_USER_POOL_ID="$COGNITO_USER_POOL_ID" \
  --from-literal=S3_ENDPOINT="$S3_ENDPOINT" \
  --from-literal=S3_PUBLIC_ENDPOINT="$S3_PUBLIC_ENDPOINT" \
  --from-literal=S3_REGION="$aws_region" \
  --from-literal=S3_BUCKET="$S3_BUCKET" \
  --from-literal=S3_FORCE_PATH_STYLE=false \
  --dry-run=client -o yaml | kubectl apply -f -)"
printf '%s\n' "$runtime_result"
runtime_changed=0
[[ "$runtime_result" == *unchanged* || "$runtime_existed" == 0 ]] || runtime_changed=1

estimation_existed=0
kubectl -n relay get secret relay-estimation-config >/dev/null 2>&1 && estimation_existed=1
estimation_result="$(kubectl -n relay create secret generic relay-estimation-config \
  --from-literal=AI_PROVIDER="${AI_PROVIDER:-}" \
  --from-literal=AI_API_KEY="${AI_API_KEY:-}" \
  --from-literal=AI_MODEL="${AI_MODEL:-}" \
  --from-literal=AI_ENDPOINT="${AI_ENDPOINT:-}" \
  --from-literal=AI_TEMPERATURE="${AI_TEMPERATURE:-}" \
  --from-literal=AI_MAX_TOKENS="${AI_MAX_TOKENS:-}" \
  --from-literal=AI_ESTIMATION_TIMEOUT_MS="${AI_ESTIMATION_TIMEOUT_MS:-}" \
  --from-literal=AI_RATE_LIMIT_REQUESTS_PER_MINUTE="${AI_RATE_LIMIT_REQUESTS_PER_MINUTE:-20}" \
  --from-literal=AI_GLOBAL_RATE_LIMIT_REQUESTS_PER_MINUTE="${AI_GLOBAL_RATE_LIMIT_REQUESTS_PER_MINUTE:-300}" \
  --dry-run=client -o yaml | kubectl apply -f -)"
printf '%s\n' "$estimation_result"
estimation_changed=0
[[ "$estimation_result" == *unchanged* || "$estimation_existed" == 0 ]] || estimation_changed=1


# Secrets are generated by CloudFormation and never persisted in the env file.
tokens_existed=0
kubectl -n relay get secret relay-service-tokens >/dev/null 2>&1 && tokens_existed=1
user_token="$(secret_value UserServiceTokenArn)"
supplier_token="$(secret_value SupplierServiceTokenArn)"
credit_token="$(secret_value CreditServiceTokenArn)"
estimation_token="$(secret_value EstimationServiceTokenArn)"
for token in "$user_token" "$supplier_token" "$credit_token" "$estimation_token"; do
  [[ ${#token} -ge 32 && "$token" != *local-internal* ]] || { echo 'Missing or invalid production service token' >&2; exit 1; }
done
tokens_result="$(kubectl -n relay create secret generic relay-service-tokens \
  --from-literal=INTERNAL_USER_SERVICE_TOKEN="$user_token" \
  --from-literal=USER_SERVICE_INTERNAL_TOKEN="$user_token" \
  --from-literal=INTERNAL_SUPPLIER_SERVICE_TOKEN="$supplier_token" \
  --from-literal=CREDIT_SERVICE_INTERNAL_TOKEN="$credit_token" \
  --from-literal=CREDIT_ESTIMATION_SERVICE_TOKEN="$estimation_token" \
  --dry-run=client -o yaml | kubectl apply -f -)"
unset user_token supplier_token credit_token estimation_token token
tokens_changed=0
[[ "$tokens_result" == *unchanged* || "$tokens_existed" == 0 ]] || tokens_changed=1

step "Check Kafka topic initialization"
# Completed Jobs are retained with fingerprints. Run them only when their
# inputs change, or when a new cluster has no matching completed Job.
job_is_current() {
  local name="$1" desired="$2" completed stored
  completed="$(kubectl -n relay get job "$name" -o jsonpath='{.status.succeeded}' 2>/dev/null || true)"
  stored="$(kubectl -n relay get job "$name" -o jsonpath='{.metadata.annotations.relay\.dev/config-hash}' 2>/dev/null || true)"
  [[ "$completed" == 1 && "$stored" == "$desired" ]]
}
hash_inputs() {
  node deploy/scripts/config-tools.mjs tree-hash "$@"
}
topic_hash="$(printf '%s\n' "$msk_arn" \
  "$(sha256sum deploy/scripts/kafka-topics.mjs)" \
  "$(kubectl -n relay get configmap relay-runtime -o jsonpath='{.data.KAFKA_PARTITION_COUNT}')" \
  "$(kubectl -n relay get configmap relay-runtime -o jsonpath='{.data.KAFKA_REPLICATION_FACTOR}')" \
  "$(kubectl -n relay get configmap relay-runtime -o jsonpath='{.data.KAFKA_MIN_IN_SYNC_REPLICAS}')" | sha256sum | cut -d' ' -f1)"
if job_is_current kafka-init "$topic_hash"; then
  echo 'Kafka topics already initialized for this cluster and configuration.'
else
  echo 'Create or expand Kafka topics.'
  kubectl -n relay delete job kafka-init --ignore-not-found
  sed "s|IMAGE_CREDIT_API|$credit_api_image|g" k8s/base/kafka-topics.yaml > "$rendered"
  kubectl apply -f "$rendered"
  if ! kubectl -n relay wait --for=condition=complete job/kafka-init --timeout=15m; then
    echo 'Kafka topic initialization failed. Job and pod diagnostics:' >&2
    kubectl -n relay describe job/kafka-init >&2 || true
    kubectl -n relay get pods -l job-name=kafka-init -o wide >&2 || true
    kubectl -n relay logs job/kafka-init --all-containers=true --tail=100 >&2 || true
    exit 1
  fi
  kubectl -n relay annotate job kafka-init "relay.dev/config-hash=$topic_hash" --overwrite >/dev/null
fi

step "Check database migration Jobs"
migration_sources=(
  "supplier-schema:supplier-service/backend/migrate.js supplier-service/backend/src/schema.sql:$(output SupplierDatabaseEndpoint)"
  "user-migrate:user-service/backend/prisma:$(output UserDatabaseEndpoint)"
  "errand-migrate:errand-service/backend/prisma:$(output ErrandDatabaseEndpoint)"
  "credit-migrate:credit-service/backend/prisma:$(output CreditDatabaseEndpoint)"
)

sed \
  -e "s|IMAGE_HOST|$host_image|g" \
  -e "s|IMAGE_SUPPLIER_FRONTEND|$supplier_frontend_image|g" \
  -e "s|IMAGE_USER_FRONTEND|$user_frontend_image|g" \
  -e "s|IMAGE_ERRAND_FRONTEND|$errand_frontend_image|g" \
  -e "s|IMAGE_CREDIT_FRONTEND|$credit_frontend_image|g" \
  -e "s|IMAGE_SUPPLIER_API|$supplier_api_image|g" \
  -e "s|IMAGE_USER_API|$user_api_image|g" \
  -e "s|IMAGE_USER_AUTH_API|$user_auth_api_image|g" \
  -e "s|IMAGE_ERRAND_API|$errand_api_image|g" \
  -e "s|IMAGE_CREDIT_API|$credit_api_image|g" \
  -e "s|IMAGE_CREDIT_ESTIMATION_API|$credit_estimation_image|g" \
  -e "s|IMAGE_REDIS|$redis_image|g" \
  -e "s|IMAGE_ERRAND_NOTIFICATION|$errand_notification_image|g" \
  -e "s|IMAGE_USER_EVENT_PUBLISHER|$user_event_publisher_image|g" \
  -e "s|IMAGE_ERRAND_EVENT_PUBLISHER|$errand_event_publisher_image|g" \
  k8s/base/migrations.yaml > "$rendered"
for spec in "${migration_sources[@]}"; do
  job="${spec%%:*}"
  inputs="${spec#*:}"
  db_endpoint="${inputs##*:}"
  source_paths="${inputs%:*}"
  # Paths are repository-controlled and intentionally word-split.
  read -r -a source_list <<< "$source_paths"
  desired_hash="$(printf '%s\n' "$db_endpoint" "$(hash_inputs "${source_list[@]}")" | sha256sum | cut -d' ' -f1)"
  if job_is_current "$job" "$desired_hash"; then
    echo "Skipping unchanged completed migration $job."
    continue
  fi
  echo "Running migration $job."
  kubectl -n relay delete job "$job" --ignore-not-found
  awk -v name="$job" 'BEGIN { RS="---"; ORS="---\n" } index($0, "metadata: { name: " name ",") { print }' "$rendered" | kubectl apply -f -
  kubectl -n relay wait --for=condition=complete "job/$job" --timeout=10m
  kubectl -n relay annotate job "$job" "relay.dev/config-hash=$desired_hash" --overwrite >/dev/null
done

sed \
  -e "s|IMAGE_HOST|$host_image|g" \
  -e "s|IMAGE_SUPPLIER_FRONTEND|$supplier_frontend_image|g" \
  -e "s|IMAGE_USER_FRONTEND|$user_frontend_image|g" \
  -e "s|IMAGE_ERRAND_FRONTEND|$errand_frontend_image|g" \
  -e "s|IMAGE_CREDIT_FRONTEND|$credit_frontend_image|g" \
  -e "s|IMAGE_SUPPLIER_API|$supplier_api_image|g" \
  -e "s|IMAGE_USER_API|$user_api_image|g" \
  -e "s|IMAGE_USER_AUTH_API|$user_auth_api_image|g" \
  -e "s|IMAGE_ERRAND_API|$errand_api_image|g" \
  -e "s|IMAGE_CREDIT_API|$credit_api_image|g" \
  -e "s|IMAGE_CREDIT_ESTIMATION_API|$credit_estimation_image|g" \
  -e "s|IMAGE_REDIS|$redis_image|g" \
  -e "s|IMAGE_ERRAND_NOTIFICATION|$errand_notification_image|g" \
  -e "s|IMAGE_USER_EVENT_PUBLISHER|$user_event_publisher_image|g" \
  -e "s|IMAGE_ERRAND_EVENT_PUBLISHER|$errand_event_publisher_image|g" \
  k8s/base/workloads.yaml | kubectl apply -f -
step "Apply autoscaling, ingress, and wait for workloads"
if [[ "$config_changed" == 1 || "$runtime_changed" == 1 || "$tokens_changed" == 1 ]]; then
  echo 'Runtime configuration changed; restarting environment-dependent workloads.'
  kubectl -n relay rollout restart deployment/user-api deployment/errand-api deployment/credit-api deployment/supplier-api deployment/user-event-publisher deployment/errand-event-publisher deployment/user-auth-api deployment/errand-notification deployment/credit-estimation-api
fi
if [[ "$estimation_changed" == 1 && "$config_changed" == 0 && "$runtime_changed" == 0 ]]; then
  echo 'AI configuration changed; restarting credit-estimation-api.'
  kubectl -n relay rollout restart deployment/credit-estimation-api
fi
# Pin the upstream core manifest; no Helm installation is required.
kubectl apply --server-side -f https://github.com/kedacore/keda/releases/download/v2.17.3/keda-2.17.3-core.yaml
bash deploy/scripts/wait-for-crds.sh crd/scaledobjects.keda.sh crd/triggerauthentications.keda.sh
kubectl -n keda rollout status deployment/keda-operator --timeout=5m
kubectl -n keda rollout status deployment/keda-metrics-apiserver --timeout=5m
# Migrate the existing HPA before KEDA creates its own for the same deployment.
kubectl -n relay delete hpa credit-api --ignore-not-found
kubectl apply -f k8s/base/autoscaling.yaml
sed -e "s|KEDA_KAFKA_BROKERS|$msk_brokers|g" \
    -e 's/KEDA_KAFKA_SASL/scram_sha512/' -e 's/KEDA_KAFKA_TLS/enable/' \
    k8s/base/keda-credit.yaml | kubectl apply -f -
sed "s/PRIVATE_ALB_SECURITY_GROUP_ID/$(output PrivateAlbSecurityGroupId)/g" k8s/base/ingress.yaml > "$rendered"
kubectl apply -f "$rendered"
kubectl -n relay get deployment -o name | while read -r deployment; do
  kubectl -n relay rollout status "$deployment" --timeout=10m
done
# During migration the ingress can temporarily report the old public ALB.
# Wait for the controller to report an active internal replacement.
alb_dns=""
alb_arn=""
for attempt in $(seq 1 60); do
  alb_dns="$(kubectl -n relay get ingress relay -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')"
  if [[ -n "$alb_dns" ]]; then
    alb_arn="$(aws elbv2 describe-load-balancers --region "$aws_region" \
      --query "LoadBalancers[?DNSName=='$alb_dns' && Scheme=='internal' && State.Code=='active'].LoadBalancerArn | [0]" --output text)"
    [[ "$alb_arn" == arn:* ]] && break
  fi
  sleep 10
done
[[ "$alb_arn" == arn:* ]] || { echo 'Active internal ALB did not appear after ten minutes' >&2; exit 1; }
gateway_stack="${stack_name}-gateway"
step "Create or update the streaming API Gateway proxy and VPC link"
aws cloudformation deploy --region "$aws_region" --stack-name "$gateway_stack" \
  --template-file infra/relay-gateway.yaml --parameter-overrides \
  "VpcLinkSubnetA=$(output PrivateSubnetAId)" "VpcLinkSubnetB=$(output PrivateSubnetBId)" \
  "VpcLinkSecurityGroupId=$(output VpcLinkSecurityGroupId)" "LoadBalancerArn=$alb_arn" \
  "LoadBalancerDnsName=$alb_dns"
gateway_output() {
  aws cloudformation describe-stacks --region "$aws_region" --stack-name "$gateway_stack" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
gateway_api_id="$(gateway_output ApiId)"
gateway_domain="$(gateway_output ApiDomainName)"
# REST API stages are snapshots; refresh after changes to methods or integrations.
aws apigateway create-deployment --region "$aws_region" --rest-api-id "$gateway_api_id" \
  --stage-name relay >/dev/null
# CloudFront provides the trusted HTTPS hostname without Route 53 or ACM.
edge_stack="${stack_name}-edge"
step "Create or update CloudFront edge distribution"
aws cloudformation deploy \
  --region "$aws_region" \
  --stack-name "$edge_stack" \
  --template-file infra/relay-cloudfront.yaml \
  --parameter-overrides "LoadBalancerDnsName=$gateway_domain" DistributionEnabled=true
edge_output() {
  aws cloudformation describe-stacks --region "$aws_region" --stack-name "$edge_stack" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
distribution_id="$(edge_output DistributionId)"
public_origin="https://$(edge_output DistributionDomainName)"
aws cloudfront wait distribution-deployed --id "$distribution_id"
# The auth pod starts with a fail-closed origin until CloudFront has a hostname.
current_origin="$(kubectl -n relay get secret relay-runtime -o jsonpath='{.data.AUTH_PUBLIC_ORIGIN}' | node deploy/scripts/config-tools.mjs decode)"
if [[ "$current_origin" != "$public_origin" ]]; then
  echo 'CloudFront origin changed; updating and restarting user-auth-api.'
  origin_patch="$(node -e 'const data=Buffer.from(process.argv[1]).toString("base64"); process.stdout.write(JSON.stringify({data:{AUTH_PUBLIC_ORIGIN:data}}))' "$public_origin")"
  kubectl -n relay patch secret relay-runtime --type merge -p "$origin_patch" >/dev/null
  kubectl -n relay rollout restart deployment/user-auth-api
  kubectl -n relay rollout status deployment/user-auth-api --timeout=10m
fi
for attempt in $(seq 1 30); do
  curl --fail --silent --show-error --max-time 10 "$public_origin/healthz" >/dev/null 2>&1 && break
  sleep 10
done
curl --fail --show-error --max-time 10 "$public_origin/healthz"
echo "Deployment complete: $public_origin"
