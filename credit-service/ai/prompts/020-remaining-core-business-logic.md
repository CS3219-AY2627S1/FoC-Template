<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-20 (Asia/Singapore).
Scope: Archived the exact core-logic request and bounded clarification questions; integration ownership is human-specified.
-->

# Prompt archive — 020

## Exact user prompt

```text
we can leave the rabbitMQ startup wiring and user service implementation to my team members, i just need to implement the credit logic on my side, let's implement the rest of our core business logic now
```

## Key assistant response (verbatim)

I’ll leave RabbitMQ startup and User Service integration to your teammates. I’ll review the remaining credit operations against your recorded rules, implement what’s finalized, and flag any behaviour that still needs your decision.

## Clarification questions (verbatim)

1. Before I write the remaining history rows, please give the final complete history.type list. INITIAL_GRANT is confirmed; the current SQL still uses reserve/update/release/transfer, while your later flow names RELEASED, TRANSFER_OUT and TRANSFER_IN. What exact names should reserve and update use, and should I now migrate release/transfer to those later names?
2. History pagination still needs your finalized cursor/snapshot definition: the schema has UUID id and created_at, but the repository sketch used beforeSequenceId. How should tokens encode the page boundary and exclude rows added after page one, including transactions that commit later? I can implement the other balance/reservation rules while you decide.
3. For ReserveCredits only when its saved retry record is missing: should a matching existing reservation return its current state for all statuses, or only RESERVED? Also, please confirm order IDs must be UUIDs to match their existing SQL type. This leaves the schema unchanged and lets invalid IDs fail before opening a transaction.
4. For the gRPC controller, what authenticates service identity, which services may call the two history RPCs, and what trailing-metadata key/reason strings should errors use? Only VERSION_CONFLICT is named so far. These are still needed to connect business methods to the protected RPC handlers; I will implement the service/repository independently meanwhile.
