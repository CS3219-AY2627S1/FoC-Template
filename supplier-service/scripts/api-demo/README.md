<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-09-27
Scope: Documented the Bash endpoint collection, self-contained endpoint checks,
user journeys, prerequisites, state handling, and cleanup.
Author review: Reviewed and approved by @ron.
-->

# Supplier API Bash demonstrations

These scripts exercise the running User and Supplier services through their public HTTP
APIs. They do not use the frontend or query either database directly.

## Prerequisites

From the repository root, start the services first:

```sh
docker compose up --build -d user-service supplier-service
```

The scripts require `bash`, `curl`, and `jq`. Administrator checks read
`BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` from the repository's ignored
`.env` file without executing that file. Override the service locations with
`API_USER_BASE_URL` or `API_SUPPLIER_BASE_URL` when required.

## Complete user journeys

Run any journey independently:

```sh
./supplier-service/scripts/api-demo/journeys/member-read.sh
./supplier-service/scripts/api-demo/journeys/member-authorization.sh
./supplier-service/scripts/api-demo/journeys/admin-crud.sh
./supplier-service/scripts/api-demo/journeys/admin-validation.sh
./supplier-service/scripts/api-demo/journeys/visibility.sh
./supplier-service/scripts/api-demo/journeys/admin-concurrency.sh
```

- `member-read.sh` registers and logs in a MEMBER, reads metadata/catalogue/detail, then
  drops its local token and proves the next request returns `401`.
- `member-authorization.sh` proves MEMBER create, update, archive, restore, and archived
  listing attempts return `403` without changing the selected Supplier version.
- `admin-crud.sh` creates, reads, updates, archives, and restores the same Supplier ID.
- `admin-validation.sh` demonstrates `400`, `409`, `412`, `428`, and `404` cases.
- `visibility.sh` proves archived Suppliers are concealed from MEMBER but available to
  ADMINISTRATOR, then restores the same record.
- `admin-concurrency.sh` sends two administrator-session updates with one ETag and proves
  that exactly one succeeds while the stale request receives `412`.

## One endpoint at a time

The self-contained endpoint runner prepares its own account, token, Supplier, and ETag:

```sh
./supplier-service/scripts/api-demo/tests/run-endpoint.sh list
./supplier-service/scripts/api-demo/tests/run-endpoint.sh update
./supplier-service/scripts/api-demo/tests/run-endpoint.sh restore
```

Supported names are:

```text
user-health supplier-health register login whoami change-role
metadata list get create update archive restore
```

For Postman-like manual requests, use the scripts under `endpoints/`. Authentication is
passed with `API_TOKEN`; create/update bodies come from JSON files:

```sh
member_token="$(
  ./supplier-service/scripts/api-demo/endpoints/auth/login.sh \
    api_member_123 'ApiDemoMember123Aa1' 2>/dev/null | jq -r '.accessToken'
)"

API_TOKEN="${member_token}" \
  ./supplier-service/scripts/api-demo/endpoints/suppliers/list.sh \
  'q=coffee&page=0&size=5&sort=name,asc'

API_TOKEN="${member_token}" \
  ./supplier-service/scripts/api-demo/endpoints/suppliers/get.sh SUPPLIER_ID
```

Endpoint scripts write HTTP status and selected headers to standard error and JSON to
standard output, allowing the response body to be piped into `jq`. Mutation scripts use:

```text
create.sh BODY.json
update.sh SUPPLIER_ID ETAG BODY.json
archive.sh SUPPLIER_ID ETAG
restore.sh SUPPLIER_ID ETAG
```

## Run everything

```sh
./supplier-service/scripts/api-demo/run-all.sh
```

The checks generate unique MEMBER accounts. Created Supplier fixtures are archived after
successful checks because the service intentionally does not physically delete Suppliers.
To reset all local demonstration data after stopping the stack:

```sh
docker compose down -v
```

Without `-v`, the local PostgreSQL volumes and their test records remain available.
