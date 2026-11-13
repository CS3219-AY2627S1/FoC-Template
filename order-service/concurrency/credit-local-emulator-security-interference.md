# Credit local-emulator security interference handoff

Vincent explicitly approved this narrow peer exception on 2026-10-11,
CHANGE-105 / ADR-036. Annablee remains owner of Credit business behavior.

## Exactly what changed

- credit-service/src/main/java/sg/edu/nus/foc/credit/security/SecurityConfig.java:
  explicitly selected emulator mode allows unsigned HTTP push ONLY to the typed
  completion/open-refund event routes. The branch requires FOC_ENVIRONMENT=local,
  CREDIT_PUBSUB_PUSH_MODE=emulator, a Pub/Sub emulator host, Firebase Auth emulator
  mode/host and demo Auth/PubSub projects. Incomplete or cloud settings fail closed.
- credit-service/src/test/java/sg/edu/nus/foc/credit/security/SecurityComponentsTest.java:
  tests the local guard and rejects missing emulator settings/cloud environment.

No Credit ledger, reservation, command, DTO, controller business handler, migration
or cloud deployment source changed. Ordinary Credit endpoints still use Firebase
JWT identity/roles. Google cloud push keeps its dedicated converter and signature,
issuer, audience, verified email/service-account validator. No staging/prod
subscription is made unsigned. The existing PubSubPushSecurityTest remains.

## Local settings and payload

Compose explicitly supplies demo-foc-local, pubsub-emulator:8085 and Firebase
demo-foc Auth emulator. Two subscriptions target:

```text
POST /api/credits/internal/order-events/open-refund
POST /api/credits/internal/order-events/completion
```

Wrapped Pub/Sub JSON is unchanged: subscription path plus message.data (base64 of
current compact v2 event) and attributes eventId/eventType/eventVersion.
Successful processing returns 204; non-success must cause broker retry. There is
NO Credit subscription for accepted cancellation: those are User penalty facts.

## Verification and limits

Focused Credit security tests, actual unsigned emulator push/refund/transfer and
real Compose authenticated Credit APIs are recorded in CHANGE-105. Cloud OIDC
regressions remain separate from local delivery. No cloud rollout, IAM mutation
or production authentication test occurred. Human peer review remains pending.
To restore the previous cloud-only local behavior, remove the emulator exception
and its two-file test change together with the local transport selection; do not
disable cloud JWT validation or revert financial business changes.
