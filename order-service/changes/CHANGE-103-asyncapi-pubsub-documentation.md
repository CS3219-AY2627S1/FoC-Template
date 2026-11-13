# CHANGE-103: AsyncAPI for existing Order Pub/Sub

- Date/developer: 2026-10-10 / Vincent.
- Branch: `sprint-2-3-credit-service-concurrency-update-event-payload`.
- Approval: "OK document my pubsub in async api now". Documentation-only scope;
  no new event behavior, provider implementation, frontend or infrastructure.
- Classification: representation/implementation detail, not a contract amendment.
- Authority: ADR-013/021/025/026/031/034 and current publisher/mapper/outbox code;
  scoped effective context loading under ADR-033. Parent/Order instructions apply;
  no nested instructions found in affected documentation/scripts subtrees.
- Source drift: D1 and user-selected Overall PDF SHA-256 match recorded values;
  historical Updated PDF remains absent, not silently substituted.

## Added and retained

`docs/asyncapi/asyncapi.yaml` represents the three current Google Pub/Sub channels
and send operations. Refund/completion have exactly seven JSON fields (v2 attribute);
accepted abort has its existing v1 envelope/current snapshot, actor, version and
five-field optional plan. Five complete examples cover both refund statuses,
completion and both abort outcomes. Attributes, parameterized topic/project,
ADC/service identity, no ordering key, stable event identity and publication versus
financial acknowledgment are documented. No invented receive/reply operation or
Cloud Pub/Sub schema registry is declared.

`docs/asyncapi/README.md` explains viewing/validation, actual peer push routes,
delivery/leases/recovery and verification limits. The source-parity validator
checks DTO field sets, topic variables/defaults, mapper versions, publisher
attributes, schemas/examples/negative cases, send-only references and outbox cadence.
Indexes, contracts pointer, context, traceability and Vincent active work link it.
Local learning remains excluded; root AI usage disclosure is the authorized exception.

Current Credit decoder/record/controller accept compact v2 shape and matching
attributes through typed `/open-refund` and `/completion` push routes. This supersedes
older source assumptions for this documentation, but does not set peer feedback
VERIFIED or prove ledger/authentication/cloud integration. User abort subscriber
was not found in the inspected source; completion overdue facts remain a peer gap.
Historical decisions/feedback are preserved. Sprint remains `[~]`.

## Verification evidence

- Documentation checker first failed with missing AsyncAPI file (expected RED).
- PyYAML/jsonschema checks pass: three operations/channels, five DTO field sets,
  five examples, negative extra-field/version/status cases, source topics/metadata/
  mapper/cadence and snapshot IDs/versions.
- First official CLI 6.2.0 run exposed a Google binding requiring schemaSettings.
  Removed that optional binding rather than claim an unconfigured cloud schema.
  Initial run on Node 22 had engine warnings; not the final supported-runtime check.
- Official CLI 4.1.1 validation exits 0, zero document errors/warnings and one
  informational suggestion to use AsyncAPI 3.1.0. npm reported transitive engine/
  deprecation warnings; these are tool dependency notices, not application changes.
- Final CLI 6.2.0 validation with temporary Node 24.11.1 also exits 0: zero
  document errors/warnings, same single informational format-version suggestion.
  npm cache downloads emit host-engine/deprecation notices; no dependency, lockfile,
  installed Node version or application runtime was changed. Final checks on 2026-10-11.
- Structured context TOML parses. D1/Overall hash inspection matches. Diff whitespace
  and explicit-path scope review performed before commit.
- No Maven/frontend/browser/financial/cloud test was run for this documentation-only
  task. Existing test references are links, not fresh runtime verification claims.

## Traceability and handoff

| Requirement | Artifact | Check | Result |
| --- | --- | --- | --- |
| F4.1.7, F4.1.8/F10, F11 / ADR-025/031 | Compact refund channel/body | DTO/parser/example checks | Documentation verified; live gate unchanged |
| F4.1.5/F5.1, F11 / ADR-031 | Completion channel/body | Same, completed example | Documentation verified; live gate unchanged |
| F11.2 / ADR-025 | User abort channel and OPEN/EXPIRED snapshot | Both examples and nested DTOs | Documentation verified; User consumer unverified |
| NFR consistency/verification / ADR-013/021/026/034 | Publication identity/attributes/outbox guide | Source parity, negative schemas, parser | Documentation verified; no delivery guarantee claimed |

No Java, frontend, peer source, migrations, database, topic/subscription, IAM,
Compose, gateway, CI or service credentials were changed. Documentation validation
does not fix operational or authorization gaps and does not finish the Sprint.

Documentation/validator commit: `5556eb9`, local only. Guide relative links (7)
and whitespace/scope checks pass. Task disclosure and commit handoff are recorded
separately; excluded learning is not staged. Human review remains pending.
