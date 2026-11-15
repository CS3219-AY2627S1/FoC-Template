#!/usr/bin/env bash
# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-27.
# Scope: added a MEMBER journey proving every Supplier administrator operation
# and archived listing are forbidden. Author review: Reviewed and approved by @ron.

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/scenarios.sh
source "${script_dir}/../lib/scenarios.sh"

api_demo_init
api_require_running_stack
api_print_heading "MEMBER authorization journey"

api_create_member
api_assert_status 201 "register a new MEMBER"
api_login "${API_MEMBER_USERNAME}" "${API_MEMBER_PASSWORD}"
api_assert_status 200 "log in as the MEMBER"
member_token="$(api_json '.accessToken')"

api_supplier_list "${member_token}" "page=0&size=1"
api_assert_status 200 "load an ACTIVE Supplier prerequisite"
supplier_id="$(api_json '.items[0].id')"

api_supplier_get "${member_token}" "${supplier_id}"
api_assert_status 200 "read the Supplier before rejected mutations"
supplier_etag="$(api_header ETag)"
supplier_version="$(api_json '.version')"
valid_body="$(jq -c '{name, categories, buildingCode, floor, locationDescription, latitude, longitude, hoursKind, opensAt, closesAt}' <<<"${API_RESPONSE_BODY}")"

forbidden_create_body="$(api_supplier_payload "Forbidden MEMBER Supplier $(api_unique_suffix)" "MEMBER must not create this Supplier")"
api_supplier_create "${member_token}" "${forbidden_create_body}"
api_assert_status 403 "forbid MEMBER create"
api_assert_error_code "FORBIDDEN" "create returns the stable forbidden code"

api_supplier_update "${member_token}" "${supplier_id}" "${supplier_etag}" "${valid_body}"
api_assert_status 403 "forbid MEMBER update"
api_assert_error_code "FORBIDDEN" "update returns the stable forbidden code"

api_supplier_archive "${member_token}" "${supplier_id}" "${supplier_etag}"
api_assert_status 403 "forbid MEMBER archive"
api_assert_error_code "FORBIDDEN" "archive returns the stable forbidden code"

api_supplier_restore "${member_token}" "${supplier_id}" "${supplier_etag}"
api_assert_status 403 "forbid MEMBER restore"
api_assert_error_code "FORBIDDEN" "restore returns the stable forbidden code"

api_supplier_list "${member_token}" "status=ARCHIVED&page=0&size=1"
api_assert_status 403 "forbid MEMBER archived listing"
api_assert_error_code "FORBIDDEN" "archived listing returns the stable forbidden code"

api_supplier_get "${member_token}" "${supplier_id}"
api_assert_status 200 "Supplier remains readable after rejected mutations"
api_assert_equals "$(api_json '.version')" "${supplier_version}" "rejected mutations leave the version unchanged"

api_pass "MEMBER authorization journey"
