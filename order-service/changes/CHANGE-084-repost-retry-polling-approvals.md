# CHANGE-084: Record repost retry, polling and peer-authorization approvals

- Date/developer/branch: 2026-10-09 / Vincent / `sprint-2-3`.
- Classification: approved design refinement/product failure-handling amendment;
  trusted security integration remains a proposal for peer agreement.
- Status: documentation completed; application implementation NOT started here.
- Decision: ADR-027 / ARCH-EVO-029; supersedes pending user choices in CHANGE-083.

## Exact approval scope

Vincent approved documentation-first discussion of trusted auto-repost peer
credentials and explicitly instructed NOT to implement that mechanism yet.
He selected polling for near-real-time UI, accepted that confirmed insufficient
credits cannot distinguish delayed refund from genuinely inadequate balance,
and approved fixed-candidate-ID temporary retries bounded by new expiry, stopping
invalid/authorization/permanent failures with short appropriate EXPIRED-card
messages. No peer owner's approval, exact credential mechanism or production
completion is inferred. This turn records decisions only; later implementation
of polling/retry/UI still needs the concrete feature design and peer dependencies.

## Before and after

Before: CHANGE-083 proposed stable-ID retries and trusted credentials as pending;
failure UI proposal named only insufficient funds. Current repost code creates a
new candidate per invocation, derives auto expiry from execution/duration, and
does not persist task/failure state or provide polling. After: approved rules are
persisted, including other short terminal messages; code remains unchanged.
See ADR-027 for sequence/ownership/recovery/UI/test obligations and FEEDBACK-005
for the handoff that Vincent can discuss with User, Supplier and Annablee/Credit.

## Traceability and affected artifacts

NTH4 automatic/manual repost, F1 creation authorization/credit validation,
F10 expired history and approved visibility override; existing NFR2 shared
responsive UX, NFR3 verification and NFR4 auditable failure/retry behavior.
These are approved amendments/refinements, not quotations newly found in D1.
No completion marker changed. Requirements/context/ADR/evolution/diagram target,
contracts/peer feedback/test obligations/sprint/handoff/index/disclosure updated.
Source/test files, migrations, deployment, peer code, original PDFs/PNG unchanged.
Learning update is local and excluded from commits.

## Verification and remaining work

Atomic approval-documentation commit: `c993591`; disclosure/handoff follows
separately. No push, learning staging or application/peer commit performed.

Read-only inspection reconfirmed User `/role-context` obtains requester UID from
Firebase authentication; Credit PUT/GET reservation is requester-bound and
Supplier pair validation is synchronous. Order automatic code has no durable
retry or explicit new-expiry field. This is source inspection, not live tests.
D1 and selected overall PDF hashes match the recorded values (actual location
is `../../` from repository root; historical `../../../` paths resolve wrongly
there). Initial hash lookup at the historical path failed; corrected lookup passed.
No source reference/hash was silently changed, no runtime test claimed.

Documentation checks passed: `git diff --check`; Python 3.12 TOML parsing and
assertions for approved-but-unimplemented flags, retained timing/minute/15-minute
cadence, and existence of the new decision/change/diagram/feedback references.
Tracked diff scope is Order documentation plus authorized AI disclosure only.
`git check-ignore` confirms the learning update is excluded. The Mermaid target
was text-reviewed, not rendered. No Java/RTL/browser/peer runtime tests were run
because this is a decision-documentation task with unchanged application code.

Do not reuse old Java/RTL coverage as proof of new retry/polling behavior. Peer
security agreement/implementation and reservation confirmation/reconciliation,
then TDD implementation/migration/browser/live integration remain outstanding.
