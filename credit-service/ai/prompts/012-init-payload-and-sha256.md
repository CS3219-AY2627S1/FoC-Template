<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-20 (Asia/Singapore).
Scope: Archived the human's SHA-256 confirmation, initialization replay outcome, and exact payload verbatim, with the implementation response.
-->

# Prompt archive — 012

Received 2026-10-20 (Asia/Singapore), as answers to the questions recorded in
[exchange 011](011-init-outcomes-and-deterministic-keys.md).

## Exact answer — hash algorithm

```text
yes SHA-256 sorry
```

## Exact answer — duplicate initialization and payload

```text
we can just keep the general replay rule, it should return the original saved success without granting again. 

InitCredits payload: user_id, total_credits, reserved_credits, available_credits
```

## Key assistant response (verbatim)

I’ll add `InitCredits` with the four-field response you specified, regenerate the types, and add its client wrapper and unimplemented handler. I’ll also record SHA-256 and the rule that duplicate calls replay the saved success without granting again.
