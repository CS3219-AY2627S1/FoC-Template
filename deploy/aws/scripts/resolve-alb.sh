#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:=ap-southeast-1}"
namespace=${KUBERNETES_NAMESPACE:-foc-staging}

for _ in $(seq 1 120); do
  dns=$(kubectl -n "$namespace" get ingress gateway -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)
  [[ -n $dns ]] && break
  sleep 5
done
[[ -n ${dns:-} ]] || { echo 'Timed out waiting for the private ALB hostname.' >&2; exit 1; }

arn=$(aws --region "$AWS_REGION" elbv2 describe-load-balancers \
  --query "LoadBalancers[?DNSName=='$dns'].LoadBalancerArn | [0]" --output text)
[[ $arn == arn:aws:* ]] || { echo 'Could not resolve the private ALB ARN.' >&2; exit 1; }

printf 'alb_dns_name=%s\n' "$dns"
printf 'alb_arn=%s\n' "$arn"
if [[ -n ${GITHUB_OUTPUT:-} ]]; then
  printf 'alb_dns_name=%s\nalb_arn=%s\n' "$dns" "$arn" >> "$GITHUB_OUTPUT"
fi
