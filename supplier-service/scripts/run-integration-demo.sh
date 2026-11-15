#!/usr/bin/env bash
# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
# Scope: added a one-command wrapper for the existing Supplier integration demo.
# Author review: Reviewed and approved by @ron.

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
supplier_service_dir="$(cd -- "${script_dir}/.." && pwd)"

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed or is not on PATH." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker is not installed or is not on PATH." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Error: Docker is not running. Start Docker Desktop and try again." >&2
  exit 1
fi

cd "${supplier_service_dir}"

echo "Installing the exact dependencies from package-lock.json..."
npm ci

echo "Running the isolated Supplier backend integration demonstration..."
npm run test:integration
