#!/usr/bin/env bash
set -euo pipefail

region=${AWS_REGION:-ap-southeast-1}
profile_args=()
if [[ -n ${AWS_PROFILE:-} ]]; then profile_args=(--profile "$AWS_PROFILE"); fi

account_id=$(aws "${profile_args[@]}" sts get-caller-identity --query Account --output text)
bucket="foc-team-12-terraform-state-${account_id}-${region}"

if ! aws "${profile_args[@]}" s3api head-bucket --bucket "$bucket" 2>/dev/null; then
  if [[ $region == us-east-1 ]]; then
    aws "${profile_args[@]}" s3api create-bucket --bucket "$bucket" >/dev/null
  else
    aws "${profile_args[@]}" s3api create-bucket --bucket "$bucket" \
      --create-bucket-configuration "LocationConstraint=$region" >/dev/null
  fi
fi

aws "${profile_args[@]}" s3api put-public-access-block --bucket "$bucket" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws "${profile_args[@]}" s3api put-bucket-versioning --bucket "$bucket" \
  --versioning-configuration Status=Enabled
aws "${profile_args[@]}" s3api put-bucket-encryption --bucket "$bucket" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'

mkdir -p .aws-local
for stack in bootstrap staging-core staging-edge; do
  cat > ".aws-local/${stack}-backend.hcl" <<EOF
bucket = "$bucket"
key    = "$stack/terraform.tfstate"
region = "$region"
EOF
done
cat > .aws-local/bootstrap.tfvars <<EOF
state_bucket_name = "$bucket"
EOF

printf 'Terraform state bucket is ready: %s\n' "$bucket"
printf 'Backend files were written under ignored .aws-local/. No credentials were stored.\n'
