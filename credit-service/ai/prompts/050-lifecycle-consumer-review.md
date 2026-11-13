<!--
AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-06 (Asia/Singapore).
Scope: Archived exact lifecycle-consumer review requests and actual outcomes.
-->

# Prompt archive — 050

## Exact user prompt

```text
# Context from my IDE setup:

## Open tabs:
- outboxStore.ts: user-service/src/events/outboxStore.ts
- userEvents.ts: credit-service/src/events/userEvents.ts
- README.md: credit-service/README.md
- initial-allocation.test.cjs: credit-service/test/initial-allocation.test.cjs
- user-created.test.cjs: credit-service/test/user-created.test.cjs

## My request:
Ok the user service schema has been updated and i integrated the consumer, can you please check that everything works and update the README to reflect the changes. 

Also, do not add the headers like you have been doing, all you are supposed to do is edit the existing header of a file you have changed, so update the date, the scope and the prompt numbers.
```

## Exact follow-up prompt — no additional tests

```text
# Context from my IDE setup:

## Active file: user-service/src/events/outboxStore.ts

## Open tabs:
- outboxStore.ts: user-service/src/events/outboxStore.ts
- userEvents.ts: credit-service/src/events/userEvents.ts
- README.md: credit-service/README.md
- initial-allocation.test.cjs: credit-service/test/initial-allocation.test.cjs
- user-created.test.cjs: credit-service/test/user-created.test.cjs

## My request:
No, you don't need to add tests for the new integration
```

## Exact follow-up prompt — missing archive

```text
# Context from my IDE setup:

## Active file: user-service/src/events/outboxStore.ts

## Open tabs:
- outboxStore.ts: user-service/src/events/outboxStore.ts
- 049-user-lifecycle.md: credit-service/ai/prompts/049-user-lifecycle.md
- usage-log.md: credit-service/ai/usage-log.md
- userEvents.ts: credit-service/src/events/userEvents.ts
- broker.ts: credit-service/src/events/broker.ts

## My request:
you didn't add prompt 050 and link it inside usage-log.md
```

## Key responses and outcomes

- Reviewed the human-integrated consumer and updated shared User schemas.
- Corrected deletion/restoration handler logs to contain only eventId; kept
  the creation success log and existing retry/error mapping behavior.
- Updated README for all three User events, lifecycle behavior, migrations
  010/011, inactive/missing REST accounts and actual verification.
- Added no test files or cases, following the human's correction.
- Existing checks passed: 126 Credit results and 10 live-listener results,
  zero failures/skips, Messaging/Credit builds and Credit ESLint. Tests used
  isolated PostgreSQL 17 and RabbitMQ 3.13 containers, which were removed afterward.
  The live suite covers registration, retries and recovery; lifecycle delivery
  was reviewed directly and existing service tests cover lifecycle operations.
- At 11:07 SGT on 2026-11-06, added this missing standalone archive and linked
  it from usage-log entry 050. Moved the inline follow-up prompt here and
  retained the log's detailed outcomes. This archive correction changes only
  documentation; no tests were rerun. Application/source edits made since the
  previous verification were left untouched.
- Human review remains pending for these archive corrections.
