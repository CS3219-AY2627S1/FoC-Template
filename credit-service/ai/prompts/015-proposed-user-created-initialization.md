<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-20 (Asia/Singapore).
Scope: Archived the human's proposed event-triggered initialization change verbatim and recorded the clarification response.
-->

# Prompt archive — 015

## Exact user prompt

```text
instead of InitCredits, I have discussed with UserService and we are considering a events based workflow instead, where user service publishes a userCreated event, and then we initialise a credit account and allocate 10 credits from there
```

## Key assistant response (verbatim)

Under that proposed workflow, `userCreated` becomes the trigger for account initialization. The existing rules still apply: allocate 10 credits once, write the account/history/retry result atomically, and avoid another grant on duplicate processing.

Before implementation, you and User Service need to finalize:

- **Transport and contract:** broker/channel, exact event payload, and how the event and user are identified.
- **Delivery behaviour:** when publication happens relative to registration, acknowledgment timing, retries, and recovery when publication or processing fails.
- **Scope:** whether this replaces the `InitCredits` RPC entirely, and how first registration is distinguished from future restoration.

Your existing `GetBalance → NOT_FOUND` behaviour covers the period before the credit account has been initialized; it still must not create an account.

I’ve recorded this as a **proposal** in the [credit-service usage log](/FoC/credit-service/ai/usage-log.md). Implementation and contract changes remain pending your finalized event design.
