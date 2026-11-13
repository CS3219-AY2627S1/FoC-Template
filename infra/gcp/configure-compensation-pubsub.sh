#!/usr/bin/env bash
# Idempotent request/result topics, authenticated push and retained DLQ.
# dev creates isolated topics only; staging/production wire actual private services.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[[ $# == 1 ]] || { echo "usage: $0 dev|staging|production" >&2; exit 2; }
environment=$1
[[ $environment == dev || $environment == staging || $environment == production ]] || exit 2
set -a
# shellcheck source=SCRIPTDIR/project.env
source "$ROOT/infra/gcp/project.env"
if [[ $environment != dev ]]; then
  # shellcheck source=/dev/null
  source "$ROOT/infra/environments/$environment.env"
fi
set +a
gc() { gcloud --project "$PROJECT_ID" --quiet "$@"; }
exists() { "$@" >/dev/null 2>&1; }
gc services enable pubsub.googleapis.com
gc beta services identity create --service=pubsub.googleapis.com >/dev/null
if [[ $environment == dev ]]; then
  for topic in credit-command-compensation-dev-v1 credit-command-compensation-result-dev-v1; do
    exists gc pubsub topics describe "$topic" || gc pubsub topics create "$topic" --labels service=order-credit,environment=dev
  done
  gc pubsub topics add-iam-policy-binding credit-command-compensation-dev-v1 \
    --member "serviceAccount:foc-order-service@$PROJECT_ID.iam.gserviceaccount.com" --role roles/pubsub.publisher >/dev/null
  gc pubsub topics add-iam-policy-binding credit-command-compensation-result-dev-v1 \
    --member "serviceAccount:foc-credit-service@$PROJECT_ID.iam.gserviceaccount.com" --role roles/pubsub.publisher >/dev/null
  echo "Dev topics ready; no dev messages are routed to staging or production."
  exit
fi
bash "$ROOT/infra/gcp/configure-order-pubsub.sh" "$environment"
bash "$ROOT/infra/gcp/configure-credit-pubsub.sh" "$environment"
order_url="https://order-service-$environment-$PROJECT_NUMBER.$REGION.run.app"
agent="serviceAccount:service-$PROJECT_NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com"
push=$ORDER_COMPENSATION_PUSH_SERVICE_ACCOUNT
push_id=$(cut -d@ -f1 <<<"$push")
exists gc iam service-accounts describe "$push" ||
  gc iam service-accounts create "$push_id" --display-name "FoC Order compensation push ($environment)"
gc iam service-accounts add-iam-policy-binding "$push" \
  --member "$agent" --role roles/iam.serviceAccountTokenCreator >/dev/null
# CI may update subscriptions as well as a human owner running this script.
for account in "$push" "$CREDIT_PUBSUB_PUSH_SERVICE_ACCOUNT"; do
  gc iam service-accounts add-iam-policy-binding "$account" \
    --member "serviceAccount:$DEPLOYER_SA" --role roles/iam.serviceAccountUser >/dev/null
done
if exists gc run services describe "order-service-$environment" --region "$REGION"; then
  gc run services add-iam-policy-binding "order-service-$environment" --region "$REGION" \
    --member "serviceAccount:$push" --role roles/run.invoker >/dev/null
fi
suffix=$environment
[[ $environment != production ]] || suffix=prod
dlq="order-compensations-dead-letter-$suffix-v1"
recovery="$dlq-recovery"
exists gc pubsub topics describe "$dlq" ||
  gc pubsub topics create "$dlq" --labels "service=order-service,environment=$environment,purpose=dead-letter"
gc pubsub topics add-iam-policy-binding "$dlq" --member "$agent" --role roles/pubsub.publisher >/dev/null
if exists gc pubsub subscriptions describe "$recovery"; then
  [[ $(gc pubsub subscriptions describe "$recovery" --format='value(topic)') == "projects/$PROJECT_ID/topics/$dlq" ]] ||
    { echo "Unexpected recovery topic; refusing to rebind $recovery" >&2; exit 1; }
else
  gc pubsub subscriptions create "$recovery" --topic "$dlq" --message-retention-duration 7d --expiration-period never
fi
subscription=$ORDER_COMPENSATION_RESULT_SUBSCRIPTION
if exists gc pubsub subscriptions describe "$subscription"; then
  [[ $(gc pubsub subscriptions describe "$subscription" --format='value(topic)') == "projects/$PROJECT_ID/topics/$CREDIT_COMPENSATION_RESULT_TOPIC" ]] ||
    { echo "Unexpected result topic; refusing to rebind $subscription" >&2; exit 1; }
  gc pubsub subscriptions update "$subscription" \
    --ack-deadline 60 --message-retention-duration 7d --expiration-period never \
    --min-retry-delay 10s --max-retry-delay 600s --dead-letter-topic "$dlq" --max-delivery-attempts 10
  gc pubsub subscriptions modify-push-config "$subscription" \
    --push-endpoint "$order_url/api/orders/internal/credit-compensations" \
    --push-auth-service-account "$push" --push-auth-token-audience "$order_url"
else
  gc pubsub subscriptions create "$subscription" --topic "$CREDIT_COMPENSATION_RESULT_TOPIC" \
    --ack-deadline 60 --message-retention-duration 7d --expiration-period never \
    --min-retry-delay 10s --max-retry-delay 600s --dead-letter-topic "$dlq" --max-delivery-attempts 10 \
    --push-endpoint "$order_url/api/orders/internal/credit-compensations" \
    --push-auth-service-account "$push" --push-auth-token-audience "$order_url" \
    --labels "service=order-service,environment=$environment"
fi
gc pubsub subscriptions add-iam-policy-binding "$subscription" \
  --member "$agent" --role roles/pubsub.subscriber >/dev/null
echo "Compensation request/result delivery ready for $environment."
