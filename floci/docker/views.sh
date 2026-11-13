#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6 Sol), date: 2026-11-04
# Scope: Generated implementation of optional local Compose monitoring views
# Author review: Verified each view work and are able to view databases or kafbat.

set -euo pipefail
cd "$(dirname "$0")/../.."
action="${1:-}"
view="${2:-}"
if [[ "$action" != start && "$action" != stop ]] || [[ ! "$view" =~ ^(kafka|user|errand|credit|all)$ ]]; then
  echo "Usage: $0 start|stop kafka|user|errand|credit|all" >&2
  exit 2
fi
[[ -s floci/docker/.generated.env ]] || { echo "Run npm run up:compose first." >&2; exit 2; }
compose_env=(--env-file .env.development)
if [[ -f .env ]]; then compose_env=(--env-file .env "${compose_env[@]}"); fi
compose_env+=(--env-file floci/docker/.generated.env --profile ui)
case "$view" in
  kafka) services=(kafbat-ui); ports=(8081) ;;
  user) services=(user-prisma-studio); ports=(5555) ;;
  errand) services=(errand-prisma-studio); ports=(5556) ;;
  credit) services=(credit-prisma-studio); ports=(5557) ;;
  all) services=(kafbat-ui user-prisma-studio errand-prisma-studio credit-prisma-studio); ports=(8081 5555 5556 5557) ;;
esac
if [[ "$action" == start ]]; then
  docker compose "${compose_env[@]}" up -d --no-deps "${services[@]}"
  printf 'Compose views: '
  printf 'http://localhost:%s ' "${ports[@]}"
  printf '\n'
else
  docker compose "${compose_env[@]}" stop "${services[@]}"
fi
