#!/usr/bin/env bash
# Delete the local FoC kind cluster, including its database volumes.

set -euo pipefail

if ! command -v kind >/dev/null 2>&1; then
  echo "kind is required." >&2
  exit 1
fi

kind delete cluster --name foc
