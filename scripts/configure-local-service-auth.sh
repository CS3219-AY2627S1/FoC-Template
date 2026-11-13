#!/usr/bin/env bash
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
env_file="$repo/.env"
touch "$env_file"
chmod 600 "$env_file"

for command in openssl base64 jq awk; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 1; }
done

read_value() {
  awk -v key="$1" 'index($0,key "=")==1 { print substr($0,length(key)+2); exit }' "$env_file"
}

upsert() {
  local key=$1 value=$2 temporary
  temporary=$(mktemp)
  awk -v key="$key" -v value="$value" '
    BEGIN { found=0 }
    index($0,key "=")==1 { if (!found) print key "=" value; found=1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "$env_file" > "$temporary"
  mv "$temporary" "$env_file"
  chmod 600 "$env_file"
}

ensure_value() {
  local key=$1 value=$2
  [[ -n "$(read_value "$key")" ]] || upsert "$key" "$value"
}

private_key() {
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null \
    | openssl pkcs8 -topk8 -nocrypt -outform DER | base64 | tr -d '\n'
}

public_key() {
  printf '%s' "$1" | base64 -d \
    | openssl pkey -inform DER -pubout -outform DER 2>/dev/null | base64 | tr -d '\n'
}

merge_trust() {
  local existing=$1 required=$2
  existing=${existing#\"}; existing=${existing%\"}
  required=${required#\"}; required=${required%\"}
  jq -cn --arg old "${existing:-{}}" --arg required "$required" \
    '(try ($old | fromjson) catch {}) * ($required | fromjson)'
}

admin_private=$(read_value ADMIN_SERVICE_PRIVATE_KEY)
chat_private=$(read_value CHAT_SERVICE_PRIVATE_KEY)
[[ -n "$admin_private" ]] || admin_private=$(private_key)
[[ -n "$chat_private" ]] || chat_private=$(private_key)
admin_public=$(public_key "$admin_private")
chat_public=$(public_key "$chat_private")

admin_entry=$(jq -cn --arg key "$admin_public" \
  '{"admin-local-1":{"subject":"admin-service","publicKey":$key}}')
chat_entry=$(jq -cn --arg key "$chat_public" \
  '{"chat-local-1":{"subject":"chat-service","publicKey":$key}}')

upsert ADMIN_SERVICE_KEY_ID admin-local-1
upsert ADMIN_SERVICE_PRIVATE_KEY "$admin_private"
upsert CHAT_SERVICE_KEY_ID chat-local-1
upsert CHAT_SERVICE_PRIVATE_KEY "$chat_private"
upsert USER_SERVICE_TRUSTED_KEYS "$(merge_trust "$(read_value USER_SERVICE_TRUSTED_KEYS)" "$(jq -cn --arg a "$admin_entry" --arg c "$chat_entry" '($a|fromjson)*($c|fromjson)')")"
upsert ADMIN_SERVICE_TRUSTED_KEYS "$(merge_trust "$(read_value ADMIN_SERVICE_TRUSTED_KEYS)" "$chat_entry")"
upsert CHAT_SERVICE_TRUSTED_KEYS "$(merge_trust "$(read_value CHAT_SERVICE_TRUSTED_KEYS)" "$admin_entry")"
upsert ORDER_SERVICE_TRUSTED_KEYS "$(merge_trust "$(read_value ORDER_SERVICE_TRUSTED_KEYS)" "$chat_entry")"
upsert CREDIT_SERVICE_TRUSTED_KEYS "$(merge_trust "$(read_value CREDIT_SERVICE_TRUSTED_KEYS)" "$chat_entry")"

# Keep a checkout that predates Admin/Notification additions runnable without copying example
# placeholders by hand. Existing local values always win.
ensure_value ADMIN_DB_NAME admin_db
ensure_value ADMIN_DB_USER admin_user
ensure_value ADMIN_DB_PASSWORD "$(openssl rand -hex 24)"
ensure_value NOTIFICATION_DB_NAME notification_db
ensure_value NOTIFICATION_DB_USER notification_user
ensure_value NOTIFICATION_DB_PASSWORD "$(openssl rand -hex 24)"
ensure_value KAFKA_ADMIN_SERVICE_PASSWORD "$(openssl rand -hex 24)"
ensure_value KAFKA_NOTIFICATION_SERVICE_PASSWORD "$(openssl rand -hex 24)"

echo "Local service identities are configured in the ignored .env file. Secret values were not printed."
