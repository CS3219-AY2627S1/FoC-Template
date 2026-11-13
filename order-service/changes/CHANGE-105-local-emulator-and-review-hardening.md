# CHANGE-105: Local emulator and Order review hardening

- Owner/approver: Vincent, 2026-10-11.
- Branch: sprint-2-3-credit-service-concurrency-update-event-payload.
- Status: [~] locally verified slice; approval: ADR-036. Cloud/peer/Sprint gates
  remain incomplete as explicitly listed below.
- Requirements: F1/F2 creation/reservation; F3/F4 acceptance; F4.1.5/F5.1
  completion; F4.1.7 cancellation; F4.1.8/F10 expiry; F11.2 abort; NFR3.1.1
  line/branch coverage, NFR3.1.3 positive/negative tests; approved ADR-013/025/
  026/031/033/034/035 consistency/security/transport amendments.
- Actual Credit provider supplies typed refund/completion push, compact v2,
  key/generation replay/result/compensation; its Google push authentication is
  incompatible with unsigned emulator push. Explicit narrow exception approved.
- Shared configuration changes limited to this integration; unrelated peer
  settings/data preserved. No cloud deployment, provision, resource deletion,
  application-volume reset or automatic-repost implementation authorized.
- Source drift: D1 and selected Overall SHA256 match project reference.
- Pre-implementation screenshot audit (historical baseline): #48 public token
  remained; automatic repost deferred. #49
  min0/request CPU remains. #51/#52 fixed only on durable command routes, not
  legacy direct routes. #53 timeout bounds already implemented by CHANGE-104;
  error mapping remains. #54 relationship check missing. #55 receipt/event scope,
  unused settlement and synchronous/unbounded outbox remain.
- At task start, test-first results and migration/commit handoffs were pending.
  Current evidence follows below; previous CHANGE-104 results alone were not a
  pass for this change. Operator recovery retains failed/unresolved evidence.

## Implemented screenshot findings

| Finding | Effective result |
| --- | --- |
| #48 lifecycle public fallback | External lifecycle HTTP hooks default disabled and reject non-local environments. In-process timers need no shared token. Automatic repost/peer credentials deferred. |
| #49 idle Cloud Run timers | Order deployment min-instances=1 and --no-cpu-throttling; config only, no deployment. |
| #51 assignment before local commit | Legacy accept routes durable intent/lease/historical result/conditional compensation; no direct bypass. |
| #52 reserved credits without order | Legacy creation routes durable coordinator with saved candidate before Credit I/O. Same-key retry/local rollback/restart verified. Command-ID limits precede I/O. |
| #53 peer timeouts/errors | 3s connect/5s read bounds already implemented in CHANGE-104; this change maps Supplier/assignment/reset known errors instead of unhandled 500. Uncertain financial outcomes remain pending. |
| #54 unrelated order read | Requester/current courier/admin or eligible courier browsing available OPEN; other IDs concealed as 404. |
| #55 replay/event/outbox | Actor/order/input receipt binding (V7); new scoped event IDs; dead HTTP settlement removed; bounded async publication; retained FAILED after 10 (V6) and ADMIN redrive. |

## Verification evidence (2026-10-11)

- Tests-first focused RED and GREEN recorded in target/change105-binding-red.log,
  change105-read-green.log and change105-focused.log (41 focused passed).
- Final Java21/Maven3.9.16 verify from isolated exact-source snapshot:
  **354 tests, 0 failures/errors/skips; BUILD SUCCESS**, 7m18s.
  JaCoCo **94.86% lines / 80.12% branches**, thresholds unchanged.
  Log: target/change105-snapshot-20261011/verification-complete.log.
  All **192** current source/resource/test files matched the snapshot by SHA256.
- **12 actual Credit/Order/PostgreSQL/emulator integration tests pass**, including
  lost HTTP reply/read timeout after remote commit, local rollback, stable replay,
  provider restart, same-key simultaneous claim, expiration compensation, abort
  reset/stale clear replay, abort-after-expiry refund, cancellation/expiry refunds
  and completion transfer. Duplicate completion is replayed through the actual
  wrapped HTTP consumer and its 204 ACK; first delivery uses the broker.
  User/Supplier validation is fixture-backed in this Java harness, not claimed live.
- Existing five real PostgreSQL transition races: **10 tests pass**. Outbox
  migration **5 tests pass**, including explicit V5->V7 data preservation;
  outbox JPA **5 tests pass**, including FAILED/claim exclusion/redrive.
- Approved Credit exception: **21 security tests pass**, including cloud signed
  push rejection/validation and local configuration guard. Read-only source copy
  used under Order target; peer output/source not altered by Maven verification.
- Actual full Compose images built and stack started, volumes retained. **24
  real HTTP assertions pass** using actual User/Supplier/Order/Credit, local Auth
  and Pub/Sub: registration/roles/locations, stable legacy creation replay,
  historical Credit result, cancel/refund, accept/abort/same-ID reopen/reaccept,
  progress/completion/duplicate request and correct 50->45 / 50->55 balances.
  Anonymous Credit /me=401; non-ADMIN failed-event list=403; oversized key=400;
  unrelated cancelled order=404, owner=200. Fresh test accounts/orders retained.
  Test script: scripts/Test-LocalEmulatorIntegration.ps1; log in target.
- Frontend **83 tests pass**, lint/typecheck pass; no frontend application edit.
- **29** local/cloud configuration assertions pass; base/three-file Compose
  configuration validates. Local project/topics/host pinned, no ADC volume or
  tunnel. Init exits 0; real application containers healthy. No cloud API writes.
- AsyncAPI DTO/schema/example/source parity, TOML parsing and git diff checks pass.
  D1 and selected Overall hashes match their persistent reference.

## Failed/interrupted checks — not counted as passes

- Windows Maven clean failed on a locked target/maven-archiver; IDE wrote error
  classes into shared target, causing unresolved classes in early runs. Corrected
  EventPublicationException package-directory alignment and used an isolated
  source snapshot; no forced deletion. Own clean log moved to ignored target.
- Early test expectations used incorrect reservation enums, omitted required
  eventId replay attribute or assumed Credit ledger event_id instead of origin_id.
  Corrected fixtures to actual inspected contracts; final tests pass.
- Final Maven emits a **fork-JVM shutdown timeout warning after all tests** while
  still returning BUILD SUCCESS/exit 0. Test-process cleanup remains a diagnostic
  follow-up; do not report this warning as absent or infer a production cause.
- Generic drift helper rejects existing project-d1-reference column format;
  generic completion helper rejects historical active-work/traceability format.
  These helpers did not pass. Direct hashes and manual gate recorded separately;
  Sprint remains [~]. No broad workflow-history reformat performed.

## Migration, ownership and operational handoff

New Order migrations V6 retained FAILED/check/index; V7 actor/input receipt binding.
Expected schema **7**. Matching Docker startup runs Flyway; actual existing local
database upgraded **V4->V7 without reset**. Historical receipts remain unbound and
replay fails closed; existing event payload/ID preserved. Back up before cloud
rollout; use reviewed restore/forward correction, never edit applied migrations
or delete failed financial evidence to downgrade. Consuming developer/cloud
upgrade review still outstanding. Detail: docs/database-migration-workflow.md.

Operator GET /api/orders/internal/outbox/failed?limit=20 lists IDs; ADMIN POST
/api/orders/internal/outbox/{eventId}/redrive (no body) commits PENDING/returns202
then queues same event ID/payload. Publication ACK is not consumer ledger success.
Root Docker commands and destructive down --volumes warning: local-live-testing.md.
No application-volume reset, cloud provisioning/deployment/deletion, token storage
or credentials bypass. Old local-live.ps1 refuses to provision the old cloud path.
Supplier SeedCsvReader user change and unrelated D3 file preserved/uncommitted.

Atomic commits: a2bab85 Credit exception; f6c44bb Order emulator transport;
dc9dbb8 shared Compose; 29bfaf6 Order hardening/tests/deployment. No push.

## Remaining gates

Automatic repost/delegated authorization deferred. Manual repost is not in the
three-operation durable protocol. HTTP tokenless recovery needs same-key owner
Continue with fresh authorization. User penalty/completion consumers and separate
overdue source remain peer work. Cloud deployment/IAM/OIDC/runtime and interactive
browser/UI verification not performed; local emulators cannot prove them.
Human review, consuming-developer migration review and workflow-helper format
issues remain; no overall Sprint completion claimed. Learning record:
learning/local-emulator-and-retained-outbox-recovery.md (local/excluded).
