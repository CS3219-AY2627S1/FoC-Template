# CHANGE-088: Isolated real Pub/Sub delivery into local Docker Credit

- Date / author: 2026-10-09, Vincent, `sprint-2-3-credit`.
- Status: local connector implemented and tested; live cloud/financial gates open `[~]`.
- Approval: explicit user request to implement the previously proposed restricted
  HTTPS local tunnel, isolated test resources and authenticated Google push.
- Authority: D1 F4.1.7/F4.1.8/F4.1.5/F5.1/F10/F11, NFR3;
  ADR-013/021/025/026/028 retained;
  [ADR-029](../docs/decisions/ADR-029-local-live-credit-push.md).
- Scope: Order-owned helper/config/scripts/tests plus approved root Compose
  override/env example and disclosure. Peer application source is read-only.

## Problem, decision and exact implementation

Real HTTP peer calls do not provide Google Pub/Sub with an inbound route to
Docker Credit. Existing shared cloud provisioning targets Cloud Run, not local
Credit. No Dockerfile modification alone fixes this. Use a temporary Docker
cloudflared Quick Tunnel to an exact-path POST-only nginx helper, retaining
Credit's Google OIDC and wrapped push contracts. This is an approved local-test
topology refinement, NOT an application/security bypass or production connector.

`compose.local-live.yaml` merges after base and HTTP overrides, activates existing
Order prod JWT/method security and HTTP peer roles, retains local DB/Auth emulator,
and matches isolated producer topics with Credit push subscription/identity/audience
configuration. Shared base Compose and all peer sources remain unchanged.
`compose.http-peers.yaml` changes comments only: integrated financial handlers now
exist, so historical Sequences 1-3-only descriptions are not current evidence.
`.env.example` describes personal ignored local parameters, never credentials.

`order-service/deploy/local-live/nginx.conf` rejects every other path/method,
queries and oversized bodies; preserves path, JSON, bearer and request ID;
uses Docker DNS for local Credit; runs non-root/read-only without published ports.
Read-only runtime test caught default nginx fastcgi temp-directory creation;
fixed ALL nginx temp paths to writable /tmp, then repeated runtime tests pass.

`scripts/local-live.ps1` Setup provisions only owned test names/resources with
labels, scoped IAM, two real financial push subscriptions, retry/backoff and a
DLQ/recovery subscription. Custom audience stays stable as destination URL changes.
Check inspects metadata and publicly tests auth/routing rejection; it is NOT a
ledger test. Pause converts only owned financial subscriptions to pull before down.
No accepted-cancellation Credit subscription, cloud-wide publisher role, shared
subscription retargeting, Pub/Sub emulator, service-account key or DB reset.
Setup requires real gcloud/ADC/owner permission; partial setup is rerunnable.

## Requirement -> verification chain

| Authority | Implementation | Executed evidence | Remaining gate |
| --- | --- | --- | --- |
| D1 F4.1.7/F4.1.8/F10, ADR-019 | Existing refund event; local isolated subscription | Script/config and nginx routing tests | Live CANCELLED/EXPIRED ledger refund |
| D1 F4.1.5/F5.1, ADR-011 | Existing completion event; local isolated subscription | Script/config and nginx routing tests | Live completed credit transfer/dedup |
| D1 F11, ADR-025 | Existing abort/reset/history; no Credit penalty subscription | Real-mode/topic configuration checks | Live before/after-expiry abort and reset |
| NFR3, approved connector security | Exact POST ingress + Google OIDC retained | Negative path/method/query/body and preservation assertions | Actual Google signature/IAM/token/consumer |
| ADR-026 | Same minute lifecycle/15-minute recovery | Actual merged Compose cadence assertions | Real scheduler/after-commit/cloud delivery |
| Scope/data ownership | Local URLs, unchanged peer/base services, no volumes reset | Baseline service configuration comparisons | Human two-user browser/DB observations |

## Test and verification record

- Red before implementation: Test-LocalLive failed with missing setup script.
- Green: **60 configuration/safety assertions** with actual merged Docker Compose;
  mocked gcloud command recording, no cloud changes. Config-only ADC fixture is
  NEVER used to start an application. Names, resource ownership, scoped updates,
  OIDC configuration, local DBs, cadence and unchanged base services covered.
- Green: **16 actual restricted nginx integration assertions** using temporary
  Docker fixture containers/network, cleaned in finally. Header/body/path routing,
  upstream 401 preservation, denial cases and separate internal health verified.
  Fixture success is synthetic, NOT Credit authentication/financial verification.
- Actual pinned cloudflared image help validates configured tunnel flags; no tunnel
  or cloud resources started during tests. Helper images are pulled.
- `git diff --check`: passed. D1/Overall SHA-256 match recorded source fingerprints.
- Context TOML parses and retains false live-verification/paused retry flags;
  128 local Markdown links resolve. Exact diff shows peer/base/infra/FE source
  untouched; temporary fixture containers/network cleaned.
- Generic source-drift checker: existing manifest column format rejected (exit 2),
  not a source content change; manual fingerprint evidence kept separate.
- Generic completion checker: failed (exit 1, five format/history findings).
  Existing traceability lacks its fixed column schema and old active-work text
  has unqualified `[x]` matches. No unrelated historical rewrite to force green;
  this checker is NOT reported passed. Scoped local tests are separate evidence.
- gcloud unavailable on PATH and standard personal ADC absent in this runner.
  Therefore no Setup/Check against GCP, full app build/start, actual Google push,
  authenticated browser or local financial end-to-end test claimed.
- Actual Setup preflight executed and refused with missing-gcloud error (exit 1)
  before any connector start/cloud write; expected safety result, not Setup success.
- Maven/Vitest not rerun for this configuration-only concern; no Java/FE source
  changes or new migrations. Prior focused Credit tests are separate evidence.

## Handoff, rollback and limitations

Atomic implementation commits: `9e77fa0` Order connector/scripts/tests;
`e78f887` approved shared Compose/env additions. Documentation and AI disclosure
are separate concerns; no push. Learning/personal profile are not staged.

Run [local-live-testing.md](../docs/local-live-testing.md) for prerequisites,
build/up/down/force-recreate commands, IAM, cloud resources, logs and two-user
financial assertions. Reconcile URL with Setup after tunnel restart/recreation.
Pause before down; never use down -v. Cloud resources/backlogs remain until
explicit reviewed cleanup. Quick Tunnels are development-only, retries/retention
finite, DLQ must be inspected; successful publication is not a completed refund.

No Sprint marker upgraded. User consumers, FEEDBACK-003/005/006/007, live peer
verification and production recovery remain separate gates. ALL background retry
implementation and trusted delegated credentials remain paused. Learning is
updated locally and excluded from Git. No push performed.
