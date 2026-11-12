#!/usr/bin/env bash

# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-10
# Scope (AI-27): Generated the deploy workflow, CI helper scripts and deploy-role Terraform I specified.
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-10 to 2026-11-11
# Scope (AI-29): Generated manifests, secret wiring and service changes to deploy the AI assistant and RAG services.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

# The image tag of each backend service = the first 12 characters of the git tree hash of its folder
# at HEAD. Same code, same tag; any change in the folder, a new tag. So a deploy can tell which images
# need building (tag not yet in ECR), and which tags to deploy, from git alone.
#
#   scripts/image-tags.sh           prints "<service> <tag> <folder>" per line
#   scripts/image-tags.sh --write   also writes the tags into k8s/kustomization.yaml and k8s/jobs/kustomization.yaml
#
# Used by .github/workflows/deploy.yml. Only committed code counts (uncommitted changes don't change a tag).
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
services=(user-service supplier-service credit-service order-service notification-service chat-service
          ai-errand-assistant-service rag-service)

# Image and Kubernetes names must be lowercase; a service whose folder is named differently is listed here
declare -A folders=([rag-service]=RAG-service)

tag_of() {
  git -C "$root" rev-parse "HEAD:$1" | cut -c1-12
}

# Replaces the newTag line under "- name: campuscouriers/<service>" (files without that service are left alone)
write_tag() {
  local file="$1" service="$2" tag="$3"
  awk -v name="- name: campuscouriers/${service}" -v tag="$tag" '
    { line = $0; sub(/\r$/, "", line) }
    line ~ /^ *- name: / { inside = (line ~ name "$") }
    inside && line ~ /^ *newTag: / { sub(/newTag: .*/, "newTag: " tag); inside = 0 }
    { print }
  ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
}

for service in "${services[@]}"; do
  folder="${folders[$service]:-$service}"
  tag="$(tag_of "$folder")"
  echo "$service $tag $folder"
  if [[ "${1:-}" == "--write" ]]; then
    write_tag "$root/k8s/kustomization.yaml" "$service" "$tag"
    write_tag "$root/k8s/jobs/kustomization.yaml" "$service" "$tag"
  fi
done
