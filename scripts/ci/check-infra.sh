#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), date: 2026-10-13
# Mode: Infrastructure verification.
# Scope: Added checks for Reporting Service bucket privacy and object permissions.
# Author review: I verified for correctness.

# Verifies that every deployable service has the cloud resources it needs, so a missing piece
# fails a pull request instead of a deploy. Read-only: it never creates or changes anything.
#
# Usage: scripts/ci/check-infra.sh [environment ...]   (default: staging production)
#
# Per service (scripts/ci/list-services.sh):
#   - runtime identity foc-<service>@ exists, and the deployer may deploy as it
# Per Firestore service (list-services.sh --firestore) and environment:
#   - database <name>-<environment> exists
#   - foc-<service>@ has datastore.user on exactly that database
# Per environment:
#   - config bucket ${PROJECT_ID}-foc-config-<environment> exists
# Order Service Cloud SQL:
#   - shared instance ${CLOUD_SQL_INSTANCE} exists
#   - databases ${CLOUD_SQL_STAGING_DATABASE} and ${CLOUD_SQL_PRODUCTION_DATABASE} exist
#   - order-service runtime identity has roles/cloudsql.client
# Credit Service Cloud SQL:
#   - per-environment databases and users exist on the shared instance
#   - credit-service runtime identity can connect and read its password secrets
# Order Service Pub/Sub, per environment:
#   - its four topics exist and order-service's runtime identity may publish to them
# User Service Pub/Sub, per environment:
#   - its user-created topic exists and user-service's runtime identity may publish to it
# User Service MongoDB, per environment:
#   - its connection-string secret exists and user-service's identity can read it
#   - the secret has a value once user-service-<environment> is deployed
# Credit Service Pub/Sub push (when enabled in project.env):
#   - two Order-topic and one User-topic subscription target authenticated Credit push endpoints
#   - shared dead-letter topic/recovery subscription and required IAM bindings exist
# Network (Cloud Run Direct VPC egress; only the gateway is public):
#   - VPC subnet with Private Google Access, which the deployer may use, and Cloud NAT
#
# Anything missing is fixed by the CI/CD owner re-running infra/gcp/bootstrap.sh, which
# derives the same service lists from the repository.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# shellcheck source=SCRIPTDIR/../../infra/gcp/project.env
source infra/gcp/project.env

environments=("$@")
[[ ${#environments[@]} -gt 0 ]] || environments=(staging production)

services=()
while IFS= read -r svc; do [[ -n $svc ]] && services+=("$svc"); done < <(scripts/ci/list-services.sh)
firestore_services=()
while IFS= read -r svc; do [[ -n $svc ]] && firestore_services+=("$svc"); done < <(scripts/ci/list-services.sh --firestore)

problems=()
problem() { problems+=("$1"); echo "  ✗ $1"; }
ok() { echo "  ✓ $1"; }
runtime_sa() { echo "foc-$1@${PROJECT_ID}.iam.gserviceaccount.com"; }
sql_database() { [[ $1 == staging ]] && echo "$CLOUD_SQL_STAGING_DATABASE" || echo "$CLOUD_SQL_PRODUCTION_DATABASE"; }
sql_secret() { [[ $1 == staging ]] && echo "$CLOUD_SQL_STAGING_SECRET" || echo "$CLOUD_SQL_PRODUCTION_SECRET"; }
credit_sql_database() { [[ $1 == staging ]] && echo "$CREDIT_SQL_STAGING_DATABASE" || echo "$CREDIT_SQL_PRODUCTION_DATABASE"; }
credit_sql_user() { [[ $1 == staging ]] && echo "$CREDIT_SQL_STAGING_USER" || echo "$CREDIT_SQL_PRODUCTION_USER"; }
credit_sql_secret() { [[ $1 == staging ]] && echo "$CREDIT_SQL_STAGING_SECRET" || echo "$CREDIT_SQL_PRODUCTION_SECRET"; }
user_mongodb_secret() { [[ $1 == staging ]] && echo "$USER_MONGODB_STAGING_SECRET" || echo "$USER_MONGODB_PRODUCTION_SECRET"; }
credit_pubsub_enabled() { [[ $1 == staging ]] && echo "$CREDIT_PUBSUB_STAGING_ENABLED" || echo "$CREDIT_PUBSUB_PRODUCTION_ENABLED"; }
credit_dlq_topic() { [[ $1 == staging ]] && echo "$CREDIT_PUBSUB_STAGING_DLQ_TOPIC" || echo "$CREDIT_PUBSUB_PRODUCTION_DLQ_TOPIC"; }
credit_dlq_subscription() { [[ $1 == staging ]] && echo "$CREDIT_PUBSUB_STAGING_DLQ_SUBSCRIPTION" || echo "$CREDIT_PUBSUB_PRODUCTION_DLQ_SUBSCRIPTION"; }
environment_value() {
  local env=$1 key=$2
  awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "infra/environments/$env.env"
}

echo "Service identities"
for svc in "${services[@]}"; do
  sa=$(runtime_sa "$svc")
  if ! gcloud iam service-accounts describe "$sa" --project "$PROJECT_ID" >/dev/null 2>&1; then
    problem "$svc: runtime identity $sa does not exist"
    continue
  fi
  if gcloud iam service-accounts get-iam-policy "$sa" --project "$PROJECT_ID" --format json |
    jq -e --arg m "serviceAccount:$DEPLOYER_SA" \
      '.bindings // [] | any(.role == "roles/iam.serviceAccountUser" and (.members | index($m)))' >/dev/null; then
    ok "$svc: $sa (deployer may deploy as it)"
  else
    problem "$svc: the deployer is not allowed to deploy as $sa"
  fi
done

policy=$(gcloud projects get-iam-policy "$PROJECT_ID" --format json)
echo "Firestore databases"
for svc in ${firestore_services[@]+"${firestore_services[@]}"}; do
  name=${svc%-service}
  for env in "${environments[@]}"; do
    db="$name-$env"
    if ! gcloud firestore databases describe --database "$db" --project "$PROJECT_ID" >/dev/null 2>&1; then
      problem "$svc: Firestore database '$db' does not exist"
      continue
    fi
    if jq -e --arg m "serviceAccount:$(runtime_sa "$svc")" --arg db "projects/$PROJECT_ID/databases/$db" \
      '.bindings // [] | any(.role == "roles/datastore.user" and (.members | index($m))
        and ((.condition.expression // "") | contains($db)))' <<<"$policy" >/dev/null; then
      ok "$svc: $db (access granted)"
    else
      problem "$svc: $(runtime_sa "$svc") has no access to Firestore database '$db'"
    fi
  done
done

echo "Order Service Cloud SQL"
if ! gcloud sql instances describe "$CLOUD_SQL_INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1; then
  problem "order-service: Cloud SQL instance '$CLOUD_SQL_INSTANCE' does not exist"
else
  ok "order-service: Cloud SQL instance '$CLOUD_SQL_INSTANCE'"
  for env in staging production; do
    db=$(sql_database "$env")
    if gcloud sql databases describe "$db" --instance "$CLOUD_SQL_INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1; then
      ok "order-service: Cloud SQL database '$db'"
    else
      problem "order-service: Cloud SQL database '$db' does not exist"
    fi
  done
  if jq -e --arg m "serviceAccount:$(runtime_sa order-service)" \
    '.bindings // [] | any(.role == "roles/cloudsql.client" and (.members | index($m)))' <<<"$policy" >/dev/null; then
    ok "order-service: $(runtime_sa order-service) has roles/cloudsql.client"
  else
    problem "order-service: $(runtime_sa order-service) has no roles/cloudsql.client"
  fi
  for env in staging production; do
    secret=$(sql_secret "$env")
    if ! gcloud secrets describe "$secret" --project "$PROJECT_ID" >/dev/null 2>&1; then
      problem "order-service: Secret Manager secret '$secret' does not exist"
      continue
    fi
    secret_policy=$(gcloud secrets get-iam-policy "$secret" --project "$PROJECT_ID" --format json)
    if jq -e --arg m "serviceAccount:$(runtime_sa order-service)" \
      '.bindings // [] | any(.role == "roles/secretmanager.secretAccessor" and (.members | index($m)))' <<<"$secret_policy" >/dev/null; then
      ok "order-service: $(runtime_sa order-service) can access secret '$secret'"
    else
      problem "order-service: $(runtime_sa order-service) cannot access secret '$secret'"
    fi
  done
fi

echo "Credit Service Cloud SQL"
if ! gcloud sql instances describe "$CLOUD_SQL_INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1; then
  problem "credit-service: Cloud SQL instance '$CLOUD_SQL_INSTANCE' does not exist"
else
  ok "credit-service: Cloud SQL instance '$CLOUD_SQL_INSTANCE'"
  for env in "${environments[@]}"; do
    db=$(credit_sql_database "$env")
    if gcloud sql databases describe "$db" --instance "$CLOUD_SQL_INSTANCE" \
      --project "$PROJECT_ID" >/dev/null 2>&1; then
      ok "credit-service: Cloud SQL database '$db'"
    else
      problem "credit-service: Cloud SQL database '$db' does not exist"
    fi
    user=$(credit_sql_user "$env")
    if gcloud sql users list --instance "$CLOUD_SQL_INSTANCE" --project "$PROJECT_ID" \
      --filter="name=$user" --format='value(name)' | grep -Fxq "$user"; then
      ok "credit-service: Cloud SQL user '$user'"
    else
      problem "credit-service: Cloud SQL user '$user' does not exist"
    fi
  done
  if jq -e --arg m "serviceAccount:$(runtime_sa credit-service)" \
    '.bindings // [] | any(.role == "roles/cloudsql.client" and (.members | index($m)))' \
    <<<"$policy" >/dev/null; then
    ok "credit-service: $(runtime_sa credit-service) has roles/cloudsql.client"
  else
    problem "credit-service: $(runtime_sa credit-service) has no roles/cloudsql.client"
  fi
  for env in "${environments[@]}"; do
    secret=$(credit_sql_secret "$env")
    if ! gcloud secrets describe "$secret" --project "$PROJECT_ID" >/dev/null 2>&1; then
      problem "credit-service: Secret Manager secret '$secret' does not exist"
      continue
    fi
    if gcloud secrets versions list "$secret" --project "$PROJECT_ID" \
      --filter='state=ENABLED' --format='value(name)' | grep -q .; then
      ok "credit-service: Secret Manager secret '$secret' has an enabled password version"
    else
      problem "credit-service: Secret Manager secret '$secret' has no enabled password version"
    fi
    secret_policy=$(gcloud secrets get-iam-policy "$secret" --project "$PROJECT_ID" --format json)
    if jq -e --arg m "serviceAccount:$(runtime_sa credit-service)" \
      '.bindings // [] | any(.role == "roles/secretmanager.secretAccessor" and (.members | index($m)))' \
      <<<"$secret_policy" >/dev/null; then
      ok "credit-service: $(runtime_sa credit-service) can access secret '$secret'"
    else
      problem "credit-service: $(runtime_sa credit-service) cannot access secret '$secret'"
    fi
  done
fi

echo "Order Service Pub/Sub topics"
for env in "${environments[@]}"; do
  for key in ORDER_COMPLETION_TOPIC ORDER_OPEN_REFUND_TOPIC ORDER_COURIER_PENALTY_ADDITION_TOPIC ORDER_COURIER_PENALTY_DEDUCTION_TOPIC ORDER_CREDIT_COMPENSATION_TOPIC; do
    topic=$(environment_value "$env" "$key")
    if ! gcloud pubsub topics describe "$topic" --project "$PROJECT_ID" >/dev/null 2>&1; then
      problem "order-service: Pub/Sub topic '$topic' ($env) does not exist"
    elif gcloud pubsub topics get-iam-policy "$topic" --project "$PROJECT_ID" --format=json 2>/dev/null |
        jq -e --arg member "serviceAccount:$(runtime_sa order-service)" \
          '.bindings // [] | any(.role == "roles/pubsub.publisher" and (.members | index($member)))' >/dev/null; then
      ok "order-service: may publish to '$topic' ($env)"
    else
      problem "order-service: $(runtime_sa order-service) cannot publish to '$topic' ($env)"
    fi
  done
done

echo "User Service Pub/Sub topic"
for env in "${environments[@]}"; do
  topic=$(environment_value "$env" USER_CREATED_TOPIC)
  if ! gcloud pubsub topics describe "$topic" --project "$PROJECT_ID" >/dev/null 2>&1; then
    problem "user-service: Pub/Sub topic '$topic' ($env) does not exist"
  elif gcloud pubsub topics get-iam-policy "$topic" --project "$PROJECT_ID" --format=json 2>/dev/null |
      jq -e --arg member "serviceAccount:$(runtime_sa user-service)" \
        '.bindings // [] | any(.role == "roles/pubsub.publisher" and (.members | index($member)))' >/dev/null; then
    ok "user-service: may publish to '$topic' ($env)"
  else
    problem "user-service: $(runtime_sa user-service) cannot publish to '$topic' ($env)"
  fi
done

echo "User Service MongoDB connection string"
for env in "${environments[@]}"; do
  secret=$(user_mongodb_secret "$env")
  if ! gcloud secrets describe "$secret" --project "$PROJECT_ID" >/dev/null 2>&1; then
    problem "user-service: Secret Manager secret '$secret' does not exist"
    continue
  fi
  if gcloud secrets get-iam-policy "$secret" --project "$PROJECT_ID" --format json |
      jq -e --arg m "serviceAccount:$(runtime_sa user-service)" \
        '.bindings // [] | any(.role == "roles/secretmanager.secretAccessor" and (.members | index($m)))' >/dev/null; then
    ok "user-service: $(runtime_sa user-service) can access secret '$secret'"
  else
    problem "user-service: $(runtime_sa user-service) cannot access secret '$secret'"
  fi
  if gcloud secrets versions list "$secret" --project "$PROJECT_ID" --filter='state=ENABLED' --format='value(name)' | grep -q .; then
    ok "user-service: secret '$secret' has a value"
  elif gcloud run services describe "user-service-$env" --project "$PROJECT_ID" --region "$REGION" >/dev/null 2>&1; then
    problem "user-service: secret '$secret' has no enabled version, but user-service-$env is deployed"
  else
    ok "user-service: secret '$secret' has no value yet (add it before the first $env deploy)"
  fi
done

echo "Credit Service Pub/Sub push"
for env in "${environments[@]}"; do
  if [[ $(credit_pubsub_enabled "$env") != true ]]; then
    ok "credit-service: Pub/Sub push for '$env' is intentionally not activated"
    continue
  fi

  push_sa=$(environment_value "$env" CREDIT_PUBSUB_PUSH_SERVICE_ACCOUNT)
  push_url="https://credit-service-$env-$PROJECT_NUMBER.$REGION.run.app"
  dlq_topic=$(credit_dlq_topic "$env")
  dlq_subscription=$(credit_dlq_subscription "$env")
  pubsub_agent="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"
  result_topic=$(environment_value "$env" CREDIT_COMPENSATION_RESULT_TOPIC)

  if ! gcloud pubsub topics describe "$result_topic" --project "$PROJECT_ID" >/dev/null 2>&1; then
    problem "credit-service: compensation result topic '$result_topic' does not exist"
  elif gcloud pubsub topics get-iam-policy "$result_topic" --project "$PROJECT_ID" --format=json 2>/dev/null |
      jq -e --arg member "serviceAccount:$(runtime_sa credit-service)" \
        '.bindings // [] | any(.role == "roles/pubsub.publisher" and (.members | index($member)))' >/dev/null; then
    ok "credit-service: may publish compensation results to '$result_topic'"
  else
    problem "credit-service: $(runtime_sa credit-service) cannot publish to '$result_topic'"
  fi

  if gcloud iam service-accounts describe "$push_sa" --project "$PROJECT_ID" >/dev/null 2>&1; then
    ok "credit-service: Pub/Sub push identity '$push_sa'"
  else
    problem "credit-service: Pub/Sub push identity '$push_sa' does not exist"
  fi
  if ! gcloud pubsub topics describe "$dlq_topic" --project "$PROJECT_ID" >/dev/null 2>&1; then
    problem "credit-service: Pub/Sub dead-letter topic '$dlq_topic' does not exist"
  elif ! gcloud pubsub subscriptions describe "$dlq_subscription" --project "$PROJECT_ID" \
      --format='value(topic)' | grep -Fxq "projects/$PROJECT_ID/topics/$dlq_topic"; then
    problem "credit-service: dead-letter recovery subscription '$dlq_subscription' is missing or misconfigured"
  else
    ok "credit-service: dead-letter topic and recovery subscription for '$env'"
  fi
  if gcloud pubsub topics get-iam-policy "$dlq_topic" --project "$PROJECT_ID" --format=json 2>/dev/null |
      jq -e --arg member "serviceAccount:$pubsub_agent" \
        '.bindings // [] | any(.role == "roles/pubsub.publisher" and (.members | index($member)))' >/dev/null; then
    ok "credit-service: Pub/Sub may forward failures to '$dlq_topic'"
  else
    problem "credit-service: Pub/Sub cannot publish to dead-letter topic '$dlq_topic'"
  fi

  topics=(
    "$(environment_value "$env" ORDER_OPEN_REFUND_TOPIC)"
    "$(environment_value "$env" ORDER_COMPLETION_TOPIC)"
    "$(environment_value "$env" ORDER_CREDIT_COMPENSATION_TOPIC)"
    "$(environment_value "$env" USER_CREATED_TOPIC)"
  )
  subscriptions=(
    "$(environment_value "$env" CREDIT_ORDER_OPEN_REFUND_SUBSCRIPTION)"
    "$(environment_value "$env" CREDIT_ORDER_COMPLETION_SUBSCRIPTION)"
    "$(environment_value "$env" CREDIT_COMPENSATION_SUBSCRIPTION)"
    "$(environment_value "$env" CREDIT_USER_CREATED_SUBSCRIPTION)"
  )
  push_paths=(
    "/api/credits/internal/order-events/open-refund"
    "/api/credits/internal/order-events/completion"
    "/api/credits/internal/command-compensations"
    "/api/credits/internal/user-events/created"
  )
  for index in "${!subscriptions[@]}"; do
    topic=${topics[$index]}
    subscription=${subscriptions[$index]}
    push_endpoint="$push_url${push_paths[$index]}"
    if ! gcloud pubsub topics describe "$topic" --project "$PROJECT_ID" >/dev/null 2>&1; then
      problem "event publisher: Pub/Sub topic '$topic' does not exist"
      continue
    fi
    if ! subscription_json=$(gcloud pubsub subscriptions describe "$subscription" \
        --project "$PROJECT_ID" --format=json 2>/dev/null); then
      problem "credit-service: Pub/Sub subscription '$subscription' does not exist"
      continue
    fi
    if jq -e \
      --arg topic "projects/$PROJECT_ID/topics/$topic" \
      --arg endpoint "$push_endpoint" \
      --arg audience "$push_url" \
      --arg service_account "$push_sa" \
      --arg dead_letter "projects/$PROJECT_ID/topics/$dlq_topic" \
      '.topic == $topic
        and .pushConfig.pushEndpoint == $endpoint
        and .pushConfig.oidcToken.audience == $audience
        and .pushConfig.oidcToken.serviceAccountEmail == $service_account
        and .deadLetterPolicy.deadLetterTopic == $dead_letter
        and .deadLetterPolicy.maxDeliveryAttempts == 10
        and .ackDeadlineSeconds == 60
        and .retryPolicy.minimumBackoff == "10s"
        and .retryPolicy.maximumBackoff == "600s"' <<<"$subscription_json" >/dev/null; then
      ok "credit-service: Pub/Sub push subscription '$subscription'"
    else
      problem "credit-service: Pub/Sub push subscription '$subscription' is misconfigured"
    fi
    if gcloud pubsub subscriptions get-iam-policy "$subscription" --project "$PROJECT_ID" \
        --format=json 2>/dev/null |
        jq -e --arg member "serviceAccount:$pubsub_agent" \
          '.bindings // [] | any(.role == "roles/pubsub.subscriber" and (.members | index($member)))' >/dev/null; then
      ok "credit-service: Pub/Sub may forward failures from '$subscription'"
    else
      problem "credit-service: Pub/Sub cannot acknowledge dead-lettered messages from '$subscription'"
    fi
  done

  if ! gcloud run services describe "credit-service-$env" --region "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
    ok "credit-service-$env not deployed yet; push target is pre-provisioned for its deterministic URL"
  elif gcloud run services get-iam-policy "credit-service-$env" --region "$REGION" \
      --project "$PROJECT_ID" --format=json 2>/dev/null |
      jq -e --arg member "serviceAccount:$push_sa" \
        '.bindings // [] | any(.role == "roles/run.invoker" and (.members | index($member)))' >/dev/null; then
    ok "credit-service: '$push_sa' may invoke credit-service-$env"
  else
    problem "credit-service: '$push_sa' cannot invoke credit-service-$env"
  fi

  if gcloud iam service-accounts get-iam-policy "$push_sa" --project "$PROJECT_ID" --format=json 2>/dev/null |
      jq -e --arg member "serviceAccount:$pubsub_agent" \
        '.bindings // [] | any(.role == "roles/iam.serviceAccountTokenCreator" and (.members | index($member)))' >/dev/null; then
    ok "credit-service: Pub/Sub may mint OIDC tokens for '$push_sa'"
  else
    problem "credit-service: Pub/Sub cannot mint OIDC tokens for '$push_sa'"
  fi
done


echo "Order Service compensation result push"
for env in "${environments[@]}"; do
  result_topic=$(environment_value "$env" CREDIT_COMPENSATION_RESULT_TOPIC)
  result_sub=$(environment_value "$env" ORDER_COMPENSATION_RESULT_SUBSCRIPTION)
  result_sa=$(environment_value "$env" ORDER_COMPENSATION_PUSH_SERVICE_ACCOUNT)
  result_url="https://order-service-$env-$PROJECT_NUMBER.$REGION.run.app"
  suffix=$env
  [[ $env != production ]] || suffix=prod
  result_dlq="order-compensations-dead-letter-$suffix-v1"
  result_agent="serviceAccount:service-$PROJECT_NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com"
  if ! result_json=$(gcloud pubsub subscriptions describe "$result_sub" --project "$PROJECT_ID" --format=json 2>/dev/null); then
    problem "order-service: compensation result subscription '$result_sub' is missing; run configure-compensation-pubsub.sh $env"
    continue
  fi
  if ! jq -e --arg topic "projects/$PROJECT_ID/topics/$result_topic" \
      --arg endpoint "$result_url/api/orders/internal/credit-compensations" \
      --arg audience "$result_url" --arg sa "$result_sa" --arg dlq "projects/$PROJECT_ID/topics/$result_dlq" \
      '.topic == $topic and .pushConfig.pushEndpoint == $endpoint and
       .pushConfig.oidcToken.audience == $audience and .pushConfig.oidcToken.serviceAccountEmail == $sa and
       .deadLetterPolicy.deadLetterTopic == $dlq and .deadLetterPolicy.maxDeliveryAttempts == 10' <<<"$result_json" >/dev/null; then
    problem "order-service: compensation result subscription '$result_sub' is misconfigured"
  fi
  if ! gcloud pubsub subscriptions describe "$result_dlq-recovery" --project "$PROJECT_ID" --format=json 2>/dev/null |
      jq -e --arg topic "projects/$PROJECT_ID/topics/$result_dlq" '.topic == $topic' >/dev/null; then
    problem "order-service: compensation dead-letter recovery subscription is missing or misconfigured"
  fi
  if ! gcloud iam service-accounts get-iam-policy "$result_sa" --project "$PROJECT_ID" --format=json 2>/dev/null |
      jq -e --arg m "$result_agent" '.bindings // [] | any(.role == "roles/iam.serviceAccountTokenCreator" and (.members | index($m)))' >/dev/null; then
    problem "order-service: Pub/Sub cannot mint OIDC tokens for '$result_sa'"
  fi
  if ! gcloud pubsub subscriptions get-iam-policy "$result_sub" --project "$PROJECT_ID" --format=json 2>/dev/null |
      jq -e --arg m "$result_agent" '.bindings // [] | any(.role == "roles/pubsub.subscriber" and (.members | index($m)))' >/dev/null; then
    problem "order-service: Pub/Sub cannot forward exhausted compensation results to the DLQ"
  fi
  if ! gcloud pubsub topics get-iam-policy "$result_dlq" --project "$PROJECT_ID" --format=json 2>/dev/null |
      jq -e --arg m "$result_agent" '.bindings // [] | any(.role == "roles/pubsub.publisher" and (.members | index($m)))' >/dev/null; then
    problem "order-service: Pub/Sub cannot publish to the compensation DLQ"
  fi
done

echo "Network (Cloud Run Direct VPC egress; only the gateway is public)"
if ! gcloud compute networks describe "$VPC_NETWORK" --project "$PROJECT_ID" >/dev/null 2>&1; then
  problem "VPC network '$VPC_NETWORK' does not exist"
elif [[ $(gcloud compute networks subnets describe "$VPC_SUBNET" --project "$PROJECT_ID" --region "$REGION" \
    --format 'value(privateIpGoogleAccess)' 2>/dev/null) != True ]]; then
  problem "subnet '$VPC_SUBNET' is missing or has Private Google Access off"
else
  ok "network '$VPC_NETWORK', subnet '$VPC_SUBNET' (Private Google Access on)"
  if gcloud compute networks subnets get-iam-policy "$VPC_SUBNET" --project "$PROJECT_ID" --region "$REGION" \
      --format json | jq -e --arg m "serviceAccount:$DEPLOYER_SA" \
        '.bindings // [] | any(.role == "roles/compute.networkUser" and (.members | index($m)))' >/dev/null; then
    ok "the deployer may deploy into '$VPC_SUBNET'"
  else
    problem "the deployer has no roles/compute.networkUser on subnet '$VPC_SUBNET'"
  fi
fi
if gcloud compute routers describe "$VPC_ROUTER" --project "$PROJECT_ID" --region "$REGION" --format json 2>/dev/null |
    jq -e --arg nat "$VPC_NAT" '.nats // [] | any(.name == $nat)' >/dev/null; then
  ok "Cloud NAT '$VPC_NAT' on router '$VPC_ROUTER'"
else
  problem "Cloud NAT '$VPC_NAT' on router '$VPC_ROUTER' does not exist"
fi

echo "Config buckets"
for env in "${environments[@]}"; do
  bucket="${PROJECT_ID}-foc-config-$env"
  if gcloud storage buckets describe "gs://$bucket" --project "$PROJECT_ID" >/dev/null 2>&1; then
    ok "gs://$bucket"
  else
    problem "config bucket gs://$bucket does not exist"
  fi
done

echo "Reporting Service private attachment buckets"
for env in "${environments[@]}"; do
  bucket="${PROJECT_ID}-foc-reporting-$env"
  if ! bucket_json=$(gcloud storage buckets describe "gs://$bucket" --project "$PROJECT_ID" --format=json 2>/dev/null); then
    problem "reporting-service: attachment bucket gs://$bucket does not exist"
    continue
  fi
  # gcloud storage emits snake_case; also accept the nested Storage API shape.
  if [[ $(jq -r '.public_access_prevention // .iamConfiguration.publicAccessPrevention // ""' <<<"$bucket_json") != enforced ]]; then
    problem "reporting-service: gs://$bucket does not enforce public-access prevention"
  elif ! bucket_policy=$(gcloud storage buckets get-iam-policy "gs://$bucket" --project "$PROJECT_ID" --format=json); then
    problem "reporting-service: CI cannot read bucket IAM policy for gs://$bucket; ensure the deployer has storage.buckets.getIamPolicy"
  elif jq -e --arg m "serviceAccount:$(runtime_sa reporting-service)" \
      '.bindings // [] | any(.role == "roles/storage.objectAdmin" and (.members | index($m)))' <<<"$bucket_policy" >/dev/null; then
    ok "reporting-service: gs://$bucket is private and bucket-scoped object access is granted"
  else
    problem "reporting-service: $(runtime_sa reporting-service) has no object access to gs://$bucket"
  fi
done

if [[ ${#problems[@]} -gt 0 ]]; then
  echo
  echo "::error title=Cloud infrastructure incomplete::${#problems[@]} problem(s). Ask the CI/CD owner to run infra/gcp/bootstrap.sh, then infra/gcp/configure-compensation-pubsub.sh staging and infra/gcp/configure-compensation-pubsub.sh production; then re-run this check."
  if [[ -n ${GITHUB_STEP_SUMMARY:-} ]]; then
    {
      echo "### Cloud infrastructure incomplete"
      printf -- '- %s\n' "${problems[@]}"
      echo
      echo "Fix: the CI/CD owner runs \`infra/gcp/bootstrap.sh\`, then \`infra/gcp/configure-compensation-pubsub.sh staging\` and \`infra/gcp/configure-compensation-pubsub.sh production\`, then re-runs this job."
    } >>"$GITHUB_STEP_SUMMARY"
  fi
  exit 1
fi
echo
echo "All cloud infrastructure is in place for: ${environments[*]}"
