#!/usr/bin/env bash
# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-27.
# Scope: added reusable public-API setup for unique MEMBER accounts,
# administrator sessions, and Supplier fixtures. Author review: Reviewed and approved by @ron.

scenario_lib_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=api.sh
source "${scenario_lib_dir}/api.sh"

api_unique_suffix() {
  printf '%s_%s_%s' "$(date +%s)" "$$" "${RANDOM}"
}

api_create_member() {
  local suffix
  suffix="$(api_unique_suffix)"
  API_MEMBER_USERNAME="api_member_${suffix: -12}"
  API_MEMBER_EMAIL="${API_MEMBER_USERNAME}@${API_ALLOWED_EMAIL_DOMAIN}"
  API_MEMBER_PASSWORD="ApiDemoMember${RANDOM}Aa1"
  api_register "${API_MEMBER_USERNAME}" "${API_MEMBER_EMAIL}" "${API_MEMBER_PASSWORD}"
  if [[ "${API_RESPONSE_STATUS}" == "201" ]]; then
    API_MEMBER_ID="$(api_json '.id')"
  fi
}

api_require_admin_credentials() {
  API_ADMIN_USERNAME="${API_ADMIN_USERNAME:-${BOOTSTRAP_ADMIN_USERNAME:-$(api_dotenv_value BOOTSTRAP_ADMIN_USERNAME || true)}}"
  API_ADMIN_PASSWORD="${API_ADMIN_PASSWORD:-${BOOTSTRAP_ADMIN_PASSWORD:-$(api_dotenv_value BOOTSTRAP_ADMIN_PASSWORD || true)}}"
  [[ -n "${API_ADMIN_USERNAME}" ]] || api_demo_fail "Set BOOTSTRAP_ADMIN_USERNAME in .env or export API_ADMIN_USERNAME."
  [[ -n "${API_ADMIN_PASSWORD}" ]] || api_demo_fail "Set BOOTSTRAP_ADMIN_PASSWORD in .env or export API_ADMIN_PASSWORD."
}

api_login_admin() {
  api_require_admin_credentials
  api_login "${API_ADMIN_USERNAME}" "${API_ADMIN_PASSWORD}"
  api_assert_status 200 "log in as the bootstrap administrator"
  API_ADMIN_TOKEN="$(api_json '.accessToken')"
  api_assert_nonempty "${API_ADMIN_TOKEN}" "administrator access token"
}

api_supplier_payload() {
  local name="$1"
  local location="$2"
  local category="${3:-FOOD}"
  jq -cn \
    --arg name "${name}" \
    --arg location "${location}" \
    --arg category "${category}" \
    '{
      name: $name,
      categories: [$category],
      buildingCode: "COM2",
      floor: "1",
      locationDescription: $location,
      latitude: null,
      longitude: null,
      hoursKind: "INTERVAL",
      opensAt: "09:00",
      closesAt: "18:00"
    }'
}

api_create_supplier_fixture() {
  local token="$1"
  local label="${2:-API Demo Supplier}"
  local suffix
  suffix="$(api_unique_suffix)"
  API_SUPPLIER_CREATE_BODY="$(api_supplier_payload "${label} ${suffix}" "API demonstration fixture ${suffix}")"
  api_supplier_create "${token}" "${API_SUPPLIER_CREATE_BODY}"
  api_assert_status 201 "create a Supplier fixture"
  API_SUPPLIER_ID="$(api_json '.id')"
  API_SUPPLIER_ETAG="$(api_header ETag)"
  api_assert_nonempty "${API_SUPPLIER_ID}" "server-generated Supplier ID"
  api_assert_header_matches "ETag" '^"v0"$' "new Supplier starts at version zero"
}

api_archive_fixture_if_active() {
  local token="$1"
  local supplier_id="$2"
  api_supplier_get "${token}" "${supplier_id}"
  [[ "${API_RESPONSE_STATUS}" == "200" ]] || return 0
  if [[ "$(api_json '.status')" == "ACTIVE" ]]; then
    local etag
    etag="$(api_header ETag)"
    api_supplier_archive "${token}" "${supplier_id}" "${etag}"
    [[ "${API_RESPONSE_STATUS}" == "204" ]] || api_demo_fail "Could not archive temporary Supplier ${supplier_id}."
  fi
}
