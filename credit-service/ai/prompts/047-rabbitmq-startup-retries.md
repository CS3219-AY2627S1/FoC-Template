<!--
AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-30 (Asia/Singapore).
Scope: Archived the RabbitMQ retry request, follow-up, comments and inspection results.
-->

# Prompt archive — 047

## Exact user prompts

```text
i need to implement credit client retries for when rabbitMQ is down, ive left the comments in index.ts for the details
```

```text
check the file again now
```

```text
can call connect() again on same object until it works, then register the consumer once. need to add a new getter API to foc/messaging to see disconnects
```

## Human's saved comments in src/index.ts

```typescript
// should also show later disconnect
// listener down should be info only, don't make /health return 503
// loop needs to check shuttingDown and sleep timer must be cancellable
// keep retrying forever with a cap, 1s doubling to 30s
// reuse rabbitmq client and retry connect()
// log once per attempt with next delay and error message
```

## Key responses and outcomes

- Initial read found no retry comments; the human saved them and asked for a reread.
- Confirmed retry/health/shutdown behavior and existing shared reconnect support.
  Asked for reusable-client/status direction under the assignment's interface
  restrictions; the human confirmed reusing connect() and adding a getter.
- Implemented one-client startup retries with 1-second doubling delays capped at
  30 seconds, one initial consumer registration, per-failure message/next-delay
  logs and cancellation on shutdown. Added shared read-only isConnected and wired
  health to live connection/recovery readiness. HTTP status stays database-based.
- Preserved the original broker recovery implementation/authorship. Startup code
  uses it after initial success; shared gRPC retries were not changed.
- Messaging/Credit builds, 108 Credit tests and Credit lint passed. Ten live
  listener test results passed using a dedicated broker and private outage proxy.
  An initial live run exposed a pre-existing asynchronous DLQ visibility race;
  the corrected test waits for delivery and retains exact ID assertions.
- README/disclosures updated, schemas/processes/sockets/test broker cleaned. No
  deployment, dependency/schema change, commit or push. Human review pending.
