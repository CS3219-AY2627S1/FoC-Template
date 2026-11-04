# CHANGE-180 - Admin courier suspension controls

Date: 2026-11-04. Owner: Yao Xiang on `feat/suspend-unsuspend`.

## Approved scope and provider inspection

User explicitly requests Admin UI for PUT /api/users/{userId}/suspension and /suspension-removal. This supersedes the earlier request to remove Suspend from the Admin user profile. Existing UserController methods are admin-protected, bodyless PUTs returning User. UserService.suspendUser sets penalty10, isCourierSuspended=true and a one-month deadline; unsuspendUser clears flag/deadline without resetting penalty. User source/API inspected read-only. The running local image exposes Suspend but not the newly added Unsuspend route; rebuild its existing source for local integration. No User backend implementation is authorized/needed by this UI task.

## Design and implementation gate

- Existing ADMIN user full profile, top Admin actions card: show Suspend Courier when not suspended, Unsuspend Courier when suspended. Retain promotion, deactivation, summary, balance/history and navigation.
- Existing shared AdminConfirmation gains optional action labels/variant with its current deactivation defaults preserved. Suspend confirmation explains one month/score10/existing errands; Unsuspend explains restored courier access and unchanged penalty score.
- Active account and userActions capability required; busy state disables repeat submits and other actions/back/dismiss. Unknown/inactive/pending account states remain disabled. Server remains authorization authority.
- API adapter uses encoded target ID and existing useApi bearer transport, no body or mock fallback. Normalize and validate the returned target identity before updating the profile. Successful response immediately updates status/score/deadline and switches the action; failure retains profile/dialog, shows server explanation and allows retry. Returning to Users refreshes the list as before.
- Flexible existing action row and shared responsive dialog preserve styling. No new route, backend endpoint, schema, topic, env/config, auth policy, normal-mode UI or new financial/suspension rule.
- Known separate blocker: legacy User documents missing status can still fail saveActive writes; backfill/compatibility fix remains unapproved and is not hidden by this UI. Peer audit mapping and policy follow-ups remain separate.

## Verification plan

Use existing frontend admin page/API tests for confirmation/cancel, success/status toggle/score preservation, inactive/capability/busy controls, server errors/retry and identity/error propagation. Run affected tests RED first, then full frontend tests/lint/type checking and production build. Existing ADMIN route/permission tests remain. Requirements: explicit user amendment to Admin UI scope; NFR2.1 responsive styling reused, NFR3.1.3 positive/negative coverage. Backend behavior not modified.

## Verification results and limits

- Test-first:11 expected failures/41 passing tests in target/change180-red.log before production implementation. Focused final52 tests pass in target/change180-focused.log.
- Full frontend:331 tests across56 files pass in target/change180-frontend.log; lint passes in target/change180-lint.log. Direct npm run typecheck exits0 (Next route generation and tsc --noEmit), target/change180-typecheck.log.
- Real provider source inspected: both routes exist with ADMIN_ONLY and expected return semantics. Running local User OpenAPI exposes Suspend but not Unsuspend, so its image requires rebuilding from existing source. No real suspension/unsuspension or account-data mutation was performed.
- Docker User/frontend build commands produced no output; bounded docker info and both named-pipe ping probes timed out. Stopped only the two task-owned stalled builds after checking their process identities. Docker engine/containers were not restarted, preserving in-memory Pub/Sub pending messages. Docker image build and live endpoint/visual checks are not verified.
- Host npm run build started Next production compilation but failed with Windows System.OutOfMemoryException. No production build success is claimed. Restore local Docker/resources, rebuild existing User/frontend images, then verify Admin Users on a disposable active account before rollout.
- Existing legacy User documents missing stored status can still fail suspension/penalty writes; the separate compatibility fix/backfill is not authorized or performed. Existing User audit/policy peer follow-ups remain separate.
- Persistent change/sprint/contract/traceability/architecture/context/active-work/disclosure records updated. No new ADR, diagrams, schema, backend source, runtime settings, topics, cloud resources or normal-mode UI. Human code/browser review pending; source/docs left uncommitted for user review, with no commit or push requested.

## Flow and responsibilities

Admin profile action -> shared confirmation -> existing useApi bearer PUT through gateway -> existing User ADMIN_ONLY/policy -> normalize matching User response -> update profile fields and switch control. Error retains dialog and prior profile, pending disables repeat actions/dismissal. AdminUserProfile owns presentation/state, AdminConfirmation reusable dialog labels, admin-api encoded routes/normalization; User Service retains all policy/authorization. Existing deactivation defaults, profile/history/navigation and USER Requester/Courier pages are unchanged.
