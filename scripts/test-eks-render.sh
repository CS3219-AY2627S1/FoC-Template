#!/usr/bin/env bash
# Focused, cluster-free regression check for all EKS Kustomize stages.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

bash ./scripts/eks-deploy.sh --render-only

AWS_ACCOUNT_ID=123456789012 \
AWS_REGION=us-west-2 \
IMAGE_TAG=release-42 \
STORAGE_CLASS=custom-gp3 \
FRONTEND_COOKIE_SECURE=true \
  bash ./scripts/eks-deploy.sh --render-only

# The base manifests must retain kind's local images and pull policy.
kind_apps="$(kubectl kustomize deploy/k8s/apps)"
grep -q 'image: foc-frontend-service:local' <<<"$kind_apps"
grep -q 'imagePullPolicy: Never' <<<"$kind_apps"

echo "EKS rendering and local kind compatibility checks passed."
