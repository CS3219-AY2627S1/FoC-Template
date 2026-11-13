# CHANGE-109 - Profile frontend merge compatibility

Date:2026-10-11. Vincent explicitly requests fixing the frontend after mergec2fe90c
and reviewing exact upstream commitcd41186. Status:[~].

## Scope and authority

User-authorized shared frontend exception, only profile pages/tests plus required
Order-owned records and AI disclosure. No sibling backend/shared infrastructure
changes. Current branch/developer allocation matches Vincent. Existing dirty
audit/handoff records remain preserved; no old main restoration.

## Inspected contracts and minimal repair

- Current AuthProvider exposes identity/loading/token operations, not profile state.
  Replace the new route's absent context dependencies with local, account-keyed
  loading via existing useApi. Redirect signed-out users; abort stale reads.
- Existing authenticated GET /api/users/me returns saved User. Existing PUT to the
  same path derives UID from the bearer token, accepts {username} or {email}, and
  returns saved User. Classification:MATCHES_APPROVED_CONTRACT for these existing
  self-profile shapes; no UID/role/password fields sent to User Service.
- Username save uses PUT response, not missing refreshProfile. Email verification
  remains Firebase's verifyBeforeUpdateEmail/reload workflow. Only after reload
  confirms the requested verified email: refresh Firebase ID token, PUT {email},
  then announce success. Failure retains the verification control for another
  synchronization attempt; no claim of a distributed atomic profile transaction.
- Password remains Firebase reauthentication then updatePassword. Keep delete
  account UI removed. Add the existing Profile page's edit navigation.

## Classification and alternatives

Implementation detail repairing an incomplete merge against existing APIs. A local
account-keyed form isolates drafts across users and avoids global auth changes.
Restoring main's entire provider/backend or introducing shared profile context
would broaden scope and reintroduce reverted code; neither is used.

## Traceability and tests

NFR2.1 responsive shared UI and NFR3.1.3 positive/negative coverage; root frontend
authenticated gateway convention. No new Order FR/sequence/class responsibility,
schema, event, role mapping or architecture decision. The user's repair request
supplies this compatibility slice's acceptance criteria, not a new product FR.

Test first: current auth shape loads/prefills profile; auth restoration/no user;
load failure/retry; username minimal PUT/error; verified-email ordering/failure;
unverified email makes no PUT; password flow; account switch; edit navigation;
delete-account remains absent. Run focused/full Vitest, lint, typecheck and build.

## Exact friend commit review

cd411865573982168b7fb91c3878eebd949b3df3^1 -> cd41186 modifies only
frontend/src/app/profile/edit/page.tsx:25 deletions removing DeleteAccountButton,
its state/callback and section. Safe regarding new peer coordination: no added
endpoint/call or backend/configuration change. This does not certify inherited main
or remedy the current branch's separate missing frontend context dependency.

## Verification and handoff

Source/test commitd7f72a8. Initial13 tests:11 expected failures/2 passes; repaired
13/13 pass. Added account-switch-mid-verification test:1 expected failure/11 passes;
mounted-form guard now prevents old-account continuation. Final116/116 tests in27
files, no skips; typecheck/build pass; lint0errors/3 existing login warnings.
Outside-repository lockfile build warning unchanged. Patch whitespace checks pass.

No backend/AuthProvider/Order recovery/schema/config changes. D1/Overall hashes
match. No new architecture/ADR; detail registered in architecture evolution.
Actual backend inspected, not executed with real accounts. FEEDBACK-012 now
READY_FOR_VERIFICATION. Live verification-email delivery, authenticated browser/
mobile and runtime rollout remain gates. Existing User Firebase/Mongo update is
not atomic across services and is unchanged. Strict gate not rerun; Sprint[~].
Source committed separately; pre-existing overlapping audit/disclosure edits are
preserved uncommitted. Human review remains pending.
