# CHANGE-076: Configure deployed Order Pub/Sub topic destinations

- Date: 2026-10-08
- Owner: Yao Xiang, Developer 1
- Status: Configuration implemented and statically verified; cloud publication pending
- Authority: User's explicit request to add the environment settings; ADR-021/CHANGE-073

## Change

Set ORDER_ACCEPTED_CANCELLATION_TOPIC, ORDER_OPEN_REFUND_TOPIC, and ORDER_COMPLETION_TOPIC in infra/environments/production.env to accepted-order-cancellation-prod-v1, open-order-refund-prod-v1, and order-completion-prod-v1. Set the corresponding staging variables to the existing dev-v1 topics. These files are consumed by scripts/ci/deploy.sh when rendering order-service/deploy/env.yaml. The existing project remains protean-vigil-509704-q4. Existing peer and database configuration is preserved.

## Traceability and boundaries

This supplies concrete destinations for the existing accepted-cancellation, OPEN refund (cancellation/expiry), and completion publisher flows in Sequences 5-7 under approved ADR-021. No requirement, API/event payload, business flow, publisher class, database schema, frontend, credential file, service-account identity or peer-service implementation changes. Main deploys staging automatically; production remains manual promotion using configuration from the promoted commit. No new design decision or migration is required.

## Verification

- Read the actual deployment script and template; both use the existing three topic variables.
- Substituted environment values into the deployment YAML for each environment and parsed both rendered files with js-yaml. All three topics resolve exactly once to the intended environment's names and the existing project ID. This is a local template/value validation, not a deployed Cloud Run check.
- Verified all pre-existing environment settings remain intact and git diff --check passes.
- No Maven tests required for this configuration-only change; no deployment or real-cloud publish performed.

## Remaining operations

The team must grant the configured runtime identity foc-order-service@protean-vigil-509704-q4.iam.gserviceaccount.com topic-scoped Pub/Sub Publisher access on its intended destinations. The current deploy script shares that identity between staging and production. User-reported topic creation and live IAM were not independently verified. Merge the configuration with the CI repairs, validate staging, then promote that commit to production. Peer subscriptions/consumers remain independently implemented.

## Recovery

Revert these appended topic settings or replace them with deliberately selected destinations and redeploy the desired commit. Do not promote with missing topic values; the deployment template renders missing variables as empty. Messages already published cannot be recalled.
