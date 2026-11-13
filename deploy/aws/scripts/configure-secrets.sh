#!/usr/bin/env bash
set -euo pipefail

region=${AWS_REGION:-ap-southeast-1}
environment=${FOC_ENVIRONMENT:-staging}
profile_args=()
if [[ -n ${AWS_PROFILE:-} ]]; then profile_args=(--profile "$AWS_PROFILE"); fi

for command in aws jq openssl base64; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 1; }
done

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
chmod 700 "$tmp"

random_password() { openssl rand -base64 36 | tr -d '\n'; }
private_key() {
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null \
    | openssl pkcs8 -topk8 -nocrypt -outform DER | base64 | tr -d '\n'
}
has_value() {
  aws "${profile_args[@]}" --region "$region" secretsmanager get-secret-value \
    --secret-id "$1" --query VersionId --output text >/dev/null 2>&1
}
put_file() {
  local name=$1 file=$2
  if has_value "$name"; then
    printf 'Preserved existing %s.\n' "$name"
    return
  fi
  aws "${profile_args[@]}" --region "$region" secretsmanager put-secret-value \
    --secret-id "$name" --secret-string "file://$file" >/dev/null
  printf 'Initialized %s.\n' "$name"
}
merge_file() {
  local name=$1 file=$2 current="$tmp/current.json" merged="$tmp/merged.json"
  local current_sorted="$tmp/current-sorted.json" merged_sorted="$tmp/merged-sorted.json"
  if has_value "$name"; then
    aws "${profile_args[@]}" --region "$region" secretsmanager get-secret-value \
      --secret-id "$name" --query SecretString --output text > "$current"
    # The existing secret wins for every field; the generated file supplies only missing keys.
    jq -s '.[0] * .[1]' "$file" "$current" > "$merged"
    jq -S . "$current" > "$current_sorted"
    jq -S . "$merged" > "$merged_sorted"
    if cmp -s "$current_sorted" "$merged_sorted"; then
      printf 'Preserved existing %s.\n' "$name"
      return
    fi
    aws "${profile_args[@]}" --region "$region" secretsmanager put-secret-value \
      --secret-id "$name" --secret-string "file://$merged" >/dev/null
    printf 'Added missing fields to %s without rotating existing values.\n' "$name"
    return
  fi
  aws "${profile_args[@]}" --region "$region" secretsmanager put-secret-value \
    --secret-id "$name" --secret-string "file://$file" >/dev/null
  printf 'Initialized %s.\n' "$name"
}
sync_scram_secret() {
  local name=$1 username=$2 password=$3
  local file="$tmp/scram-${username}.json"
  local current="$tmp/scram-${username}-current.json"
  jq -n --arg username "$username" --arg password "$password" \
    '{username:$username,password:$password}' > "$file"
  if has_value "$name"; then
    aws "${profile_args[@]}" --region "$region" secretsmanager get-secret-value \
      --secret-id "$name" --query SecretString --output text > "$current"
    if cmp -s <(jq -S . "$current") <(jq -S . "$file"); then
      printf 'Preserved existing SCRAM identity %s.\n' "$username"
      return
    fi
  fi
  aws "${profile_args[@]}" --region "$region" secretsmanager put-secret-value \
    --secret-id "$name" --secret-string "file://$file" >/dev/null
  printf 'Synchronized SCRAM identity %s without printing its password.\n' "$username"
}
secret_property() {
  local name=$1 property=$2
  has_value "$name" || return 1
  aws "${profile_args[@]}" --region "$region" secretsmanager get-secret-value \
    --secret-id "$name" --query SecretString --output text | jq -er --arg property "$property" '.[$property] | select(type == "string" and length > 0)'
}
merge_trust_file() {
  local name=$1 file=$2 property=$3 current="$tmp/current.json" merged="$tmp/merged.json"
  if ! has_value "$name"; then
    put_file "$name" "$file"
    return
  fi
  aws "${profile_args[@]}" --region "$region" secretsmanager get-secret-value \
    --secret-id "$name" --query SecretString --output text > "$current"
  jq -s --arg property "$property" '
    (.[0] * .[1]) as $base
    | ((.[1][$property] // "{}") | fromjson) as $oldTrust
    | ((.[0][$property] // "{}") | fromjson) as $requiredTrust
    | $base + {($property): (($oldTrust * $requiredTrust) | tojson)}
  ' "$file" "$current" > "$merged"
  if cmp -s <(jq -S . "$current") <(jq -S . "$merged"); then
    printf 'Preserved existing %s.\n' "$name"
    return
  fi
  aws "${profile_args[@]}" --region "$region" secretsmanager put-secret-value \
    --secret-id "$name" --secret-string "file://$merged" >/dev/null
  printf 'Added missing service-auth fields to %s without rotating existing keys.\n' "$name"
}
merge_user_secret() {
  local name=$1 file=$2 property=$3 current="$tmp/current-user.json" merged="$tmp/merged-user.json"
  if ! has_value "$name"; then
    put_file "$name" "$file"
    return
  fi
  aws "${profile_args[@]}" --region "$region" secretsmanager get-secret-value \
    --secret-id "$name" --query SecretString --output text > "$current"
  jq -s --arg property "$property" --arg updateBootstrap "${ADMIN_BOOTSTRAP_EMAIL:+true}" '
    .[0] as $generated
    | .[1] as $current
    | ($generated * $current) as $base
    | (($current[$property] // "{}") | fromjson) as $oldTrust
    | (($generated[$property] // "{}") | fromjson) as $requiredTrust
    | ($base + {($property): (($oldTrust * $requiredTrust) | tojson)})
    | if $updateBootstrap == "true" then
        . + ($generated | {
          ADMIN_BOOTSTRAP_EMAIL,
          ADMIN_BOOTSTRAP_USERNAME,
          ADMIN_BOOTSTRAP_PASSWORD
        })
      else . end
  ' "$file" "$current" > "$merged"
  if cmp -s <(jq -S . "$current") <(jq -S . "$merged"); then
    printf 'Preserved existing %s.\n' "$name"
    return
  fi
  aws "${profile_args[@]}" --region "$region" secretsmanager put-secret-value \
    --secret-id "$name" --secret-string "file://$merged" >/dev/null
  printf 'Updated required trust/bootstrap fields in %s without rotating other credentials.\n' "$name"
}

mail_secret="foc/$environment/user-mail-secrets"
if ! has_value "$mail_secret"; then
  [[ -n ${SENDGRID_API_KEY:-} ]] || { echo 'Set SENDGRID_API_KEY in your shell; it will not be printed.' >&2; exit 1; }
  [[ -n ${SENDGRID_FROM_EMAIL:-} ]] || { echo 'Set SENDGRID_FROM_EMAIL in your shell.' >&2; exit 1; }
fi

bootstrap_count=0
for value in "${ADMIN_BOOTSTRAP_EMAIL:-}" "${ADMIN_BOOTSTRAP_USERNAME:-}" "${ADMIN_BOOTSTRAP_PASSWORD:-}"; do
  [[ -z $value ]] || bootstrap_count=$((bootstrap_count + 1))
done
if (( bootstrap_count != 0 && bootstrap_count != 3 )); then
  echo 'Set ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_USERNAME, and ADMIN_BOOTSTRAP_PASSWORD together.' >&2
  exit 1
fi
if (( bootstrap_count == 3 )); then
  normalized_email=$(printf '%s' "$ADMIN_BOOTSTRAP_EMAIL" | tr '[:upper:]' '[:lower:]')
  case "$normalized_email" in
    *@u.nus.edu|*@u.duke.nus.edu|*@u.yale-nus.edu.sg) ;;
    *) echo 'ADMIN_BOOTSTRAP_EMAIL must use an eligible NUS student domain.' >&2; exit 1 ;;
  esac
  (( ${#ADMIN_BOOTSTRAP_USERNAME} >= 1 && ${#ADMIN_BOOTSTRAP_USERNAME} <= 20 )) \
    || { echo 'ADMIN_BOOTSTRAP_USERNAME must be between 1 and 20 characters.' >&2; exit 1; }
  (( ${#ADMIN_BOOTSTRAP_PASSWORD} >= 15 && ${#ADMIN_BOOTSTRAP_PASSWORD} <= 64 )) \
    || { echo 'ADMIN_BOOTSTRAP_PASSWORD must be between 15 and 64 characters.' >&2; exit 1; }
fi

user_db=$(random_password)
supplier_db=$(random_password)
order_db=$(random_password)
credit_db=$(random_password)
admin_db=$(random_password)
chat_db=$(random_password)
notification_db=$(random_password)
rabbitmq=$(random_password)
jwt_key=$(private_key)
admin_secret="foc/$environment/admin-service-secrets"
chat_secret="foc/$environment/chat-service-secrets"
admin_key=$(secret_property "$admin_secret" ADMIN_SERVICE_PRIVATE_KEY || private_key)
chat_key=$(secret_property "$chat_secret" CHAT_SERVICE_PRIVATE_KEY || private_key)
admin_public=$(printf '%s' "$admin_key" | openssl base64 -d -A \
  | openssl pkey -inform DER -pubout -outform DER 2>/dev/null | base64 | tr -d '\n')
chat_public=$(printf '%s' "$chat_key" | openssl base64 -d -A \
  | openssl pkey -inform DER -pubout -outform DER 2>/dev/null | base64 | tr -d '\n')
supplier_secret="foc/$environment/supplier-service-secrets"
supplier_key=$(secret_property "$supplier_secret" SUPPLIER_SERVICE_PRIVATE_KEY || private_key)
supplier_kid=$(secret_property "$supplier_secret" SUPPLIER_SERVICE_KEY_ID || printf 'supplier-staging-1')
supplier_public=$(printf '%s' "$supplier_key" | openssl base64 -d -A \
  | openssl pkey -inform DER -pubout -outform DER 2>/dev/null | base64 | tr -d '\n')
order_secret="foc/$environment/order-service-secrets"
order_key=$(secret_property "$order_secret" ORDER_SERVICE_PRIVATE_KEY || private_key)
order_kid=$(secret_property "$order_secret" ORDER_SERVICE_KEY_ID || printf 'order-staging-1')
order_public=$(printf '%s' "$order_key" | openssl base64 -d -A \
  | openssl pkey -inform DER -pubout -outform DER 2>/dev/null | base64 | tr -d '\n')
credit_secret="foc/$environment/credit-service-secrets"
credit_key=$(secret_property "$credit_secret" CREDIT_SERVICE_PRIVATE_KEY || private_key)
credit_kid=$(secret_property "$credit_secret" CREDIT_SERVICE_KEY_ID || printf 'credit-staging-1')
credit_public=$(printf '%s' "$credit_key" | openssl base64 -d -A \
  | openssl pkey -inform DER -pubout -outform DER 2>/dev/null | base64 | tr -d '\n')
user_trusted_keys=$(jq -cn --arg admin "$admin_public" --arg chat "$chat_public" \
  --arg supplier "$supplier_public" --arg supplierKid "$supplier_kid" \
  --arg order "$order_public" --arg orderKid "$order_kid" \
  --arg credit "$credit_public" --arg creditKid "$credit_kid" \
  '{"admin-staging-1":{"subject":"admin-service","publicKey":$admin},
    "chat-staging-1":{"subject":"chat-service","publicKey":$chat},
    ($supplierKid):{"subject":"supplier-service","publicKey":$supplier},
    ($orderKid):{"subject":"order-service","publicKey":$order},
    ($creditKid):{"subject":"credit-service","publicKey":$credit}}')
chat_trusted_keys=$(jq -cn --arg admin "$admin_public" \
  '{"admin-staging-1":{"subject":"admin-service","publicKey":$admin}}')
chat_caller_trusted_keys=$(jq -cn --arg chat "$chat_public" \
  '{"chat-staging-1":{"subject":"chat-service","publicKey":$chat}}')

order_trusted_keys=$chat_caller_trusted_keys
credit_trusted_keys=$chat_caller_trusted_keys

jq -n --arg db "$user_db" --arg jwt "$jwt_key" --arg trust "$user_trusted_keys" \
  --arg email "${ADMIN_BOOTSTRAP_EMAIL:-}" --arg username "${ADMIN_BOOTSTRAP_USERNAME:-}" \
  --arg password "${ADMIN_BOOTSTRAP_PASSWORD:-}" \
  '{DB_PASSWORD:$db,JWT_PRIVATE_KEY:$jwt,USER_SERVICE_TRUSTED_KEYS:$trust}
   + (if $email == "" then {} else {ADMIN_BOOTSTRAP_EMAIL:$email,ADMIN_BOOTSTRAP_USERNAME:$username,ADMIN_BOOTSTRAP_PASSWORD:$password} end)' \
  > "$tmp/user.json"
if has_value "$mail_secret"; then
  printf '{}\n' > "$tmp/mail.json"
else
  jq -n --arg key "$SENDGRID_API_KEY" --arg from "$SENDGRID_FROM_EMAIL" \
    '{SENDGRID_API_KEY:$key,SENDGRID_FROM_EMAIL:$from}' > "$tmp/mail.json"
fi
jq -n --arg value "$supplier_db" --arg key "$supplier_key" --arg kid "$supplier_kid" \
  '{DB_PASSWORD:$value,SUPPLIER_SERVICE_PRIVATE_KEY:$key,SUPPLIER_SERVICE_KEY_ID:$kid}' > "$tmp/supplier.json"
jq -n --arg value "$order_db" --arg trust "$order_trusted_keys" --arg key "$order_key" --arg kid "$order_kid" \
  '{DB_PASSWORD:$value,ORDER_SERVICE_TRUSTED_KEYS:$trust,ORDER_SERVICE_PRIVATE_KEY:$key,ORDER_SERVICE_KEY_ID:$kid}' > "$tmp/order.json"
jq -n --arg value "$credit_db" --arg trust "$credit_trusted_keys" --arg key "$credit_key" --arg kid "$credit_kid" \
  '{DB_PASSWORD:$value,CREDIT_SERVICE_TRUSTED_KEYS:$trust,CREDIT_SERVICE_PRIVATE_KEY:$key,CREDIT_SERVICE_KEY_ID:$kid}' > "$tmp/credit.json"
jq -n --arg db "$admin_db" --arg key "$admin_key" --arg trust "$chat_caller_trusted_keys" \
  '{ADMIN_DB_PASSWORD:$db,ADMIN_SERVICE_PRIVATE_KEY:$key,ADMIN_SERVICE_KEY_ID:"admin-staging-1",ADMIN_SERVICE_TRUSTED_KEYS:$trust}' \
  > "$tmp/admin.json"
jq -n --arg db "$chat_db" --arg rabbit "$rabbitmq" --arg key "$chat_key" --arg trust "$chat_trusted_keys" \
  --arg gemini "${GEMINI_API_KEY:-}" \
  '{DB_PASSWORD:$db,RABBITMQ_PASSWORD:$rabbit,CHAT_SERVICE_PRIVATE_KEY:$key,
    CHAT_SERVICE_KEY_ID:"chat-staging-1",CHAT_SERVICE_TRUSTED_KEYS:$trust}
    + (if $gemini == "" then {} else {CHAT_TRANSLATION_PROVIDER:"gemini",GEMINI_API_KEY:$gemini} end)' > "$tmp/chat.json"
jq -n --arg value "$notification_db" '{DB_PASSWORD:$value}' > "$tmp/notification.json"
jq -n \
  --arg admin "$(random_password)" --arg broker "$(random_password)" \
  --arg user "$(random_password)" --arg order "$(random_password)" \
  --arg credit "$(random_password)" --arg adminService "$(random_password)" \
  --arg chat "$(random_password)" --arg notification "$(random_password)" \
  --arg ui "$(random_password)" \
  '{KAFKA_ADMIN_PASSWORD:$admin,KAFKA_BROKER_PASSWORD:$broker,KAFKA_USER_SERVICE_PASSWORD:$user,
    KAFKA_ORDER_SERVICE_PASSWORD:$order,KAFKA_CREDIT_SERVICE_PASSWORD:$credit,
    KAFKA_ADMIN_SERVICE_PASSWORD:$adminService,KAFKA_CHAT_SERVICE_PASSWORD:$chat,
    KAFKA_NOTIFICATION_SERVICE_PASSWORD:$notification,KAFKA_UI_BROKER_PASSWORD:$ui}' > "$tmp/kafka.json"
jq -n --arg username kafka-viewer --arg password "$(random_password)" \
  '{KAFKA_UI_LOGIN_USERNAME:$username,KAFKA_UI_LOGIN_PASSWORD:$password}' > "$tmp/kafka-ui.json"

merge_user_secret "foc/$environment/user-service-secrets" "$tmp/user.json" USER_SERVICE_TRUSTED_KEYS
put_file "$mail_secret" "$tmp/mail.json"
merge_file "$supplier_secret" "$tmp/supplier.json"
merge_trust_file "foc/$environment/order-service-secrets" "$tmp/order.json" ORDER_SERVICE_TRUSTED_KEYS
merge_trust_file "foc/$environment/credit-service-secrets" "$tmp/credit.json" CREDIT_SERVICE_TRUSTED_KEYS
merge_trust_file "$admin_secret" "$tmp/admin.json" ADMIN_SERVICE_TRUSTED_KEYS
merge_trust_file "$chat_secret" "$tmp/chat.json" CHAT_SERVICE_TRUSTED_KEYS
put_file "foc/$environment/notification-service-secrets" "$tmp/notification.json"
merge_file "foc/$environment/kafka-broker-secrets" "$tmp/kafka.json"
put_file "foc/$environment/kafka-ui-secrets" "$tmp/kafka-ui.json"

# Amazon MSK requires one KMS-encrypted Secrets Manager secret per SCRAM identity. Copy the
# already-established passwords rather than creating a second set of credentials. Run apply-core
# first so Terraform has created these empty AmazonMSK_* secret containers.
kafka_secret="foc/$environment/kafka-broker-secrets"
sync_scram_secret "AmazonMSK_foc-${environment}_foc_admin" foc_admin \
  "$(secret_property "$kafka_secret" KAFKA_ADMIN_PASSWORD)"
sync_scram_secret "AmazonMSK_foc-${environment}_user_service" user_service \
  "$(secret_property "$kafka_secret" KAFKA_USER_SERVICE_PASSWORD)"
sync_scram_secret "AmazonMSK_foc-${environment}_order_service" order_service \
  "$(secret_property "$kafka_secret" KAFKA_ORDER_SERVICE_PASSWORD)"
sync_scram_secret "AmazonMSK_foc-${environment}_credit_service" credit_service \
  "$(secret_property "$kafka_secret" KAFKA_CREDIT_SERVICE_PASSWORD)"
sync_scram_secret "AmazonMSK_foc-${environment}_admin_service" admin_service \
  "$(secret_property "$kafka_secret" KAFKA_ADMIN_SERVICE_PASSWORD)"
sync_scram_secret "AmazonMSK_foc-${environment}_chat_service" chat_service \
  "$(secret_property "$kafka_secret" KAFKA_CHAT_SERVICE_PASSWORD)"
sync_scram_secret "AmazonMSK_foc-${environment}_notification_service" notification_service \
  "$(secret_property "$kafka_secret" KAFKA_NOTIFICATION_SERVICE_PASSWORD)"
sync_scram_secret "AmazonMSK_foc-${environment}_kafka_ui" kafka_ui \
  "$(secret_property "$kafka_secret" KAFKA_UI_BROKER_PASSWORD)"

echo 'Runtime secrets are initialized. Secret values were not printed or written to the repository.'
