# Shared penalty policy library

Effective CHANGE-186 (2026-11-10), approved Yao Xiang: reactivate COURIER_UNRESPONSIVE(3)
and retire COURIER_BAD_ATTITUDE(2) from new selections. Keep bad-attitude enum/data/event
compatibility. Report policies are immutable and sorted ascending by amount; full
active list retains declaration order. This supersedes the active/retired selections
below. Existing deferred highest-penalty and sequencing rules do not change.

Effective CHANGE-170 (2026-11-01), approved Yao Xiang: COURIER_BAD_ATTITUDE adds 2 points and belongs to the selectable report subset and full active list. Seven active policies; four report cases. Preserve all older values and the retired unresponsive compatibility constant. No new score consumer or topic is implied.

CHANGE-134, approved2026-10-16: add COURIER_UNRESPONSIVE(3). Full policy now7;
report subset includes this case while still excluding the original3 automatic
outcomes. Order admin cancellation can select any addition and emits only its
highest requested case. Original reason names/values unchanged.

Follow root AGENTS.md. This ordinary Maven JAR currently shares only
sg.edu.nus.foc.common.penalty.PenaltySystemPolicy, per Order ADR-043 / CHANGE-130.

- CHANGE-132 renames the old CourierPenaltyCase Java type. Keep static queries:
  getSuccessfulDeliveryReward returns SUCCESSFUL_DELIVERY; getCourierPenaltyCases
  excludes ACCEPTED_TASK_CANCELLATION, OVERDUE_DELIVERY, SUCCESSFUL_DELIVERY;
  getFullPenaltyPolicy includes all six. Returned lists are immutable and ordered.
  Do not confuse the report-case subset with all automatic addition reasons.

- Keep approved names/amounts stable: accepted cancellation 2, overdue delivery 1,
  successful delivery 1, wrong-location delivery 4, mishandling/damage 4,
  deliberate retention/theft 10 (CHANGE-131, D1 NTH2 PDF37-39).
  Amounts are positive; only successful delivery deducts. Report misconduct needs
  administrator confirmation. The mapping does not enforce suspension, select
  the highest incident or implement report resolution; do not claim otherwise.
- No authentication, service entities/repositories, persistence, HTTP endpoints,
  Spring runtime configuration or application service logic in this module.
- No Dockerfile, database or deployment. Services bundle this dependency.
- Verify with root `bash ./mvnw -pl foc-common verify` or PowerShell
  `.\mvnw.cmd -pl foc-common verify`; retain 80% line/branch coverage gates.
- Policy/wire changes require team agreement and consumer compatibility review.


## Effective CHANGE-147 — Report reply privacy and active policy choices (2026-10-19)

Approved Yao Xiang: admin resolution reply is visible only to the submitter and reviewing admins; courier participants still see resolved status/time and other existing case information. Local prototype list/detail responses redact resolutionNote on copied snapshots, and UI hides the reply in courier views. Production Report Service is still missing and must enforce this with verified caller identity, never client-supplied roles. Live Reports remain Coming soon.

COURIER_UNRESPONSIVE is retired from active policy lists and new admin apply/cancel choices. Its enum/amount remain only for historical persisted rows and existing outbox events; immutable migrations and saved penalties are not rewritten or waived. Six active policies; three selectable report penalties (wrong location4, damage4, theft10). Cancellation UI selects one radio case and sends the existing one-element list; stored maximum semantics and existing penalty topics remain unchanged.

Report cards omit Order descriptions; closed cards are muted but remain navigable. Requester/courier names link to admin profiles, IDs have separate copy rows. Admin table names, email, roles and IDs truncate visually while full values remain in titles/copy/details. No sibling backend or shared runtime/CI/cloud configuration changes. See CHANGE-147.
