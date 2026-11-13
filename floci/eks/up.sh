#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Terra), date: 2026-11-06
# Scope: Generated implementation of local EKS deployment, resource configuration, and startup recovery
# Author review: Verified local floci AWS emulation works and closely matches AWS, with differences documented.

# Secret-bearing commands must not be exposed by inherited shell tracing.
set +x
set -euo pipefail
cd "$(dirname "$0")/../.."
# Optional provider values are shared with the AWS deployment.
if [[ -f deploy/relay.aws.env ]]; then
  set -a
  source deploy/relay.aws.env
  set +a
fi
no_cache=0
for arg in "$@"; do
  case "$arg" in
    --no-cache) no_cache=1 ;;
    *) echo "Unknown option: $arg (supported: --no-cache)" >&2; exit 2 ;;
  esac
done
if (( no_cache )) && [[ "${REUSE_FLOCI:-0}" == 1 ]]; then
  echo '--no-cache requires restarting Floci EKS; unset REUSE_FLOCI.' >&2
  exit 2
fi

# Warn before startup; an initialized Floci secret may still supply these values.
source deploy/scripts/ai-secret.sh
if ! ai_env_valid; then
  echo 'Warning: AI provider values are missing from the environment. An existing Floci secret may supply them; otherwise credit estimation will not function.' >&2
fi

# Compose remains available at localhost:8080; this is a separate Floci instance.
docker volume create relay-floci-eks-ca >/dev/null
if [[ "${REUSE_FLOCI:-0}" != 1 ]]; then
  if (( no_cache )); then
    docker compose -f compose.eks.yaml --project-name relay-eks build --no-cache floci-eks
    docker compose -f compose.eks.yaml --project-name relay-eks up -d --no-build
  else
    docker compose -f compose.eks.yaml --project-name relay-eks up -d --build
  fi
else
  [[ "$(docker inspect relay-floci-eks --format '{{.State.Health.Status}}' 2>/dev/null || true)" == healthy ]] || {
    echo 'REUSE_FLOCI=1 requires an already healthy local Floci EKS container.' >&2
    exit 1
  }
fi
for i in $(seq 1 300); do
  [[ "$(docker inspect relay-floci-eks --format '{{.State.Health.Status}}' 2>/dev/null || true)" == healthy ]] && docker exec relay-floci-eks test -s /app/data/relay-auth.env && docker exec relay-floci-eks test -s /app/data/relay-rds.env && docker exec relay-floci-eks test -s /app/data/relay-aws-access.env && break
  sleep 3
done
[[ "$(docker inspect relay-floci-eks --format '{{.State.Health.Status}}')" == healthy ]]
docker exec relay-floci-eks test -s /app/data/relay-rds.env
docker exec relay-floci-eks test -s /app/data/relay-aws-access.env
s3_bucket="$(docker exec -e AWS_ENDPOINT_URL=http://127.0.0.1:4566 \
  -e AWS_DEFAULT_REGION=us-east-1 -e AWS_ACCESS_KEY_ID=test -e AWS_SECRET_ACCESS_KEY=test \
  relay-floci-eks aws cloudformation describe-stacks --stack-name relay-local-storage \
  --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' --output text)"
[[ -n "$s3_bucket" && "$s3_bucket" != None ]]
# The auth stack chooses its own pool and app client IDs.
auth_output="$(docker exec relay-floci-eks cat /app/data/relay-auth.env)"
COGNITO_USER_POOL_ID="$(printf '%s\n' "$auth_output" | sed -n 's/^COGNITO_USER_POOL_ID=//p')"
COGNITO_CLIENT_ID="$(printf '%s\n' "$auth_output" | sed -n 's/^COGNITO_CLIENT_ID=//p')"
[[ -n "$COGNITO_USER_POOL_ID" && -n "$COGNITO_CLIENT_ID" ]]
export COGNITO_USER_POOL_ID COGNITO_CLIENT_ID
rds_output="$(docker exec relay-floci-eks cat /app/data/relay-rds.env)"
rds_value() { printf '%s\n' "$rds_output" | sed -n "s/^$1=//p"; }
for name in USER ERRAND CREDIT SUPPLIER; do
  host="$(rds_value "${name}_DATABASE_HOST")"
  port="$(rds_value "${name}_DATABASE_PORT")"
  password="$(rds_value "${name}_DATABASE_PASSWORD")"
  [[ -n "$host" && "$port" =~ ^[0-9]+$ && -n "$password" ]]
  printf -v "${name}_DATABASE_HOST" '%s' "$host"
  printf -v "${name}_DATABASE_PORT" '%s' "$port"
  printf -v "${name}_DATABASE_PASSWORD" '%s' "$password"
done

node=floci-aws-eks-relay-local
for i in $(seq 1 120); do
  docker exec "$node" test -f /etc/rancher/k3s/k3s.yaml >/dev/null 2>&1 && break
  sleep 3
done
docker exec "$node" test -f /etc/rancher/k3s/k3s.yaml
port="$(docker port "$node" 6443/tcp | head -1 | sed 's/.*://')"
docker cp "$node:/etc/rancher/k3s/k3s.yaml" floci/eks/.kubeconfig
# BSD sed (macOS) and GNU sed use different in-place editing flags.
kubeconfig_tmp="$(mktemp)"
sed "s|https://127.0.0.1:6443|https://127.0.0.1:$port|" floci/eks/.kubeconfig > "$kubeconfig_tmp"
mv "$kubeconfig_tmp" floci/eks/.kubeconfig
export KUBECONFIG="$PWD/floci/eks/.kubeconfig"
kubectl wait --for=condition=Ready node --all --timeout=120s

if (( no_cache )) || [[ "${SKIP_IMAGE_BUILD:-0}" != 1 ]]; then
  build_options=()
  if (( no_cache )); then build_options+=(--no-cache); fi
  KAFKA_BROKERS=bootstrap USER_DATABASE_URL=bootstrap ERRAND_DATABASE_URL=bootstrap CREDIT_DATABASE_URL=bootstrap SUPPLIER_DATABASE_URL=bootstrap SUPPLIER_DATABASE_PORT=7004 SUPPLIER_DATABASE_PASSWORD=bootstrap docker compose -f compose.yaml --project-name relay build "${build_options[@]}" host supplier-frontend user-frontend errand-frontend credit-frontend supplier-api user-api user-auth-api errand-api credit-api credit-estimation-api errand-notification user-event-publisher errand-event-publisher
fi
images=(relay-host relay-supplier-frontend relay-user-frontend relay-errand-frontend relay-credit-frontend relay-supplier-api relay-user-api relay-user-auth-api relay-errand-api relay-credit-api relay-credit-estimation-api relay-errand-notification relay-user-event-publisher relay-errand-event-publisher relay-redis)
floci_aws() {
  docker exec -i -e AWS_ENDPOINT_URL=http://127.0.0.1:4566 -e AWS_REGION=us-east-1 \
    -e AWS_DEFAULT_REGION=us-east-1 -e AWS_ACCESS_KEY_ID=test \
    -e AWS_SECRET_ACCESS_KEY=test relay-floci-eks aws "$@"
}
AI_SECRET_ID="relay-local-eks/credit-estimation-ai"
ai_aws() { floci_aws "$@"; }
ai_secret_preflight quiet
ai_secret_initialize
ai_secret_export_values

if (( no_cache )) || [[ "${SKIP_IMAGE_PUSH:-0}" != 1 ]]; then
  # Mirror the upstream image in local ECR without building a wrapper image.
  docker pull redis:7-alpine
  docker tag redis:7-alpine relay-redis:latest
  floci_aws ecr get-login-password | docker login --username AWS --password-stdin localhost:4567
fi
for image in "${images[@]}"; do
  repository="${image#relay-}"
  floci_aws ecr describe-repositories --repository-names "$repository" >/dev/null 2>&1 || floci_aws ecr create-repository --repository-name "$repository" >/dev/null
  uri="$(floci_aws ecr describe-repositories --repository-names "$repository" --query 'repositories[0].repositoryUri' --output text)"
  [[ "$uri" == localhost:4567/* ]]
  if (( no_cache )) || [[ "${SKIP_IMAGE_PUSH:-0}" != 1 ]]; then
    docker tag "$image:latest" "$uri:latest"
    docker push "$uri:latest"
  fi
  printf -v "IMAGE_${repository//-/_}" '%s' "$uri:latest"
done

kubectl apply -f k8s/base/namespace.yaml -f k8s/base/configmap.yaml -f k8s/floci/traefik.yaml
kubectl -n relay delete deployment user-postgres errand-postgres credit-postgres supplier-postgres --ignore-not-found
kubectl -n relay delete service user-postgres errand-postgres credit-postgres supplier-postgres --ignore-not-found
floci_ip="$(docker inspect relay-floci-eks --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')"
sed "s/FLOCI_DOCKER_IP/$floci_ip/g" k8s/floci/floci-service.yaml | kubectl apply -f -
msk_output="$(docker exec relay-floci-eks cat /app/data/relay-msk.env)"
msk_brokers="$(printf '%s\n' "$msk_output" | sed -n 's/^MSK_BROKERS=//p')"
[[ -n "$msk_brokers" ]]
broker_host=""
broker_ip="${msk_brokers%%:*}"
for candidate in $(docker ps --filter name=floci-aws-msk --format '{{.Names}}'); do
  candidate_ip="$(docker inspect "$candidate" --format '{{with index .NetworkSettings.Networks "relay-eks_default"}}{{.IPAddress}}{{end}}')"
  if [[ "$candidate_ip" == "$broker_ip" ]]; then broker_host="$candidate"; break; fi
done
[[ -n "$broker_host" ]]
node_hosts="$(kubectl -n kube-system get configmap coredns -o jsonpath='{.data.NodeHosts}')"
dns_patch="$(printf '%s' "$node_hosts" | docker exec -i relay-floci-eks jq -Rs --arg host "$broker_host" --arg ip "$broker_ip" '{data:{NodeHosts: ((split("\n") | map(select(. != "" and (endswith(" " + $host) | not))) | join("\n")) + "\n" + $ip + " " + $host + "\n")}}')"
kubectl -n kube-system patch configmap coredns --type merge -p "$dns_patch"
kubectl -n kube-system rollout restart deployment/coredns
kubectl -n kube-system rollout status deployment/coredns --timeout=2m
kubectl -n relay delete deployment kafka --ignore-not-found
kubectl -n relay delete service kafka --ignore-not-found
kubectl -n relay delete job kafka-init --ignore-not-found

# CloudFront reaches the internal ALB through Floci's HTTP listener.
node_ip="$(docker inspect "$node" --format '{{with index .NetworkSettings.Networks "relay-eks_default"}}{{.IPAddress}}{{end}}')"
[[ -n "$node_ip" ]]
stack=relay-local-rds
subnet_a="$(floci_aws cloudformation describe-stack-resource --stack-name "$stack" --logical-resource-id SubnetA --query StackResourceDetail.PhysicalResourceId --output text)"
subnet_b="$(floci_aws cloudformation describe-stack-resource --stack-name "$stack" --logical-resource-id SubnetB --query StackResourceDetail.PhysicalResourceId --output text)"
vpc_id="$(floci_aws cloudformation describe-stack-resource --stack-name "$stack" --logical-resource-id Vpc --query StackResourceDetail.PhysicalResourceId --output text)"
load_balancer_arn="$(floci_aws elbv2 describe-load-balancers --names relay-local-http --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || true)"
if [[ -z "$load_balancer_arn" || "$load_balancer_arn" == None ]]; then
  load_balancer_arn="$(floci_aws elbv2 create-load-balancer --name relay-local-http --type application --scheme internal --subnets "$subnet_a" "$subnet_b" --query 'LoadBalancers[0].LoadBalancerArn' --output text)"
fi
floci_aws elbv2 modify-load-balancer-attributes --load-balancer-arn "$load_balancer_arn" --attributes Key=routing.http.preserve_host_header.enabled,Value=true >/dev/null
target_group_arn="$(floci_aws elbv2 describe-target-groups --names relay-local-traefik --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || true)"
if [[ -z "$target_group_arn" || "$target_group_arn" == None ]]; then
  target_group_arn="$(floci_aws elbv2 create-target-group --name relay-local-traefik --protocol HTTP --port 30080 --target-type ip --vpc-id "$vpc_id" --health-check-path /healthz --query 'TargetGroups[0].TargetGroupArn' --output text)"
fi
floci_aws elbv2 register-targets --target-group-arn "$target_group_arn" --targets "Id=$node_ip,Port=30080" >/dev/null
http_listener="$(floci_aws elbv2 describe-listeners --load-balancer-arn "$load_balancer_arn" --query 'Listeners[?Port==`18080`].ListenerArn | [0]' --output text)"
if [[ -z "$http_listener" || "$http_listener" == None ]]; then
  floci_aws elbv2 create-listener --load-balancer-arn "$load_balancer_arn" --protocol HTTP --port 18080 --default-actions "Type=forward,TargetGroupArn=$target_group_arn" >/dev/null
fi
# Floci REST API emulates the proxy data path. Its VPC-link implementation
# differs from AWS VPC Link V2; use its REST VPC Link metadata locally.
local_api_id="$(floci_aws apigateway get-rest-apis --query "items[?name=='relay-local-proxy'].id | [0]" --output text)"
if [[ -z "$local_api_id" || "$local_api_id" == None ]]; then
  local_api_id="$(floci_aws apigateway create-rest-api --name relay-local-proxy --query id --output text)"
fi
root_id="$(floci_aws apigateway get-resources --rest-api-id "$local_api_id" --query "items[?path=='/'].id | [0]" --output text)"
proxy_id="$(floci_aws apigateway get-resources --rest-api-id "$local_api_id" --query "items[?path=='/{proxy+}'].id | [0]" --output text)"
if [[ -z "$proxy_id" || "$proxy_id" == None ]]; then
  proxy_id="$(floci_aws apigateway create-resource --rest-api-id "$local_api_id" --parent-id "$root_id" --path-part '{proxy+}' --query id --output text)"
fi
local_link="$(floci_aws apigateway get-vpc-links --query "items[?name=='relay-local-proxy-link'].id | [0]" --output text)"
if [[ -z "$local_link" || "$local_link" == None ]]; then
  local_link="$(floci_aws apigateway create-vpc-link --name relay-local-proxy-link --target-arns "$load_balancer_arn" --query id --output text)"
fi
if ! floci_aws apigateway get-method --rest-api-id "$local_api_id" --resource-id "$root_id" --http-method ANY >/dev/null 2>&1; then
  floci_aws apigateway put-method --rest-api-id "$local_api_id" --resource-id "$root_id" --http-method ANY --authorization-type NONE >/dev/null
fi
floci_aws apigateway put-integration --rest-api-id "$local_api_id" --resource-id "$root_id" --http-method ANY \
  --type HTTP_PROXY --integration-http-method ANY --connection-type VPC_LINK --connection-id "$local_link" --uri 'http://localhost:18080/' >/dev/null
if ! floci_aws apigateway get-method --rest-api-id "$local_api_id" --resource-id "$proxy_id" --http-method ANY >/dev/null 2>&1; then
  floci_aws apigateway put-method --rest-api-id "$local_api_id" --resource-id "$proxy_id" --http-method ANY --authorization-type NONE \
    --request-parameters 'method.request.path.proxy=true' >/dev/null
fi
floci_aws apigateway put-integration --rest-api-id "$local_api_id" --resource-id "$proxy_id" --http-method ANY \
  --type HTTP_PROXY --integration-http-method ANY --connection-type VPC_LINK --connection-id "$local_link" --uri 'http://localhost:18080/{proxy}' \
  --request-parameters 'integration.request.path.proxy=method.request.path.proxy' >/dev/null
floci_aws apigateway create-deployment --rest-api-id "$local_api_id" --stage-name relay >/dev/null
floci_aws cloudformation deploy --stack-name relay-local-edge \
  --template-file /opt/relay/infra/relay-cloudfront.yaml \
  --parameter-overrides LoadBalancerDnsName=localhost OriginHttpPort=4566 OriginProtocolPolicy=http-only \
    UseAwsApiGatewayPolicy=false "OriginPath=/restapis/$local_api_id/relay/_user_request_"
cloudfront_domain="$(floci_aws cloudformation describe-stacks --stack-name relay-local-edge --query 'Stacks[0].Outputs[?OutputKey==`DistributionDomainName`].OutputValue' --output text)"
# Floci buffers API Gateway responses, so the local SSE path bypasses the gateway.
# Floci CloudFormation also drops cache behavior methods and policy IDs.
# Reconcile the generated distribution through the supported CloudFront API.
distribution_id="$(floci_aws cloudformation describe-stacks --stack-name relay-local-edge --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' --output text)"
origin_policy_id="$(floci_aws cloudformation describe-stack-resource --stack-name relay-local-edge --logical-resource-id RelayOriginRequestPolicy --query StackResourceDetail.PhysicalResourceId --output text)"
config_file="$(mktemp)"
etag="$(floci_aws cloudfront get-distribution-config --id "$distribution_id" --query ETag --output text)"
floci_aws cloudfront get-distribution-config --id "$distribution_id" --query DistributionConfig --output json > "$config_file"
docker cp "$config_file" relay-floci-eks:/tmp/relay-cloudfront-config.json
docker exec relay-floci-eks jq --arg policy "$origin_policy_id" \
  '(.Origins.Items[0] | .Id = "local-sse-direct" | .OriginPath = "" | .CustomOriginConfig.HTTPPort = 18080) as $sseOrigin | .Origins.Items = ((.Origins.Items | map(select(.Id != "local-sse-direct"))) + [$sseOrigin]) | .Origins.Quantity = (.Origins.Items | length) | (.DefaultCacheBehavior | .TargetOriginId = "local-sse-direct" | .PathPattern = "api/notifications/stream*" | .OriginRequestPolicyId = $policy | .CachePolicyId = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" | del(.ForwardedValues)) as $sseBehavior | .CacheBehaviors.Items = ([$sseBehavior] + ((.CacheBehaviors.Items // []) | map(select(.PathPattern != "api/notifications/stream*")))) | .CacheBehaviors.Quantity = (.CacheBehaviors.Items | length) | .DefaultCacheBehavior.AllowedMethods = {Quantity: 7, Items: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"], CachedMethods: {Quantity: 2, Items: ["GET", "HEAD"]}} | .DefaultCacheBehavior.CachePolicyId = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" | .DefaultCacheBehavior.OriginRequestPolicyId = $policy | del(.DefaultCacheBehavior.ForwardedValues)' \
  /tmp/relay-cloudfront-config.json > "$config_file"
docker cp "$config_file" relay-floci-eks:/tmp/relay-cloudfront-config.json
floci_aws cloudfront update-distribution --id "$distribution_id" --if-match "$etag" \
  --distribution-config file:///tmp/relay-cloudfront-config.json >/dev/null
docker exec relay-floci-eks rm -f /tmp/relay-cloudfront-config.json
rm -f "$config_file"
[[ "$cloudfront_domain" == *.cloudfront.localhost.floci.io ]]
public_origin="https://${cloudfront_domain}"

# Shared workload manifests require the same Secret shape as production.
kubectl -n relay create secret generic relay-service-tokens \
  --from-literal=INTERNAL_USER_SERVICE_TOKEN=local-internal-user-service-token \
  --from-literal=USER_SERVICE_INTERNAL_TOKEN=local-internal-user-service-token \
  --from-literal=INTERNAL_SUPPLIER_SERVICE_TOKEN=local-internal-supplier-service-token \
  --from-literal=CREDIT_SERVICE_INTERNAL_TOKEN=local-internal-credit-service-token \
  --from-literal=CREDIT_ESTIMATION_SERVICE_TOKEN=local-internal-estimation-service-token \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n relay create secret generic relay-runtime \
  --from-literal=USER_DATABASE_URL=postgresql://relay:${USER_DATABASE_PASSWORD}@${USER_DATABASE_HOST}:${USER_DATABASE_PORT}/relay?schema=public \
  --from-literal=ERRAND_DATABASE_URL=postgresql://relay:${ERRAND_DATABASE_PASSWORD}@${ERRAND_DATABASE_HOST}:${ERRAND_DATABASE_PORT}/relayerrand?schema=public \
  --from-literal=CREDIT_DATABASE_URL=postgresql://relay:${CREDIT_DATABASE_PASSWORD}@${CREDIT_DATABASE_HOST}:${CREDIT_DATABASE_PORT}/relay?schema=public \
  --from-literal=SUPPLIER_DATABASE_URL=postgresql://relay:${SUPPLIER_DATABASE_PASSWORD}@${SUPPLIER_DATABASE_HOST}:${SUPPLIER_DATABASE_PORT}/relay \
  --from-literal=SUPPLIER_DB_HOST=${SUPPLIER_DATABASE_HOST} \
  --from-literal=SUPPLIER_DB_PORT=${SUPPLIER_DATABASE_PORT} \
  --from-literal=SUPPLIER_DB_PASSWORD=${SUPPLIER_DATABASE_PASSWORD} \
  --from-literal=KAFKA_BROKERS="$msk_brokers" \
  --from-literal=AWS_REGION=us-east-1 \
  --from-literal=AWS_DEFAULT_REGION=us-east-1 \
  --from-literal=AWS_ENDPOINT_URL=http://floci-local:4566 \
  --from-literal=AWS_ENDPOINT_URL_STS=http://floci-local:4566 \
  --from-literal=COGNITO_ENDPOINT_URL=http://floci-local:4566 \
  --from-literal=AUTH_PUBLIC_ORIGIN="$public_origin" \
  --from-literal=COGNITO_ISSUER=https://localhost:4567/${COGNITO_USER_POOL_ID} \
  --from-literal=COGNITO_JWKS_URI=http://floci-local:4566/${COGNITO_USER_POOL_ID}/.well-known/jwks.json \
  --from-literal=COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID} \
  --from-literal=COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID} \
  --from-literal=AUTH_BOOTSTRAP_ADMIN_EMAIL=admin@example.com \
  --from-literal=S3_ENDPOINT=http://floci-local:4566 \
  --from-literal=S3_PUBLIC_ENDPOINT=https://localhost:4567 \
  --from-literal=S3_REGION=us-east-1 \
  --from-literal=S3_BUCKET="$s3_bucket" \
  --from-literal=S3_FORCE_PATH_STYLE=true \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n relay create secret generic relay-estimation-config \
  --from-literal=AI_PROVIDER="${AI_PROVIDER:-}" \
  --from-literal=AI_API_KEY="${AI_API_KEY:-}" \
  --from-literal=AI_MODEL="${AI_MODEL:-}" \
  --from-literal=AI_ENDPOINT="${AI_ENDPOINT:-}" \
  --from-literal=AI_TEMPERATURE="${AI_TEMPERATURE:-}" \
  --from-literal=AI_MAX_TOKENS="${AI_MAX_TOKENS:-}" \
  --from-literal=AI_ESTIMATION_TIMEOUT_MS="${AI_ESTIMATION_TIMEOUT_MS:-}" \
  --from-literal=AI_RATE_LIMIT_REQUESTS_PER_MINUTE="${AI_RATE_LIMIT_REQUESTS_PER_MINUTE:-20}" \
  --from-literal=AI_GLOBAL_RATE_LIMIT_REQUESTS_PER_MINUTE="${AI_GLOBAL_RATE_LIMIT_REQUESTS_PER_MINUTE:-300}" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n relay patch configmap relay-runtime --type merge -p '{"data":{"KAFKA_AUTH_MODE":"none","KAFKA_REPLICATION_FACTOR":"1","KAFKA_MIN_IN_SYNC_REPLICAS":"1"}}'
access_output="$(docker exec relay-floci-eks cat /app/data/relay-aws-access.env)"
access_value() { printf '%s\n' "$access_output" | sed -n "s/^$1=//p"; }
service_accounts="$(mktemp)"
publisher_temporarily_stopped=0
cleanup() {
  if (( publisher_temporarily_stopped )); then
    kubectl -n relay scale deployment/user-event-publisher --replicas=1 >/dev/null 2>&1 || true
  fi
  rm -f "$service_accounts"
}
trap cleanup EXIT
sed \
  -e "s|ROLE_USER_API|$(access_value USER_API_ROLE_ARN)|g" \
  -e "s|ROLE_USER_AUTH_API|$(access_value USER_AUTH_API_ROLE_ARN)|g" \
  k8s/base/serviceaccounts.yaml > "$service_accounts"
if grep -q ROLE_ "$service_accounts"; then echo 'AWS access role output missing' >&2; exit 1; fi
kubectl apply -f "$service_accounts"
render() {
  sed \
    -e "s|IMAGE_HOST|${IMAGE_host}|g" \
    -e "s|IMAGE_SUPPLIER_FRONTEND|${IMAGE_supplier_frontend}|g" \
    -e "s|IMAGE_USER_FRONTEND|${IMAGE_user_frontend}|g" \
    -e "s|IMAGE_ERRAND_FRONTEND|${IMAGE_errand_frontend}|g" \
    -e "s|IMAGE_CREDIT_FRONTEND|${IMAGE_credit_frontend}|g" \
    -e "s|IMAGE_SUPPLIER_API|${IMAGE_supplier_api}|g" \
    -e "s|IMAGE_USER_AUTH_API|${IMAGE_user_auth_api}|g" \
    -e "s|IMAGE_USER_API|${IMAGE_user_api}|g" \
    -e "s|IMAGE_ERRAND_API|${IMAGE_errand_api}|g" \
    -e "s|IMAGE_CREDIT_API|${IMAGE_credit_api}|g" \
    -e "s|IMAGE_CREDIT_ESTIMATION_API|${IMAGE_credit_estimation_api}|g" \
    -e "s|IMAGE_REDIS|${IMAGE_redis}|g" \
    -e "s|IMAGE_ERRAND_NOTIFICATION|${IMAGE_errand_notification}|g" \
    -e "s|IMAGE_USER_EVENT_PUBLISHER|${IMAGE_user_event_publisher}|g" \
    -e "s|IMAGE_ERRAND_EVENT_PUBLISHER|${IMAGE_errand_event_publisher}|g" "$1" |
    sed -E '/^[[:space:]]+image: localhost:4567\/.*:latest$/ { p; s/^([ ]*)image:.*/\1imagePullPolicy: Always/; }' |
    # The emulated single node has much less capacity than AWS Auto Mode.
    # Keep the same 768 MiB limits and Node heap cap, but lower local requests.
    sed -e '/name: DB_SSL_CA_PATH/d' -e 's/memory: 512Mi/memory: 128Mi/g' -e 's/360mb/90mb/g' |
    # Keep the host and remote frontends at one replica on the local node,
    # including their HPA bounds so autoscaling cannot restore extra replicas.
    awk '
      /^---/ { frontend = 0 }
      /^metadata: \{ name: (host|supplier-frontend|user-frontend|errand-frontend|credit-frontend),/ { frontend = 1 }
      frontend && /^  (replicas|minReplicas|maxReplicas):/ { sub(/: [0-9]+/, ": 1") }
      { print }
    '
}
# Recover clusters from either previous request size, including partial runs.
# Free a publisher reservation before rolling existing workloads if needed.
local_workloads=(supplier-api user-api errand-api credit-api user-auth-api credit-estimation-api errand-notification user-event-publisher errand-event-publisher)
needs_resize=0
for workload in "${local_workloads[@]}"; do
  request="$(kubectl -n relay get deployment "$workload" -o jsonpath='{.spec.template.spec.containers[0].resources.requests.memory}' 2>/dev/null || true)"
  if [[ -n "$request" && "$request" != 128Mi ]]; then needs_resize=1; fi
  # A previous run may have updated the Deployment while old Pods still run.
  pod_requests="$(kubectl -n relay get pods -l "app=$workload" -o jsonpath='{range .items[*]}{.spec.containers[0].resources.requests.memory}{" "}{end}' 2>/dev/null || true)"
  for pod_request in $pod_requests; do
    if [[ "$pod_request" != 128Mi ]]; then needs_resize=1; fi
  done
done
if (( needs_resize )); then
  echo 'Reducing existing local workload memory requests before running initialization jobs.'
  if kubectl -n relay get deployment user-event-publisher >/dev/null 2>&1; then
    publisher_temporarily_stopped=1
    kubectl -n relay scale deployment/user-event-publisher --replicas=0
    if [[ -n "$(kubectl -n relay get pods -l app=user-event-publisher -o name)" ]]; then
      kubectl -n relay wait --for=delete pod -l app=user-event-publisher --timeout=2m
    fi
  fi
  for workload in "${local_workloads[@]}"; do
    if kubectl -n relay get deployment "$workload" >/dev/null 2>&1; then
      kubectl -n relay set resources "deployment/$workload" --requests=memory=128Mi
    fi
  done
  for workload in user-api credit-api; do
    if kubectl -n relay get deployment "$workload" >/dev/null 2>&1; then
      kubectl -n relay rollout status "deployment/$workload" --timeout=5m
    fi
  done
fi
render k8s/base/kafka-topics.yaml | kubectl apply -f -
kubectl -n relay wait --for=condition=complete job/kafka-init --timeout=5m
kubectl -n relay delete job supplier-schema user-migrate errand-migrate credit-migrate --ignore-not-found
render k8s/base/migrations.yaml | kubectl apply -f -
kubectl -n relay wait --for=condition=complete job/supplier-schema job/user-migrate job/errand-migrate job/credit-migrate --timeout=10m
render k8s/base/workloads.yaml | kubectl apply -f -
publisher_temporarily_stopped=0
AWS_ACCESS_SERVICE_ACCOUNTS_FILE="$service_accounts" bash floci/eks/inject-aws-access.sh
kubectl -n relay rollout restart deployment/user-api deployment/errand-api deployment/credit-api deployment/supplier-api deployment/user-event-publisher deployment/errand-event-publisher deployment/credit-estimation-api deployment/errand-notification
# Pin the upstream core manifest; no Helm installation is required.
kubectl apply --server-side -f https://github.com/kedacore/keda/releases/download/v2.17.3/keda-2.17.3-core.yaml
bash deploy/scripts/wait-for-crds.sh crd/scaledobjects.keda.sh crd/triggerauthentications.keda.sh
# Keep KEDA's limits intact while reducing local scheduler reservations.
kubectl -n keda set resources deployment/keda-operator deployment/keda-metrics-apiserver --requests=memory=64Mi
kubectl -n keda rollout status deployment/keda-operator --timeout=5m
kubectl -n keda rollout status deployment/keda-metrics-apiserver --timeout=5m
kubectl -n relay delete hpa credit-api --ignore-not-found
render k8s/base/autoscaling.yaml | kubectl apply -f -
# Floci uses plaintext Kafka; its emulation does not implement MSK SCRAM/TLS.
sed -e "s|KEDA_KAFKA_BROKERS|$msk_brokers|g" \
    -e 's/KEDA_KAFKA_SASL/none/' -e 's/KEDA_KAFKA_TLS/disable/' \
    -e '/authenticationRef:/,+1d' k8s/base/keda-credit.yaml | \
    awk 'BEGIN { RS="---\n"; ORS="---\n" } /kind: ScaledObject/ { print }' | kubectl apply -f -
kubectl apply -f k8s/floci/ingress.yaml
kubectl -n relay get deployment -o name | while read -r deployment; do kubectl -n relay rollout status "$deployment" --timeout=10m; done

curl -fsS http://localhost:4567/_floci/ca.pem > floci/eks/.floci-ca.pem
for i in $(seq 1 20); do curl --cacert floci/eks/.floci-ca.pem -fsS "$public_origin/healthz" >/dev/null && break; sleep 2; done
curl --cacert floci/eks/.floci-ca.pem -fsS "$public_origin/healthz"
printf 'Local EKS application: %s\n' "$public_origin"
printf 'Trust floci/eks/.floci-ca.pem in your browser to use the local certificate.\n'
