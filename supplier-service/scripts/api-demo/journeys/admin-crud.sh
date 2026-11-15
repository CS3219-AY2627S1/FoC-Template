#!/usr/bin/env bash
# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-27.
# Scope: added the complete administrator Supplier create, read, update,
# archive, archived-read, and restore journey. Author review: Reviewed and approved by @ron.

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/scenarios.sh
source "${script_dir}/../lib/scenarios.sh"

api_demo_init
api_require_running_stack
api_print_heading "ADMINISTRATOR CRUD lifecycle journey"

api_login_admin
admin_token="${API_ADMIN_TOKEN}"

api_create_supplier_fixture "${admin_token}" "Administrator CRUD Supplier"
supplier_id="${API_SUPPLIER_ID}"
create_etag="${API_SUPPLIER_ETAG}"

api_supplier_get "${admin_token}" "${supplier_id}"
api_assert_status 200 "read the newly created Supplier"
api_assert_equals "$(api_header ETag)" "${create_etag}" "create and detail ETags agree"

updated_body="$(api_supplier_payload "Administrator CRUD Supplier Updated $(api_unique_suffix)" "Updated through the Bash administrator journey" "PRINTING")"
api_supplier_update "${admin_token}" "${supplier_id}" "${create_etag}" "${updated_body}"
api_assert_status 200 "update the Supplier"
api_assert_equals "$(api_json '.id')" "${supplier_id}" "update preserves the server-generated ID"
api_assert_equals "$(api_json '.version')" "1" "update increments the Supplier version"
update_etag="$(api_header ETag)"
api_assert_equals "${update_etag}" '"v1"' "update returns the next ETag"

api_supplier_archive "${admin_token}" "${supplier_id}" "${update_etag}"
api_assert_status 204 "archive the Supplier"

api_supplier_get "${admin_token}" "${supplier_id}"
api_assert_status 200 "administrator can read the archived Supplier"
api_assert_json '.status == "ARCHIVED"' "archive changes the lifecycle status"
archive_etag="$(api_header ETag)"
api_assert_equals "${archive_etag}" '"v2"' "archive increments the ETag"

api_supplier_restore "${admin_token}" "${supplier_id}" "${archive_etag}"
api_assert_status 200 "restore the Supplier"
api_assert_equals "$(api_json '.id')" "${supplier_id}" "restore returns the same Supplier ID"
api_assert_json '.status == "ACTIVE"' "restore makes the Supplier active"
restore_etag="$(api_header ETag)"
api_assert_equals "${restore_etag}" '"v3"' "restore increments the ETag"

# Keep repeat runs from filling the ACTIVE catalogue with demonstration fixtures.
api_supplier_archive "${admin_token}" "${supplier_id}" "${restore_etag}"
api_assert_status 204 "archive the temporary fixture after the demonstration"

api_pass "ADMINISTRATOR CRUD lifecycle journey"
