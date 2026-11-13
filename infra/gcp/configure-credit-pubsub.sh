#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), date: 2026-10-08
# Mode: Config setup generation.
# Scope: Generate configuration for credit pubsub as required.
# Author review: I reviewed for correctness.
# Provisions Credit Service's authenticated Order/User-event push subscriptions and DLQ.
# Usage: infra/gcp/configure-credit-pubsub.sh <staging|production>
set -euo pipefail

(( BASH_VERSINFO[0] >= 4 )) || { echo "bash 4+ is required" >&2; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
environment=${1:?environment (staging|production) required}
[[ $environment == staging || $environment == production ]] || {
  echo "unknown environment: $environment" >&2
  exit 2
}

set -a
# shellcheck source=SCRIPTDIR/project.env
source "$ROOT/infra/gcp/project.env"
# shellcheck source=/dev/null
source "$ROOT/infra/environments/$environment.env"
set +a

if [[ $environment == staging ]]; then
  enabled=$CREDIT_PUBSUB_STAGING_ENABLED
  dead_letter_topic=$CREDIT_PUBSUB_STAGING_DLQ_TOPIC
  dead_letter_subscription=$CREDIT_PUBSUB_STAGING_DLQ_SUBSCRIPTION
else
  enabled=$CREDIT_PUBSUB_PRODUCTION_ENABLED
  dead_letter_topic=$CREDIT_PUBSUB_PRODUCTION_DLQ_TOPIC
  dead_letter_subscription=$CREDIT_PUBSUB_PRODUCTION_DLQ_SUBSCRIPTION
fi
[[ $enabled == true ]] || {
  echo "Credit Pub/Sub delivery is not approved for $environment; enable it in infra/gcp/project.env first." >&2
  exit 2
}

gc() { gcloud --project "$PROJECT_ID" --quiet "$@"; }
exists() { "$@" >/dev/null 2>&1; }
push_service_url="https://credit-service-$environment-$PROJECT_NUMBER.$REGION.run.app"
push_service_account=$CREDIT_PUBSUB_PUSH_SERVICE_ACCOUNT
push_service_account_id=${push_service_account%%@*}
pubsub_service_agent="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"

topics=(
  "$ORDER_OPEN_REFUND_TOPIC"
  "$ORDER_COMPLETION_TOPIC"
  "$ORDER_CREDIT_COMPENSATION_TOPIC"
  "$USER_CREATED_TOPIC"
)
subscriptions=(
  "$CREDIT_ORDER_OPEN_REFUND_SUBSCRIPTION"
  "$CREDIT_ORDER_COMPLETION_SUBSCRIPTION"
  "$CREDIT_COMPENSATION_SUBSCRIPTION"
  "$CREDIT_USER_CREATED_SUBSCRIPTION"
)
push_paths=(
  "/api/credits/internal/order-events/open-refund"
  "/api/credits/internal/order-events/completion"
  "/api/credits/internal/command-compensations"
  "/api/credits/internal/user-events/created"
)

echo "Configuring Credit Pub/Sub push delivery for $environment"
gc services enable pubsub.googleapis.com

exists gc pubsub topics describe "$CREDIT_COMPENSATION_RESULT_TOPIC" ||
  gc pubsub topics create "$CREDIT_COMPENSATION_RESULT_TOPIC" \
    --labels "service=credit-service,environment=$environment,purpose=compensation-result"
gc pubsub topics add-iam-policy-binding "$CREDIT_COMPENSATION_RESULT_TOPIC" \
  --member "serviceAccount:foc-credit-service@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/pubsub.publisher >/dev/null

exists gc pubsub topics describe "$USER_CREATED_TOPIC" ||
  gc pubsub topics create "$USER_CREATED_TOPIC" \
    --labels "service=user-service,environment=$environment"
gc pubsub topics add-iam-policy-binding "$USER_CREATED_TOPIC" \
  --member "serviceAccount:foc-user-service@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/pubsub.publisher >/dev/null

for topic in "${topics[@]}"; do
  exists gc pubsub topics describe "$topic" || {
    echo "Required Order Service topic '$topic' does not exist. Run infra/gcp/configure-order-pubsub.sh $environment first." >&2
    exit 1
  }
done

exists gc iam service-accounts describe "$push_service_account" ||
  gc iam service-accounts create "$push_service_account_id" \
    --display-name "FoC Credit Pub/Sub push ($environment)"

gc iam service-accounts add-iam-policy-binding "$push_service_account" \
  --member "serviceAccount:$pubsub_service_agent" \
  --role roles/iam.serviceAccountTokenCreator >/dev/null

if exists gc run services describe "credit-service-$environment" --region "$REGION"; then
  gc run services add-iam-policy-binding "credit-service-$environment" --region "$REGION" \
    --member "serviceAccount:$push_service_account" --role roles/run.invoker >/dev/null
fi

exists gc pubsub topics describe "$dead_letter_topic" ||
  gc pubsub topics create "$dead_letter_topic" \
    --labels "service=credit-service,environment=$environment,purpose=dead-letter"
gc pubsub topics add-iam-policy-binding "$dead_letter_topic" \
  --member "serviceAccount:$pubsub_service_agent" --role roles/pubsub.publisher >/dev/null

if ! exists gc pubsub subscriptions describe "$dead_letter_subscription"; then
  gc pubsub subscriptions create "$dead_letter_subscription" \
    --topic "$dead_letter_topic" \
    --message-retention-duration 7d \
    --expiration-period never \
    --labels "service=credit-service,environment=$environment,purpose=dead-letter-recovery"
else
  recovery_topic=$(gc pubsub subscriptions describe "$dead_letter_subscription" --format 'value(topic)')
  expected_recovery_topic="projects/$PROJECT_ID/topics/$dead_letter_topic"
  [[ $recovery_topic == "$expected_recovery_topic" ]] || {
    echo "Recovery subscription '$dead_letter_subscription' uses '$recovery_topic', expected '$expected_recovery_topic'." >&2
    exit 1
  }
fi

for index in "${!subscriptions[@]}"; do
  subscription=${subscriptions[$index]}
  topic=${topics[$index]}
  push_endpoint="$push_service_url${push_paths[$index]}"
  if ! exists gc pubsub subscriptions describe "$subscription"; then
    gc pubsub subscriptions create "$subscription" \
      --topic "$topic" \
      --ack-deadline 60 \
      --message-retention-duration 7d \
      --expiration-period never \
      --min-retry-delay 10s \
      --max-retry-delay 600s \
      --dead-letter-topic "$dead_letter_topic" \
      --max-delivery-attempts 10 \
      --push-endpoint "$push_endpoint" \
      --push-auth-service-account "$push_service_account" \
      --push-auth-token-audience "$push_service_url" \
      --labels "service=credit-service,environment=$environment"
  else
    current_topic=$(gc pubsub subscriptions describe "$subscription" --format 'value(topic)')
    expected_topic="projects/$PROJECT_ID/topics/$topic"
    [[ $current_topic == "$expected_topic" ]] || {
      echo "Subscription '$subscription' uses '$current_topic', expected '$expected_topic'." >&2
      exit 1
    }
    gc pubsub subscriptions update "$subscription" \
      --ack-deadline 60 \
      --message-retention-duration 7d \
      --expiration-period never \
      --min-retry-delay 10s \
      --max-retry-delay 600s \
      --dead-letter-topic "$dead_letter_topic" \
      --max-delivery-attempts 10
    gc pubsub subscriptions modify-push-config "$subscription" \
      --push-endpoint "$push_endpoint" \
      --push-auth-service-account "$push_service_account" \
      --push-auth-token-audience "$push_service_url"
  fi
  gc pubsub subscriptions add-iam-policy-binding "$subscription" \
    --member "serviceAccount:$pubsub_service_agent" --role roles/pubsub.subscriber >/dev/null
done

echo "Credit Pub/Sub push delivery is configured for $environment under $push_service_url/api/credits/internal"
