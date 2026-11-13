<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-20 (Asia/Singapore).
Scope: Archived the human's initialization, history page, and deterministic-key decisions verbatim, with key response and remaining clarification questions.
-->

# Prompt archive — 011

Received 2026-10-20 (Asia/Singapore), as answers to the questions recorded in
[exchange 010](010-response-shapes-and-internal-keys.md).

## Exact answer — initialization outcomes and history pages

```text
[1] InitCredits return payload should indicate whether the allocation was a success, and if not, retry if it was due to a service failure or indicate that the allocation could no go through because user is already allocated. we need to account for the scenarios where user is successfully registered by user service but credit account creation or credits allocation fails or is delayed, and must also prevent repeated initial allocation requests to go through. in the future, after we implement archival, we also have to ensure that at restoration, credits are not allocated again, InitCredits is strictly a one-time thing at the first point of a user's registration.

[2] both history page response fields should return the same page message and the same entry message since they read from the same history table. should be entries and next_page_token
```

## Exact answer — deterministic idempotency key flow

```text
the key is not random and is never stored for later reuse. Credit Service recomputes it from the request every time, the same request always yields the same key, so a retry hits the same record

for each call, we can compute a SHA-26 of the request fields, take a lock on (operation_type, key) and look up an existing record. if a record exists with the same hash, we return the original response (but i'm not sure how to deal with if the state has changed since then), if a record exists with a different hash, we reject it, if there is no record, go ahead with the operation and save the record atomically
```

## Key assistant response (verbatim)

I’ll add the shared history page response with `entries` and `next_page_token`, and record the initialization and deterministic-key rules.

Under your stated “return the original response” rule, a retry returns the saved result even if the reservation has since changed. `GetReservation` returns its current state.

I’ll confirm the hash name and initialization result format before encoding those details.

## Assistant clarification questions (verbatim)

1. Did you mean SHA-256 when you wrote SHA-26? I’ll record your deterministic-key/locking flow now and leave hash implementation pending that confirmation.
2. The InitCredits behavior is clear; please give its exact payload field names/types and values for success, already allocated, and retryable service failure, plus any gRPC failure codes you want. Also, should a duplicate InitCredits return the original saved success without granting again, or an already-allocated result? The latter differs from the general original-response replay rule.

## Explanation of the human-specified replay rule

Returning the original saved response describes the result of that earlier
operation. If a reservation has since changed, a matching retry still returns
that saved response under the human's stated rule; the already-decided
`GetReservation` read returns current state once implemented. Original-response
replay is also documented in [Stripe API v1](https://docs.stripe.com/api/idempotent_requests).
This citation supports that explanation only; no Stripe key-generation,
retention, error-caching, or other policies were adopted for this project.
