#!/usr/bin/env bash
# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-27.
# Scope: added shared configuration, HTTP capture, redaction, and assertions for
# the local Bash API demonstrations. Author review: Reviewed and approved by @ron.

api_demo_fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

api_dotenv_value() {
  local key="$1"
  local env_file="${API_DEMO_REPO_ROOT}/.env"
  local value

  [[ -f "${env_file}" ]] || return 1
  value="$(awk -v key="${key}" '
    index($0, key "=") == 1 {
      sub(/^[^=]*=/, "")
      sub(/\r$/, "")
      print
      exit
    }
  ' "${env_file}")"
  [[ -n "${value}" ]] || return 1

  if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "${value}"
}

api_demo_configure() {
  local supplier_port
  local user_port

  supplier_port="${SUPPLIER_PORT:-$(api_dotenv_value SUPPLIER_PORT || printf '3000')}"
  user_port="${USER_PORT:-$(api_dotenv_value USER_PORT || printf '3001')}"
  API_SUPPLIER_BASE_URL="${API_SUPPLIER_BASE_URL:-http://127.0.0.1:${supplier_port}}"
  API_USER_BASE_URL="${API_USER_BASE_URL:-http://127.0.0.1:${user_port}}"
  API_ALLOWED_EMAIL_DOMAIN="${API_ALLOWED_EMAIL_DOMAIN:-${ALLOWED_EMAIL_DOMAIN:-$(api_dotenv_value ALLOWED_EMAIL_DOMAIN || printf 'u.nus.edu')}}"
  API_TIMEOUT_SECONDS="${API_TIMEOUT_SECONDS:-15}"
}

api_demo_cleanup() {
  if [[ -n "${API_DEMO_TMP_DIR:-}" && -d "${API_DEMO_TMP_DIR}" ]]; then
    rm -rf -- "${API_DEMO_TMP_DIR}"
  fi
}

api_demo_init() {
  local common_dir

  common_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  API_DEMO_REPO_ROOT="$(cd -- "${common_dir}/../../../.." && pwd)"

  command -v curl >/dev/null 2>&1 || api_demo_fail "curl is required."
  command -v jq >/dev/null 2>&1 || api_demo_fail "jq is required. Install it with 'brew install jq' on macOS."
  command -v mktemp >/dev/null 2>&1 || api_demo_fail "mktemp is required."

  api_demo_configure
  API_DEMO_TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/foc-api-demo.XXXXXX")"
  API_RESPONSE_HEADERS_FILE="${API_DEMO_TMP_DIR}/headers"
  API_RESPONSE_BODY_FILE="${API_DEMO_TMP_DIR}/body"
  trap api_demo_cleanup EXIT
}

api_request() {
  local method="$1"
  local url="$2"
  local token="${3-}"
  local body="${4-}"
  local if_match="${5-}"
  local curl_exit
  local -a curl_args

  curl_args=(
    --silent
    --show-error
    --request "${method}"
    --connect-timeout "${API_TIMEOUT_SECONDS}"
    --max-time "${API_TIMEOUT_SECONDS}"
    --dump-header "${API_RESPONSE_HEADERS_FILE}"
    --output "${API_RESPONSE_BODY_FILE}"
    --write-out '%{http_code}'
  )
  [[ -z "${token}" ]] || curl_args+=(--header "Authorization: Bearer ${token}")
  [[ -z "${if_match}" ]] || curl_args+=(--header "If-Match: ${if_match}")
  if [[ -n "${body}" ]]; then
    curl_args+=(--header 'Content-Type: application/json' --data "${body}")
  fi
  curl_args+=("${url}")

  set +e
  API_RESPONSE_STATUS="$(curl "${curl_args[@]}")"
  curl_exit=$?
  set -e
  [[ ${curl_exit} -eq 0 ]] || api_demo_fail "Could not call ${method} ${url}. Is Docker Compose running?"
  API_RESPONSE_BODY="$(<"${API_RESPONSE_BODY_FILE}")"
}

api_header() {
  local header_name="$1"
  awk -v name="${header_name}" '
    tolower($1) == tolower(name ":") {
      $1 = ""
      sub(/^ /, "")
      sub(/\r$/, "")
      value = $0
    }
    END { print value }
  ' "${API_RESPONSE_HEADERS_FILE}"
}

api_redacted_body() {
  if [[ -z "${API_RESPONSE_BODY}" ]]; then
    printf '<empty response body>'
  elif jq -e . >/dev/null 2>&1 <<<"${API_RESPONSE_BODY}"; then
    jq -c 'if type == "object" then del(.accessToken) else . end' <<<"${API_RESPONSE_BODY}"
  else
    printf '%s' "${API_RESPONSE_BODY}"
  fi
}

api_assert_status() {
  local expected="$1"
  local description="$2"
  if [[ "${API_RESPONSE_STATUS}" != "${expected}" ]]; then
    api_demo_fail "${description}: expected HTTP ${expected}, received ${API_RESPONSE_STATUS}: $(api_redacted_body)"
  fi
  printf '  PASS  %s (HTTP %s)\n' "${description}" "${expected}"
}

api_assert_json() {
  local filter="$1"
  local description="$2"
  if ! jq -e "${filter}" >/dev/null 2>&1 <<<"${API_RESPONSE_BODY}"; then
    api_demo_fail "${description}: response did not satisfy ${filter}: $(api_redacted_body)"
  fi
  printf '  PASS  %s\n' "${description}"
}

api_json() {
  local filter="$1"
  jq -er "${filter}" <<<"${API_RESPONSE_BODY}"
}

api_assert_equals() {
  local actual="$1"
  local expected="$2"
  local description="$3"
  [[ "${actual}" == "${expected}" ]] || api_demo_fail "${description}: expected '${expected}', received '${actual}'."
  printf '  PASS  %s\n' "${description}"
}

api_assert_nonempty() {
  local value="$1"
  local description="$2"
  [[ -n "${value}" && "${value}" != "null" ]] || api_demo_fail "${description} was empty."
  printf '  PASS  %s\n' "${description}"
}

api_assert_header_matches() {
  local header_name="$1"
  local pattern="$2"
  local description="$3"
  local value
  value="$(api_header "${header_name}")"
  [[ "${value}" =~ ${pattern} ]] || api_demo_fail "${description}: ${header_name} was '${value}'."
  printf '  PASS  %s\n' "${description}"
}

api_assert_error_code() {
  local expected="$1"
  local description="$2"
  local actual
  actual="$(api_json '.code // .error // empty')"
  api_assert_equals "${actual}" "${expected}" "${description}"
}

api_print_heading() {
  printf '\n== %s ==\n' "$1"
}

api_pass() {
  printf '\nPASS: %s\n' "$1"
}

api_print_cli_response() {
  local etag
  local location
  local request_id
  etag="$(api_header ETag)"
  location="$(api_header Location)"
  request_id="$(api_header X-Request-Id)"

  printf 'HTTP %s\n' "${API_RESPONSE_STATUS}" >&2
  [[ -z "${etag}" ]] || printf 'ETag: %s\n' "${etag}" >&2
  [[ -z "${location}" ]] || printf 'Location: %s\n' "${location}" >&2
  [[ -z "${request_id}" ]] || printf 'X-Request-Id: %s\n' "${request_id}" >&2
  if [[ -n "${API_RESPONSE_BODY}" ]]; then
    if jq -e . >/dev/null 2>&1 <<<"${API_RESPONSE_BODY}"; then
      jq . <<<"${API_RESPONSE_BODY}"
    else
      printf '%s\n' "${API_RESPONSE_BODY}"
    fi
  fi
}

api_require_running_stack() {
  api_request GET "${API_USER_BASE_URL}/health"
  [[ "${API_RESPONSE_STATUS}" == "200" ]] || api_demo_fail "User Service is not healthy at ${API_USER_BASE_URL}. Run 'docker compose up --build -d' first."
  api_request GET "${API_SUPPLIER_BASE_URL}/health"
  [[ "${API_RESPONSE_STATUS}" == "200" ]] || api_demo_fail "Supplier Service is not healthy at ${API_SUPPLIER_BASE_URL}. Run 'docker compose up --build -d' first."
}
