<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-21 (Asia/Singapore).
Scope: Archived the exact human-finalized REST/bookmark wire definitions and key implementation response.
-->

# Prompt archive — 022

The exact clarification question is recorded in
[exchange 021](021-history-and-authentication.md#follow-up-clarification-verbatim).

## Exact user answer

```text
Paths: GET /credits/me/balance and GET /credits/me/history to mirror user service

Query parameters: pageSize and pageToken, both optional

JSON naming: camelCase, matching User Service’s profile fields and Order’s documented fields. IDs are strings, timestamps are ISO UTC strings, credits are integers, and optional fields are null, as in Order. Errors use { error, message }, as in User Service’s authenticate middleware

Balance response: userId, totalCredits, reservedCredits, availableCredits

History response: entries and nextPageToken, which is null when there is no next page

let's just include sequence_id as a decimal string first, cld help debugging and tests

for bookmark can use JSON object with named fields, userId and sequenceId, with sequence as decimal string. decode the token, then require exactly those two keys, serId must equal the caller, sequenceId must be digits only, with no leading zero, and fit a signed 64-bit integer.
```

## Key assistant response (verbatim)

I’ll use those REST paths and camelCase responses, with `null` for the final page token. I’ll add the strict bookmark checks, connect both routes to the JWT subject, and test that users—including admins—can only read their own data.

## Key outputs

Implemented CreditService.getUserCreditHistory, exact userId/sequenceId base64url
bookmarks, strict scope/shape/positive signed-bigint validation, default 50/max 100
rows, limit+1 queries, and null final token. Implemented GET /credits/me/balance
and GET /credits/me/history with the RS256 subject as the only user selector,
camelCase fields, ISO UTC timestamps, decimal sequence IDs, nullable links and
error/message objects. Connected REST startup/shutdown and read-only public-key
mounting in local Docker. No User Service or RabbitMQ startup implementation added.
