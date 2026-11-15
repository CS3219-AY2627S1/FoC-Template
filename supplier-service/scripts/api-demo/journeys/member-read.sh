#!/usr/bin/env bash
# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-27.
# Scope: added the self-contained MEMBER register, login, catalogue, detail,
# and local sign-out API journey. Author review: Reviewed and approved by @ron.

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/scenarios.sh
source "${script_dir}/../lib/scenarios.sh"

api_demo_init
api_require_running_stack
api_print_heading "MEMBER read and session journey"

api_create_member
api_assert_status 201 "register a new MEMBER"

api_login "${API_MEMBER_USERNAME}" "${API_MEMBER_PASSWORD}"
api_assert_status 200 "log in as the MEMBER"
member_token="$(api_json '.accessToken')"
api_assert_nonempty "${member_token}" "login access token"

api_whoami "${member_token}"
api_assert_status 200 "read the MEMBER profile"
api_assert_json '.role == "MEMBER"' "registered account has the MEMBER role"

api_supplier_metadata "${member_token}"
api_assert_status 200 "read Supplier metadata"
api_assert_json '.buildingCodes | length > 0' "metadata contains Building Codes"

api_supplier_list "${member_token}" "page=0&size=5&sort=name,asc"
api_assert_status 200 "list ACTIVE Suppliers"
api_assert_json '.items | length > 0' "seeded Supplier catalogue is not empty"
supplier_id="$(api_json '.items[0].id')"

api_supplier_get "${member_token}" "${supplier_id}"
api_assert_status 200 "view one Supplier"
api_assert_equals "$(api_json '.id')" "${supplier_id}" "detail returns the selected Supplier"
api_assert_header_matches "ETag" '^"v[0-9]+"$' "detail returns a strong Supplier ETag"

# The User Service has no server-side logout endpoint. Dropping the local token is logout.
member_token=""
api_supplier_list "${member_token}" "page=0&size=1"
api_assert_status 401 "reject a Supplier request after local sign-out"

api_pass "MEMBER read and session journey"
