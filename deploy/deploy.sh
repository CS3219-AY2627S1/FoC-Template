#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6 Sol), date: 2026-11-05
# Scope: Generated implementation of AWS deployment orchestration, SSO setup, and generated configuration
# Author review: Verified steps are ordered correctly and no critical secrets are stored.

# Secret-bearing commands must not be exposed by inherited shell tracing.
set +x
set -euo pipefail
cd "$(dirname "$0")/.."

stack_name="${1:-${STACK_NAME:-relay}}"
auth_stack="${AUTH_STACK:-relay-auth}"
storage_stack="${STORAGE_STACK:-relay-storage}"
env_file="deploy/relay.aws.env"
export AWS_PAGER=""
step() { printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
fail() { printf 'Deployment stopped: %s\n' "$*" >&2; exit 1; }
command -v aws >/dev/null || fail 'Install AWS CLI v2 first.'
command -v docker >/dev/null || fail 'Install Docker first.'
command -v kubectl >/dev/null || fail 'Install kubectl first.'
command -v node >/dev/null || fail 'Install Node.js first.'
command -v openssl >/dev/null || fail 'Install OpenSSL first.'
docker info >/dev/null 2>&1 || fail 'Docker API unavailable. Start Docker and check docker info.'

# Honor an explicit profile; otherwise prefer the documented user profile.
if [[ -z "${AWS_PROFILE:-}" ]]; then
  if aws configure list-profiles | grep -Fxq user; then
    export AWS_PROFILE=user
  else
    read -r -p 'AWS SSO profile name [user]: ' AWS_PROFILE
    export AWS_PROFILE="${AWS_PROFILE:-user}"
  fi
fi
if ! aws configure list-profiles | grep -Fxq "$AWS_PROFILE"; then
  step "Configure AWS SSO profile $AWS_PROFILE"
  aws configure sso --profile "$AWS_PROFILE"
fi
if ! aws sts get-caller-identity >/dev/null 2>&1; then
  step "Sign in with AWS SSO profile $AWS_PROFILE"
  aws sso login --profile "$AWS_PROFILE"
fi
aws sts get-caller-identity >/dev/null || fail 'AWS credentials are unavailable.'
export AWS_REGION="${AWS_REGION:-$(aws configure get region --profile "$AWS_PROFILE" || true)}"
if [[ -z "$AWS_REGION" ]]; then
  read -r -p 'AWS Region [ap-southeast-1]: ' AWS_REGION
  export AWS_REGION="${AWS_REGION:-ap-southeast-1}"
fi
export AWS_DEFAULT_REGION="$AWS_REGION"
step "AWS account $(aws sts get-caller-identity --query Account --output text), region $AWS_REGION, profile $AWS_PROFILE"

# Keep user-specific options while replacing generated IDs and endpoints.
if [[ -f "$env_file" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$env_file"
  set +a
else
  : > "$env_file"
fi
chmod 600 "$env_file"
set_env() {
  local key="$1" value="$2" temp
  temp="$(mktemp)"
  awk -v key="$key" 'index($0, key "=") != 1 { print }' "$env_file" > "$temp"
  printf '%s=%q\n' "$key" "$value" >> "$temp"
  cat "$temp" > "$env_file"
  rm -f "$temp"
}
stack_output() {
  aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text
}
# This preflight happens before any CloudFormation deployment.
source deploy/scripts/ai-secret.sh
AI_SECRET_ID="${stack_name}/credit-estimation-ai"
ai_aws() { aws --region "$AWS_REGION" "$@"; }
ai_secret_preflight strict
step "Create or update Cognito stack $auth_stack"
aws cloudformation deploy --region "$AWS_REGION" --stack-name "$auth_stack" --template-file infra/relay-auth.yaml
step "Create or update profile-image storage stack $storage_stack"
aws cloudformation deploy --region "$AWS_REGION" --stack-name "$storage_stack" --template-file infra/relay-storage.yaml
for mapping in \
  COGNITO_USER_POOL_ID:UserPoolId \
  COGNITO_CLIENT_ID:UserPoolClientId \
  COGNITO_ISSUER:UserPoolIssuer \
  COGNITO_JWKS_URI:UserPoolJwksUri; do
  key="${mapping%%:*}"
  output_name="${mapping#*:}"
  set_env "$key" "$(stack_output "$auth_stack" "$output_name")"
done
for mapping in S3_BUCKET:BucketName S3_ENDPOINT:S3Endpoint S3_PUBLIC_ENDPOINT:S3PublicEndpoint; do
  key="${mapping%%:*}"
  output_name="${mapping#*:}"
  set_env "$key" "$(stack_output "$storage_stack" "$output_name")"
done
export COGNITO_USER_POOL_ID="$(stack_output "$auth_stack" UserPoolId)"
superadmin_group="$(stack_output "$auth_stack" SuperAdminGroupName)"

# Existing stacks keep their Kubernetes version. A new stack uses the newest
# version reported as standard support in this Region unless explicitly set.
existing_cluster="$(stack_output "$stack_name" ClusterName 2>/dev/null || true)"
if [[ -n "$existing_cluster" && "$existing_cluster" != None ]]; then
  k8s_version="$(aws eks describe-cluster --region "$AWS_REGION" --name "$existing_cluster" --query cluster.version --output text)"
else
  k8s_version="${KUBERNETES_VERSION:-}"
  if [[ -z "$k8s_version" ]]; then
    k8s_version="$(aws eks describe-cluster-versions --region "$AWS_REGION" \
      --query 'clusterVersions[?status==`STANDARD_SUPPORT`].clusterVersion' --output text | tr '\t' '\n' | node deploy/scripts/config-tools.mjs latest-version)"
  fi
fi
[[ -n "$k8s_version" && "$k8s_version" != None ]] || fail 'Could not choose a supported Kubernetes version.'
set_env KUBERNETES_VERSION "$k8s_version"
set_env IMAGE_TAG "${IMAGE_TAG:-latest}"
step "Using Kubernetes $k8s_version; generated Cognito and S3 values saved in $env_file"

# Bootstrap only if no member exists. Never store the permanent password.
existing_admin="$(aws cognito-idp list-users-in-group --region "$AWS_REGION" \
  --user-pool-id "$COGNITO_USER_POOL_ID" --group-name "$superadmin_group" \
  --limit 1 --query 'Users[0].Username' --output text)"
if [[ -z "$existing_admin" || "$existing_admin" == None ]]; then
  step 'Create the first super-admin account'
  admin_email="${RELAY_INITIAL_ADMIN_EMAIL:-}"
  admin_password="${RELAY_INITIAL_ADMIN_PASSWORD:-}"
  [[ -n "$admin_email" ]] || read -r -p 'Initial admin email: ' admin_email
  if [[ -z "$admin_password" ]]; then
    read -r -s -p 'Initial admin password: ' admin_password
    printf '\n'
  fi
  [[ -n "$admin_email" && -n "$admin_password" ]] || fail 'Admin email and password are required.'
  if ! aws cognito-idp admin-get-user --region "$AWS_REGION" --user-pool-id "$COGNITO_USER_POOL_ID" --username "$admin_email" >/dev/null 2>&1; then
    aws cognito-idp admin-create-user --region "$AWS_REGION" --user-pool-id "$COGNITO_USER_POOL_ID" \
      --username "$admin_email" --user-attributes "Name=email,Value=$admin_email" Name=email_verified,Value=true \
      --message-action SUPPRESS >/dev/null
  fi
  aws cognito-idp admin-set-user-password --region "$AWS_REGION" --user-pool-id "$COGNITO_USER_POOL_ID" \
    --username "$admin_email" --password "$admin_password" --permanent >/dev/null
  aws cognito-idp admin-add-user-to-group --region "$AWS_REGION" --user-pool-id "$COGNITO_USER_POOL_ID" \
    --username "$admin_email" --group-name "$superadmin_group" >/dev/null
  unset admin_password RELAY_INITIAL_ADMIN_PASSWORD
  step "Initial super-admin $admin_email is ready"
else
  step "Super-admin already exists: $existing_admin; skipping bootstrap"
fi

step 'Deploy EKS, MSK, images, migrations, workloads, ingress, and CloudFront'
bash deploy/scripts/deploy-eks.sh "$stack_name"
step "Deployment finished. Verify workloads with: kubectl -n relay get deployments,pods,jobs,services,ingress"
