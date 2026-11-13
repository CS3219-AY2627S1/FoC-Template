#!/usr/bin/env bash
set -euo pipefail
source /opt/foc-kafka/lib.sh
require_env KAFKA_ADMIN_PASSWORD
write_client_properties /tmp/foc-kafka-health.properties foc_admin "$KAFKA_ADMIN_PASSWORD"
# exec makes kubelet timeouts terminate the CLI JVM rather than leave orphan probe children.
exec /opt/foc-kafka-cli/kafka-broker-api-versions.sh \
  --bootstrap-server localhost:9092 \
  --command-config /tmp/foc-kafka-health.properties >/dev/null 2>&1
