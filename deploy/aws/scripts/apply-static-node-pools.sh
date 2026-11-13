#!/usr/bin/env bash
set -euo pipefail

: "${STATIC_NODE_POOL_TIMEOUT_SECONDS:=900}"

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
manifest="$root/deploy/aws/k8s/staging/static-node-pools.yaml"

kubectl apply -f "$manifest"

wait_for_pool() {
  local pool=$1
  local expected_zone=$2
  local deadline=$((SECONDS + STATIC_NODE_POOL_TIMEOUT_SECONDS))
  local ready_node

  while ((SECONDS < deadline)); do
    ready_node=$(kubectl get nodes -l "karpenter.sh/nodepool=$pool" \
      -o jsonpath='{range .items[*]}{.metadata.name}{"|"}{.metadata.labels.topology\.kubernetes\.io/zone}{"|"}{range .status.conditions[?(@.type=="Ready")]}{.status}{end}{"\n"}{end}' \
      2>/dev/null | awk -F '|' -v zone="$expected_zone" '$2 == zone && $3 == "True" {print $1; exit}')
    if [[ -n $ready_node ]]; then
      echo "Static NodePool $pool has Ready worker $ready_node in $expected_zone."
      return 0
    fi
    sleep 10
  done

  echo "Static NodePool $pool did not provide a Ready worker in $expected_zone within ${STATIC_NODE_POOL_TIMEOUT_SECONDS}s." >&2
  kubectl get nodepool "$pool" -o yaml >&2 || true
  kubectl get nodeclaims -l "karpenter.sh/nodepool=$pool" -o wide >&2 || true
  kubectl get nodes -l "karpenter.sh/nodepool=$pool" -o wide >&2 || true
  return 1
}

wait_for_pool foc-static-1a ap-southeast-1a
wait_for_pool foc-static-1b ap-southeast-1b

kubectl get nodepool foc-static-1a foc-static-1b
kubectl get nodes -l friendoncampus.com/capacity=static \
  -L topology.kubernetes.io/zone,karpenter.sh/nodepool
