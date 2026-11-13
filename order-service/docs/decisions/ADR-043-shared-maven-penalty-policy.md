# ADR-043: Shared Maven courier penalty policy

Effective CHANGE-132 refinement, approved by Yao Xiang2026-10-15: Java type is
PenaltySystemPolicy, superseding the historical CourierPenaltyCase name below.
Add reward, report-subset and full-policy static queries; lists are immutable.
Order is migrated first and uses reward lookup. Same enum strings/amounts/wire,
no binary alias, new report workflow, module/deployment or authentication change.


Approved by Yao Xiang, 2026-10-15, CHANGE-130. Effective refinement of ADR-041:
the enum is shared source, initially consumed by Order; values remain +2/+1/-1.

Use ordinary foc-common Maven JAR in this repository, not a Git submodule.
Share only sg.edu.nus.foc.common.penalty.CourierPenaltyCase; no auth, persistence,
entities, outbox implementation or service business policy is extracted.
Enum names/positive amounts and all event wire contracts remain unchanged.
User Service's hardcoded HTTP policy is not silently migrated or verified.

Root reactor contains common and Order; existing Spring Boot parents retained.
Order Docker context is repo root, explicit COPY/allowlist excludes secrets.
Compose/CI/staging build the same sources; production promotes tested images.
Shared/root build changes test all Maven backends conservatively. Common has no
Dockerfile, service identity or deployment. Consumers rebuild to adopt updates.

Compared with a separate Git repository or artifact registry, reactor source
builds remove remote version/pointer operations. Cost: root-aware Order build
configuration. Other services may explicitly adopt later without importing Order.
Local verification: root wrapper -pl order-service -am verify. No schema/env change.

CHANGE-131 refinement, 2026-10-15: user requests all D1 NTH2 penalty mappings. Common additionally contains wrong-location delivery4, mishandling/damage4 and deliberate retention/theft10. The three automatic Order event reasons/JSON remain unchanged. No report resolution, highest-incident algorithm, score mutation or suspension enforcement is introduced; permanent suspension remains a D1 requirement for future User/Report integration.
