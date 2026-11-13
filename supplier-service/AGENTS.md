# Supplier Service

Owner: Jun Hui. Own Supplier/location schema, CRUD/query APIs, ACTIVE/INACTIVE behavior, UI,
authorization integration, migrations and contracts; also Logging, broker reliability/retries,
failure recording and observability.

Preserve backend web/service/domain/repository separation, DTO validation, Problem Details and
optimistic locking. Use forward-only Flyway migrations; never edit an applied migration.
Document behavior/OpenAPI changes in the [README](README.md), including consumer effects.
For API changes affecting frontend types, follow the generation rules in
[frontend/AGENTS.md](frontend/AGENTS.md#architecture-and-checks), even during backend work.

Frontend work also follows [frontend/AGENTS.md](frontend/AGENTS.md). Backend completion checks
are in the README; frontend scripts and design rules are in the nested instructions. Resolve
missing broker, logging-retention or cloud decisions before implementing them.
