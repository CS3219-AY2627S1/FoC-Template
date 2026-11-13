#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6 Sol), date: 2026-11-05
# Scope: Generated implementation of local EKS service-account AWS credential injection
# Author review: Verified correctness and documented floci behavior difference.

set -euo pipefail

# Floci does not inject IRSA environment variables or projected tokens.
# Apply this after the shared AWS workload manifest is installed.
service_accounts_file="${AWS_ACCESS_SERVICE_ACCOUNTS_FILE:?}"
role_for() {
  sed -n "s|.*eks.amazonaws.com/role-arn: ||p" "$service_accounts_file" | sed -n "$1"p
}
user_role="$(role_for 1)"
auth_role="$(role_for 2)"
[[ -n "$user_role" && -n "$auth_role" ]]

inject() {
  local deployment="$1" container="$2" role="$3"
  local patch
  patch="$(printf '{"spec":{"template":{"spec":{"volumes":[{"name":"aws-iam-token","projected":{"sources":[{"serviceAccountToken":{"audience":"sts.amazonaws.com","expirationSeconds":86400,"path":"token"}}]}}],"containers":[{"name":"%s","env":[{"name":"AWS_ROLE_ARN","value":"%s"},{"name":"AWS_WEB_IDENTITY_TOKEN_FILE","value":"/var/run/secrets/eks.amazonaws.com/serviceaccount/token"}],"volumeMounts":[{"name":"aws-iam-token","mountPath":"/var/run/secrets/eks.amazonaws.com/serviceaccount","readOnly":true}]}]}}}}' "$container" "$role")"
  kubectl -n relay patch deployment "$deployment" --type strategic -p "$patch"
}
inject user-api api "$user_role"
inject user-auth-api api "$auth_role"
