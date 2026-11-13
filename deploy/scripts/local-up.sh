#!/usr/bin/env bash
# Starts Relay in a local Kubernetes cluster (k3d) from this checkout: builds the images with
# docker compose, imports them into the cluster and installs the Helm chart.
# Run it again after a code change, it only rebuilds and rolls out what changed.
#
#   deploy/scripts/local-up.sh            app on http://localhost:8081
#   RELAY_LOCAL_PORT=9000 deploy/scripts/local-up.sh
#
# Remove everything again with: k3d cluster delete relay
set -euo pipefail

cd "$(dirname "$0")/../.."

CLUSTER=relay
CONTEXT="k3d-$CLUSTER"
PORT="${RELAY_LOCAL_PORT:-8081}"
# Our services in the chart. A new service needs an entry here and in values.yaml.
SERVICES=(user-service supplier-service credit-service order-service recommendation-service message-service rag-service web-client)

# Directory docker builds a service from when compose.yaml does not build it (yet).
build_context() {
  case "$1" in
    *) echo "$1" ;;
  esac
}

if ! k3d cluster get "$CLUSTER" >/dev/null 2>&1; then
  echo "Creating the k3d cluster $CLUSTER (port $PORT)"
  k3d cluster create "$CLUSTER" --port "$PORT:80@loadbalancer" --wait
fi

# compose builds the services it knows, with the same contexts as for docker compose up.
COMPOSE_SERVICES=()
for service in "${SERVICES[@]}"; do
  if docker compose config --services | grep -qx "$service"; then
    COMPOSE_SERVICES+=("$service")
  else
    echo "Building $service"
    docker build --file "$service/Dockerfile" --tag "relay-$service:latest" "$(build_context "$service")"
  fi
done
echo "Building ${COMPOSE_SERVICES[*]}"
docker compose build "${COMPOSE_SERVICES[@]}"

# A new tag per run, so Kubernetes sees a new image and replaces the pods.
TAG="local-$(date +%Y%m%d%H%M%S)"
IMAGES=()
for service in "${SERVICES[@]}"; do
  docker tag "relay-$service:latest" "relay-$service:$TAG"
  IMAGES+=("relay-$service:$TAG")
done
k3d image import --cluster "$CLUSTER" "${IMAGES[@]}"

helm upgrade --install relay deploy/helm/relay \
  --kube-context "$CONTEXT" --namespace relay --create-namespace \
  --values deploy/helm/relay/values-local.yaml \
  --set images.tag="$TAG" \
  --wait --timeout 5m

kubectl --context "$CONTEXT" --namespace relay get pods
echo
echo "Relay:   http://localhost:$PORT"
echo "Mailpit: http://localhost:$PORT/mail/"
