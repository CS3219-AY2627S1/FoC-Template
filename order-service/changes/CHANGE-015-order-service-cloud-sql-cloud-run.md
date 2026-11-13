# CHANGE-015: Approve Order Service Cloud SQL and Cloud Run deployment

- Date: 2026-09-29
- Status: Approved design; infrastructure implementation in progress
- Developer: Vincent (Developer 2)
- Approver: User
- Related ADR: `docs/decisions/ADR-008-order-service-cloud-sql-cloud-run.md`

## Reason

The Order Service had an unresolved PostgreSQL/Firestore and Kubernetes/Cloud Run conflict. The
user selected PostgreSQL on Cloud SQL, Cloud Run, one shared instance with separate staging and
production databases, and acknowledged possible charges. The user then approved public IP plus
the Cloud SQL Java Connector with automated backups, point-in-time recovery, and deletion
protection.

## Approved design

- Project: `protean-vigil-509704-q4`
- Region: `asia-southeast1`
- PostgreSQL version: 15 (low-cost shared-core configuration)
- Instance: one shared PostgreSQL instance for Order Service
- Databases: `order_staging`, `order_production`
- Runtime: Cloud Run
- Connection: public IP plus Cloud SQL Java Connector
- Secrets: Secret Manager, referenced by deployment configuration
- Runtime access: Order Service runtime identity with `roles/cloudsql.client`
- Safety: single-zone, automated backups, point-in-time recovery, deletion protection

## Files and records to synchronize

- `docs/ai-project-context.md`
- `docs/ai-project-context.toml`
- `docs/current-sprint.md`
- `docs/architecture-order-service.md`
- `AGENTS.md` and local workflow references
- `infra/gcp/bootstrap.sh`
- `scripts/ci/check-infra.sh`
- `infra/environments/staging.env`
- `infra/environments/production.env`
- Order Service Cloud Run deployment configuration
- `docs/architecture-evolution.md`
- `docs/change-log.md`
- `../ai/usage-log.md`

## Scope exclusions

No sibling-service database was changed. No application business behavior, peer API, migration
tool, migration file, or Sprint 1 sequence implementation was approved by this change.
