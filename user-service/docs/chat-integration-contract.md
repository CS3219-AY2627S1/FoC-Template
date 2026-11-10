# User Service identity contracts for Chat Service

User Service owns these versioned, read-only interfaces. Chat Service owns conversation
membership and decisions about discovery, creation, sending, and delivery. Never read
User Service tables from Chat Service. The participant POST looks up identities and
does not create participants or accounts.

## Internal connection and configuration

Use `http://user-service:8000` on the shared internal Compose network, or the configured
internal User Service base URL in deployment. Local host development uses
`http://127.0.0.1:8000`. The public browser talks to Chat Service; these paths and
credentials belong only on the internal service connection.

Independently generate `CHAT_SERVICE_SHARED_SECRET` and provide the same value to both
services through ignored environment configuration or the deployment secret store.
User Service startup permits an absent value; chat calls then fail closed. An empty
value is absent. There is no Supplier or `INTERNAL_SERVICE_SECRET` fallback. Do not
overwrite existing secrets, send them through source/documents, or put them in URLs,
browser configuration, logs, or events. The existing development generator does not
provision this new secret. The deployment identity replacement follows the existing
IAM/mTLS approach; cloud identity provisioning is outside this change.

## Username search

`GET /v1/internal/chat/users?username=lex&limit=20`

Required headers: `X-FoC-Service-Secret: <chat-service-secret>` and
`Authorization: Bearer <original-caller-access-token>`. User Service checks the current
session/account/role version and updates session activity using its existing rules.
All active User/Admin/Super Admin callers receive the same narrow projection.

```json
{"items":[{"userId":"11111111-1111-4111-8111-111111111111","username":"alex_ng"}],"nextCursor":null}
```

`username` is trimmed, 1–64 allow-listed username characters, normalized case-insensitively,
and matched as a literal substring anywhere in the username. `%` and `_` are literal.
Email/display names do not match. The caller and deleted accounts are excluded.
`limit` defaults to 20 and accepts 1–100. Optional `cursor` is an opaque, URL-safe
continuation: pass it unchanged with the same normalized query. Pages order by
normalized username then immutable UUID, with bounded keyset lookahead and no total
result cap. A null cursor means there was no further match when queried. Pages reflect
current database state, so profile deletion between pages does not invalidate a cursor;
renames/inserts can affect traversal. Unknown query fields are rejected.

## Current participant lookup

`POST /v1/internal/chat/participants` requires the Chat Service secret header only.
Background delivery/status checks need no browser bearer token.

```json
{"userIds":["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"]}
```

```json
{"items":[{"userId":"11111111-1111-4111-8111-111111111111","displayName":"Alex","username":"alex_ng","accountStatus":"ACTIVE"},{"userId":"22222222-2222-4222-8222-222222222222","displayName":"Deleted User","username":null,"accountStatus":"DELETED"}],"missingUserIds":["33333333-3333-4333-8333-333333333333"]}
```

Supply 1–100 UUIDs before deduplication. Duplicate IDs collapse in first-occurrence
order; known items and missing IDs each retain that order. Invalid UUIDs, empty or
oversized batches, and unknown body fields reject the entire request. Mixed and
all-unknown batches return 200. Unknown IDs are not inferred to be deleted.
Active display names/usernames are resolved afresh. A tombstone always returns
`Deleted User`, null username, and the original UUID, including after username reuse
by a different account. Names are not unique. Recheck status before new messages/live
forwarding; this response is a current observation, not an authorization grant.

## Privacy, failures, and correlation

Search items contain exactly `userId` and `username`. Participant items contain exactly
`userId`, `displayName`, `username`, and `accountStatus`. No email, system role,
credentials, sessions, verification metadata, or former tombstone identity is exposed.
Responses use `Cache-Control: no-store`. Send `X-Correlation-ID` to correlate calls;
the response uses the existing header and error envelope:

```json
{"error":{"code":"INVALID_SERVICE_IDENTITY","message":"Service authentication is required.","correlationId":"example-trace","fieldErrors":[]}}
```

| Condition | Result |
|---|---|
| Missing/wrong/unconfigured Chat Service identity | 401 `INVALID_SERVICE_IDENTITY` |
| Missing/invalid/expired/revoked/idle search caller, deleted account or stale role version | 401 existing authentication error |
| Invalid query/cursor/limit/batch/UUID or extra fields | 422 `VALIDATION_ERROR`, safe field errors |
| No search matches / unknown participant IDs | 200 empty page / explicit `missingUserIds` |
| Unavailable database | 503 `SERVICE_NOT_READY`; never a fabricated empty result |

Fail closed on failed identity/status calls. Use bounded timeouts and validate response
DTOs in Chat Service. Logs retain correlation, operation, counts, status and duration;
never request/response payloads. Existing `/v1/users/me`, JWKS and Supplier authorization
contracts retain their behavior.
