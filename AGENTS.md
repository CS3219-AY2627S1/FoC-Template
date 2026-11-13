# Repository agent rules

Before editing, identify the owning service from [TASK_SPLIT.md](TASK_SPLIT.md) and read its
`AGENTS.md`, including any nested instructions for the affected folder. Ask if ownership is
unclear. For an explicitly assigned shared task, identify its editor and affected service owners.

Before any frontend design or implementation work, read the shared [product design
contract](design.md). It governs cross-service presentation and journeys; service requirements,
APIs and backend authorization remain authoritative for behavior.

## Boundaries

- Work within the assigned service/N2H area and approved shared-file scope. Never change another
  service's code, API, frontend, or database just to make your task pass.
- Each service exclusively reads/writes its own database. Integrate through producer-owned
  APIs/events; every backend enforces authorization locally.
- Before introducing or changing a cross-service contract, obtain explicit approval of ownership
  and behavior. Document caller/producer/consumer, inputs/outcomes, operation identity, duplicate
  handling, failure/retry/reconciliation responsibility, and observability where applicable.
- Shared gateway, Compose, environment examples, broker configuration and CI changes have one
  nominated editor and require review from all affected service owners.
- A new required Compose variable (`${NAME:?...}`) must be added to `.env.example`, every CI job
  that runs Compose and `deploy/kafka/Test-LocalKafka.sh` in the same change; CI never reads
  `.env`. `python3 .github/scripts/compose_env_check.py` checks this on every PR.
- Use approved backlog/wireframes for product rules; record missing or conflicting rules for
  confirmation. Update affected tests and service documentation when behavior changes.
- Keep shared UI decisions in `design.md`, not copied service notes. A material shared-design
  change updates that contract, affected implementations and regression tests together and needs
  affected frontend-owner review.

## Reading and workflow

Read applicable guidance once per task; revisit it when scope or documents change. Inspect only
relevant README/contract sections, source and tests. Read a service checklist when choosing or
scoping an iteration; it is a roadmap, not a requirement to implement all steps.

Use `$foc-iterate-feature <service>-<iteration>: <outcome>` for the staged feature workflow, and
`$foc-commit` when commits are requested. Skills define the process; service instructions define
the invariants; READMEs hold behavior/contracts and verification commands. Personal, ignored
checklists are not shared acceptance sources.
