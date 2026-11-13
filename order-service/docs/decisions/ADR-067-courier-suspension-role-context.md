# ADR-067 - Courier suspension is an acceptance restriction

Date: 2026-11-04. Status: user-approved behavior, implementation verification in CHANGE-179.

## Context and decision

User explicitly chooses User Service role-context with retained courier role and `isCourierSuspended`. A suspended courier must finish assigned work but must not acquire new errands. Previously removing the role blocked existing transitions; the Order adapter also called courier-eligibility for every courier operation, and the UI converted a forbidden acceptance into pending authorization.

Use the existing synchronous authenticated role-context response for roles and suspension. Bind to verified JWT subject, preserve all existing role checks, and carry the verified flag separately from roles in request authentication. Normal production requests query once and reuse only within that request. New requests refresh the context. No token or global cross-request suspension cache is introduced.

`verifyCourier` verifies identity/role for existing work. An explicit `requireCourierAcceptance` checks suspension on new ACCEPT only. Missing/null flag never defaults to acceptance permission. A completed command is a replay, not a new task; durable uncertain effects retain existing reversal/compensation protection. Domain ownership/version/lifecycle and report funding holds continue unchanged.

## Alternatives

- Keep removing courier role and broaden existing-operation role guards: rejected by the user's chosen role-preserving contract; unnecessarily changes endpoint role policy.
- Keep role-context plus courier-eligibility: workable but duplicates account lookups and spreads new-task restrictions into existing-work helpers.
- Trust browser or JWT custom suspension claim: unsuitable because the browser is not authoritative and token lifetime can hide suspension updates.
- Chosen role-context response gives one authoritative account snapshot per request. A suspension racing after that snapshot takes effect on the next request; this is not a distributed lock with User Service.

## Consequences and verification

No schema, broker, deployment or new peer operation. User Service must retain/restore existing courier roles; Order must never infer a missing role merely from a suspension flag. The existing User courier-eligibility endpoint can remain for other consumers, but Order stops calling it. JWT signature/issuer/audience validation is unchanged.

Frontend clears a forbidden local intent only after owned status404; real pending or uncertain commands retain the stable key. Retry-policy acceptance denied before Credit ends rejected; possible effects require confirmed reversal/fencing. Compensation-policy recovery stays on its existing journal/outbox. Tests and final evidence are in CHANGE-179.
