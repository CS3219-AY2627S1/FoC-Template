# CHANGE-073: Publish local Order events to real Pub/Sub dev topics

- Date: 2026-10-07
- Developer: Yao Xiang, Developer 1
- Status: Implemented; local/cloud publish verification pending
- Change type: User-approved architecture and local infrastructure change
- Related records: CHANGE-054, CHANGE-060, ARCH-EVO-023, ADR-021

## User approval

The user selected real Google Cloud Pub/Sub for local publishing, retained the existing GCP project, approved topic-level IAM separation, and supplied the development topic IDs:

- `order-completion-dev-v1`
- `open-order-refund-dev-v1`
- `accepted-order-cancellation-dev-v1`

Production uses separately configured topic IDs in the same project. The user's developers grant themselves publisher access only on the dev topics; the production Cloud Run service identity receives publisher access only on the production topics. No service-account private key is shared or stored in `.env` or Secret Manager.

## Effective behavior

- The default Compose stack no longer starts a Pub/Sub emulator or topic initializer. Order Service publishes to the real Pub/Sub API using the current project's topic IDs and the developer's local Application Default Credentials (ADC).
- Compose mounts each developer's ADC credentials file read-only into only the Order Service container. The untracked local `.env` stores that developer's host file path; the shared `.env.example` contains no credential contents.
- The Google Pub/Sub publisher factory now always uses the normal Google client transport and ADC. It no longer implements emulator channel configuration.
- Compose retains `ORDER_PEERS_MODE=mock`; changing the Pub/Sub transport does not switch User, Supplier, or Credit peer adapters.
- Runtime topic IDs remain environment-overridable so Cloud Run can select production topics. Production must set all three topic variables and must not inherit the dev defaults. Topic IAM makes a missing/incorrect production topic setting fail to publish rather than granting production access to dev topics.
- Actual topic creation and IAM grants are performed by the project team in GCP, outside this repository change.

## Rationale and trade-offs

Using one project with distinct topics avoids provisioning another project while testing Google authentication, topic existence, permissions, message IDs, and real delivery. Topic-scoped IAM limits the impact of a local configuration mistake. The environments still share project-level billing, quotas, and administrative controls; project-wide publisher grants would weaken the separation. Local publishes are real cloud messages and may be processed by subscriptions attached to the dev topics.

Each developer uses personal ADC rather than a shared service-account key. This keeps credentials out of shared files and gives GCP audit logs the developer's identity. The mounted credential file is read-only but remains accessible to the Order Service container while it runs.

## Affected files

- Root `compose.yaml` and `.env.example`: remove emulator services/variables, mount local ADC, and configure the three dev topics in the existing project.
- `src/main/resources/application.yaml`: use the configured project and dev topic defaults while retaining environment overrides.
- `GoogleCloudPubSubPublisherFactory`: remove emulator transport code.
- `GoogleCloudPubSubPublisherFactoryTest`: test topic-keyed caching and shutdown without credentials or a live broker.
- Order Service README, architecture/context/contract records, active work, decision/evolution/change indexes, and AI usage disclosure.
- Historical CHANGE-060 is retained and marked superseded; prior work and peer-service source remain untouched.

## Verification

The Order Service factory test was updated before its implementation change. The Maven wrapper could not start under the current local execution environment (`Cannot start maven from wrapper`), so that test did not reach compilation. Docker Compose config validation was unavailable because the local Docker CLI could not read `C:\Users\thamy\.docker\config.json` (access denied). Image startup and a real Pub/Sub publish still need to be checked after the GCP topics and IAM are configured. No live cloud resource or IAM policy was changed by this task.

## Rollback and operational notes

Reverting the Order Service code/configuration restores the previous emulator-based Compose behavior. Events already accepted by Google Pub/Sub cannot be withdrawn; inspect dev subscriptions and outbox status before rollback or replay. Do not point production consumers at dev topics.
