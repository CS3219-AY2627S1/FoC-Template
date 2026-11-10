# CHANGE-183 - automatic repost business-rejection policy

Approved Vincent, 2026-11-09, branch auto-repost-fix, explicit confirmation and request to resume implementation plus one replacement slide. Narrowly supersedes CHANGE-164: a confirmed business rejection stops automatic attempts for that original, even if the balance/details later recover. Manual repost remains available under its existing checks.

## Scope and design gate

- Current sprint/feature: Sprint2-3 lifecycle, NTH4 automatic/manual linked repost. D1 F1/F10/F13, NFR3.1 testing/concurrency/durability, ADR-025/027/030/033/055 and CHANGE-164 apply. D1 and selected Overall fingerprints match; scoped current-context exception ADR-033 applies.
- Classification: user-approved behavior amendment. Existing scheduler, OrderCommandService/Store, original row lock, pending uniqueness, compensation journal and repository retain their responsibilities. SQL and direct/locked registration guard must agree.
- Policy: existing terminal reason INSUFFICIENT_CREDITS, FORBIDDEN, ACCOUNT_NOT_FOUND, NOT_FOUND, VALIDATION_ERROR or REPOST_EXPIRED disallows another automatic attempt. A durable completed command already holds this evidence; no schema/status/plan-used change. Failed plan stays EXPIRED, unlinked and manually reviewable.
- Temporary outages, original refund lag, holds and stale-version contention retain later eligible scans. Possible Credit effects must reach confirmed compensation first; pending/reconciliation and failed publication never become safe by a retry limit. Every fresh attempt rechecks current plan/requester/suppliers before any new Credit effect.
- Contracts: actual Credit internal funding-ready/reservation controller, command/error mapping, HttpCreditCommandGateway and HttpBackgroundRepostChecks inspected. Current eligibility bool/pair-valid bool and keyed authoritative no-effect rejection match the approved contracts. Transport/HTTP failures remain SERVICE_UNAVAILABLE, not presumed business rejection. No peer API gap introduced. User/Supplier reads remain fixtures in real Credit integration tests.
- Backend: OrderCommandStore, JpaOrderRepository, OrderCompensationJournal and existing tests. Data ownership unchanged: Order plans/commands/links; Credit funds; User eligibility; Supplier locations. No peer application writes, migration, topic, JWT, deployment or cloud mutation.
- Frontend: ../frontend Next16 App Router/package/config/Order failure projection inspected, no pre-existing Git changes. Existing USER Requester expired card displays repostFailureMessage on desktop/mobile and keeps manual form; no new UI/API field/layout. ADMIN/Courier unchanged.
- Tests first: insufficient funds stays stopped after balance restoration, all five other confirmed business reasons stop both SQL and direct retries, manual remains possible. Preserve temporary failure retries, refund wait, unresolved compensation barrier, lost response/reversal and competing workers/one successor regressions.
- Interaction approvals pending: none. Existing synchronous reservation plus Pub/Sub compensation/result stays unchanged. Cloud rollout remains a separate unverified operation.

## Alternatives and limitations

Repeated safe business rejections (CHANGE-164) waste work until the user changes the input/funding. A new plan status/schema would duplicate immutable command evidence and complicate manual recovery. Reuse command reasons in both selection/guard, without marking a failed plan used. An uncertain response is never classified from its HTTP status alone. Generic confirmed compensation permits revalidation, not automatic business approval. No promise of punctual execution or live staging verification.

## Verification

[~] RED/GREEN/integration/regression results pending. Existing tests are not rewritten merely to pass: the former insufficient-funds retry assertion is intentionally replaced by the approved contrary behavior.
