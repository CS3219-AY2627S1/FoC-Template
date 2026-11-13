# ADR-021: Use real Pub/Sub with topic-level environment separation

- Status: Accepted by user's explicit approval; local implementation complete, GCP setup pending
- Date: 2026-10-07
- Owner: Order Service
- Related change: CHANGE-073
- Supersedes: CHANGE-060's emulator as the default local Pub/Sub runtime; supersedes emulator transport support in ARCH-EVO-010

## Context

The default local stack used a Pub/Sub emulator and `demo-foc`, so local publishing did not exercise real GCP authentication, topic IAM, or cloud delivery. The user wants to test actual Pub/Sub without creating another GCP project and will create dev and production topics in the existing project `protean-vigil-509704-q4`.

## Decision

- Use the same GCP project for development and production, with separate Pub/Sub topics per environment.
- Local Order Service uses the development topic IDs `order-completion-dev-v1`, `open-order-refund-dev-v1`, and `accepted-order-cancellation-dev-v1`.
- Production topic IDs are set through the existing topic environment variables when those topics are provisioned; they are not inferred from development IDs.
- Each developer authenticates locally with their own Google account through ADC. Compose mounts the developer's ADC file read-only into the Order Service container. No service-account key or credential content is shared in `.env`, checked into the repository, or stored in Secret Manager.
- Grant developers `roles/pubsub.publisher` on only the development topics. Grant the production Cloud Run service identity `roles/pubsub.publisher` on only the production topics. Do not grant these principals project-level publisher access.
- The default Compose stack uses real Pub/Sub and no longer runs or initializes a Pub/Sub emulator. The publisher uses Google's normal authenticated client transport.
- User/Supplier/Credit mock-versus-HTTP peer configuration remains independent of broker transport.

## Consequences and trade-offs

This exercises real credentials, topic existence, IAM, acknowledgments, and cloud subscriptions locally. Real messages may be consumed by dev subscribers and count against the shared project's quotas and billing. Separate topics and topic-level IAM reduce cross-environment publishing risk, but a shared project still shares billing, quotas, and project-level administration. Broad project IAM can defeat topic-level separation.

The local ADC file is personal and mounted read-only, but the running container can use its credentials. The host path is machine-specific and belongs in each developer's ignored `.env`. Production uses Cloud Run's attached service identity and needs no credential file.

If production topic variables are omitted, the application defaults to dev topics; the production service identity must lack permission on those topics so the error is visible and the transactional outbox can retry. Production deployment configuration must explicitly set all three production topic IDs before release.

## Verification and operations

No GCP resources or IAM policies were changed as part of the repository implementation. The user/team must create all six topics, configure topic-level IAM, enable the Pub/Sub API, and set the production topic environment variables. Validate local publishing against a dev topic before using the full Compose stack. Confirm event subscribers are connected only to the intended environment's topics.

## Rollback

Revert CHANGE-073 to restore the emulator-based local default. Messages already accepted by Pub/Sub cannot be recalled; inspect dev subscriptions and the Order outbox before replaying. Production topic and IAM configuration remain team-managed.
