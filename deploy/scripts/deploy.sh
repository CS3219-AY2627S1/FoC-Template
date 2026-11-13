#!/usr/bin/env bash
# Deploys Relay to the cloud cluster: creates the Secrets and installs or upgrades the Helm chart
# with values-cloud.yaml, then restarts the services so they run the newest dev images.
#
#   deploy/scripts/deploy.sh
#   IMAGE_TAG=sha-1a2b3c4 deploy/scripts/deploy.sh    fixed images instead of the moving dev tag
#
# Needs two files next to this folder, both ignored by Git:
#   deploy/ghcr.env            GHCR_USERNAME and GHCR_TOKEN (a token with read:packages)
#   deploy/cloud-secrets.env   the passwords; created with random values on the first run
set -euo pipefail

cd "$(dirname "$0")/../.."
export KUBECONFIG="${RELAY_KUBECONFIG:-$HOME/.kube/relay-aws.yaml}"

GHCR_FILE=deploy/ghcr.env
SECRETS_FILE=deploy/cloud-secrets.env
# Every key under secrets.values in values.yaml. A new key gets a random value on the next run.
SECRET_KEYS=(BROKER_PASSWORD OTP_SECRET ADMIN_PASSWORD SUPPLIER_DB_PASSWORD ORDER_DB_PASSWORD MAILPIT_PASSWORD SEED_DEMO_PASSWORD)
CERT_MANAGER_VERSION=v1.21.3

if [ ! -f "$GHCR_FILE" ]; then
  echo "Missing $GHCR_FILE with GHCR_USERNAME=... and GHCR_TOKEN=..., see docs/deployment.md" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$GHCR_FILE"
: "${GHCR_USERNAME:?missing in $GHCR_FILE}" "${GHCR_TOKEN:?missing in $GHCR_FILE}"

# Letters and digits only, because some of them end up inside a database or broker URL.
touch "$SECRETS_FILE"
chmod 600 "$SECRETS_FILE"
for key in "${SECRET_KEYS[@]}"; do
  grep -q "^$key=" "$SECRETS_FILE" || echo "$key=$(openssl rand -hex 16)" >> "$SECRETS_FILE"
done

# A key from Anthropic cannot be made up. Without it the rag-service still starts, but every
# question fails, so the line is added empty and filled in by hand.
grep -q "^CLAUDE_API_KEY=" "$SECRETS_FILE" || echo "CLAUDE_API_KEY=" >> "$SECRETS_FILE"
grep -q "^CLAUDE_API_KEY=." "$SECRETS_FILE" || echo "Warning: CLAUDE_API_KEY in $SECRETS_FILE is empty, the help assistant cannot answer" >&2

host="$(terraform -chdir=deploy/terraform output -raw hostname)"

# cert-manager gets the HTTPS certificate from Let's Encrypt and renews it. The chart's
# ClusterIssuer needs its resource types, so it comes first.
helm upgrade --install cert-manager oci://quay.io/jetstack/charts/cert-manager \
  --version "$CERT_MANAGER_VERSION" --namespace cert-manager --create-namespace \
  --set crds.enabled=true --wait --timeout 5m >/dev/null

kubectl create namespace relay --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n relay create secret docker-registry ghcr \
  --docker-server=ghcr.io --docker-username="$GHCR_USERNAME" --docker-password="$GHCR_TOKEN" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n relay create secret generic relay-secrets --from-env-file="$SECRETS_FILE" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

helm upgrade --install relay deploy/helm/relay --namespace relay \
  --values deploy/helm/relay/values-cloud.yaml \
  --set ingress.host="$host" \
  --set images.tag="${IMAGE_TAG:-dev}" \
  --wait --timeout 10m

# The tag stays dev, so Kubernetes does not notice a new image by itself. A restart pulls it.
kubectl -n relay rollout restart deployment >/dev/null
kubectl -n relay rollout status deployment --timeout 5m

kubectl -n relay get pods
echo
# The first certificate takes about a minute; until then browsers warn about the address.
kubectl -n relay get certificate relay-tls --no-headers 2>/dev/null \
  | awk '{ print "Certificate ready: " $2 }'
echo "Relay:   https://$host"
echo "Mailpit: https://$host/mail/"
