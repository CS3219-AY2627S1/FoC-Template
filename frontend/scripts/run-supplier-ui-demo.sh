#!/usr/bin/env bash
# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-27.
# Scope: Added a one-command wrapper for the isolated Supplier UI checks in
# issue #31. Author review: Reviewed and approved by @ron.

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
frontend_dir="$(cd -- "${script_dir}/.." && pwd)"

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

cd "${frontend_dir}"

echo "Installing the exact frontend dependencies from package-lock.json..."
npm ci

echo "Installing the matching Playwright Chromium browser if needed..."
npm exec -- playwright install chromium

echo "Running frontend lint, component tests, and the production build..."
npm run lint
npm test
npm run build

echo "Running the isolated live Supplier UI verification..."
npm run test:e2e
