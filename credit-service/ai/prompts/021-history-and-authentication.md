<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-21 (Asia/Singapore).
Scope: Archived exact human clarifications and key implementation responses; no design rationale generated.
-->

# Prompt archive — 021

The four questions answered below are archived verbatim in
[exchange 020](020-remaining-core-business-logic.md#clarification-questions-verbatim).
Answers are recorded in their original order. The history update label's spelling
is retained exactly.

## Exact user answer 1

```text
reserve becomes RESERVED and update becomes RESERVARTION_UPDATED. Yes, migrate release and transfer to the later names now, in one migration that renames everything, including init_credits to INITIAL_GRANT. All of it goes in one new migration, which replaces the type check with the new list. The same migration adds the sequence_id column and its indexes, plus a partial unique index so a user can have only one INITIAL_GRANT. 

i also have to make a change to the history methods, we don't need getOrderCreditHistory anymore. we only need getUserCreditHistory which is to be accessed by the frontend service only. so we can remove the “order” variant of the paging bookmark and the order-based history index. but the order ID stays on every entry, since F8.2.3 requires it. getUserCreditHistory is the only history method, and it’s only for the frontend.
```

## Exact user answer 2

```text
we can add a sequence_id column to history, a bigint generated always as identity with a unique index plus indexes on (user_id, sequence_id desc) 

token is a base64 url encoding of user id and last sequence id returned
query is a page that takes rows in the scope below the boundary, newest first, fetching one extra row to know whether a next page exists. as mentioned before token with wrong scope or malformation is INVALID_ARGUMENT
Page size defaults to 50 with a maximum of 100
later commits: every history insert for a user happens under the user's account lock, both are held until commit so rows in one scope get sequence numbers in commit order. transaction committing 
created_at becomes display only, so we replace the timestamp then id sort rule, bcs i think timestamps in postgres are now() so when the transaction started, not when it committed right
we can test by writing during paging to confirm
```

## Exact user answer 3

```text
when saved retry record is missing and requester and amount match, return current reservation for every status, make no new writes and save no new entry record, let's just match how normal retries behave
If the requester or amount differs, it is FAILED_PRECONDITION with reason REQUEST_CONFLICT. That includes a retry of the original reserve after the amount was updated

ya order IDs must be UUIDs in lowercase hyphenated form, checked before any transaction, otherwise INVALID_ARGUMENT
```

## Exact user answer 4

```text
for authentication: 
gRPC, between services: the caller sends its own secret in x-credit-service-token metadata. Credit keeps one distinct secret per allowed caller and compares in constant time. Identity comes from the matching secret, never from a name the caller sends. A missing or unknown secret is UNAUTHENTICATED. A known service calling something it isn’t allowed is PERMISSION_DENIED. Only order-service may call, for reserve, update, release, settle, get reservation and balance. TLS is required outside local use

REST, for the frontend on port 3004: balance and user's own history, authenticated by the user’s token. Credit verifies it with User Service’s public key. RS256 only, with a subject present and the token unexpired. The user comes from the token’s subject, so each user reads only their own data, and admins get no extra reach
There is no gRPC history call. GetOrderCreditHistory is removed and user history is REST-only.

for user service we shall only be communciating via published events as established

so now order is credit's only grpc caller

and the rest api is for the frontend

trailing-metadata key is x-credit-error-reason, matching the token header’s style, the values are ACCOUNT_NOT_FOUND, RESERVATION_NOT_FOUND, INSUFFICIENT_CREDITS, VERSION_CONFLICT, INVALID_STATE and REQUEST_CONFLICT
```

## Key assistant responses (verbatim excerpts)

The reservation mutations are implemented, and the PostgreSQL concurrency tests passed for competing reserves, settlement versus release, duplicate retries, and opposing settlements. I’m now checking the history migration and authentication. The REST paths and bookmark encoding are still awaiting your earlier clarification.

Authentication checks passed: all six gRPC methods reject unauthenticated calls before business logic, and business errors preserve the agreed reason trailers. The history tests also passed for bigint precision, writes between pages, and commits that occur after page one. I’m applying migration 006 locally and updating the container configuration and disclosures.

## Follow-up clarification (verbatim)

Please finalize the REST wire details: the two GET paths, page-size/token query parameter names, and JSON response field naming (camelCase or snake_case). Should sequence_id be included in history entries as a decimal string? Also specify whether the base64url bookmark contains a JSON array [userId, lastSequenceId] or an object with named fields. These are the remaining public-interface details; I can implement the finalized SQL and credit transitions meanwhile.

The human's exact answer and implementation are recorded in
[exchange 022](022-rest-wire-details.md).
