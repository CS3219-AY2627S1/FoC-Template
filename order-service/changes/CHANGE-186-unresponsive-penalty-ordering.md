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
