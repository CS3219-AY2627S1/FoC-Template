#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6 Sol), date: 2026-11-04
# Scope: Generated implementation of local EKS teardown and Floci sidecar cleanup
# Author review: Verified all containers are stopped safely, and that floci generated containers are also removed.

set -euo pipefail
cd "$(dirname "$0")/../.."
source floci/common/cleanup.sh

# Stop only port forwards launched by the optional EKS views.
for pid_file in floci/eks/.view-*.pid floci/eks/.port-forward.pid; do
  [[ -f "$pid_file" ]] || continue
  pid="$(cat "$pid_file")"
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
    command="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    [[ "$command" == *kubectl*port-forward* ]] && kill "$pid" || true
  fi
  rm -f "$pid_file"
done

# The k3s node and RDS sidecars are created by Floci through the Docker socket,
# so Docker Compose cannot see or remove them.
if docker container inspect floci-aws-eks-relay-local >/dev/null 2>&1; then
  docker rm -fv floci-aws-eks-relay-local >/dev/null
fi
if docker volume inspect floci-aws-eks-relay-local >/dev/null 2>&1; then
  docker volume rm floci-aws-eks-relay-local >/dev/null
fi
remove_floci_sidecars relay-eks_default
docker compose -f compose.eks.yaml --project-name relay-eks down --volumes --remove-orphans
rm -f floci/eks/.kubeconfig floci/eks/.images.tar
rm -f floci/eks/.view-*.log floci/eks/.port-forward.log floci/eks/.port-forward.err.log
printf 'Local Floci EKS environment removed.\n'