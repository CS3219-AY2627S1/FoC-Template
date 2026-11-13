# ADR-008: Order Service PostgreSQL on Cloud SQL with Cloud Run

- Status: **Approved**
- Date: 2026-09-29
- Developer: Vincent (Developer 2)
- Approved by: User
- Scope: Order Service deployment and persistence only

## Decision

Order Service uses PostgreSQL hosted by Google Cloud SQL and is deployed to Google Cloud Run.
One Cloud SQL instance is shared by the staging and production environments, with separate
databases:

- `order_staging`
- `order_production`

Cloud Run connects through a public-IP Cloud SQL connection using the Cloud SQL Java Connector.
The runtime service account receives `roles/cloudsql.client`. Database passwords remain in Google
Secret Manager and are referenced by Cloud Run deployment configuration; they are never committed
to Git.

The instance uses PostgreSQL 15, is provisioned in `asia-southeast1`, uses a single-zone
configuration for the student deployment, enables automated backups and point-in-time recovery,
and has deletion protection enabled. The shared instance is a cost-saving choice and therefore remains a shared
failure, maintenance, and capacity boundary for staging and production.

## Superseded conflict

The Order Service source architecture specified PostgreSQL/Kubernetes while the parent repository
defaults specified Firestore/Cloud Run. This ADR records the user-approved Order Service deviation:

- PostgreSQL/Cloud SQL replaces Firestore for Order Service persistence.
- Cloud Run replaces Kubernetes for Order Service deployment.
- The parent Firestore convention remains applicable to other services unless their owners approve
  a separate decision.

## Alternatives and trade-offs

### Separate Cloud SQL instances

Provides stronger staging/production isolation but increases cost and operational maintenance.
Rejected for the current student deployment.

### Private IP/VPC

Provides stronger network isolation, but requires private services access and Cloud Run VPC
egress configuration. Public IP plus the Java Connector is simpler for the current project while
still providing encrypted, IAM-authorized connections.

### Direct public database connection

Rejected. Public connectivity must use the Cloud SQL Java Connector rather than exposing database
credentials and authorized networks directly to the application.

## Consequences

- `bootstrap.sh` and `check-infra.sh` must provision and verify the shared Cloud SQL instance,
  databases, IAM access, and Secret Manager containers.
- Cloud Run deployment configuration must provide the instance connection name, database name,
  database user, and Secret Manager password reference.
- PostgreSQL schema changes must use the versioned migration workflow in
  `docs/database-migration-workflow.md`.
- The shared instance can couple staging and production during maintenance, quota, or capacity
  events; this is accepted for cost reasons.
- Cloud SQL usage can incur charges; the user explicitly acknowledged this.

## Implementation boundary

This ADR approves infrastructure and deployment direction. It does not approve Sprint 1 business
behavior, peer-service contracts, migration-tool selection, or application source implementation.
