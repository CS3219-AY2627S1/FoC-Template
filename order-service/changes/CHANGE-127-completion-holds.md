# CHANGE-127: Order completion holds

- Date/owner: 2026-10-14, Yao Xiang, order-service/penalty-integration.
- Status: approved Order placement/guards implemented and verified; actual Report
  integration and release deferred. Full NTH2/NTH3 completion not claimed.
- User approves forwarded requester Firebase authorization, own active Order
  holds and funding freeze; explicitly defers release. D1 NTH2 PDF38/NTH3 PDF41.
- Workflow loaded and decisions recorded before source/TDD; ADR-040 and
  completion-hold-design.md own contracts/class/sequence design.

## Implementation and traceability

| Requirement | Implementation | Evidence |
| --- | --- | --- |
| NTH2/NTH3 funding freeze | Order flag, immutable per-report rows, locked atomic placement | Domain/service/API/PG rollback and races |
| NFR4 authority | Existing Firebase/Requester roles and locked ownership | Role/UID/owner denial, Bearer forwarding |
| NTH2 manual/48-hour hold | Domain funding guards, SQL due filters, locked recheck | Held completion/cancel/expiry/abort create no funding; independent success |
| NFR2 requester explanation | Existing Order DTO/client/actions | Disabled control and stale-response report message |
| NFR3 migration/regression | Additive V9; V1..V8 unchanged | Clean/upgrade PG and full verify/coverage |

PUT /api/orders/internal/{orderId}/completion-holds/{reportId}, body requesterId,
returns orderId/reportId/isCompletionHold/version. Repeated placement is
idempotent; conflicting report binding rejects. Hold itself changes no status.
No event/topic, Credit protocol, outbox publication, peer backend, Compose,
deployment or secret changes. No new environment variable.

## TDD and verification

- Backend RED showed missing domain hold methods; UI RED showed missing message.
- Deterministic cross-Order race proved JPA merge could overwrite a report binding.
  Insert-only SQL and uniqueness now reject/roll back the loser.
- Stale-browser RED proved generic version conflict after hold placement.
  Owner then hold-before-version now returns the ongoing-report message.
- Final ./mvnw verify: 394 tests, zero failures/errors/skips; JaCoCo gates pass.
  Real PostgreSQL Testcontainers/migration and existing Credit HTTP harness
  included. No actual Report caller verification.
- Frontend: 126 tests/28 files pass; typecheck, lint, production build pass.
  Three existing login lint warnings. Sandbox Google Fonts download failed;
  network-enabled retry passed. Typecheck passed after sequential build; an
  intermediate simultaneous run lacked generated route types.
- Existing migration assertion updated from three to four foreign keys for V9.
  Rollback fixture corrected for Spring exception translation; all rerun pass.
- Started Docker Desktop hidden and only dedicated order-postgres. Flyway
  applied local schema8 ->9, preserving seven Orders (zero existing holds).
  No volumes deleted or sibling schema modified; generic postgres-dev untouched.
  Application images were not rebuilt/recreated.
- Logs in ignored target/change127-verified.log, change127-frontend.log,
  change127-build.log, change127-binding-red.log, change127-binding-green.log,
  change127-stale-red.log and change127-local-migration.log.

## Remaining scope and recovery

FEEDBACK-013: Report caller absent; release deferred. Browser confirmation,
actual requester/Report integration and cloud rollout unverified; no push/deploy.
Placed holds persist. Disable placement traffic for rollback; retain records
and use reviewed forward corrections. Avoid old Order revisions ignoring holds.
Do not delete hold records or roll back schema to bypass held funding.
