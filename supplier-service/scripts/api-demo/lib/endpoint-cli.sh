#!/usr/bin/env bash
# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-27.
# Scope: added the shared command-line adapter used by the individual API
# endpoint scripts. Author review: Reviewed and approved by @ron.

endpoint_cli_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=api.sh
source "${endpoint_cli_dir}/api.sh"

api_cli_require_token() {
  [[ -n "${API_TOKEN:-}" ]] || api_demo_fail "Export API_TOKEN with a MEMBER or ADMINISTRATOR bearer token first."
}

api_cli_require_arg() {
  local value="${1-}"
  local usage="$2"
  [[ -n "${value}" ]] || api_demo_fail "Usage: ${usage}"
}

api_cli_read_json() {
  local path="$1"
  local body
  if [[ "${path}" == "-" ]]; then
    body="$(cat)"
  else
    [[ -f "${path}" ]] || api_demo_fail "JSON body file not found: ${path}"
    body="$(<"${path}")"
  fi
  jq -e . >/dev/null 2>&1 <<<"${body}" || api_demo_fail "Request body must be valid JSON."
  printf '%s' "${body}"
}

api_endpoint_main() {
  local operation="$1"
  shift
  local body

  api_demo_init

  case "${operation}" in
    user-health)
      api_user_health
      ;;
    supplier-health)
      api_supplier_health
      ;;
    register)
      api_cli_require_arg "${1-}" "register.sh USERNAME EMAIL PASSWORD"
      api_cli_require_arg "${2-}" "register.sh USERNAME EMAIL PASSWORD"
      api_cli_require_arg "${3-}" "register.sh USERNAME EMAIL PASSWORD"
      api_register "$1" "$2" "$3"
      ;;
    login)
      api_cli_require_arg "${1-}" "login.sh IDENTIFIER PASSWORD"
      api_cli_require_arg "${2-}" "login.sh IDENTIFIER PASSWORD"
      api_login "$1" "$2"
      ;;
    whoami)
      api_cli_require_token
      api_whoami "${API_TOKEN}"
      ;;
    change-role)
      api_cli_require_token
      api_cli_require_arg "${1-}" "change-role.sh USER_ID MEMBER|ADMINISTRATOR"
      api_cli_require_arg "${2-}" "change-role.sh USER_ID MEMBER|ADMINISTRATOR"
      api_change_user_role "${API_TOKEN}" "$1" "$2"
      ;;
    metadata)
      api_cli_require_token
      api_supplier_metadata "${API_TOKEN}"
      ;;
    list)
      api_cli_require_token
      api_supplier_list "${API_TOKEN}" "${1-}"
      ;;
    get)
      api_cli_require_token
      api_cli_require_arg "${1-}" "get.sh SUPPLIER_ID"
      api_supplier_get "${API_TOKEN}" "$1"
      ;;
    create)
      api_cli_require_token
      api_cli_require_arg "${1-}" "create.sh BODY.json"
      body="$(api_cli_read_json "$1")"
      api_supplier_create "${API_TOKEN}" "${body}"
      ;;
    update)
      api_cli_require_token
      api_cli_require_arg "${1-}" "update.sh SUPPLIER_ID ETAG BODY.json"
      api_cli_require_arg "${2-}" "update.sh SUPPLIER_ID ETAG BODY.json"
      api_cli_require_arg "${3-}" "update.sh SUPPLIER_ID ETAG BODY.json"
      body="$(api_cli_read_json "$3")"
      api_supplier_update "${API_TOKEN}" "$1" "$2" "${body}"
      ;;
    archive)
      api_cli_require_token
      api_cli_require_arg "${1-}" "archive.sh SUPPLIER_ID ETAG"
      api_cli_require_arg "${2-}" "archive.sh SUPPLIER_ID ETAG"
      api_supplier_archive "${API_TOKEN}" "$1" "$2"
      ;;
    restore)
      api_cli_require_token
      api_cli_require_arg "${1-}" "restore.sh SUPPLIER_ID ETAG"
      api_cli_require_arg "${2-}" "restore.sh SUPPLIER_ID ETAG"
      api_supplier_restore "${API_TOKEN}" "$1" "$2"
      ;;
    *)
      api_demo_fail "Unknown endpoint operation: ${operation}"
      ;;
  esac

  api_print_cli_response
}
