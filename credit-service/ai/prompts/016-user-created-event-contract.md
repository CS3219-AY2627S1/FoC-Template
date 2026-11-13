<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-20 (Asia/Singapore).
Scope: Archived the human's finalized event initialization scope/delivery rules verbatim and recorded bounded integration questions.
-->

# Prompt archive — 016

## Exact user prompt

```text
communication between user service and credit service:
transport and contract: we can use rabbitMQ through shared messaging package that is currently being implemented in PR 57, payload has four fields: type “user.created”, eventId, occurredAt and userId, can be verified from the user service implementation. user service will publish a userCreated event that we listen to and do the allocation on our end.
delivery behaviour: publication should happen once the user is registered, that is not our concern, we do the allocation when the event is published. we acknowledge only when our transaction commits or after confirming the grant already exists. a database or lock failure is retried by the shared client i proposed before up to its limit. for recovery, user service shd try publishing on their side again. we just need to ensure idempotency and that even if multiple events are published for the same user, we only fulfill it once for allcoation.
scope: this shd replace the entire initcredits rpc, the whole point is to reduce coupling between services, and allocation only happens at registration. it is user service's responsibility to distinguish this from future restoration, on our side we ensure that we check with userID to ensure that allocation happens only once, even if the userCreated event is actually published after retoration. For now, user.created means a new userId and gets 10 credits exactly once per userId.

is there anything else u need from me?
```

## Key assistant responses (verbatim)

I’ll check PR 57 and the User Service publisher against these decisions, then identify any remaining details needed for the consumer.

At PR 57’s current commit, the shared client acknowledges when the handler returns and retries thrown failures three times by default before dead-lettering. I couldn’t find a `user.created` contract, queue, or publisher there. I’ll also remove `InitCredits` from the gRPC contract, as you’ve now confirmed.

## Clarification questions (verbatim)

1. Which branch/file contains User Service’s user.created publisher, and what exact queue does it publish to? I inspected PR 57 at b8b924d; it currently has no user.created contract/queue/publisher, so I cannot verify those integration details yet.
2. For an existing credit account with no initial-grant history or saved allocation result, how should the event consumer finish? Your previous RPC rule returned ALREADY_EXISTS without changes; the new rule acknowledges only after commit or confirmation that the grant already exists. Please define how this inconsistent-account case is handled.

## Inspected source

Fetched [PR 57](https://github.com/AY2627S1-CS3219-P22/FoC/pull/57) without checkout
or merge; inspected commit `b8b924db95a60a36f9bc6b8c1880bf5ae96fb939`:
shared/messaging/src/index.ts, topology.ts, contracts/credit.ts, README.md, and
user-service/src/services/userService.ts. Git tree/grep inspection found no
user.created contract or publisher in shared/ or user-service/ at that commit.
The local branch also contains no shared/messaging package or user.created publisher.

The current shared client acknowledges after handler resolution; rejected
handlers are republished with an incremented retry header and then dead-lettered
after the configured limit (default MAX_RETRIES = 3). Invalid JSON is dead-lettered.
The event queue/publisher details therefore remain for the human to supply.
