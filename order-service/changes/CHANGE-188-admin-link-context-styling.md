# CHANGE-188 - Context-specific admin link styling

Approved Yao Xiang, 2026-11-10, hfix/penalty-event-ordering: underline table
navigation only on mouse hover, keep a more obvious permanent underline for
supported detail-view navigation, and remove supplier-card title navigation because
View details is already present. Copy all table IDs exclusively through copy icons.

Refines CHANGE-187 without changing its icon-only copy or explicit Report Order ID
navigation. Use underline alone, no extra navigation arrows: table links also underline
on keyboard focus; detail links use a 2px underline with the existing offset/theme.
Supplier-card names remain plain, their copy icon still copies the full ID and View
details remains the existing route. Order-detail related-supplier links remain valid.

Scope: shared AdminRecordLink, Orders table context, Users table profile opener,
Supplier cards and related tests/docs. Admin mode only, existing components/admin,
existing gateway APIs/auth, no backend/schema/API/dependency/config/cloud changes.
Existing uncommitted policy/identifier/review work is preserved. Project source hashes,
developer and branch remain consistent with CHANGE-187; only this approved presentation
rule supersedes its permanent-underlines/arrows and supplier-card-title links.

Verification: focused identifier/table/card regressions, full frontend tests, lint,
route type generation/TypeScript. No new business feature or backend test changes.

## Final verification

Implemented in the existing shared link component and Admin Orders/Users/Suppliers.
Three updated assertions failed before implementation; all74 focused Admin identifier,
page and Report cases pass after implementation. Full frontend lint and Next route
generation/TypeScript pass; diff whitespace check passes. The broader363-test run is
CHANGE-187 evidence, not rerun for this low-impact style amendment. Browser/mobile
visual, production build and Docker/deployed checks were not run. No runtime restart,
backend change, database mutation, commit or push performed.

Table record links and the user-profile opener use hover/focus underlining. Detail
navigation, including Report Order ID and related account/supplier links, defaults
to permanent 2px underlining. Extra arrow icons are removed. Supplier card titles
are plain text with a separate copy icon; the existing View details link remains.
Shared CopyId remains the only Admin clipboard writer, invoked only by its icon.
Tests confirm clicking a displayed supplier name does not copy or navigate, copying
retains the actual ID, table link destinations are preserved, and Report detail links
remain explicit and separate from copying.

| D1 reference | Requirement | Implementation | Test | Result |
| --- | --- | --- | --- | --- |
| NTH1 | Clear Admin navigation/copy controls | Context-aware AdminRecordLink and existing card/table controls | 74 focused cases; lint/typecheck | Passed locally |

No backend, API, auth, data model, requirement scope, architecture component, skill,
dependency, environment or infrastructure change. Shared frontend sources/tests,
UI style guide, owning change/active work/context, architecture/change indexes,
traceability, learning and AI disclosure updated. Existing Report review findings
and in-progress penalty changes remain unchanged.
