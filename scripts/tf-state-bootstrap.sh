#!/usr/bin/env bash
set -euo pipefail

export AWS_PROFILE="${AWS_PROFILE:-nusisb_IsbUsersPS-986918902548}"
export AWS_REGION="${AWS_REGION:-ap-southeast-1}"

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
BOOTSTRAP_DIR="$REPO_ROOT/infra/terraform-bootstrap"

echo "Creating the shared Terraform state bucket (profile: $AWS_PROFILE, region: $AWS_REGION)."
echo "Run 'aws sso login' first if your SSO session has expired."
echo

terraform -chdir="$BOOTSTRAP_DIR" init
terraform -chdir="$BOOTSTRAP_DIR" apply

echo
echo "State bucket ready:"
terraform -chdir="$BOOTSTRAP_DIR" output -raw bucket_name
echo
