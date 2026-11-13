#!/usr/bin/env bash
set -euo pipefail
# Official main classes verified against apache/kafka:4.3.1. Avoid its build-tree/JMX discovery
# for short-lived admin clients on Windows Minikube. Revalidate mappings on image upgrades.
case "${0##*/}" in
  kafka-topics.sh) main_class=org.apache.kafka.tools.TopicCommand ;;
  kafka-configs.sh) main_class=kafka.admin.ConfigCommand ;;
  kafka-acls.sh) main_class=org.apache.kafka.tools.AclCommand ;;
  kafka-broker-api-versions.sh) main_class=org.apache.kafka.tools.BrokerApiVersionsCommand ;;
  kafka-console-producer.sh) main_class=org.apache.kafka.tools.ConsoleProducer ;;
  kafka-console-consumer.sh) main_class=org.apache.kafka.tools.consumer.ConsoleConsumer ;;
  kafka-get-offsets.sh) main_class=org.apache.kafka.tools.GetOffsetShell ;;
  *) echo 'Unsupported pinned Kafka CLI entry point' >&2; exit 64 ;;
esac
exec java -Xms32m -Xmx128m -XX:TieredStopAtLevel=1 -Djava.awt.headless=true \
  -Dlog4j2.configurationFile=file:/opt/kafka/config/tools-log4j2.yaml \
  -cp '/opt/kafka/libs/*' "$main_class" "$@"
