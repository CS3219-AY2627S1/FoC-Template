#!/bin/sh
set -eu

# Fail before nginx starts rather than accepting requests with an empty target.
: "${INTERNAL_GATEWAY_URL:?INTERNAL_GATEWAY_URL must be set}"
: "${NGINX_DNS_RESOLVER:?NGINX_DNS_RESOLVER must be set}"
