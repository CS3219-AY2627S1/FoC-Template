#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

action="${1:-start}"
if [[ $# -gt 2 || ! "$action" =~ ^(start|token|check|stop)$ ]]; then
  echo "Usage: bash deploy/scripts/headlamp.sh [start|token|check|stop] [kube-context]" >&2
  exit 2
fi
command -v kubectl >/dev/null || { echo 'kubectl is required.' >&2; exit 1; }
context="${2:-$(kubectl config current-context)}"
[[ -n "$context" ]] || { echo 'Select a Kubernetes context first.' >&2; exit 2; }
kube() { kubectl --context "$context" "$@"; }
namespace=relay-observability
port="${HEADLAMP_PORT:-9082}"
if [[ "$action" == start ]] && { [[ ! "$port" =~ ^[0-9]{1,5}$ ]] || (( 10#$port < 1 || 10#$port > 65535 )); }; then
  echo 'HEADLAMP_PORT must be between 1 and 65535.' >&2
  exit 2
fi
printf 'Kubernetes context: %s\n' "$context"
print_token() {
  echo 'Headlamp read-only login token (requested lifetime: 1 hour):'
  kube -n "$namespace" create token relay-headlamp-viewer --duration=1h
}
case "$action" in
  start)
    # Fail before creating anything if this is not a deployed Relay cluster.
    kube get namespace relay >/dev/null
    kube apply -k k8s/headlamp
    kube -n "$namespace" rollout status deployment/relay-headlamp --timeout=5m
    print_token
    printf '\nOpen http://localhost:%s and select namespace relay.\n' "$port"
    echo 'Keep this terminal open. Ctrl-C closes the tunnel; use stop to uninstall Headlamp.'
    exec kubectl --context "$context" -n "$namespace" port-forward --address 127.0.0.1 service/relay-headlamp "$port:4466"
    ;;
  token) print_token ;;
  check)
    # These commands deliberately fail when metrics or KEDA are unavailable.
    kube get apiservice v1beta1.metrics.k8s.io v1beta1.external.metrics.k8s.io
    kube -n relay top pods
    kube -n relay get hpa
    kube -n relay get scaledobjects.keda.sh
    ;;
  stop)
    kube delete -k k8s/headlamp --ignore-not-found
    ;;
esac
