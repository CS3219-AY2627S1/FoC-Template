#!/usr/bin/env bash
# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-27.
# Scope: added the MEMBER versus ADMINISTRATOR archived visibility and same-ID
# restoration journey. Author review: Reviewed and approved by @ron.

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/scenarios.sh
source "${script_dir}/../lib/scenarios.sh"

api_demo_init
api_require_running_stack
api_print_heading "Supplier lifecycle visibility journey"

api_login_admin
admin_token="${API_ADMIN_TOKEN}"
api_create_supplier_fixture "${admin_token}" "Visibility Journey Supplier"
supplier_id="${API_SUPPLIER_ID}"
create_etag="${API_SUPPLIER_ETAG}"

api_create_member
api_assert_status 201 "register a MEMBER observer"
api_login "${API_MEMBER_USERNAME}" "${API_MEMBER_PASSWORD}"
api_assert_status 200 "log in as the MEMBER observer"
member_token="$(api_json '.accessToken')"

api_supplier_get "${member_token}" "${supplier_id}"
api_assert_status 200 "MEMBER can read the ACTIVE Supplier"

api_supplier_archive "${admin_token}" "${supplier_id}" "${create_etag}"
api_assert_status 204 "administrator archives the Supplier"

api_supplier_get "${member_token}" "${supplier_id}"
api_assert_status 404 "archived Supplier is concealed from MEMBER detail"
api_assert_error_code "SUPPLIER_NOT_FOUND" "concealed detail uses the not-found code"

api_supplier_list "${member_token}" "status=ARCHIVED&page=0&size=100"
api_assert_status 403 "MEMBER cannot list archived Suppliers"
api_assert_error_code "FORBIDDEN" "archived list enforces the MEMBER role"

api_supplier_list "${admin_token}" "status=ARCHIVED&page=0&size=100"
api_assert_status 200 "administrator can list archived Suppliers"
api_assert_json ".items | any(.id == \"${supplier_id}\")" "administrator list contains the archived Supplier"

api_supplier_get "${admin_token}" "${supplier_id}"
api_assert_status 200 "administrator can read archived Supplier detail"
archive_etag="$(api_header ETag)"

api_supplier_restore "${admin_token}" "${supplier_id}" "${archive_etag}"
api_assert_status 200 "administrator restores the Supplier"
api_assert_equals "$(api_json '.id')" "${supplier_id}" "restore preserves the Supplier ID"
restore_etag="$(api_header ETag)"

api_supplier_get "${member_token}" "${supplier_id}"
api_assert_status 200 "restored Supplier is visible to MEMBER again"
api_assert_equals "$(api_json '.id')" "${supplier_id}" "MEMBER sees the restored record"

api_supplier_archive "${admin_token}" "${supplier_id}" "${restore_etag}"
api_assert_status 204 "archive the temporary visibility fixture"

api_pass "Supplier lifecycle visibility journey"
