#!/usr/bin/env bash
# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-27.
# Scope: added reusable request functions for User authentication and every
# Supplier Service endpoint. Author review: Reviewed and approved by @ron.

api_lib_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${api_lib_dir}/common.sh"

api_user_health() {
  api_request GET "${API_USER_BASE_URL}/health"
}

api_supplier_health() {
  api_request GET "${API_SUPPLIER_BASE_URL}/health"
}

api_register() {
  local username="$1"
  local email="$2"
  local password="$3"
  local body
  body="$(jq -cn --arg username "${username}" --arg email "${email}" --arg password "${password}" '{username: $username, email: $email, password: $password}')"
  api_request POST "${API_USER_BASE_URL}/auth/register" "" "${body}"
}

api_login() {
  local identifier="$1"
  local password="$2"
  local body
  body="$(jq -cn --arg identifier "${identifier}" --arg password "${password}" '{identifier: $identifier, password: $password}')"
  api_request POST "${API_USER_BASE_URL}/auth/login" "" "${body}"
}

api_whoami() {
  api_request GET "${API_USER_BASE_URL}/whoami" "$1"
}

api_change_user_role() {
  local token="$1"
  local user_id="$2"
  local role="$3"
  local body
  body="$(jq -cn --arg role "${role}" '{role: $role}')"
  api_request PUT "${API_USER_BASE_URL}/users/${user_id}/role" "${token}" "${body}"
}

api_supplier_metadata() {
  api_request GET "${API_SUPPLIER_BASE_URL}/api/v1/suppliers/metadata" "$1"
}

api_supplier_list() {
  local token="$1"
  local query="${2-}"
  local url="${API_SUPPLIER_BASE_URL}/api/v1/suppliers"
  [[ -z "${query}" ]] || url="${url}?${query}"
  api_request GET "${url}" "${token}"
}

api_supplier_get() {
  api_request GET "${API_SUPPLIER_BASE_URL}/api/v1/suppliers/$2" "$1"
}

api_supplier_create() {
  api_request POST "${API_SUPPLIER_BASE_URL}/api/v1/suppliers" "$1" "$2"
}

api_supplier_update() {
  api_request PUT "${API_SUPPLIER_BASE_URL}/api/v1/suppliers/$2" "$1" "$4" "$3"
}

api_supplier_archive() {
  api_request DELETE "${API_SUPPLIER_BASE_URL}/api/v1/suppliers/$2" "$1" "" "$3"
}

api_supplier_restore() {
  api_request POST "${API_SUPPLIER_BASE_URL}/api/v1/suppliers/$2/restore" "$1" "" "$3"
}
