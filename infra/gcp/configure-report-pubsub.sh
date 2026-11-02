#!/usr/bin/env bash
# AI assistance: OpenAI Codex, 2026-10-30. Report saga cloud wiring; human review required.
# prepare: identities and Report result publishing, before the first Report deployment.
# wire: authenticated push subscriptions after BOTH Cloud Run services exist.
# Never deploys, enables saga flags, changes Order's Publisher grants, or deletes resources.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ $# -ge 1 && $# -le 2 ]] || { echo "usage: $0 staging|production [prepare|wire]" >&2; exit 2; }
environment=$1
phase=${2:-prepare}
[[ $environment == staging || $environment == production ]] || exit 2
[[ $phase == prepare || $phase == wire ]] || exit 2
# shellcheck source=SCRIPTDIR/project.env
source "$ROOT/infra/gcp/project.env"
# shellcheck source=/dev/null
source "$ROOT/infra/environments/$environment.env"
gc() { gcloud --project "$PROJECT_ID" --quiet "$@"; }
exists() { "$@" >/dev/null 2>&1; }
runtime="foc-reporting-service@$PROJECT_ID.iam.gserviceaccount.com"
agent="serviceAccount:service-$PROJECT_NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com"
report_url="https://reporting-service-$environment-$PROJECT_NUMBER.$REGION.run.app"
order_url="https://order-service-$environment-$PROJECT_NUMBER.$REGION.run.app"
suffix=dev
[[ $environment != production ]] || suffix=prod
dlq="report-resolution-dead-letter-$suffix-v1"
recovery="$dlq-recovery"

ensure_subscription_topic() {
  local subscription=$1 topic=$2 actual
  if exists gc pubsub subscriptions describe "$subscription"; then
    actual=$(gc pubsub subscriptions describe "$subscription" --format='value(topic)')
    [[ $actual == "projects/$PROJECT_ID/topics/$topic" ]] || {
      echo "Refusing to rebind $subscription: expected $topic, found $actual" >&2; exit 1;
    }
  fi
}

# Preflight bindings BEFORE cloud mutation. Topics already created by the owner are reused.
ensure_subscription_topic "$REPORT_RESOLUTION_REQUEST_SUBSCRIPTION" "$ORDER_REPORT_COMPENSATION_TOPIC"
ensure_subscription_topic "$ORDER_REPORT_COMPENSATION_RESULT_SUBSCRIPTION" "$REPORT_COMPENSATION_RESULT_TOPIC"
ensure_subscription_topic "$recovery" "$dlq"
if [[ $phase == wire ]]; then
  # A missing service must not leave a half-wired subscription. prepare can run before deployment.
  for service in reporting-service order-service; do
    gc run services describe "$service-$environment" --region "$REGION" >/dev/null
  done
fi

gc services enable pubsub.googleapis.com iamcredentials.googleapis.com
gc beta services identity create --service=pubsub.googleapis.com >/dev/null
if ! exists gc iam service-accounts describe "$runtime"; then
  gc iam service-accounts create foc-reporting-service --display-name "FoC reporting-service (Cloud Run runtime)"
fi
gc iam service-accounts add-iam-policy-binding "$runtime" \
  --member "serviceAccount:$DEPLOYER_SA" --role roles/iam.serviceAccountUser >/dev/null

for topic in "$ORDER_REPORT_COMPENSATION_TOPIC" "$REPORT_COMPENSATION_RESULT_TOPIC"; do
  exists gc pubsub topics describe "$topic" ||
    gc pubsub topics create "$topic" --labels "service=reporting-service,environment=$environment"
done
# Order already has Publisher. Preserve its policy; Report needs only its result topic.
gc pubsub topics add-iam-policy-binding "$REPORT_COMPENSATION_RESULT_TOPIC" \
  --member "serviceAccount:$runtime" --role roles/pubsub.publisher >/dev/null
for push in "$REPORT_RESOLUTION_PUSH_SERVICE_ACCOUNT" "$ORDER_REPORT_COMPENSATION_PUSH_SERVICE_ACCOUNT"; do
  if ! exists gc iam service-accounts describe "$push"; then
    gc iam service-accounts create "${push%%@*}" --display-name "FoC Report saga push ($environment)"
  fi
  gc iam service-accounts add-iam-policy-binding "$push" \
    --member "$agent" --role roles/iam.serviceAccountTokenCreator >/dev/null
  gc iam service-accounts add-iam-policy-binding "$push" \
    --member "serviceAccount:$DEPLOYER_SA" --role roles/iam.serviceAccountUser >/dev/null
done
if [[ $phase == prepare ]]; then
  echo "Report saga identities/topics ready for $environment. Flags unchanged."
  echo "Run bootstrap.sh for Report Firestore/bucket access, deploy both backends with flags disabled, then run: $0 $environment wire"
  exit
fi

gc run services add-iam-policy-binding "reporting-service-$environment" --region "$REGION" \
  --member "serviceAccount:$REPORT_RESOLUTION_PUSH_SERVICE_ACCOUNT" --role roles/run.invoker >/dev/null
gc run services add-iam-policy-binding "order-service-$environment" --region "$REGION" \
  --member "serviceAccount:$ORDER_REPORT_COMPENSATION_PUSH_SERVICE_ACCOUNT" --role roles/run.invoker >/dev/null
exists gc pubsub topics describe "$dlq" ||
  gc pubsub topics create "$dlq" --labels "service=reporting-service,environment=$environment,purpose=dead-letter"
gc pubsub topics add-iam-policy-binding "$dlq" --member "$agent" --role roles/pubsub.publisher >/dev/null
exists gc pubsub subscriptions describe "$recovery" ||
  gc pubsub subscriptions create "$recovery" --topic "$dlq" --message-retention-duration 7d --expiration-period never

wire_subscription() {
  local subscription=$1 topic=$2 endpoint=$3 push=$4 audience=$5
  local delivery=(--ack-deadline 60 --message-retention-duration 7d --expiration-period never
    --min-retry-delay 10s --max-retry-delay 600s --dead-letter-topic "$dlq" --max-delivery-attempts 10)
  if exists gc pubsub subscriptions describe "$subscription"; then
    gc pubsub subscriptions update "$subscription" "${delivery[@]}"
    gc pubsub subscriptions modify-push-config "$subscription" \
      --push-endpoint "$endpoint" --push-auth-service-account "$push" --push-auth-token-audience "$audience"
  else
    gc pubsub subscriptions create "$subscription" --topic "$topic" "${delivery[@]}" \
      --push-endpoint "$endpoint" --push-auth-service-account "$push" --push-auth-token-audience "$audience" \
      --labels "service=reporting-service,environment=$environment"
  fi
  # The GOOGLE Pub/Sub agent needs Subscriber for dead-letter forwarding, not the Report runtime.
  gc pubsub subscriptions add-iam-policy-binding "$subscription" --member "$agent" --role roles/pubsub.subscriber >/dev/null
}
wire_subscription "$REPORT_RESOLUTION_REQUEST_SUBSCRIPTION" "$ORDER_REPORT_COMPENSATION_TOPIC" \
  "$report_url/api/reports/internal/order-resolution-compensations" "$REPORT_RESOLUTION_PUSH_SERVICE_ACCOUNT" "$report_url"
wire_subscription "$ORDER_REPORT_COMPENSATION_RESULT_SUBSCRIPTION" "$REPORT_COMPENSATION_RESULT_TOPIC" \
  "$order_url/api/orders/internal/report-resolution-compensations" "$ORDER_REPORT_COMPENSATION_PUSH_SERVICE_ACCOUNT" "$order_url"
echo "Report saga push configured for $environment. Flags unchanged; verify indexes, IAM and delivery before activation."
