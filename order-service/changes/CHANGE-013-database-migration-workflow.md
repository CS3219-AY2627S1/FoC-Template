# CHANGE-013: Require Versioned Database Migrations for Shared Local Development

## Request

Ensure that changes made to one developer's local Order Service database are represented by shared migration files so another developer can reproduce the same schema on an independent local database.

## Reason

Independent local databases prevent data collisions, but the project workflow did not yet require a versioned, reviewable schema artifact or a migration handoff. Without that rule, local ORM updates or manual SQL could leave the developers with incompatible schemas.

## Project and sprint references

- Sprint 1 persistence integration-test requirement in `sprints/sprint-1/acceptance-tests.md`.
- Sprint 1 contract requirement that PostgreSQL schema, identifiers, timestamps, and version representation remain explicit before implementation in `sprints/sprint-1/contracts.md`.
- Existing Order Service developer allocation and shared-database coordination rules.

## Changes

- Added `docs/database-migration-workflow.md`.
- Updated `AGENTS.md` and `.codex/skills/spec-driven-development/SKILL.md` to require versioned migration files, peer handoff, schema-version verification, and no manual-only schema changes.
- Updated `skills.md` and `docs/instruction-map.md` so the migration workflow is discoverable.
- Updated Vincent's active-work handoff with the workflow change.

## Deliberately not decided

- PostgreSQL versus Firestore remains unresolved at project level.
- Flyway, Liquibase, or another migration tool is not selected.
- No migration directory, dependency, application configuration, database schema, or migration file was created.

## Result

Workflow-only change. No application source, tests, contracts, deployment configuration, or database was modified.

## Verification

- Confirmed the new workflow requires a migration artifact for every shared schema change.
- Confirmed it distinguishes schema synchronization from local data synchronization.
- Confirmed it requires peer application and verification of the same migration history.
- Confirmed no application migration tool or migration file was added.

## Reversal considerations

Reverting this change would remove the explicit migration handoff and verification requirements while leaving existing application files unchanged. Any migration files created under the rule would require separate review and must not be deleted by reverting this workflow record.
