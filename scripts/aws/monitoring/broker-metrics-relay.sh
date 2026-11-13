#!/bin/sh
# Run only after approval. Adds a metrics relay without restarting RabbitMQ.
set -eu
broker_ip=$(docker inspect rabbitmq --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
case "$broker_ip" in *[!0-9.]*|'') echo 'Invalid broker container address' >&2; exit 1;; esac
if docker container inspect campusgo-metrics-relay >/dev/null 2>&1; then
  echo 'Relay already exists; inspect it before replacing it.' >&2
  exit 1
fi
install -d -m 755 /opt/campusgo/monitoring
printf 'events {}\nhttp { server { listen 15692; location / { proxy_pass http://%s:15692; } } }\n' "$broker_ip" > /opt/campusgo/monitoring/metrics-relay.conf
# Bind to the host private address supplied by the operator, never all interfaces.
: "${BROKER_PRIVATE_IP:?Set the inspected EC2 private IPv4 address}"
case "$BROKER_PRIVATE_IP" in *[!0-9.]*|'') exit 1;; esac
docker run -d --name campusgo-metrics-relay --restart unless-stopped \
  --read-only --tmpfs /var/cache/nginx --tmpfs /var/run \
  --log-opt max-size=5m --log-opt max-file=2 \
  -p "$BROKER_PRIVATE_IP:15692:15692" \
  -v /opt/campusgo/monitoring/metrics-relay.conf:/etc/nginx/nginx.conf:ro \
  nginx:1.31.6-alpine
