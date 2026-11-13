# CHANGE-132: PenaltySystemPolicy name and shared selection methods

Owner: Yao Xiang, order-service/penalty-integration, 2026-10-15.
User explicitly requests renaming CourierPenaltyCase to PenaltySystemPolicy,
successful-delivery reward lookup, report cases excluding the original three,
full policy lookup and Order adoption first. Refinement of ADR-043/CHANGE-131.
Existing127-131 work preserved; profile/branch/source fingerprints agree.

## Approved API

Package sg.edu.nus.foc.common.penalty, enum PenaltySystemPolicy. Keep six existing
constant names and positive amounts exactly unchanged. Lombok amount getter and
constructor remain; add explicit policy selection methods:

- static PenaltySystemPolicy getSuccessfulDeliveryReward(): SUCCESSFUL_DELIVERY.
- static List<PenaltySystemPolicy> getCourierPenaltyCases(): WRONG_LOCATION_DELIVERY,
  ITEM_MISHANDLING_OR_DAMAGE, DELIBERATE_ITEM_RETENTION_OR_THEFT, in that order.
  Excludes ACCEPTED_TASK_CANCELLATION, OVERDUE_DELIVERY and SUCCESSFUL_DELIVERY
  exactly as requested; the name does not imply all five addition reasons.
- static List<PenaltySystemPolicy> getFullPenaltyPolicy(): all six in declaration
  order. Both lists are immutable so callers cannot alter shared policy data.

Rename Order imports, event DTO/facts types and tests. Order completion and event
direction selection use the reward helper; no new report case publication or
workflow. No HTTP API, serialized reason, amount, event ID, topic, schema,
authentication, database, module coordinate or build configuration change.
No old Java alias requested; Order is the only current library consumer.

## Responsibilities and validation

Common supplies stable lookup data; Order retains lifecycle/outbox/transport.
User/Report highest-penalty, confirmation and suspension logic remains pending.
D1 NTH2 mapping and ADR-041 automatic policy remain unchanged.

Tests first: rename test references before implementation for compile RED; verify
all six amounts, unknown-name rejection, exact reward, exact report/full list
membership/order and list immutability. Full root reactor verify retains coverage
gates; existing seven-field event and stored retry tests protect wire behaviour.
Check common JAR contains the new enum and no stale old class, AsyncAPI and patch
checks. No sibling backend/UI/build/deployment or cloud execution.

## Completed verification

- RED: renamed/helper tests failed compilation on missing PenaltySystemPolicy
  before source changes. GREEN common suite11 tests covers all6 mapping rows,
  invalid reason, reward, exact report/full lists and immutability.
- First full run: common passed; Order Docker-dependent tests failed6 and
  skipped31 because Docker Desktop was stopped and Docker fallback discovery
  parsed malformed Windows PATH entry C:\Program Files \PuTTY. No code assertion
  failures. Started Desktop hidden and excluded only that entry in the new test
  process; no system/user PATH setting or project workaround was persisted.
- Final root wrapper -pl order-service -am verify: common11 + Order420 =431,
  zero failures/errors/skips; original80% gates pass. Common12/12 lines (no branch
  counter); Order2121/2232 lines,892/1114 branches. No gate/exclusion changes.
- Common JAR/javap confirms six unchanged constants, the three typed static
  queries and getPenaltyAmount; new class exists and old enum class is absent.
  Existing Order JSON/identity/retry tests pass after DTO/mapper type migration.
- AsyncAPI/reference/topic validation and git diff --check pass. No schema or
  event version change. Current class diagram/docs/workflow name synchronized;
  dated old change/ADR records retained with an effective rename amendment.
- No new frontend/sibling/auth/source-build/schema/infra/cloud edits, application
  image rebuild/recreation, score mutation, deployment, staging or commit/push.
  Previous127-131 changes preserved. Hosted CI/human review remain pending.
- Evidence: ignored target/change132-red.log, change132-verify.log (environment
  failure) and change132-verified.log (final successful complete run).
