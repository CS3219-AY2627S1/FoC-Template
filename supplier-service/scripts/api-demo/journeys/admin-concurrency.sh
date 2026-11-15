#!/usr/bin/env bash
# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-27.
# Scope: added two concurrent administrator-session updates proving optimistic
# ETag conflict protection. Author review: Reviewed and approved by @ron.

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/scenarios.sh
source "${script_dir}/../lib/scenarios.sh"

api_demo_init
api_require_running_stack
api_print_heading "Concurrent ADMINISTRATOR update journey"

api_login_admin
admin_token_a="${API_ADMIN_TOKEN}"

# JWTs issued in different seconds represent two independent administrator sessions.
sleep 2
api_login "${API_ADMIN_USERNAME}" "${API_ADMIN_PASSWORD}"
api_assert_status 200 "open administrator session B"
admin_token_b="$(api_json '.accessToken')"
api_assert_nonempty "${admin_token_b}" "administrator session B token"
[[ "${admin_token_a}" != "${admin_token_b}" ]] || api_demo_fail "administrator sessions unexpectedly received the same token."

api_create_supplier_fixture "${admin_token_a}" "Concurrent Update Supplier"
supplier_id="${API_SUPPLIER_ID}"

api_supplier_get "${admin_token_a}" "${supplier_id}"
api_assert_status 200 "session A reads the Supplier"
etag_a="$(api_header ETag)"
api_supplier_get "${admin_token_b}" "${supplier_id}"
api_assert_status 200 "session B reads the Supplier"
etag_b="$(api_header ETag)"
api_assert_equals "${etag_b}" "${etag_a}" "both sessions start from the same ETag"

body_a="$(api_supplier_payload "Concurrent Winner A $(api_unique_suffix)" "Submitted by administrator session A" "FOOD")"
body_b="$(api_supplier_payload "Concurrent Winner B $(api_unique_suffix)" "Submitted by administrator session B" "PRINTING")"
attempt_dir="${API_DEMO_TMP_DIR}/concurrent"
mkdir -p "${attempt_dir}"

run_attempt() {
  local label="$1"
  local token="$2"
  local body="$3"
  (
    API_RESPONSE_HEADERS_FILE="${attempt_dir}/${label}.headers"
    API_RESPONSE_BODY_FILE="${attempt_dir}/${label}.body"
    api_supplier_update "${token}" "${supplier_id}" "${etag_a}" "${body}"
    printf '%s' "${API_RESPONSE_STATUS}" >"${attempt_dir}/${label}.status"
  )
}

run_attempt a "${admin_token_a}" "${body_a}" &
pid_a=$!
run_attempt b "${admin_token_b}" "${body_b}" &
pid_b=$!
wait "${pid_a}"
wait "${pid_b}"

status_a="$(<"${attempt_dir}/a.status")"
status_b="$(<"${attempt_dir}/b.status")"
statuses="$(printf '%s\n%s\n' "${status_a}" "${status_b}" | sort | paste -sd, -)"
api_assert_equals "${statuses}" "200,412" "one concurrent update succeeds and one is rejected"

if [[ "${status_a}" == "412" ]]; then
  stale_body_file="${attempt_dir}/a.body"
else
  stale_body_file="${attempt_dir}/b.body"
fi
api_assert_equals "$(jq -er '.code' "${stale_body_file}")" "SUPPLIER_VERSION_CONFLICT" "stale session receives the version-conflict code"

api_supplier_get "${admin_token_a}" "${supplier_id}"
api_assert_status 200 "read the committed concurrent result"
api_assert_equals "$(api_json '.version')" "1" "only one update increments the version"
winning_etag="$(api_header ETag)"
api_assert_equals "${winning_etag}" '"v1"' "committed Supplier has the next ETag"

api_supplier_archive "${admin_token_a}" "${supplier_id}" "${winning_etag}"
api_assert_status 204 "archive the temporary concurrency fixture"

api_pass "Concurrent ADMINISTRATOR update journey"
