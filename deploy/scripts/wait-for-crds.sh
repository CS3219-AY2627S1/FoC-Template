#!/usr/bin/env bash
set -euo pipefail

# Newly applied CRDs may have null status.conditions. Go templates treat that
# as an empty range, whereas kubectl wait --for=condition fails immediately.
for crd in "$@"; do
  deadline=$((SECONDS + 120))
  while true; do
    established="$(kubectl get "$crd" --request-timeout=10s \
      -o go-template='{{range .status.conditions}}{{if eq .type "Established"}}{{.status}}{{end}}{{end}}')"
    if [[ "$established" == True ]]; then
      printf '%s established\n' "$crd"
      break
    fi
    if (( SECONDS >= deadline )); then
      printf 'Timed out waiting for %s to become Established\n' "$crd" >&2
      kubectl get "$crd" --request-timeout=10s -o yaml >&2 || true
      exit 1
    fi
    sleep 2
  done
done
