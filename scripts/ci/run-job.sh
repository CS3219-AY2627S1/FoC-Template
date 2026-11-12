#!/usr/bin/env bash

# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-10
# Scope (AI-27): Generated the deploy workflow, CI helper scripts and deploy-role Terraform I specified.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

# Runs one Job from k8s/jobs (with the image tags currently in k8s/jobs/kustomization.yaml) and waits
# for it: exit 0 when it succeeds, 1 when it fails or times out. Its logs are printed either way.
#
#   scripts/ci/run-job.sh <namespace> <job name> <timeout in seconds>
#
# A Job can't be changed once created, so any previous run is deleted first.
set -euo pipefail

namespace="$1" name="$2" timeout="$3"

kubectl delete job "$name" -n "$namespace" --ignore-not-found --wait=true
kubectl kustomize k8s/jobs \
  | yq "select(.kind == \"Job\" and .metadata.name == \"$name\")" \
  | kubectl apply -f -

condition() { # prints "True" if the Job has that condition
  kubectl get job "$name" -n "$namespace" -o jsonpath="{.status.conditions[?(@.type==\"$1\")].status}"
}

status=1
deadline=$((SECONDS + timeout))
while (( SECONDS < deadline )); do
  if [[ "$(condition Complete)" == "True" ]]; then status=0; break; fi
  if [[ "$(condition Failed)" == "True" ]]; then break; fi
  sleep 5
done

echo "--- logs of job/$name"
kubectl logs "job/$name" -n "$namespace" --all-containers --tail=200 || true

if (( status != 0 )); then
  echo "job/$name did not complete (failed, or still running after ${timeout}s)" >&2
fi
exit "$status"
