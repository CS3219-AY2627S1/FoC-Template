# ADR-036: Local emulator and Order review hardening

Scoped supersession: CHANGE-107 / ARCH-EVO-043 retires the optional expiry HTTP
shortcut only (Vincent, 2026-10-11). All repost routes and this ADR's local/cloud
security/configuration decisions remain; historical rationale is preserved.

- Date/approver: 2026-10-11 / Vincent, request plus explicit follow-up approvals.
- Status: APPROVED; scoped local implementation verified (CHANGE-105). Overall
  Sprint/cloud/peer completion remains [~], not granted by local tests.
- Supersedes ADR-021/029 local real-broker/ADC/tunnel selection only. Cloud keeps
  real Google Pub/Sub and topic-scoped IAM; original records remain historical.

## Approved local transport/security

Use the actual Pub/Sub emulator on the private Compose network, a demo project,
three local producer topics and two Credit typed push subscriptions. No Credit
subscription to accepted-cancellation (User penalty only). A setup container
creates emulator topics/subscriptions idempotently before Order starts. No ADC,
gcloud login, HTTPS tunnel, real GCP resources or mock financial service needed.
Java selects a plaintext fixed emulator channel with NoCredentialsProvider;
cloud mode must never silently select that channel or accept emulator settings.
Explicit local environment/mode, Pub/Sub host and Firebase emulator settings
guard Credit's unauthenticated local push exception. All other Credit APIs keep
Firebase JWT/role verification; cloud push retains Google OIDC validation.
The narrowly approved Credit source/test change receives an interference handoff.

## Approved review fixes

- Cloud Run Order has min-instances=1 and --no-cpu-throttling; increased cost is
  explicitly accepted. Change configuration only; no deployment/provisioning.
- Reject the public lifecycle-token fallback outside local mode. Cloud internal
  lifecycle access must not rely on a repository-visible shared value.
- GET by ID enforces requester/current courier/admin relationship, or eligible
  courier access to currently available OPEN orders; conceal unrelated IDs (404).
- Existing CREATE/ACCEPT/ABORT routes use the durable coordinator, preserving
  ordinary Order responses on success and returning saved command status as 202
  while unresolved. No legacy remote-effect/local-commit bypass remains allowed.
- Bind receipt replay to caller/order/immutable input; reject key reuse rather
  than returning foreign Order data. New event identities include order scope.
  Add bounded command IDs before unsafe I/O. Remove unused settlement adapter.
- Peer connection/read bounds remain 3s/5s; map dependency/known client errors
  without turning uncertain financial outcomes into terminal rejection.
- Immediate outbox dispatch runs on a bounded executor, retaining after-commit
  ordering and the 15-minute recovery scan. After ten failed attempts retain
  FAILED records, log/observe them and allow authorized operator redrive. Never
  delete financial evidence or present transport ACK as completed refund.

## Boundaries and tests

Order owns commands/orders/outbox; Credit owns all ledger effects. Keep existing
minimal mutation bodies, key/generation headers and event bodies. No tokens stored.
Automatic repost and service credentials are deferred, not repaired implicitly.
Test isolation/fail-closed transport, local push/cloud authentication separation,
real Order/Credit/PostgreSQL/emulator delivery, replay/lost reply/local rollback/
restart/leases/compensation, receipt/read authorization and outbox exhaustion/
redrive. Isolated containers only; no application-volume deletion or cloud tests.
Frontend keeps existing pending/status/fresh-authorization behavior. Final command
handoff includes build/up/down --volumes with explicit destructive-reset warning.

## Alternatives and trade-offs

Real local broker tests IAM but exposes shared cloud topics and requires ADC and
public ingress; emulator removes those local risks but cannot verify cloud IAM.
Cloud Scheduler/OIDC avoids an always-on instance but introduces a separate
infrastructure/authentication path; the user chose existing in-process timers.
Retiring legacy routes breaks clients; routing through the coordinator preserves
normal success while explicitly exposing pending instead of unsafe rollback.
Indefinite outbox retries preserve eventual attempts but hide permanent failures;
retained FAILED plus redrive requires operator attention and must be observable.
