#!/bin/sh
set -eu
case "$BROKER_METRICS_HOST" in *[!0-9.]*|'') echo 'Expected broker IPv4 address' >&2; exit 1;; esac
sed "s/\${BROKER_METRICS_HOST}/$BROKER_METRICS_HOST/g" /etc/prometheus/prometheus.template.yaml > /tmp/prometheus.yaml
exec /bin/prometheus --config.file=/tmp/prometheus.yaml --storage.tsdb.path=/prometheus --storage.tsdb.retention.time=7d --storage.tsdb.retention.size=5GB
