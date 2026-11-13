# CHANGE-060: Local Pub/Sub emulator for Order Service

> Status update (2026-10-07): This local runtime decision was explicitly superseded by CHANGE-073/ADR-021. The historical emulator setup and verification below are retained as provenance; the current Compose stack publishes to real Pub/Sub dev topics using per-developer ADC.

- Date: 2026-10-02
- Developer: Yao Xiang, Developer 1
- Status at implementation: IMPLEMENTED; Compose and Docker runtime verification passed; Maven test execution unavailable. Current status: SUPERSEDED by CHANGE-073/ADR-021.
- Change type: Implementation detail under approved CHANGE-054 / ADR-009
- Trigger: Local Order completion/cancellation attempts used the real Google Pub/Sub endpoint because the local Compose stack left `PUBSUB_EMULATOR_HOST` unset.

## Decision and behavior

The default local Compose stack runs Google's Pub/Sub emulator and configures Order Service to publish to it using a local project ID. A one-shot Compose initializer creates the completion and cancellation topics before Order Service starts. The local publisher uses the existing emulator transport and no Google credentials. The local `ORDER_PEERS_MODE=mock` behavior remains independent and unchanged.

The configured Google Cloud project and topic IDs remain the application defaults when these local environment variables are absent, so deployed runtime configuration continues to use Application Default Credentials. No peer consumer, subscription, or other service is changed.

## Affected files

- Root `compose.yaml`: emulator, topic initialization, and Order Service environment/dependency.
- `src/main/resources/application.yaml`: environment-backed Pub/Sub project/topic values with existing cloud values as defaults.
- `README.md`: local emulator and deployed Pub/Sub behavior.
- `docs/active-work/yao-xiang.md`, `docs/change-log.md`, and `../ai/usage-log.md`: durable task and AI-use records.

## Verification

- `docker compose -f compose.yaml config` passed.
- `docker compose -f compose.yaml up -d --build --force-recreate order-service pubsub-emulator pubsub-topics-init` started the local stack. The topic initializer created all three configured topics; the emulator REST topic listing returned the completion and both cancellation topics.
- The running Order Service reports `PUBSUB_EMULATOR_HOST=pubsub-emulator:8085` and `PUBSUB_PROJECT_ID=demo-foc`; Docker reported it healthy.
- A local test publish to `projects/demo-foc/topics/order-completion-v1` was acknowledged by the emulator with message ID `1`. No Google Cloud endpoint was used.
- Docker image build/package and Spring startup passed. The Maven wrapper failed with `Cannot start maven from wrapper`; system Maven could not create its configured `C:\.m2\repository`, even when passed a temporary repository override, so Maven tests were not run.
- `git diff --check` passed.

## Scope and limitations

Local emulator data is not sent to Google Cloud and is not persistent when the emulator process is recreated. Emulator success does not verify deployed IAM or real-cloud delivery. The deployment path and real topic defaults are preserved.
