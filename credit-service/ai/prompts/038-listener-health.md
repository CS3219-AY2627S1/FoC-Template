<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-22 (Asia/Singapore).
Scope: Archived the bounded health-extension request, inspection and clarification.
-->

# Prompt archive — 038

## Exact user prompt

```text
can we have /health report the listener as well as the database?
```

## Key responses

> I’ll check what listener status the shared broker exposes, then confirm the health response behavior with you before changing the endpoint.

> The copied broker exposes no live listener status. Credit can track whether startup completed, but detecting a later disconnect or consumer cancellation needs support from the shared package. I’ve asked which behavior you want, along with the `/health` HTTP status rule.

## Exact clarification questions

> Should listener health report only whether startup succeeded, or also detect later disconnects and consumer cancellation? The copied broker package currently exposes no live listener-status API.

Options: Detect disconnects and cancellation too; Report startup success only.

> Should the response add `listener: "up" | "down"`, with HTTP 200/status "ok" only when both database and listener are up, and HTTP 503/status "degraded" otherwise?

Options: Yes, 503 if either is down; Keep HTTP status based on database only.

## Inspection

Current REST health uses the DB probe only. Entrypoint startup is intentionally
nonfatal for the consumer. Shared RabbitMQClient has private connection/channel
fields and no public status method or consumer-status events. Its cancellation
callback currently receives null and returns without maintaining health state.
Inspected the installed amqplib types/event forwarding source to confirm close,
error and cancellation notifications exist at the underlying transport layer.
No source/public API changes or runtime tests performed while the human choices
are pending. Used local source and root AGENTS.md; no external source or package
changes. Human review pending.

## Exact human answers

Listener scope:

```text
Report startup success only
```

HTTP status rule:

```text
Keep HTTP status based on database only
```

Key response:

> I’ll add `listener: "up" | "down"` based on consumer startup success, while keeping the HTTP code and overall `status` based on the database. I’ll document that this won’t detect a later disconnect.

## Implementation and actual verification

Added a listener-startup callback to REST health and a flag in the entrypoint.
The flag is down while startup is pending/failed and during explicit shutdown;
it becomes up when startUserEventConsumer resolves, unless shutdown has begun.
No shared broker source or live-state hooks changed. Both HTTP status and overall
status remain database-based, so db up/listener down returns 200/status ok.

Health tests cover all four DB/listener combinations, token-free/invalid-token
access, and unsupported method behavior. Lifecycle tests check pending, successful,
failed and late-during-shutdown flags. Updated the live listener integration health
assertion, service README, local ignored Postman health assertion/README and
consolidated disclosures.

Full workspace build and all 94 Credit tests passed, with zero failures/skips.
Actual source startup with an unreachable test broker returned 200 with db up
and listener down while protected APIs behaved normally. Dedicated RabbitMQ/
PostgreSQL live tests passed six scenarios/seven Node results and confirmed
health 200/db up/listener up after real consumer startup. Temporary child/schema/
synthetic rows/key/log files were cleaned up. The owned test broker/volume cleanup
is recorded in the usage log. Existing Credit/Postgres services were not replaced.

Postman REST collection lint passed; all 103 regenerated scripts parse. No new
native Postman run claimed. Shared source remains unchanged from the credited
upstream package. Scoped whitespace/local documentation links checked. No new
dependencies, external sources, skill, agent, commit, push or deployment. Human
review pending; runtime startup status is explicitly not live connection health.
