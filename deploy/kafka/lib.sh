#!/usr/bin/env bash

KAFKA_BIN_DIR=${KAFKA_BIN_DIR:-/opt/kafka/bin}

require_env() {
  local name=$1
  if [ -z "${!name:-}" ]; then
    echo "Required environment variable $name is not set" >&2
    return 1
  fi
}

jaas_escape() {
  local value=$1
  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    echo "Kafka credentials must not contain line breaks" >&2
    return 1
  fi
  printf '%s' "$value" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

write_client_properties() {
  local path=$1
  local username=$2
  local password=$3
  local escaped_username
  local escaped_password
  local security_protocol=${KAFKA_SECURITY_PROTOCOL:-SASL_PLAINTEXT}
  local sasl_mechanism=${KAFKA_SASL_MECHANISM:-PLAIN}
  local login_module

  case "$sasl_mechanism" in
    PLAIN) login_module=org.apache.kafka.common.security.plain.PlainLoginModule ;;
    SCRAM-SHA-512) login_module=org.apache.kafka.common.security.scram.ScramLoginModule ;;
    *)
      echo "Unsupported Kafka SASL mechanism: $sasl_mechanism" >&2
      return 1
      ;;
  esac

  escaped_username=$(jaas_escape "$username")
  escaped_password=$(jaas_escape "$password")
  umask 077
  cat > "$path" <<EOF
security.protocol=$security_protocol
sasl.mechanism=$sasl_mechanism
sasl.jaas.config=$login_module required username="$escaped_username" password="$escaped_password";
EOF
}

kafka_command() {
  "$KAFKA_BIN_DIR/$1" "${@:2}"
}
