#!/usr/bin/env bash
# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-27.
# Scope: added administrator validation, duplicate, missing/stale ETag, and
# unknown-Supplier API scenarios. Author review: Reviewed and approved by @ron.

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/scenarios.sh
source "${script_dir}/../lib/scenarios.sh"

api_demo_init
api_require_running_stack
api_print_heading "ADMINISTRATOR validation and precondition journey"

api_login_admin
admin_token="${API_ADMIN_TOKEN}"
api_create_supplier_fixture "${admin_token}" "Administrator Validation Supplier"
supplier_id="${API_SUPPLIER_ID}"
create_etag="${API_SUPPLIER_ETAG}"
create_body="${API_SUPPLIER_CREATE_BODY}"

invalid_body="$(jq -c '.categories = []' <<<"${create_body}")"
api_supplier_create "${admin_token}" "${invalid_body}"
api_assert_status 400 "reject an invalid create body"
api_assert_error_code "SUPPLIER_VALIDATION_FAILED" "invalid create returns the validation code"

api_supplier_create "${admin_token}" "${create_body}"
api_assert_status 409 "reject a duplicate Supplier"
api_assert_error_code "SUPPLIER_ALREADY_EXISTS" "duplicate create returns the conflict code"
api_assert_equals "$(api_json '.existingSupplierId')" "${supplier_id}" "duplicate response identifies the existing Supplier"

update_body="$(api_supplier_payload "Validation Supplier Updated $(api_unique_suffix)" "This update must satisfy its precondition" "PRINTING")"
api_supplier_update "${admin_token}" "${supplier_id}" "" "${update_body}"
api_assert_status 428 "reject update without If-Match"
api_assert_error_code "SUPPLIER_PRECONDITION_REQUIRED" "missing If-Match returns the precondition code"

api_supplier_update "${admin_token}" "${supplier_id}" '"v99"' "${update_body}"
api_assert_status 412 "reject update with a stale ETag"
api_assert_error_code "SUPPLIER_VERSION_CONFLICT" "stale update returns the version-conflict code"

api_supplier_get "${admin_token}" "${supplier_id}"
api_assert_status 200 "read the Supplier after rejected changes"
api_assert_equals "$(api_json '.version')" "0" "rejected changes preserve the Supplier version"

unknown_id="00000000-0000-4000-8000-000000000099"
api_supplier_get "${admin_token}" "${unknown_id}"
api_assert_status 404 "reject an unknown Supplier ID"
api_assert_error_code "SUPPLIER_NOT_FOUND" "unknown Supplier returns the not-found code"

api_supplier_archive "${admin_token}" "${supplier_id}" "${create_etag}"
api_assert_status 204 "archive the temporary validation fixture"

api_pass "ADMINISTRATOR validation and precondition journey"
