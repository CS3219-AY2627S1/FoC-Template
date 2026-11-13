#!/usr/bin/env bash
set -euo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
project_name=${COMPOSE_PROJECT_NAME:-foc-kafka-smoke-${USER:-local}}
keep_stack=${KEEP_KAFKA_SMOKE_STACK:-0}
failed=1

export USER_DB_NAME=${USER_DB_NAME:-kafka_smoke_user_db}
export USER_DB_USER=${USER_DB_USER:-kafka_smoke_user}
export USER_DB_PASSWORD=${USER_DB_PASSWORD:-not-used-kafka-smoke}
export SUPPLIER_DB_NAME=${SUPPLIER_DB_NAME:-kafka_smoke_supplier_db}
export SUPPLIER_DB_USER=${SUPPLIER_DB_USER:-kafka_smoke_supplier}
export SUPPLIER_DB_PASSWORD=${SUPPLIER_DB_PASSWORD:-not-used-kafka-smoke}
export CREDIT_DB_NAME=${CREDIT_DB_NAME:-kafka_smoke_credit_db}
export CREDIT_DB_USER=${CREDIT_DB_USER:-kafka_smoke_credit}
export CREDIT_DB_PASSWORD=${CREDIT_DB_PASSWORD:-not-used-kafka-smoke}
export ORDER_DB_NAME=${ORDER_DB_NAME:-kafka_smoke_order_db}
export ORDER_DB_USER=${ORDER_DB_USER:-kafka_smoke_order}
export ORDER_DB_PASSWORD=${ORDER_DB_PASSWORD:-not-used-kafka-smoke}
export NOTIFICATION_DB_NAME=${NOTIFICATION_DB_NAME:-kafka_smoke_notification_db}
export NOTIFICATION_DB_USER=${NOTIFICATION_DB_USER:-kafka_smoke_notification}
export NOTIFICATION_DB_PASSWORD=${NOTIFICATION_DB_PASSWORD:-not-used-kafka-smoke}
export JWT_PRIVATE_KEY=${JWT_PRIVATE_KEY:-not-used-kafka-smoke}
export KAFKA_ADMIN_PASSWORD=${KAFKA_ADMIN_PASSWORD:-smoke-admin-password}
export KAFKA_BROKER_PASSWORD=${KAFKA_BROKER_PASSWORD:-smoke-broker-password}
export KAFKA_USER_SERVICE_PASSWORD=${KAFKA_USER_SERVICE_PASSWORD:-smoke-user-password}
export KAFKA_ORDER_SERVICE_PASSWORD=${KAFKA_ORDER_SERVICE_PASSWORD:-smoke-order-password}
export KAFKA_CREDIT_SERVICE_PASSWORD=${KAFKA_CREDIT_SERVICE_PASSWORD:-smoke-credit-password}
export KAFKA_NOTIFICATION_SERVICE_PASSWORD=${KAFKA_NOTIFICATION_SERVICE_PASSWORD:-smoke-notification-password}
export KAFKA_UI_BROKER_PASSWORD=${KAFKA_UI_BROKER_PASSWORD:-smoke-ui-broker-password}
export KAFKA_UI_LOGIN_USERNAME=${KAFKA_UI_LOGIN_USERNAME:-kafka-smoke-viewer}
export KAFKA_UI_LOGIN_PASSWORD=${KAFKA_UI_LOGIN_PASSWORD:-smoke-ui-login-password}

export ADMIN_DB_NAME=${ADMIN_DB_NAME:-kafka_smoke_admin_db}
export ADMIN_DB_USER=${ADMIN_DB_USER:-kafka_smoke_admin}
export ADMIN_DB_PASSWORD=${ADMIN_DB_PASSWORD:-ci-admin-db-password}
export ADMIN_SERVICE_PRIVATE_KEY=${ADMIN_SERVICE_PRIVATE_KEY:-not-used-by-this-job}
export USER_SERVICE_TRUSTED_KEYS=${USER_SERVICE_TRUSTED_KEYS:-'{}'}
export KAFKA_ADMIN_SERVICE_PASSWORD=${KAFKA_ADMIN_SERVICE_PASSWORD:-ci-kafka-admin-service-password}

compose() {
  docker compose --project-directory "$repository_root" -p "$project_name" "$@"
}

cleanup() {
  if [ -n "${ui_cookie_jar:-}" ]; then
    rm -f "$ui_cookie_jar"
  fi
  if [ "$failed" -ne 0 ]; then
    echo "Kafka smoke verification failed; broker and initializer logs follow." >&2
    compose ps >&2 || true
    compose logs --no-color --tail=200 kafka kafka-init kafka-ui >&2 || true
  fi
  if [ "$keep_stack" != 1 ]; then
    compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  else
    echo "Kafka smoke stack retained as Compose project '$project_name'."
  fi
}
trap cleanup EXIT

ui_cookie_jar=$(mktemp)

login_to_kafka_ui() {
  local login_page
  local csrf_token
  local login_status
  local login_args

  login_page=$(curl --fail --silent --show-error \
    --cookie-jar "$ui_cookie_jar" http://localhost:${KAFKA_UI_HOST_PORT:-8090}/login)
  csrf_token=$(sed -n 's/.*name="_csrf"[^>]*value="\([^"]*\)".*/\1/p' <<< "$login_page" | head -n 1)
  login_args=(
    --silent --show-error --output /dev/null --write-out '%{http_code}'
    --cookie "$ui_cookie_jar" --cookie-jar "$ui_cookie_jar"
    --data-urlencode "username=$KAFKA_UI_LOGIN_USERNAME"
    --data-urlencode "password=$KAFKA_UI_LOGIN_PASSWORD"
  )
  if [ -n "$csrf_token" ]; then
    login_args+=(--data-urlencode "_csrf=$csrf_token")
  fi
  login_status=$(curl "${login_args[@]}" http://localhost:${KAFKA_UI_HOST_PORT:-8090}/login)
  if [ "$login_status" != 302 ]; then
    echo "Kafka UI login returned HTTP $login_status instead of 302" >&2
    return 1
  fi
}

wait_for_kafka_ui_cluster() {
  local response
  for _ in $(seq 1 30); do
    response=$(curl --silent --show-error --cookie "$ui_cookie_jar" \
      http://localhost:${KAFKA_UI_HOST_PORT:-8090}/api/clusters 2>/dev/null || true)
    if [[ "$response" == *'"name":"foc-local"'* ]]; then
      return 0
    fi
    sleep 2
  done
  echo "Kafka UI did not expose the foc-local cluster" >&2
  return 1
}

compose config --quiet
compose up -d --wait kafka
compose run --rm kafka-init
compose run --rm kafka-init
compose exec -T kafka /bin/bash /opt/foc-kafka/verify.sh before-restart
compose up -d --wait kafka-ui

curl --fail --silent --show-error http://localhost:${KAFKA_UI_HOST_PORT:-8090}/actuator/health | grep --quiet '"status":"UP"'
unauthenticated_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --max-redirs 0 http://localhost:${KAFKA_UI_HOST_PORT:-8090}/)
if [ "$unauthenticated_status" != 302 ] && [ "$unauthenticated_status" != 401 ]; then
  echo "Kafka UI did not require login; received HTTP $unauthenticated_status" >&2
  exit 1
fi
login_to_kafka_ui
wait_for_kafka_ui_cluster

compose restart kafka
compose up -d --wait kafka
compose exec -T kafka /bin/bash /opt/foc-kafka/verify.sh after-restart
wait_for_kafka_ui_cluster

failed=0
echo "Kafka smoke verification passed for Compose project '$project_name'."
