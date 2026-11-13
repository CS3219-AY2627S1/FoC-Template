<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-20 (Asia/Singapore).
Scope: Archived the exact user replies and recorded credit-side callback implementation and unresolved delivery/transaction definitions.
-->

# Prompt archive — 017

## Exact user reply — publisher not implemented

```text
has not been implemented yet, we should just assume it and implement on our side first
```

## Exact user reply — inconsistent account

```text
Finish it as a permanent failure with no writes. dint acknowledge it as a success. what I said earlier about acknowledging with a log only holds when the grant is confirmed.
```

## Key assistant response (verbatim)

The shared client currently retries every thrown handler error; it has no separate permanent-error path. I’ve asked whether you want this case dead-lettered immediately or after the existing retry limit. Meanwhile, I’ll implement and test the handler against your existing `initCredits({ userId })` service method, keeping the allocation transaction pending the history-type and lock definitions.

## Clarification questions (verbatim)

1. PR 57’s current client retries every thrown handler error and only then dead-letters it; it has no permanent-error hook. For this account inconsistency, should it go directly to the dead-letter queue, or follow the existing bounded retry-then-dead-letter path? The handler will never return success for it.
2. Two earlier definitions still block the allocation transaction itself: should initial-grant history use the existing SQL value init_credits, or your later INITIAL_GRANT name? Also, what concrete SQL mechanism/key mapping should implement the retry-key and absent-account locks? Your assignment rules reserve these choices for you; I can implement the consumer callback against your existing initCredits service signature while these are pending.
