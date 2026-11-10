#!/usr/bin/env bash
# Provisions User Service's authenticated push subscriptions for Order's courier-penalty events.
# Idempotent: creates what is missing and points existing subscriptions at this environment's
# User Service. Order's topics come from infra/gcp/configure-order-pubsub.sh.
# Usage: infra/gcp/configure-user-pubsub.sh <staging|production>
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
environment=${1:?environment (staging|production) required}
[[ $environment == staging || $environment == production ]] || {
  echo "unknown environment: $environment" >&2
  exit 2
}

# shellcheck source=SCRIPTDIR/project.env
source "$ROOT/infra/gcp/project.env"
# shellcheck source=/dev/null
source "$ROOT/infra/environments/$environment.env"

gc() { gcloud --project "$PROJECT_ID" --quiet "$@"; }
exists() { "$@" >/dev/null 2>&1; }
push_url="https://user-service-$environment-$PROJECT_NUMBER.$REGION.run.app"
push_sa=$USER_PUBSUB_PUSH_SERVICE_ACCOUNT
pubsub_agent="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"

topics=("$ORDER_COURIER_PENALTY_ADDITION_TOPIC" "$ORDER_COURIER_PENALTY_DEDUCTION_TOPIC")
subscriptions=("$USER_PUBSUB_PENALTY_ADDITION_SUBSCRIPTION" "$USER_PUBSUB_PENALTY_DEDUCTION_SUBSCRIPTION")
push_paths=("/api/users/internal/penalties/addition" "/api/users/internal/penalties/deduction")

echo "Configuring User Pub/Sub push delivery for $environment"
for topic in "${topics[@]}"; do
  exists gc pubsub topics describe "$topic" || {
    echo "Order topic '$topic' does not exist. Run infra/gcp/configure-order-pubsub.sh $environment first." >&2
    exit 1
  }
done

exists gc iam service-accounts describe "$push_sa" ||
  gc iam service-accounts create "${push_sa%%@*}" --display-name "FoC User Pub/Sub push ($environment)"
gc iam service-accounts add-iam-policy-binding "$push_sa" \
  --member "serviceAccount:$pubsub_agent" --role roles/iam.serviceAccountTokenCreator >/dev/null

for index in "${!subscriptions[@]}"; do
  subscription=${subscriptions[$index]}
  topic=${topics[$index]}
  push_endpoint="$push_url${push_paths[$index]}"
  if ! exists gc pubsub subscriptions describe "$subscription"; then
    gc pubsub subscriptions create "$subscription" \
      --topic "$topic" \
      --ack-deadline 60 \
      --message-retention-duration 7d \
      --expiration-period never \
      --min-retry-delay 10s \
      --max-retry-delay 600s \
      --push-endpoint "$push_endpoint" \
      --push-auth-service-account "$push_sa" \
      --push-auth-token-audience "$push_url" \
      --labels "service=user-service,environment=$environment"
  else
    current_topic=$(gc pubsub subscriptions describe "$subscription" --format 'value(topic)')
    [[ $current_topic == "projects/$PROJECT_ID/topics/$topic" ]] || {
      echo "Subscription '$subscription' uses '$current_topic', expected topic '$topic'." >&2
      exit 1
    }
    gc pubsub subscriptions modify-push-config "$subscription" \
      --push-endpoint "$push_endpoint" \
      --push-auth-service-account "$push_sa" \
      --push-auth-token-audience "$push_url"
  fi
done

echo "User Pub/Sub push delivery is configured for $environment under $push_url/api/users/internal/penalties"
