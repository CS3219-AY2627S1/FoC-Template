# ADR-030: Field-specific errors and new repost minimum

Approved by Vincent on 2026-10-09; CHANGE-091. Supersedes ADR-028 only for new
automatic plan validation: expiry >= scheduled due + 30 minutes, due >= original
expiry. New manual submissions use expiry >= submission + 30 minutes.

Grandfather saved explicit-expiry plans, rather than silently rewriting or
disabling user instructions. JPA loading/execution does not run new-plan creation
validation; late automatic execution needs only a still-future saved expiry.
V4's existing disable-without-expiry migration remains untouched.

Return only actual invalid fields using the existing detail envelope. Client
validation improves feedback but never replaces domain/API validation. Identical
supplier IDs are invalid; similar catalogue names are not a reason to reject.
No peer integration shape, database schema, background retry or auth change.

Persisted short repost outcomes remain supported; temporary background retries
and trusted service credentials remain paused pending peer agreement.
