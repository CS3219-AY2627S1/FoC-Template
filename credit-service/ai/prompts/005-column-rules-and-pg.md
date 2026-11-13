<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-20 (Asia/Singapore).
Scope: Archived human-supplied column rules and the JSON attribution exception verbatim; recorded key responses and remaining questions.
-->

# Prompt archive — 005

Received 2026-10-20 (Asia/Singapore), as answers to the three questions recorded
in [exchange 004](004-schema-decisions.md).

## Exact answer — user IDs and relationships

```text
text is final for user_id, orders table should not exist in credit database, order_id should be obtained from order service when they call the methods we have exposed to them as API, reservations( requestor_id is text, courier_id is text and defaults to null as it is only populated when order service confirms that the order is completed and calls on us with the courierid to transfer the credits to the courier, both reference accounts), credit_history (user_id is FK referenced from accounts, reservation_id is FK references from reservations, order_id is not an FK sorry, we just populate it with the orderID given to us by order service)
```

## Exact answer — nullability, types, and allowed values

```text
for accounts (no columns should be null), reservations (only courier_id is allowed to be null), idempotency_records (no columns should be null), history (order_id can be null and reservation_id can also be null as we also record initial allocations to users that are not associated with an order or reservation), credit_history should also have total_amount and reserved_amount integer attributes, timestamp should be with time zone

check (total_credits >= 0), (reserved_credits >= 0), (reserved_credits <= total_credits)

status and type fields are restricted for this first migration, here are the values: 
reservation.status: reserved, released, transferred
history.type: init_credits, reserve, update, release, transfer
idempotency_records.type: init_credits, reserve, update, release, transfer, (and then later on archive and restore but can we ignore this for now until user service implements them?)
```

## Exact answer — JSON attribution exception

```text
yes you can do that
```

This answer approves the prior question's explicit exception: attribute the
credit workspace `package.json` and root `package-lock.json` in
`credit-service/README.md` and the service usage log because JSON does not
support comments. It is not a claim that the human reviewed generated code.

## Key assistant response (verbatim)

I’ll use your confirmed types, nullability, status values, and foreign-key relationships for the first migration, with archival still deferred. I’ll also record JSON-file attribution in the README and usage log as you approved. I’ll check the remaining defaults and naming details before applying SQL.

## Assistant clarification questions (verbatim)

1. One history-field detail remains: should credit_history have amount as well as total_amount and reserved_amount? If amount stays, what is its SQL type? You specified the two new fields as integers, but the earlier amount field is still ambiguous.
2. I’ll retain your previously specified column names requester_id and operation_type; your latest reply uses requestor_id and idempotency_records.type. Did you intend either spelling as an actual column rename? Also, no defaults were specified: please confirm that required values (IDs, timestamps, balances and version) will be supplied by application code for this first migration, or provide the defaults you want.
