#!/usr/bin/env bash
# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-27.
# Scope: added a direct Supplier Service health request. Author review: Reviewed and approved by @ron.
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/../../lib/endpoint-cli.sh"
api_endpoint_main supplier-health "$@"
