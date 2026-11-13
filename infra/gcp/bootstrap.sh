#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), date: 2026-10-13
# Mode: Infrastructure implementation.
# Scope: Added private Reporting Service buckets and bucket-scoped object permissions.
# Author review: I reviewed for correctness.

# GCP setup for FoC CI/CD and Cloud Run. Idempotent: it only creates what is missing.
# Re-run it whenever a service is added: the service lists are derived from the repository,
# and CI's "Cloud infrastructure" check (scripts/ci/check-infra.sh) fails until it has run.
#
# Usage (with an owner-level gcloud account active):
#   infra/gcp/bootstrap.sh
#
# Creates, per docs/ci-cd.md:
#   - Artifact Registry docker repo                     ${AR_REPO}
#   - one runtime service account per service           foc-<service>@
#   - one Firestore database per service per env         <name>-<env>, only readable by foc-<service>@
#   - one shared Cloud SQL PostgreSQL instance with isolated Order/Credit databases,
#     runtime users, and secrets per environment (approved by order-service ADR-008)
#   - Pub/Sub API prerequisites; event topics and Credit push subscriptions are provisioned
#     separately after the target Cloud Run service exists
#   - one config bucket per env (mounted into services)  ${PROJECT_ID}-foc-config-<env>
#   - VPC for Cloud Run Direct VPC egress: subnet with Private Google Access, Cloud NAT
#     (only the gateway is public; the other services have internal ingress)
#   - deployer service account used by GitHub Actions    foc-deployer@
#   - read-only custom role focInfraReader (deployer), used by the CI infrastructure check
#   - Workload Identity Federation for the GitHub repo  (keyless: no JSON keys in GitHub)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=SCRIPTDIR/project.env
source "$ROOT/infra/gcp/project.env"

ENVIRONMENTS=(staging production)
# Derived from the repository so nobody has to maintain lists (override with env vars):
# every service folder (it has a Dockerfile, even an empty placeholder) gets a runtime
# identity, and every service whose build uses the Firestore client gets its databases.
default_runtime=$(for dir in "$ROOT"/*/; do [[ -f "$dir/Dockerfile" ]] && basename "$dir"; done | tr '\n' ' ')
default_firestore=$("$ROOT/scripts/ci/list-services.sh" --firestore | tr '\n' ' ')
read -r -a RUNTIME_SERVICES <<<"${RUNTIME_SERVICES:-$default_runtime}"
read -r -a FIRESTORE_SERVICES <<<"${FIRESTORE_SERVICES:-$default_firestore}"
echo "Runtime services:   ${RUNTIME_SERVICES[*]}"
echo "Firestore services: ${FIRESTORE_SERVICES[*]:-none}"

POOL_ID=github
PROVIDER_ID=github-actions
DEPLOYER_ID=${DEPLOYER_SA%%@*}

gc() { gcloud --project "$PROJECT_ID" --quiet "$@"; }
exists() { "$@" >/dev/null 2>&1; }
log() { printf '\n==> %s\n' "$*"; }
runtime_sa() { echo "foc-$1@${PROJECT_ID}.iam.gserviceaccount.com"; }
# Retries transient IAM failures: per-minute service-account quotas and concurrent
# policy edits (ETag conflicts) are both common right after APIs/databases are created.
retry() {
  local attempt
  for attempt in 1 2 3 4 5; do
    "$@" && return 0
    echo "  retrying in $((attempt * 15))s (attempt $attempt/5)"
    sleep $((attempt * 15))
  done
  return 1
}
create_sa() { retry gc iam service-accounts create "$@"; }
project_binding() { retry gc projects add-iam-policy-binding "$PROJECT_ID" "$@" >/dev/null; }
config_bucket() { echo "${PROJECT_ID}-foc-config-$1"; }
reporting_bucket() { echo "${PROJECT_ID}-foc-reporting-$1"; }
sql_database() { [[ $1 == staging ]] && echo "$CLOUD_SQL_STAGING_DATABASE" || echo "$CLOUD_SQL_PRODUCTION_DATABASE"; }
sql_user() { [[ $1 == staging ]] && echo "$CLOUD_SQL_STAGING_USER" || echo "$CLOUD_SQL_PRODUCTION_USER"; }
sql_secret() { [[ $1 == staging ]] && echo "$CLOUD_SQL_STAGING_SECRET" || echo "$CLOUD_SQL_PRODUCTION_SECRET"; }
credit_sql_database() { [[ $1 == staging ]] && echo "$CREDIT_SQL_STAGING_DATABASE" || echo "$CREDIT_SQL_PRODUCTION_DATABASE"; }
credit_sql_user() { [[ $1 == staging ]] && echo "$CREDIT_SQL_STAGING_USER" || echo "$CREDIT_SQL_PRODUCTION_USER"; }
credit_sql_secret() { [[ $1 == staging ]] && echo "$CREDIT_SQL_STAGING_SECRET" || echo "$CREDIT_SQL_PRODUCTION_SECRET"; }
user_mongodb_secret() { [[ $1 == staging ]] && echo "$USER_MONGODB_STAGING_SECRET" || echo "$USER_MONGODB_PRODUCTION_SECRET"; }
secret_has_version() {
  local secret=$1 version
  version=$(gc secrets versions list "$secret" --filter='state=ENABLED' --format='value(name)' | head -n1)
  [[ -n "$version" ]]
}
ensure_sql_user_secret() {
  local user=$1 secret=$2 password
  if exists gc sql users describe "$user" --instance "$CLOUD_SQL_INSTANCE"; then
    if ! exists gc secrets describe "$secret" || ! secret_has_version "$secret"; then
      echo "ERROR: SQL user '$user' exists but Secret Manager secret '$secret' has no enabled version; reset the user explicitly before re-running." >&2
      exit 1
    fi
    return
  fi
  if exists gc secrets describe "$secret" && secret_has_version "$secret"; then
    echo "ERROR: Secret '$secret' already has a value but SQL user '$user' does not exist; resolve this mismatch explicitly." >&2
    exit 1
  fi
  password=$(openssl rand -hex 32)
  gc sql users create "$user" --instance "$CLOUD_SQL_INSTANCE" --password "$password"
  exists gc secrets describe "$secret" || gc secrets create "$secret" --replication-policy=automatic >/dev/null
  printf '%s' "$password" | gc secrets versions add "$secret" --data-file=- >/dev/null
  unset password
}

log "Enabling APIs"
gc services enable \
  run.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com \
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  secretmanager.googleapis.com cloudresourcemanager.googleapis.com storage.googleapis.com \
  sqladmin.googleapis.com pubsub.googleapis.com compute.googleapis.com

log "Artifact Registry repository: $AR_REPO ($REGION)"
exists gc artifacts repositories describe "$AR_REPO" --location "$REGION" ||
  gc artifacts repositories create "$AR_REPO" --location "$REGION" \
    --repository-format docker --description "FoC container images"

log "Runtime service accounts"
for svc in "${RUNTIME_SERVICES[@]}"; do
  exists gc iam service-accounts describe "$(runtime_sa "$svc")" ||
    create_sa "foc-$svc" --display-name "FoC $svc (Cloud Run runtime)"
done

log "Order Service Cloud SQL PostgreSQL (shared staging/production instance)"
if ! exists gc sql instances describe "$CLOUD_SQL_INSTANCE"; then
  gc sql instances create "$CLOUD_SQL_INSTANCE" \
    --database-version "$CLOUD_SQL_DATABASE_VERSION" \
    --tier "$CLOUD_SQL_TIER" \
    --region "$REGION" \
    --storage-type "$CLOUD_SQL_STORAGE_TYPE" \
    --storage-size "$CLOUD_SQL_STORAGE_SIZE_GB" \
    --availability-type zonal \
    --backup-start-time "$CLOUD_SQL_BACKUP_START_TIME" \
    --enable-point-in-time-recovery \
    --deletion-protection
else
  deletion_protection=$(gc sql instances describe "$CLOUD_SQL_INSTANCE" --format='value(settings.deletionProtectionEnabled)')
  if [[ "$deletion_protection" != "True" && "$deletion_protection" != "true" ]]; then
    gc sql instances patch "$CLOUD_SQL_INSTANCE" --deletion-protection
  fi
fi
for env in "${ENVIRONMENTS[@]}"; do
  db=$(sql_database "$env")
  exists gc sql databases describe "$db" --instance "$CLOUD_SQL_INSTANCE" ||
    gc sql databases create "$db" --instance "$CLOUD_SQL_INSTANCE"
  secret=$(sql_secret "$env")
  ensure_sql_user_secret "$(sql_user "$env")" "$secret"
  gc secrets add-iam-policy-binding "$secret" \
    --member "serviceAccount:$(runtime_sa order-service)" --role roles/secretmanager.secretAccessor >/dev/null
done
# The Order Service runtime identity may connect to Cloud SQL; database credentials remain in Secret Manager.
project_binding --member "serviceAccount:$(runtime_sa order-service)" --role roles/cloudsql.client --condition None

log "Credit Service databases on the shared Cloud SQL PostgreSQL instance"
for env in "${ENVIRONMENTS[@]}"; do
  db=$(credit_sql_database "$env")
  exists gc sql databases describe "$db" --instance "$CLOUD_SQL_INSTANCE" ||
    gc sql databases create "$db" --instance "$CLOUD_SQL_INSTANCE"
  secret=$(credit_sql_secret "$env")
  ensure_sql_user_secret "$(credit_sql_user "$env")" "$secret"
  gc secrets add-iam-policy-binding "$secret" \
    --member "serviceAccount:$(runtime_sa credit-service)" --role roles/secretmanager.secretAccessor >/dev/null
done
# The Credit Service runtime identity may connect to Cloud SQL; database credentials remain in Secret Manager.
project_binding --member "serviceAccount:$(runtime_sa credit-service)" --role roles/cloudsql.client --condition None

log "User Service MongoDB connection strings (Secret Manager)"
for env in "${ENVIRONMENTS[@]}"; do
  secret=$(user_mongodb_secret "$env")
  exists gc secrets describe "$secret" || gc secrets create "$secret" --replication-policy=automatic >/dev/null
  gc secrets add-iam-policy-binding "$secret" \
    --member "serviceAccount:$(runtime_sa user-service)" --role roles/secretmanager.secretAccessor >/dev/null
  secret_has_version "$secret" ||
    echo "NOTE: add the $env MongoDB URI: printf '%s' \"\$URI\" | gcloud secrets versions add $secret --data-file=-"
done

log "Firestore databases (database-per-service)"
for svc in ${FIRESTORE_SERVICES[@]+"${FIRESTORE_SERVICES[@]}"}; do
  name=${svc%-service}
  for env in "${ENVIRONMENTS[@]}"; do
    db="$name-$env"
    if ! exists gc firestore databases describe --database "$db"; then
      protection=()
      [[ $env == production ]] && protection=(--delete-protection)
      gc firestore databases create --database "$db" --location "$REGION" --type firestore-native ${protection[@]+"${protection[@]}"}
    fi
    # Only this service's identity may read/write its database.
    project_binding --member "serviceAccount:$(runtime_sa "$svc")" --role roles/datastore.user \
      --condition "expression=resource.name == \"projects/$PROJECT_ID/databases/$db\",title=firestore-$db"
  done
done

log "Config buckets (files mounted into Cloud Run, e.g. seed data)"
for env in "${ENVIRONMENTS[@]}"; do
  bucket=$(config_bucket "$env")
  exists gcloud storage buckets describe "gs://$bucket" ||
    gcloud storage buckets create "gs://$bucket" --project "$PROJECT_ID" --location "$REGION" \
      --uniform-bucket-level-access --public-access-prevention
  for svc in "${RUNTIME_SERVICES[@]}"; do
    gcloud storage buckets add-iam-policy-binding "gs://$bucket" \
      --member "serviceAccount:$(runtime_sa "$svc")" --role roles/storage.objectViewer >/dev/null
  done
done

log "Private Reporting Service attachment buckets"
for env in "${ENVIRONMENTS[@]}"; do
  bucket=$(reporting_bucket "$env")
  exists gcloud storage buckets describe "gs://$bucket" ||
    gcloud storage buckets create "gs://$bucket" --project "$PROJECT_ID" --location "$REGION" \
      --uniform-bucket-level-access --public-access-prevention
  gcloud storage buckets update "gs://$bucket" --public-access-prevention --uniform-bucket-level-access >/dev/null
  gcloud storage buckets add-iam-policy-binding "gs://$bucket" \
    --member "serviceAccount:$(runtime_sa reporting-service)" --role roles/storage.objectAdmin >/dev/null
done

log "VPC for Cloud Run Direct VPC egress: $VPC_NETWORK / $VPC_SUBNET ($VPC_SUBNET_RANGE)"
exists gc compute networks describe "$VPC_NETWORK" ||
  gc compute networks create "$VPC_NETWORK" --subnet-mode custom \
    --description "FoC: Cloud Run services reach each other's internal endpoints through this network"
exists gc compute networks subnets describe "$VPC_SUBNET" --region "$REGION" ||
  gc compute networks subnets create "$VPC_SUBNET" --network "$VPC_NETWORK" --region "$REGION" \
    --range "$VPC_SUBNET_RANGE" --enable-private-ip-google-access
# Requests to *.run.app (and Google APIs) from the subnet stay on Google's network and count as internal.
gc compute networks subnets update "$VPC_SUBNET" --region "$REGION" --enable-private-ip-google-access >/dev/null
exists gc compute routers describe "$VPC_ROUTER" --region "$REGION" ||
  gc compute routers create "$VPC_ROUTER" --network "$VPC_NETWORK" --region "$REGION"
# Internet egress (e.g. Cloud SQL's public IP for the Java connector) for services that send all traffic via the VPC.
exists gc compute routers nats describe "$VPC_NAT" --router "$VPC_ROUTER" --region "$REGION" ||
  gc compute routers nats create "$VPC_NAT" --router "$VPC_ROUTER" --region "$REGION" \
    --auto-allocate-nat-external-ips --nat-all-subnet-ip-ranges

log "Deployer service account: $DEPLOYER_SA"
exists gc iam service-accounts describe "$DEPLOYER_SA" ||
  create_sa "$DEPLOYER_ID" --display-name "FoC GitHub Actions deployer"
project_binding --member "serviceAccount:$DEPLOYER_SA" --role roles/run.admin --condition None
# repoAdmin (not just writer): promoting a build moves the <environment> tag, which deletes the old tag.
gc artifacts repositories add-iam-policy-binding "$AR_REPO" --location "$REGION" \
  --member "serviceAccount:$DEPLOYER_SA" --role roles/artifactregistry.repoAdmin >/dev/null
for svc in "${RUNTIME_SERVICES[@]}"; do
  # Lets the deployer run Cloud Run revisions as each runtime identity.
  gc iam service-accounts add-iam-policy-binding "$(runtime_sa "$svc")" \
    --member "serviceAccount:$DEPLOYER_SA" --role roles/iam.serviceAccountUser >/dev/null
done
for env in "${ENVIRONMENTS[@]}"; do
  gcloud storage buckets add-iam-policy-binding "gs://$(config_bucket "$env")" \
    --member "serviceAccount:$DEPLOYER_SA" --role roles/storage.objectAdmin >/dev/null
done
# Deploying with --network/--subnet (Direct VPC egress) uses the subnet.
gc compute networks subnets add-iam-policy-binding "$VPC_SUBNET" --region "$REGION" \
  --member "serviceAccount:$DEPLOYER_SA" --role roles/compute.networkUser >/dev/null

log "Read-only infrastructure role for the CI check (scripts/ci/check-infra.sh)"
reader_permissions="iam.serviceAccounts.get,iam.serviceAccounts.getIamPolicy,datastore.databases.getMetadata,datastore.databases.list,cloudsql.instances.get,cloudsql.instances.list,cloudsql.databases.get,cloudsql.databases.list,cloudsql.users.list,secretmanager.secrets.get,secretmanager.secrets.getIamPolicy,secretmanager.versions.list,resourcemanager.projects.getIamPolicy,storage.buckets.get,storage.buckets.getIamPolicy,pubsub.topics.get,pubsub.topics.getIamPolicy,pubsub.subscriptions.get,pubsub.subscriptions.getIamPolicy,run.services.get,run.services.getIamPolicy,compute.networks.get,compute.subnetworks.get,compute.subnetworks.getIamPolicy,compute.routers.get"
if exists gc iam roles describe focInfraReader; then
  gc iam roles update focInfraReader --permissions "$reader_permissions" >/dev/null
else
  gc iam roles create focInfraReader --title "FoC infrastructure reader" \
    --description "Read-only checks that every service's cloud resources exist" \
    --permissions "$reader_permissions" --stage GA >/dev/null
fi
project_binding --member "serviceAccount:$DEPLOYER_SA" --role "projects/$PROJECT_ID/roles/focInfraReader" --condition None

log "Workload Identity Federation for GitHub repo $GITHUB_REPO"
exists gc iam workload-identity-pools describe "$POOL_ID" --location global ||
  gc iam workload-identity-pools create "$POOL_ID" --location global --display-name "GitHub Actions"
exists gc iam workload-identity-pools providers describe "$PROVIDER_ID" --location global --workload-identity-pool "$POOL_ID" ||
  gc iam workload-identity-pools providers create-oidc "$PROVIDER_ID" --location global \
    --workload-identity-pool "$POOL_ID" --display-name "FoC GitHub repository" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.environment=assertion.environment" \
    --attribute-condition "assertion.repository == '$GITHUB_REPO'"
gc iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_ID/attribute.repository/$GITHUB_REPO" \
  >/dev/null

log "Done"
cat <<EOF
Workload identity provider: projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_ID/providers/$PROVIDER_ID
Deployer service account:   $DEPLOYER_SA
Registry:                   $REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO
(These match infra/gcp/project.env; update that file if you changed any defaults.)
EOF
