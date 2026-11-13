#!/usr/bin/env bash
set -euo pipefail

: "${PUBLIC_URL:?PUBLIC_URL is required}"
requests=${REQUESTS:-2000}
parallelism=${PARALLELISM:-40}
url="${PUBLIC_URL%/}/api/suppliers?page=0&size=20"

echo "Sending $requests requests with concurrency $parallelism to $url"
seq "$requests" | xargs -P "$parallelism" -I {} curl --fail --silent --output /dev/null "$url"
kubectl -n foc-staging get hpa
kubectl -n foc-staging get deployment,pods -o wide
echo 'Continue watching with: kubectl -n foc-staging get hpa,pods -w'
