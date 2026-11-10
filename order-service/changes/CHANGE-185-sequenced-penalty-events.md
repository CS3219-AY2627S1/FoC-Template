# CHANGE-185 — Unified, sequenced courier penalty events

Approved by Yao Xiang, 2026-11-10, on `hfix/penalty-event-ordering`:
"merge the topic. And add sequence number ... courier-penalty-event ... change the user service as well".

Current sprint: D4 integration/hardening, extending the approved Sprint 2/3 NTH2 flow.
Authority: D1 NTH2 (penalty additions/rewards), NFR3 consistency/reliability and
approved deferred highest-penalty outcomes. Scoring values and suspension rules do not change.

Approved design: retain addition/deduction event types; publish new eventVersion=2
envelopes to courier-penalty-event-{local,dev,prod}-v1 with positive courierSequence.
Order owns the sequence of committed scoring outcomes across all orders of one courier.
It is not wall-clock ordering. A locked PostgreSQL counter and stable event-to-sequence
binding commit with the outcome/outbox; rollback cannot consume a position. No score
sequence is assigned to a provisional admin penalty or a no-score outcome.

User owns a Mongo transactional inbox, event-ID binding and courier stream cursor.
Receive-before-apply is durable. Only lastAppliedSequence+1 can change a score;
score/processed marker/inbox/cursor commit atomically. Different couriers remain independent.
The recovery timer drains pending streams fairly; gaps are retained and logged, never skipped.
Duplicate and conflicting sequence/event identities are distinguished. Existing User
suspension/reset behavior is preserved; administrative writes do not reset the stream cursor.

Peer classification: existing v1 consumer INCOMPLETE_OR_INCOMPATIBLE with the approved
v2 contract; explicit user approval authorizes changing both implementations together.
No pending provider assumption is used. Existing seven event facts plus courierSequence;
eventVersion stays a Pub/Sub attribute. Old unsequenced outbox events retain their original
topics/routes and IDs solely for drain. Do not backfill published scoring effects.
Legacy first deliveries after a courier starts the new stream fail closed for reconciliation;
known duplicates remain harmless. A coordinated backlog-drain cutover is required.

Communication decision: durable broker/outbox retained (approved). Synchronous score
calls would couple completion to User availability; polling/in-process signals cannot
replace durable cross-service delivery. Broker ordering keys improve delivery but do not
replace source numbering/inbox order enforcement. No new frontend or unrelated API.

Affected: Order event factory/DTO/mapper/publishers/outbox routing, V21; User push receiver,
Mongo inbox/cursor/recovery/security; local/bootstrap/deployment/CI topic settings and
contracts/tests. Shared topic wiring is necessary to the user-approved merge. No cloud
resources, live databases, commit, push or deployment are changed by this task.

Verification plan: RED eight-field contract; counter rollback/idempotency/concurrency;
reverse arrival and score-floor example; duplicates/conflicts; restart/gap retry;
legacy cutover; publisher ordering key; authenticated unified endpoint; provisioning checks.
Docker availability, full builds and actual test results will be recorded before handoff.


## Final implementation and verification (2026-11-10)

Locally implemented and verified; human review and controlled cloud cutover pending.
Full root reactor Order/common verify and standalone User verify pass: 727
Order, 13 common, 284 User tests; zero failures, errors or skips. Both coverage
checks and package/OpenAPI generation pass. Mongo replica-set consumer integration
covers 40 cases; isolated PostgreSQL source sequence/upgrade covers four. The initial
seven-versus-eight-field contract test failed as expected before implementation.
The first full Order run exposed one stale V20 expectation; updated it to V21 and
reran the full suite. Initial Windows wrapper/compiler limitations were bypassed
using the cached wrapper Maven distribution with Java21, without source/build policy
changes or global Maven dependency. Test databases are isolated, never application data.

AsyncAPI parity/schema/examples, 21 fake-gcloud/local-bootstrap workflow tests,
three Order local-emulator tests, Bash syntax, Compose config and diff whitespace
checks pass. New provisioning regressions test ordered creation, idempotent rerun
and rejecting an existing unordered subscription without deleting its backlog.
Final review found failed retry batches could starve later couriers; a separate
atomic retry timestamp plus real-Mongo and processor tests now protect fairness.
The unified HTTP push route rejects unsigned requests in Google mode; the existing
OIDC issuer/audience/account validator tests remain green. No real Pub/Sub delivery
or GCP IAM/resource/deployment operation was performed.

| Project D1 reference | Requirement | Implementation | Test | Result |
| --- | --- | --- | --- | --- |
| NTH2 | Preserve the approved penalty/reward outcomes in order | Order source counter/event factory and User inbox/cursor | Reversed arrival at score floor, duplicate and concurrent consumer tests | Passed locally |
| NFR3 | Reliable local atomicity and recovery | V21 SQL transaction, Mongo receipt/apply transactions, outbox and retry processor | SQL rollback/concurrent numbering/V20 upgrade; Mongo rollback, restart/gaps/fairness | Passed locally |

Sequence/class ownership, database models, broker contract, operator commands and
rollback/gap recovery: [cutover handoff](../docs/penalty-event-cutover.md). This extends
the approved NTH2 reliability architecture without adding penalty values, altering
suspension/report/credit behavior, or changing the frontend. Requirements, architecture,
ADR/index, AsyncAPI, service/migration contracts, peer feedback, active work, persistent
context, learning and AI usage have been updated. Migration V21 is additive; no legacy
event, cursor or score is backfilled, renumbered, deleted or reset.

Remaining: deploy compatible User first; pause/drain/reconcile old scoring messages
and retired provisional policies; provision the unified topic/subscription; deploy
Order and smoke test both event types before resuming scoring. Existing legacy-account
and theft/permanent-suspension provider issues remain outside this change. Never skip
a missing sequence or switch producers back without reconciliation.
