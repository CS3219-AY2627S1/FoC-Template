#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=lib.sh
source /opt/foc-kafka/lib.sh
require_env KAFKA_ADMIN_PASSWORD

properties=/tmp/foc-kafka-health.properties
write_client_properties "$properties" foc_admin "$KAFKA_ADMIN_PASSWORD"
kafka_command kafka-broker-api-versions.sh \
  --bootstrap-server localhost:9092 \
  --command-config "$properties" >/dev/null 2>&1
