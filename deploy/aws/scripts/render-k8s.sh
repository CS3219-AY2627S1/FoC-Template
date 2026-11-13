#!/usr/bin/env bash
set -euo pipefail

: "${RDS_HOST:?RDS_HOST is required}"
: "${RDS_MASTER_SECRET_ARN:?RDS_MASTER_SECRET_ARN is required}"
: "${ALB_SECURITY_GROUP_ID:?ALB_SECURITY_GROUP_ID is required}"
: "${AWS_REGION:=ap-southeast-1}"
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
manifest=$(mktemp)
trap 'rm -f "$manifest"' EXIT

kubectl kustomize --load-restrictor=LoadRestrictionsNone "$root/deploy/aws/k8s/staging" > "$manifest"
sed \
  -e "s|RDS_HOST_REPLACED_BY_DEPLOY_SCRIPT|$RDS_HOST|g" \
  -e "s|RDS_MASTER_SECRET_ARN_REPLACED_BY_DEPLOY_SCRIPT|$RDS_MASTER_SECRET_ARN|g" \
  -e "s|ALB_SECURITY_GROUP_REPLACED_BY_DEPLOY_SCRIPT|$ALB_SECURITY_GROUP_ID|g" \
  -e "s|AWS_REGION_REPLACED_BY_DEPLOY_SCRIPT|$AWS_REGION|g" \
  -e "s|CHAT_S3_BUCKET_REPLACED_BY_DEPLOY_SCRIPT|$CHAT_S3_BUCKET|g" \
  -e "s|CHAT_SERVICE_ROLE_ARN_REPLACED_BY_DEPLOY_SCRIPT|$CHAT_SERVICE_ROLE_ARN|g" \
  -e "s|SUPPLIER_S3_BUCKET_REPLACED_BY_DEPLOY_SCRIPT|$SUPPLIER_S3_BUCKET|g" \
  -e "s|SUPPLIER_SERVICE_ROLE_ARN_REPLACED_BY_DEPLOY_SCRIPT|$SUPPLIER_SERVICE_ROLE_ARN|g" \
  -e "s|MSK_BOOTSTRAP_SERVERS_REPLACED_BY_DEPLOY_SCRIPT|$MSK_BOOTSTRAP_SERVERS|g" \
  -e "s|image: foc-gateway-service:bootstrap|image: $GATEWAY_IMAGE|g" \
  -e "s|image: foc-user-service:bootstrap|image: $USER_IMAGE|g" \
  -e "s|image: foc-supplier-service:bootstrap|image: $SUPPLIER_IMAGE|g" \
  -e "s|image: foc-order-service:bootstrap|image: $ORDER_IMAGE|g" \
  -e "s|image: foc-credit-service:bootstrap|image: $CREDIT_IMAGE|g" \
  -e "s|image: foc-admin-service:bootstrap|image: $ADMIN_IMAGE|g" \
  -e "s|image: foc-chat-service:bootstrap|image: $CHAT_IMAGE|g" \
  -e "s|image: foc-notification-service:bootstrap|image: $NOTIFICATION_IMAGE|g" \
  "$manifest"
