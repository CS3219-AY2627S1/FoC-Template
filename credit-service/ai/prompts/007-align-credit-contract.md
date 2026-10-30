<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-20 (Asia/Singapore).
Scope: Archived the human's contract/schema alignment request verbatim and key assistant responses.
-->

# Prompt archive — 007

Received 2026-10-20 (Asia/Singapore).

## Exact request

```text
We need to ensure that the shared contract in /FoC/shared/grpc/proto/credit.proto matches our schema, so to match the contract change requestor_id to requester_id, change transferred to SETTLED. for the rest, please update the contract to match our schema
```

## Key assistant response (verbatim)

I’ll compare the credit proto with the schema, rename `requestor_id` to `requester_id`, and update the reservation status to `SETTLED`. Then I’ll align the remaining existing message fields, regenerate the types, check the affected builds and tests, and log the changes.

## Assistant clarification questions (verbatim)

1. Should all reservation status values in PostgreSQL match the existing proto enum—RESERVED, RELEASED, SETTLED—or should only transferred become SETTLED while reserved/released stay lowercase? The first option gives the database and contract identical values; this casing decision needs to come from you.
2. I can align the existing four RPCs by using credit_amount, adding total_credits to Balance, adding reservation_id/version/timestamps to Reservation, and adding caller-supplied idempotency_key to the three mutation requests. Is that the contract scope you intend? New initialization/update/history RPCs would need your finalized request/response definitions first.

The human answered these questions in [exchange 008](008-status-casing-and-rpc-scope.md)
while this implementation was in progress. Migration 002 had already been applied
with the explicitly requested terminal rename and the existing lowercase values;
migration 003 implements the subsequent uppercase confirmation.
