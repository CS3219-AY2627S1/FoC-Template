#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6 Sol), date: 2026-11-04
# Scope: Generated implementation of cleanup of Floci-created local infrastructure
# Author review: Verified that floci-created containers are correctly deleted without deleting other containers.

set -euo pipefail

# Floci also creates sidecars such as an ECR registry outside Compose.
# The network and Floci label together scope cleanup to one local deployment.
remove_floci_sidecars() {
  local network="$1" id volume
  local -a volumes=()
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    while IFS= read -r volume; do
      [[ -n "$volume" ]] && volumes+=("$volume")
    done < <(docker inspect "$id" --format '{{range .Mounts}}{{if eq .Type "volume"}}{{println .Name}}{{end}}{{end}}')
    docker rm -f "$id" >/dev/null
  done < <(docker ps -aq --filter "network=$network" --filter 'label=io.floci=aws')
  if (( ${#volumes[@]} )); then
    docker volume rm "${volumes[@]}" >/dev/null
  fi
}