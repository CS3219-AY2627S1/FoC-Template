#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Terra), date: 2026-11-06
# Scope: Generated implementation of local EKS monitoring views and startup handling
# Author review: Verified that the views all work.

set -euo pipefail
cd "$(dirname "$0")/../.."
action="${1:-}"
view="${2:-}"
if [[ "$action" != start && "$action" != stop ]] || [[ ! "$view" =~ ^(kafka|user|errand|credit|headlamp|all)$ ]]; then
  echo "Usage: $0 start|stop kafka|user|errand|credit|headlamp|all" >&2
  exit 2
fi
[[ -s floci/eks/.kubeconfig ]] || { echo "Run npm run up:eks first." >&2; exit 2; }
export KUBECONFIG="$PWD/floci/eks/.kubeconfig"
if [[ "$view" == all ]]; then views=(kafka user errand credit headlamp); else views=("$view"); fi
for item in "${views[@]}"; do
  case "$item" in
    kafka) service=relay-kafka-ui; local_port=9081; service_port=8080 ;;
    user) service=relay-user-prisma-studio; local_port=6555; service_port=5555 ;;
    errand) service=relay-errand-prisma-studio; local_port=6556; service_port=5555 ;;
    credit) service=relay-credit-prisma-studio; local_port=6557; service_port=5555 ;;
    headlamp) service=relay-headlamp; local_port=9082; service_port=4466 ;;
  esac
  pid_file="floci/eks/.view-$item.pid"
  if [[ -s "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    kill "$(cat "$pid_file")"
  fi
  rm -f "$pid_file"
  if [[ "$action" == stop ]]; then
    kubectl delete -f "k8s/floci/views/$item.yaml" --ignore-not-found
    continue
  fi
  if [[ "$item" =~ ^(user|errand|credit)$ ]]; then
    # Reuse the image already deployed in this cluster; host Docker image names
    # are not visible to k3s and may not exist in a remote registry.
    api_image="$(kubectl -n relay get deployment "$item-api" -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].image}')"
    [[ "$api_image" =~ ^[a-zA-Z0-9._:/@-]+$ ]] || {
      echo "Could not determine the $item API image. Run npm run up:eks first." >&2
      exit 1
    }
    sed "s|STUDIO_API_IMAGE|$api_image|g" "k8s/floci/views/$item.yaml" | kubectl apply -f -
  else
    kubectl apply -f "k8s/floci/views/$item.yaml"
  fi
  kubectl -n relay rollout status "deployment/$service" --timeout=5m
  nohup kubectl -n relay port-forward --address 127.0.0.1 "service/$service" "$local_port:$service_port" >"floci/eks/.view-$item.log" 2>&1 &
  echo $! > "$pid_file"
  for attempt in $(seq 1 30); do
    curl --max-time 2 -fsS "http://127.0.0.1:$local_port/" -o /dev/null 2>/dev/null && break
    sleep 2
  done
  curl --max-time 5 -fsS "http://127.0.0.1:$local_port/" -o /dev/null
  echo "$item view: http://localhost:$local_port"
  if [[ "$item" == headlamp ]]; then
    echo "Headlamp login token (valid for 8 hours):"
    kubectl -n relay create token relay-headlamp-admin --duration=8h
  fi
done
