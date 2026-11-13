# CHANGE-186 - Courier unresponsiveness and ascending admin choices

Approved by Yao Xiang, 2026-11-10, on hfix/penalty-event-ordering: replace the
selectable courier bad-attitude penalty with courier unresponsiveness at 3 points;
sort Admin Apply penalty and Cancel with penalty choices from low to high.

Extends D1 NTH2 under the user's explicit policy override. No lifecycle, score
timing, highest-only selection, suspension, funding, hold or sequence change.
Existing CHANGE-185 edits remain in progress/review and are preserved.

Reactivate COURIER_UNRESPONSIVE(3) in foc-common; retire COURIER_BAD_ATTITUDE(2)
from active policy queries and new apply/cancel inputs. Retain its enum, original
amount, persisted order/attempt facts and consumer compatibility for saved outcomes
and pending events. Do not rewrite or waive historical penalties. Existing V19
constraints support both names; no migration or data backfill is needed.

Return report policies in ascending positive amount and independently sort copied
provider results in both frontend dialogs. Equal amounts retain provider/declaration
order. Expected choices: unresponsive3, wrong location4, damage4, theft10. Both still
submit a single choice; cancellation's explicit no-penalty semantics remain unchanged.

User Service accepts unresponsive3 in both v1 drain and v2 sequenced consumption,
and still reads bad-attitude2 for retained historical outcomes. AsyncAPI documents
both wire values while clearly distinguishing the retired selection. No new topic.

Affected: shared policy/tests/docs, Order integration expectations and policy API,
User policy validation/tests, Admin dialogs/tests, AsyncAPI and owning context/AI
records. Frontend structure remains components/admin, existing shadcn controls and
useAdminApi gateway client; Admin mode only. No new route, layout, dependency, auth,
env, GCP or live database mutation. Local missing-status scoring block remains separate.

Verification planned: RED shared-policy/dialog selection tests; positive 3-point
consumer and duplicate/recovery tests; rejected new bad-attitude selections; saved
enum compatibility; ascending unsorted-provider results in both dialogs; relevant
Order transaction tests, coverage, lint/typecheck and AsyncAPI checks.


## Verification and completion

Locally implemented; no application data/resources or running containers changed.
Three common-policy assertions failed before implementation; both new frontend
ordering checks failed on unsorted results. Green: 14 shared policy tests with verify/
coverage; 37 affected Order tests (domain, cancellation, deferred PostgreSQL flow,
event contract/outbox) with verify/coverage; 287 full User tests with verify/coverage;
360 frontend tests across57 files, full lint and Next route generation/TypeScript;
AsyncAPI1.8 parity/schema/11examples. No skipped tests in executed backend suites.
Initial User tests passed but branch coverage fell just below80 after deleting the
obsolete rejection. Added concurrent legacy duplicate acknowledgement and unrelated-key
failure tests; the unchanged80% gate now passes. Full Order regression was not repeated
for this amendment; prior CHANGE-185 full suite evidence remains separately recorded.
Browser/mobile visual and deployed scoring verification were not run. Existing local
missing account-status scoring issue remains unchanged and separately diagnosed.

| D1 reference | Requirement | Implementation | Test | Result |
| --- | --- | --- | --- | --- |
| NTH2 + user override | Unresponsiveness3, retired bad attitude | Shared active-policy queries, Order validation, User consumption | Positive v1/v2 three-point events, rejected new retired choice, archived historical enum | Passed locally |
| NFR3.1.1 | Reliable, verified change | Existing transaction/outbox/inbox model retained | Deferred completion/abort/cancel, duplicates and coverage gates | Passed locally |

Architecture impact: policy extension in existing components only; database/model
shape, HTTP paths, funding/hold/suspension/sequencing and penalty topic unchanged.
API /api/orders/admin/penalty-policies returns ascending report-case choices. Both
Admin dialogs sort copied provider arrays, retain stable ties, select one case and
submit unchanged request contracts. User's explicit no-penalty cancellation still
waives scoring; this amendment does not alter maximum selection or timing.
Persistent context, active work, ADR/index, traceability, service contracts, AsyncAPI,
common/User/Order READMEs, shared instructions, learning and AI usage updated. Existing
user-committed CHANGE-185 and in-progress changes preserved; no commit performed.

## Subsequent report identifier design request (proposal only)

The current shared CopyId control underlines on hover and copies when its text is
clicked; the Admin Report Order section is an entire card link. Proposed convention:
visible underlined navigation text with an internal arrow, separate labelled copy
icon with copied feedback, plain ID text without copy action, and a specific Report
Order ID link to /admin/orders?orderId=... rather than a whole-card link. Apply the
same convention to Order/User/Supplier/Report IDs after approval. No report/copy
component, navigation behaviour or API change was made in this amendment.
