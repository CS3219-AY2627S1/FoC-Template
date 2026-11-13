# ADR-055: Gated real compensation transport

- Approved: Vincent, 2026-10-27, explicit transport/test selection; CHANGE-158.
- Extends ADR-054 fixture-only milestone; does not enable deployed settings.
- Implementation: locally verified, source a6cceee; Order/common596 and Credit126
  tests pass with no skips and original coverage gates. Real compensation11 and
  retained protocol16 pass. Cloud activation remains explicitly separate.

Use existing exact compensation v1 schemas and hybrid sequence: initial
Firebase-authorized HTTP mutation, Order transactional outbox -> Pub/Sub request,
Credit atomic reverse/fence/inbox/result outbox -> Pub/Sub result -> Order inbox.
Add a separate exact-path Google OIDC security chain validating issuer, timestamp,
audience and verified service-account email. No Firebase role lookup for broker
identities. Unsigned push requires explicit local environment, demo projects,
Auth emulator and Pub/Sub emulator. Invalid combinations fail startup.
Transport is opt-in with explicit topic/subscription settings. Default retry and
deployment settings stay. Existing FAILED/redrive, guards and schemas remain.
Old RETRY commands must not be reinterpreted on cutover.

Alternatives: fixture-only cannot verify delivery; synchronous compensation
requires fresh user credentials after a crash and contradicts the approved
direction; unauthenticated production push is rejected. Cloud deployment/IAM
and direct/unkeyed financial-bypass review remain separate rollout gates.


## Automatic plan retry repair — CHANGE-164, approved user instruction2026-10-29

Compensation-first remains per immutable command, not a permanent ban on the saved automatic plan. A later minute pass may create a fresh opaque command/candidate only after a terminal no-effect rejection or confirmed compensation. Preserve all old command/fence/history and never retry an uncertain financial effect forward. Pending/reconciliation blocks new attempts. Original locking, existing pending uniqueness and atomic successful successor/link/plan-used remain; current plan expiry/holds/eligibility and feature gates still apply. No new transport, schema or peer protocol. See changes/CHANGE-164-automatic-repost-retry-until-success.md relative to Order root.
