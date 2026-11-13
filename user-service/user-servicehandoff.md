# Admin User directory handoff

Owner of this change: Yao Xiang, `order-service/admin-ui-linking`, 2026-10-29. The user explicitly authorized only the missing Admin directory endpoint and its integration. Verification results are recorded below after execution.

## Endpoint added

`GET /api/users/admin/search`

Send the signed-in admin's Firebase ID token as `Authorization: Bearer <token>`. The existing JWT validation, active-account filter and Mongo-backed `callerRoles.isAdmin(authentication)` enforce access. A client-supplied role or user ID does not grant permission.

| Query | Default | Meaning |
|---|---|---|
| `page` | `1` | One-based page; at least 1 |
| `size` | `20` | 1–100 |
| `searchBy` | `id` | `id` or `name` |
| `q` | empty | Trimmed text, at most 128 characters. Blank returns the initial directory page. |

- ID search matches the exact Firebase `userId`, with case preserved; it does not search the Mongo document ID.
- Name search matches a case-insensitive literal substring of `username`. Regex characters are escaped.
- All account statuses are included for admin review. MongoDB filters/counts before paging and sorts by `username`, `userId`, then document ID ascending; names use Mongo's existing binary sort order.
- The response includes only display fields. It excludes deletion operation/recovery fields and Credit balances. No names, accounts or sample records are created.

Example response:

```json
{
  "items": [{
    "id": "mongo-document-id",
    "userId": "firebase-uid",
    "username": "Alex",
    "email": "alex@u.nus.edu",
    "roles": ["requester", "courier"],
    "penalty": 0,
    "isCourierSuspended": false,
    "suspensionEndDate": null,
    "status": "ACTIVE"
  }],
  "page": 1,
  "size": 20,
  "totalItems": 23,
  "totalPages": 2
}
```

No match is `200` with empty `items` and zero totals. A page beyond the last retains the matching totals but has empty `items`. Status is the existing `ACTIVE`, `DEACTIVATION_PENDING` or `DEACTIVATED` enum.

Errors: `400` invalid query; `401` missing/invalid authentication; `403` inactive/non-admin caller; `503` unavailable authorization/database. Endpoint-owned query/database errors use the standard status/error/message/path/timestamp/details envelope. Existing security filters handle authentication. No real error falls back to sample data.

## User Service changes

- `controller/AdminUserDirectoryController.java`: one new GET endpoint, OpenAPI documentation, existing admin authorization, endpoint-local validation/database error responses and Bearer security scheme.
- `logic/AdminUserDirectory.java`: read-only Mongo filtering, field projection, count, deterministic sort, skip and limit.
- `logic/AdminUserPage.java`: paginated display DTO; does not serialize the entire User persistence model.
- New controller and real MongoDB tests, plus the existing OpenAPI test's directory assertion. The sole build addition is the test-scoped MongoDB Testcontainers module used by the new query tests.
- Existing User controller routes, profile/promotion/deactivation behavior, roles, penalty logic, Firebase integration, collections and persistence model are unchanged. No migration or new runtime setting.

## Frontend integration

The Admin Users page now calls this real endpoint for its initial list, pagination, ID/name search and Clear. It requests 20 records per page. The dropdown defaults to ID and offers Name again because the provider now supports it. Existing full-profile lookup, promotion, deactivation and independent Credit balance/history remain linked to their existing real APIs. Credit values are loaded in the selected profile; the User directory does not invent/join balances.

Generic Admin mock routes were removed in CHANGE-160; they remain removed. Only Admin Reports keeps local mock data; staging/production Reports shows Coming soon. Rebuild User Service and frontend to use the new route:

```powershell
docker compose -f compose.yaml -f compose.http-peers.yaml up -d --build user-service frontend
```

## Verification and boundaries

Run `./mvnw verify` from `user-service`; new query tests use disposable MongoDB containers and require Docker. Existing full-context tests still require the project's test MongoDB configuration. Local verification uses a separate disposable replica set, never an application database. From `frontend`, run `npm test`, `npm run lint`, `npm run typecheck` and `npm run build`.

Admin Report integration remains pending. This task does not implement User penalty subscribers, the Supplier deactivation/admission guard, a Report resolution saga or cloud deployment. Those independent gaps must not be marked completed merely because Admin HTTP reads/actions are linked. No unrelated User Service behavior was changed.

## Executed verification — 2026-10-29

User `mvnw verify`:36 tests passed,0 failures/errors/skips, native exit0. Query tests use real disposable Mongo8; controller tests enforce the actual existing active-account/Mongo admin-role path with mocked JWT decoding. A fresh User Docker image was additionally exercised through14 real HTTP requests against an isolated Mongo replica set, using the existing explicit local emulator decoder: paging/name/ID/status/DTO privacy,400/401/403, unchanged profile and OpenAPI passed. This is not a production-signature or deployed-cloud verification claim. Frontend252 tests, lint, typecheck, production build and both User/frontend image builds passed. Preview/test resources were removed; application databases and containers were not recreated.

The first full test run found stale compiled classes from a removed package and a missing test-slice security import. Stale generated outputs were pruned without deleting logs/source, and the new test fixture was corrected; production authentication code was not changed. Order backend tests were not repeated for this User/frontend-only change.

## CI test-image correction — CHANGE-165 (2026-10-29)

The GitHub CI excerpt reports AdminUserDirectoryTest.database failing to launch mongo:8, before its query assertions run. Its exact container crash details are not included in that excerpt. Pin the directory fixture to mongo:7.0.43, matching the existing Order/User integration fixture, instead of the floating Mongo8 tag. Tests still exercise a real disposable MongoDB replica set; no application data is used and no test is skipped or replaced with mocked query results.

No production database version, environment variable, endpoint or dependency is changed. Separate localhost:27017 background-job warnings occur in the passing full-context/OpenAPI test; those warnings are not the reported failing assertion. Full local verification uses an isolated test MongoDB for those existing full-context tests. Local results are recorded after execution; GitHub runner verification remains a CI rerun, not a locally proven result.

Executed correction verification: standalone User Maven verify native exit0;36 tests pass with zero failures/errors/skips, including all4 real directory query tests on pinned Mongo7.0.43. Full-context/OpenAPI tests use a separate disposable Mongo7 replica set; the directory fixture owns its own disposable database. Temporary fixtures removed, application databases untouched. No production code, environment, dependency or workflow changes. GitHub CI must rerun on the pushed fix to confirm the runner-specific startup problem is resolved.
