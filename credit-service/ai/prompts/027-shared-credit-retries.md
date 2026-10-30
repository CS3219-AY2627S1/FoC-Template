<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-21 (Asia/Singapore).
Scope: Archived the exact retry implementation request, human-finalized settings, and implementation/check results.
-->

# Prompt archive — 027

## Exact user prompt

```text
i also want to implement shared client retries, lets' set max number of attempts at 3, and for backoff let's do growing, capped and jittered. for deadlines we should cover the whole call including retries, and if an attempt hits deadline exceeded, it should retry only if time remains after the delay. if the client's own deadline expires, then it has to stop. if delay is longer than the time left, skip the retry and return the last error
we can cover all six RPCs, but since Order currently has its own long running retries let's keep the client's retries short
for config 
when retries run out let's return the last error unchanged since Order maps errors by grpc codes
for implementation let's try with our own loop instead of grpc
```

## Key assistant response (verbatim)

I’ll inspect the shared client and Order’s retry handling, then add the loop around all six credit RPCs. I’ll preserve the last error and use one deadline for the whole call. I’ll also check which timing settings still need your decision.

## Clarifications requested (verbatim)

1. What exact backoff settings should I implement: initial delay, growth factor, cap, and jitter formula? Your assignment rules reserve these timing choices for you; “short, growing, capped and jittered” does not specify the values.
2. Should each attempt use all remaining time under the existing timeoutMs/upstream deadline, or also have its own shorter timeout? If you want a per-attempt timeout, please specify it.
3. Your message stops at “for config.” Should attempts/backoff settings be fixed defaults or configurable? If configurable, please specify the client option names and defaults. I’ll retain retries only for UNAVAILABLE, ABORTED and DEADLINE_EXCEEDED unless you change that rule.

## Initial inspection (before the human's answers)

Inspected the shared clients, transport/contract tests, shared and service
documentation, and Order's checked-in sources. The shared Credit client currently
performs one attempt with a finite default timeout and optional upstream deadline.
No longer-running Order retry implementation was found in this checkout; no
claim is made about teammate branches. Implementation and retry tests await the
human's remaining timing/configuration decisions. No runtime changes or tests
were made in this clarification step. Existing user edits were preserved.

## Exact human clarification answers

### Backoff settings

```text
let's try with these settings first and adjust later if needed. total attempts: 3, initial delay: 50 ms, growth factor: 2, cap:500 ms. overall budget of 1.3s with each attempt using the time remaining, jitter of half the base plus a random amount up tp half
```

### Per-attempt timeout

```text
let's first try with each attempt use all remaining time, but if we see hangs, we can try with a per-attempt cap then.
```

### Configuration

```text
defaults built in, then optional fields on the client config and optional per-call override
```

## Key implementation response (verbatim)

I’ll implement three attempts with 50 ms initial backoff, growth by 2, a 500 ms cap, and jitter between half and all of each base delay. Credit calls will default to a 1.3-second total budget, with each attempt using the remaining time and earlier upstream deadlines still respected. I’ll add client and per-call overrides, then test retry counts, deadlines, and preservation of the last error.

## Implementation and verification

All six createCreditClient wrappers now use an application loop. The defaults
are timeoutMs=1300, maxAttempts=3, initialDelayMs=50, backoffMultiplier=2 and
maxDelayMs=500. Optional client config fields and per-call fields override these
individually. Other service clients retain their existing behavior. Existing
explicit timeoutMs settings, including createPeerClients configurations, override
the Credit default. No Order source, proto, schema or server behavior changed.

The base is capped before applying base/2 + Math.random()*base/2. Retries reuse
the request and supplied metadata with one absolute deadline. The last error is
thrown unchanged on exhaustion, a non-retryable code, insufficient delay budget,
or expiration after waiting. An already expired upstream deadline starts no
transport attempt and returns DEADLINE_EXCEEDED. There is no per-attempt cap.

Full workspace build passed. All 51 shared checks passed, including 43 new retry
checks, and all 74 credit checks passed against local PostgreSQL and temporary
API listeners, with no failures/skips in the completed runs. The initial sandbox
run passed 42 deterministic checks but could not bind the real gRPC listener
(EPERM); the authorized local-listener rerun passed that check and the existing
suite. Tests verify all six wrappers, the three retryable statuses, non-retryable
statuses, exact error identity/trailers, defaults and partial overrides, growth,
cap/jitter boundaries, expired/upstream/shared deadlines, skipped waits, late
timers, and real transport metadata/request/error preservation. Diff whitespace
checks passed. No new dependencies, external sources, copied implementation,
skill, delegation, commit, push, or deployment. Human review remains pending.
