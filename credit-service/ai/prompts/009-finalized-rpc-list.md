<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-20 (Asia/Singapore).
Scope: Archived the human's decided RPC list verbatim and the key response/clarification questions.
-->

# Prompt archive — 009

Received 2026-10-20 (Asia/Singapore).

## Exact request

```text
this is the shared contract we have decided on

InitCredits takes user_id
GetBalance takes userId, returns total, reserved, and available credits
GetUserCreditHistory takes userId, optional pageSize, pageToken and returns newest-first, paginated history 
GetOrderCreditHistory takes orderId, optional pageSize, pageToken and returns newest-first, paginated history 
ReserveCredits takes orderId, requesterId, amount 
UpdateReservation takes orderId, amount, expectedVersion 
ReleaseCredits takes orderId, releases an active hold without increasing total credits
SettleCredits takes orderId, courierId and transfers the held amount from requester to courier 
GetReservation takes orderId and returns the reservation's current status, amount, and version (read-only)
```

## Key assistant response (verbatim)

I’ll compare this specification with the current proto and add the finalized RPCs and fields. I’ll leave the handlers unimplemented and log the exchange. I’ll also check for any request or response details that still need your decision.

## Assistant clarification questions (verbatim)

1. Please finish the response definitions so I can encode your contract without choosing interfaces: (1) What does InitCredits return? (2) Do ReserveCredits, UpdateReservation, ReleaseCredits and SettleCredits return the existing Reservation message? (3) Does GetReservation return that full message or exactly status, amount and version? (4) For the two history RPCs, what are the response list/token field names, and which fields should each history entry include?
2. Your finalized signatures omit the existing idempotency_key. Should it remain in mutation request bodies, including InitCredits and UpdateReservation, or does your new contract change how callers supply it? Also, should GetBalance keep user_id/timestamps alongside its three credit balances, or return exactly the three balances?
