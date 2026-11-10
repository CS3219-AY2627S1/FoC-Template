# User Service Chat Integration Interface Plan

## Sprint 3 outcome and scope

Provide the two User Service interfaces proposed in the [Chat Service Sprint 3 plan](../chat-service/PLAN.md): partial username search and batch participant lookup. Chat Service will use them to find active users, display current names and `@<username>` labels, and distinguish active, deleted, and unknown participants without accessing the User Service database.

User Service remains the authority for immutable user IDs, usernames, current display names, account status, and session validity. Chat Service remains responsible for conversation membership, blocks, message validation and persistence, unread state, RabbitMQ delivery, and the chat UI.

The work is limited to the two internal HTTP interfaces, dedicated Chat Service authentication/configuration, query and response handling, tests, and integration documentation. Existing registration, authentication, profile, administrator, Supplier Service authorization, JWKS, and registration-event contracts retain their behaviour.

## Current implementation and data design

Use the existing Python 3.13, FastAPI, Pydantic v2, SQLAlchemy async, `asyncpg`, and Supabase PostgreSQL stack. Query only the existing `user_service.users` table through User Service's database session dependencies.

The existing identity model already supplies everything required:

| Existing field or behaviour | Use in the new interfaces |
|---|---|
| Immutable `users.id` UUID | Search result identity and batch lookup key. |
| `username` and `normalized_username` | Display the original username and perform case-insensitive username matching using existing normalization. |
| `display_name` | Return the latest display name for conversation-list presentation. Names are not unique. |
| `account_status` with `ACTIVE` and `DELETED` | Filter discoverable users and identify retained tombstones. |
| Account-deletion tombstone | Keep the original ID, return `Deleted User`, and expose no former username or other erased identity fields. |
| `get_current_principal` / `require_self_access` | Validate the search caller's current session, account status, role version, token expiry, and session lifecycle. |
| `GET /v1/users/me` and `GET /.well-known/jwks.json` | Existing authentication interfaces for Chat Service; no new authentication/introspection endpoint is needed for this work. |

No new tables, account statuses, or schema migration are required for the initial interfaces. Use the existing UUID and normalized-username indexes where applicable. Do not claim that an equality index accelerates arbitrary substring matching; record query timings and leave additional search indexing to a separately justified performance change.

Preserve Supabase SQL migrations as the sole schema history. Runtime models and startup must not mutate the schema. Do not grant Chat Service database credentials, add cross-service foreign keys, or copy identity tables into Chat Service.

## Authentication and privacy boundary

Introduce an optional `CHAT_SERVICE_SHARED_SECRET` setting represented as a secret value, and a dedicated FastAPI service-identity dependency for the new chat routes. Use the existing `X-FoC-Service-Secret` header name, but compare against the Chat Service secret with a constant-time comparison.

- Missing configuration, a missing header, or a mismatched secret returns `401 INVALID_SERVICE_IDENTITY` without leaking the configured value.
- The new dependency accepts only the Chat Service identity. Do not reuse the Supplier Service secret, add a fallback to `INTERNAL_SERVICE_SECRET`, or broaden the existing Supplier authorization dependency.
- Validate service identity before querying user data. The search endpoint also requires the original caller's bearer token and the existing current-session dependency.
- The batch endpoint requires service identity only. It must support Chat Service background delivery/status checks when no originating browser bearer token is available.
- All active system roles may use username discovery through Chat Service. Administrative roles do not unlock additional directory fields.
- Use direct service-to-service calls over the configured internal network. The browser calls Chat Service's public API rather than these internal User Service routes.
- Keep the service secret out of browser configuration, URLs, API responses, logs, events, and source control. Add safe placeholders and setup instructions; do not overwrite existing local secret files.
- Responses use explicit allow-listed DTOs. Never return email, role, verification metadata, credential data, session data, former tombstone identifiers, or ORM objects.
- Return `Cache-Control: no-store` for both interfaces so identity/status responses are not reused by intermediary caches.

For cloud deployment, follow the project's existing service-identity replacement approach; introducing a new cloud identity system is outside this Sprint 3 interface work.

## HTTP contracts

Use the existing camelCase DTO conventions, reject undeclared query/body fields, and reuse the established error envelope and `X-Correlation-ID` handling. Both interfaces perform read-only identity lookup; normal search authentication continues to apply the existing session-activity behaviour.

### GET /v1/internal/chat/users

Return a bounded page of active users whose usernames partially match the supplied query.

Required headers:

```http
X-FoC-Service-Secret: <chat-service-secret>
Authorization: Bearer <current-user-access-token>
```

| Query parameter | Contract |
|---|---|
| `username` | Required. Trim outer whitespace, require 1-64 characters from the existing username allow-list, then apply the existing case-insensitive normalization. Search username only. |
| `limit` | Optional integer; default 20, minimum 1, maximum 100. |
| `cursor` | Optional opaque continuation value from the preceding response for the same normalized query. |

Search behaviour:

- Match a literal substring anywhere in `normalized_username`; do not restrict matching to prefixes or exact usernames.
- Escape SQL pattern characters so allowed username characters such as `%` and `_` remain literal. Use parameterized SQLAlchemy expressions.
- Include only `ACTIVE` users with non-null usernames, and exclude the authenticated caller's immutable ID.
- Do not search display names or email, and do not apply administrative lookup permissions.
- Sort by `(normalized_username, id)` ascending and use keyset pagination with `limit + 1` lookahead. Never load all matching users to construct a page.
- Make every match accessible through continuation pages; there is no artificial total-result cap.
- Use a versioned URL-safe cursor carrying the normalized query and last ordering key. Validate its shape and values, and reject a cursor used with a different normalized query. Treat cursor content as untrusted data, not authorization.
- Pagination follows current database state rather than a long-lived snapshot. It must remain usable if a previously returned account becomes a tombstone.

Example successful response:

```json
{
  "items": [
    {
      "userId": "11111111-1111-4111-8111-111111111111",
      "username": "alex_ng"
    }
  ],
  "nextCursor": null
}
```

Each result contains exactly `userId` and `username`. Return `200` with an empty `items` array and null `nextCursor` when nothing matches. Return a continuation cursor only when another page exists.

### POST /v1/internal/chat/participants

Look up current identity and account status for a batch of immutable user IDs. The `POST` method supplies a structured batch request body; it does not create participants, conversations, or accounts.

Require `X-FoC-Service-Secret: <chat-service-secret>`. A browser bearer token is not required.

Request body:

```json
{
  "userIds": [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333"
  ]
}
```

- Require a list of 1-100 UUIDs, applying the size bound before deduplication. Invalid UUIDs or undeclared fields reject the whole request.
- Deduplicate UUIDs while preserving the order of their first occurrence.
- Perform one bounded lookup of the requested IDs. Do not perform one database query per participant.
- Return known users in first-requested order and unknown IDs in a separate `missingUserIds` array, also in requested order.
- Return both active users and retained tombstones. Do not infer that an unknown ID is a deleted account.

Example successful response:

```json
{
  "items": [
    {
      "userId": "11111111-1111-4111-8111-111111111111",
      "displayName": "Alex",
      "username": "alex_ng",
      "accountStatus": "ACTIVE"
    },
    {
      "userId": "22222222-2222-4222-8222-222222222222",
      "displayName": "Deleted User",
      "username": null,
      "accountStatus": "DELETED"
    }
  ],
  "missingUserIds": [
    "33333333-3333-4333-8333-333333333333"
  ]
}
```

Each known-user item contains exactly `userId`, `displayName`, `username`, and `accountStatus`. Resolve the current display name from User Service's data on every request, including after profile edits. For tombstones, explicitly return `Deleted User` and a null username.

Return `200` for valid mixed or all-unknown batches. A missing ID is a lookup result, not a whole-request `404`. The response is identity/status data as observed during that request; Chat Service remains responsible for fresh checks before message acceptance and live forwarding.

### Failure contract

| Condition | HTTP status and behaviour |
|---|---|
| Missing, unconfigured, or invalid Chat Service identity | `401`, existing error envelope with `INVALID_SERVICE_IDENTITY`. |
| Missing or invalid search bearer token, expired/revoked/idle session, deleted caller, or stale role version | `401`, existing authentication error behaviour. |
| Missing/invalid query, invalid limit/cursor, empty/oversized batch, invalid UUID, or extra field | `422 VALIDATION_ERROR`, with safe field errors. |
| Search has no matches | `200`, empty page. |
| Valid batch contains unknown IDs | `200`, explicit `missingUserIds`. |
| Database is unavailable | `503`, existing service-readiness error envelope; never fabricate an empty search or treat all IDs as missing. |

Error messages, validation output, and logs must not echo tokens, secrets, raw unexpected-field values, or private account data. Log correlation ID, operation name, result counts, status, and duration rather than full request/response payloads.

## Incremental implementation phases

Follow the User Service instructions: implement one phase at a time, finish its tests and human check, and obtain the user's review before committing that phase. This documentation change does not begin any implementation phase or create a commit.

### Phase 0 - Contracts and dedicated Chat Service identity

- Add strict request/response DTOs and configuration for the dedicated Chat Service secret. Keep it optional for existing User Service startup but mandatory for successful chat-interface access.
- Add a separate internal chat router and identity dependency, preserving Supplier Service authorization behaviour and current authentication rules.
- Document exact request/response examples, caller authentication requirements, pagination, batch limits, error handling, and safe setup placeholders.
- Test secret absence/mismatch, dedicated-secret isolation, configuration redaction, and strict DTO validation before exposing completed lookup handlers.

**Human check:** the new interfaces require a correctly configured Chat Service identity; a Supplier Service secret or an ordinary bearer token alone cannot grant access. Existing User Service and Supplier authorization flows still work.

### Phase 1 - Caller-authorized partial username search

- Implement the search handler using current-session validation and the existing normalized username rules.
- Add literal substring matching, active-account/caller filtering, deterministic keyset pagination, and the minimal response projection.
- Test case-insensitive middle-of-name matching, literal wildcard characters, query/cursor validation, complete page traversal, and active callers of every system role.
- Cover expired, revoked, idle, deleted-caller, and stale-role-version rejection against the existing authentication behaviour.

**Human check:** through the internal contract, find all users matching a username fragment across pages. Confirm the caller and deleted users are absent, display-name/email-only matches are absent, and results contain only IDs and usernames.

### Phase 2 - Current participant identity and tombstone lookup

- Implement the service-authenticated batch handler with bounded input, UUID validation, ordered deduplication, one database lookup, strict projection, and explicit missing-ID results.
- Return current display names, original active usernames, and tombstone labels without requiring a browser session for background calls.
- Cover duplicate display names, profile edits, deletion, identifier reuse, mixed batches, all-unknown batches, and invalid/oversized input.

**Human check:** look up an active account, a deleted account, and an unknown UUID in one request. Change the active display name and observe the next lookup return it. Register a new account using a released username and confirm the old ID still resolves only to its tombstone.

### Phase 3 - Regression verification and Chat Service handoff

- Run unit/ASGI tests and real PostgreSQL integration tests. Rebuild the isolated test database from the existing Supabase migrations and confirm no new schema history is needed.
- Re-run relevant existing authentication, profile/tombstone, Supplier authorization, configuration, and redaction coverage.
- Supply the Chat Service owner with the finalized versioned contract, sample payloads, internal base URL/configuration requirements, errors, and a reproducible safe demo. Deliver service secrets through the established secret channel, never through the document or source control.
- Verify the Chat Service contract expectations against these interfaces; production completion must not depend on mocked identity data.
- Record query timings and batch sizes as a baseline without claiming Sprint 4 chat load/performance compliance.

**Human check:** demonstrate search and participant lookup against a running User Service with real test accounts, then show Chat Service can resolve a conversation counterpart's current display name, `@username`, and deleted status through these contracts.

## Acceptance mapping and test evidence

User Service supplies identity capabilities for the following Chat Service requirements. Full messaging, privacy, history, delivery, and UI acceptance remain the responsibility of Chat Service.

| Chat requirement or agreed behaviour | User Service contribution |
|---|---|
| `N1F1.1.1` - partial username search | Active-user, username-only, case-insensitive literal substring search with complete paginated access. |
| `N1F1.1.2` - start/reopen from a search result | Stable user IDs suitable for Chat Service's unique user-pair conversation logic. |
| `N1F1.2.3` and the display-name amendment | Current display name and username for the primary name and smaller `@<username>` label. |
| `N1F1.6.1`-`N1F1.6.2` - retained deleted-user history | Stable tombstone identity and `Deleted User` label; Chat Service retains and reopens the history. |
| `N1F1.6.3` - exclude deleted users from discovery | Active-account filtering in search. |
| `N1F1.6.4`-`N1F1.6.5` - reject new interaction with deleted users | Authoritative `ACTIVE`/`DELETED` or missing-ID lookup results for Chat Service's decisions. |
| `N1NFR3.1` - short search-to-send flow | A directly usable discovery contract; action-count and UI validation remain with Chat Service. |

Required verification includes:

- Missing/wrong/unconfigured service secret, Supplier secret isolation, and a valid bearer token without service identity.
- Search with missing, expired, revoked, idle, deleted-caller, and stale-role-version sessions; valid `USER`, `ADMIN`, and `SUPER_ADMIN` callers.
- Search by exact, prefix, middle, and case-varied username fragments; literal `%` and `_`; no matching by email or display name.
- Empty, invalid, and overlong queries; limit boundaries; malformed cursors; mismatched-query cursors; page traversal with no duplicates in a stable dataset.
- Removal of a deleted account from discovery, including deletion between continuation requests.
- Batch sizes 0, 1, 100, and 101; invalid UUIDs; duplicate IDs; preserved input order; mixed known/missing IDs; all-unknown results.
- Current display-name changes, duplicate display names, active usernames, deleted users with null usernames, and released-username reuse under a new ID.
- Exact response field allow-lists and no leakage of emails, roles, sessions, credentials, tokens, secrets, or former tombstone identifiers in results/errors/logs.
- Database failure produces a service error rather than a false empty/missing result.
- Participant lookup does not alter identity data, create records, send events, or depend on a browser bearer token.
- Existing User Service API, JWKS, Supplier authorization, and registration-event regression checks pass.

No chat UI, conversation database, RabbitMQ delivery, typing indicators, first-contact requests, reporting, errand integration, or formal Sprint 4 scale certification is implemented by this User Service interface plan.
