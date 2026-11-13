#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=lib.sh
source /opt/foc-kafka/lib.sh

for variable in \
  KAFKA_ADMIN_PASSWORD \
  KAFKA_BROKER_PASSWORD \
  KAFKA_USER_SERVICE_PASSWORD \
  KAFKA_ORDER_SERVICE_PASSWORD \
  KAFKA_CREDIT_SERVICE_PASSWORD \
  KAFKA_ADMIN_SERVICE_PASSWORD \
  KAFKA_CHAT_SERVICE_PASSWORD \
  KAFKA_UI_BROKER_PASSWORD; do
  require_env "$variable"
done

admin_password=$(jaas_escape "$KAFKA_ADMIN_PASSWORD")
broker_password=$(jaas_escape "$KAFKA_BROKER_PASSWORD")
user_password=$(jaas_escape "$KAFKA_USER_SERVICE_PASSWORD")
order_password=$(jaas_escape "$KAFKA_ORDER_SERVICE_PASSWORD")
credit_password=$(jaas_escape "$KAFKA_CREDIT_SERVICE_PASSWORD")
# Optional until every environment provisions it: Compose requires it and the Minikube helper
# generates it, but an existing AWS broker Secret predates Notification. Without it the
# notification_service identity simply cannot authenticate.
notification_user=
if [ -n "${KAFKA_NOTIFICATION_SERVICE_PASSWORD:-}" ]; then
  notification_user="  user_notification_service=\"$(jaas_escape "$KAFKA_NOTIFICATION_SERVICE_PASSWORD")\""
fi
admin_service_password=$(jaas_escape "$KAFKA_ADMIN_SERVICE_PASSWORD")
chat_service_password=$(jaas_escape "$KAFKA_CHAT_SERVICE_PASSWORD")
ui_password=$(jaas_escape "$KAFKA_UI_BROKER_PASSWORD")

umask 077
cat > /tmp/foc-kafka-server-jaas.conf <<EOF
KafkaServer {
  org.apache.kafka.common.security.plain.PlainLoginModule required
  username="foc_broker"
  password="$broker_password"
  user_foc_admin="$admin_password"
  user_foc_broker="$broker_password"
  user_user_service="$user_password"
  user_order_service="$order_password"
  user_credit_service="$credit_password"
${notification_user}
  user_admin_service="$admin_service_password"
  user_chat_service="$chat_service_password"
  user_kafka_ui="$ui_password";
};

KafkaClient {
  org.apache.kafka.common.security.plain.PlainLoginModule required
  username="foc_broker"
  password="$broker_password";
};
EOF

export KAFKA_OPTS="${KAFKA_OPTS:-} -Djava.security.auth.login.config=/tmp/foc-kafka-server-jaas.conf"
exec /etc/kafka/docker/run
