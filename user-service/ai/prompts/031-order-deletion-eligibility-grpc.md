<!--
AI Assistance Disclosure:
Tool: OpenAI Codex, 2026-11-02 (Asia/Singapore).
Scope: Formatted the author's prompt into this archive file.
-->

# Prompt archive: 031

Received 2026-11-02 (Asia/Singapore).

## Prompt 1

```text
remember we had the grpc stub for checkDeletionEligibility? we need to implement that endpoint in orderService so that it is no longer stubbed. The idea is like this:

a user is blocked if, as requester or courier, they have any remaining orders that is:

- active -> aka unassigned, assigned, picked up, or
- has credits that aren't settled or refunded yet (reserved, settlement pending, or refund pending or anything of that sort)

takes in userId and

it should return

bool eligible, and int blockedOrderCount

to user-service.

if user_id is missing --> say invalid argument

if database failure --> 500 internal error
```
