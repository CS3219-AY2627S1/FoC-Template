#!/usr/bin/env bash
# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-27.
# Scope: added self-contained public-API checks that prepare the authentication,
# Supplier, and ETag prerequisites for one selected endpoint. Author review: Reviewed and approved by @ron.

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/scenarios.sh
source "${script_dir}/../lib/scenarios.sh"

endpoint="${1-}"
if [[ -z "${endpoint}" ]]; then
  api_demo_fail "Usage: run-endpoint.sh {user-health|supplier-health|register|login|whoami|change-role|metadata|list|get|create|update|archive|restore}"
fi

api_demo_init
api_require_running_stack
api_print_heading "Isolated endpoint check: ${endpoint}"

prepare_member() {
  api_create_member
  api_assert_status 201 "prepare a MEMBER account"
  api_login "${API_MEMBER_USERNAME}" "${API_MEMBER_PASSWORD}"
  api_assert_status 200 "prepare a MEMBER session"
  TEST_MEMBER_TOKEN="$(api_json '.accessToken')"
}

prepare_admin() {
  api_login_admin
  TEST_ADMIN_TOKEN="${API_ADMIN_TOKEN}"
}

case "${endpoint}" in
  user-health)
    api_user_health
    api_assert_status 200 "read User Service health"
    api_assert_json '.status == "ok"' "User Service reports ready"
    ;;
  supplier-health)
    api_supplier_health
    api_assert_status 200 "read Supplier Service health"
    api_assert_json '.status == "ok"' "Supplier Service reports database readiness"
    ;;
  register)
    api_create_member
    api_assert_status 201 "register a MEMBER"
    api_assert_json '.role == "MEMBER"' "registration cannot select an administrator role"
    ;;
  login)
    api_create_member
    api_assert_status 201 "prepare a MEMBER account"
    api_login "${API_MEMBER_USERNAME}" "${API_MEMBER_PASSWORD}"
    api_assert_status 200 "log in with the registered credentials"
    api_assert_json '.tokenType == "Bearer" and (.accessToken | length > 0)' "login returns a bearer token"
    ;;
  whoami)
    prepare_member
    api_whoami "${TEST_MEMBER_TOKEN}"
    api_assert_status 200 "read the current account"
    api_assert_equals "$(api_json '.username')" "${API_MEMBER_USERNAME}" "profile belongs to the authenticated account"
    ;;
  change-role)
    prepare_member
    prepare_admin
    api_change_user_role "${TEST_ADMIN_TOKEN}" "${API_MEMBER_ID}" "ADMINISTRATOR"
    api_assert_status 200 "promote the prepared account"
    api_assert_json '.role == "ADMINISTRATOR"' "role change takes effect"
    api_change_user_role "${TEST_ADMIN_TOKEN}" "${API_MEMBER_ID}" "MEMBER"
    api_assert_status 200 "restore the prepared account to MEMBER"
    ;;
  metadata)
    prepare_member
    api_supplier_metadata "${TEST_MEMBER_TOKEN}"
    api_assert_status 200 "read Supplier metadata"
    api_assert_json '.buildingCodes | length > 0' "metadata exposes Building Code options"
    ;;
  list)
    prepare_member
    api_supplier_list "${TEST_MEMBER_TOKEN}" "page=0&size=2&sort=name,asc"
    api_assert_status 200 "list Suppliers"
    api_assert_json '.page == 0 and .size == 2 and (.items | length > 0)' "list returns the requested page"
    ;;
  get)
    prepare_member
    api_supplier_list "${TEST_MEMBER_TOKEN}" "page=0&size=1"
    api_assert_status 200 "prepare a Supplier ID"
    supplier_id="$(api_json '.items[0].id')"
    api_supplier_get "${TEST_MEMBER_TOKEN}" "${supplier_id}"
    api_assert_status 200 "read one Supplier"
    api_assert_equals "$(api_json '.id')" "${supplier_id}" "detail returns the requested Supplier"
    api_assert_header_matches "ETag" '^"v[0-9]+"$' "detail includes its current ETag"
    ;;
  create)
    prepare_admin
    api_create_supplier_fixture "${TEST_ADMIN_TOKEN}" "Isolated Create Endpoint"
    api_assert_json '.status == "ACTIVE" and .version == 0' "create returns a new ACTIVE Supplier"
    api_archive_fixture_if_active "${TEST_ADMIN_TOKEN}" "${API_SUPPLIER_ID}"
    ;;
  update)
    prepare_admin
    api_create_supplier_fixture "${TEST_ADMIN_TOKEN}" "Isolated Update Endpoint"
    supplier_id="${API_SUPPLIER_ID}"
    update_body="$(api_supplier_payload "Updated Endpoint Supplier $(api_unique_suffix)" "Updated by the isolated endpoint check" "PRINTING")"
    api_supplier_update "${TEST_ADMIN_TOKEN}" "${supplier_id}" "${API_SUPPLIER_ETAG}" "${update_body}"
    api_assert_status 200 "update the prepared Supplier"
    api_assert_json '.version == 1' "update increments the version"
    api_archive_fixture_if_active "${TEST_ADMIN_TOKEN}" "${supplier_id}"
    ;;
  archive)
    prepare_admin
    api_create_supplier_fixture "${TEST_ADMIN_TOKEN}" "Isolated Archive Endpoint"
    supplier_id="${API_SUPPLIER_ID}"
    api_supplier_archive "${TEST_ADMIN_TOKEN}" "${supplier_id}" "${API_SUPPLIER_ETAG}"
    api_assert_status 204 "archive the prepared Supplier"
    api_supplier_get "${TEST_ADMIN_TOKEN}" "${supplier_id}"
    api_assert_status 200 "read the archived Supplier as administrator"
    api_assert_json '.status == "ARCHIVED"' "archive retains the record with ARCHIVED status"
    ;;
  restore)
    prepare_admin
    api_create_supplier_fixture "${TEST_ADMIN_TOKEN}" "Isolated Restore Endpoint"
    supplier_id="${API_SUPPLIER_ID}"
    api_supplier_archive "${TEST_ADMIN_TOKEN}" "${supplier_id}" "${API_SUPPLIER_ETAG}"
    api_assert_status 204 "prepare an archived Supplier"
    api_supplier_get "${TEST_ADMIN_TOKEN}" "${supplier_id}"
    archive_etag="$(api_header ETag)"
    api_supplier_restore "${TEST_ADMIN_TOKEN}" "${supplier_id}" "${archive_etag}"
    api_assert_status 200 "restore the prepared Supplier"
    api_assert_json '.status == "ACTIVE"' "restore reactivates the same record"
    api_assert_equals "$(api_json '.id')" "${supplier_id}" "restore preserves the Supplier ID"
    api_archive_fixture_if_active "${TEST_ADMIN_TOKEN}" "${supplier_id}"
    ;;
  *)
    api_demo_fail "Unknown endpoint '${endpoint}'."
    ;;
esac

api_pass "isolated ${endpoint} endpoint check"
