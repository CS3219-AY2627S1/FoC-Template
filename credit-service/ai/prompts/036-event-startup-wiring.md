<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-22 (Asia/Singapore).
Scope: Archived the event-startup integration request and bounded clarifications.
-->

# Prompt archive — 036

## Exact user prompt

```text
i modified userCreated.ts and broker.ts according to what the broker implementer sent me, but we still need to set up on index.ts can we do that
```

## Key responses

> I’ll inspect the event helpers you updated, then wire the consumer into `index.ts` startup and shutdown.

> The helpers use `CREDIT_USER_QUEUE` and return a broker client with `close()`, so the entrypoint can use them directly. I’ve added `RABBITMQ_URL` to Credit’s configuration and examples, following the shared package’s convention. I’m waiting on your choices for startup failure behavior and package integration before wiring the lifecycle.

## Exact clarification questions

> Should Credit fail startup if RabbitMQ connection or consumer registration fails, or keep serving its APIs? Your current helper throws on startup failure; I can wire that into the existing startup cleanup.

Options: Fail startup if the consumer cannot start; Keep the APIs running.

> `@foc/messaging` is still absent from this checkout. The local `origin/events/data-validation` branch has the exports your helpers use. Should I bring in just that package and its workspace/dependency wiring, or leave the package merge to your teammate?

Options: Leave the package merge to my teammate; Bring in the messaging package.

## Repository evidence and independent work

Read the human-edited broker/userCreated helpers without changing them. Inspected
local remote-tracking refs only: shared-event-broker, events/data-validation,
and User producer startup/env. The matching validation branch is 0b48f5f85be01d148176a6410c9ca22c2b8e672e.
No branches merged or package copied while the integration decision is pending.

Used the existing shared/User RABBITMQ_URL convention, with the same localhost
5672 default for host execution, and an explicit configurable Docker-host URL
example. Added environment/Compose pass-through and prepared isolated entrypoint
lifecycle tests without database or broker traffic. Dependent lifecycle choices
await the human's answer.

Prepared lifecycle test harness retained temporarily outside the repository at
/tmp/credit-036-startup.test.cjs while awaiting required choices. Updated the
service README to describe the human-edited validation/error helpers. No failing
repository test or dependent index change was left behind. No runtime/build tests
are claimed for the pending integration; scoped whitespace checks passed.

## Exact human answers

Startup behavior:

```text
Keep the APIs running
```

Messaging package integration:

```text
Leave this first, i'm still working out the details
```

Key response:

> I’ll start the APIs independently, then attempt consumer startup and log any failure without stopping them. I’ll also close the broker during shutdown if it connected. I’ll leave the messaging package integration untouched.

## Completed entrypoint wiring

After API readiness, the existing helper is loaded inside the nonfatal consumer
startup attempt and receives the same CreditService plus env.RABBITMQ_URL. Missing
package, connection or registration failures are caught/logged. No reconnect loop
or additional retry policy was chosen. SIGINT/SIGTERM stop APIs, await a pending
startup attempt, close the connected broker, and end the pool even after a broker
close rejection. Duplicate signals do not duplicate cleanup. The human's helpers
were not changed and the messaging package/workspace/dependencies were not merged.

The prepared lifecycle tests were restored into test/startup.test.cjs and expanded
for the confirmed behavior: eight checks passed in isolated child processes with
mocked transport/database/broker boundaries and no real broker traffic. They cover
success, slow connection, rejected connection, missing package, shutdown during
connection, close failure, duplicate signals and API bind failures. Actual-source
startup and affected API regression results are recorded below/in the usage log.

Final verification: all 23 affected API/lifecycle tests passed with zero failures
or skips. Actual source startup with the actual package absent logged consumer
failure while gRPC authentication, REST authentication and PostgreSQL health
remained available. Temporary child/key files cleaned up; no data writes or live
broker traffic. Credit build was attempted and still reports the existing unresolved
messaging imports/implicit-any errors in broker.ts/userCreated.ts only. No package
merge or dependency wiring performed, as requested. Whitespace and modified local
Markdown links checked. Human review remains pending.
