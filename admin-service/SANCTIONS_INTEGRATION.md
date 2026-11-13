# Reversible case bans

Scope approved by Darryl: Admin action tracking/UI, User's sanction consumer and reason/audit
reactivation, and nominated shared-file edits. Wire shapes use the existing review drafts
unchanged. This approval does not represent Jun Hui/Eldridge/XueTing review or deployment approval.

## Ownership and authorization

Admin owns the case, assigned reviewer, participant eligibility, reason, request receipt, command
outbox, outcome inbox, action state and case audit. User owns current account/admin status,
the lifecycle guard, ban effect, account audit, stored operation result and outcome outbox.
Neither application reads the other database. Gateway forwards only the existing public routes;
no internal endpoint or new account-administration interface is added to Admin.

`POST /api/admin/cases/{caseId}/actions` accepts `type: BAN`, `targetUserId`, `reason`, and
`Idempotency-Key`. Omit `amount`. Admin requires a current active administrator in ADMIN mode,
assigned reviewer, UNDER_REVIEW case and a verified reporting participant. Historical non-reporters
remain blocked on Chat eligibility. The trimmed reason is 1–2000 characters. An accepted 202
means durable tracking, not a completed ban. Repeat the same request key/body to recover its
original receipt; changed input/actor/route conflicts. Credit corrections retain their existing API.

User verifies command key/producer/type/version/actor/identities before considering an effect.
It acquires its existing lifecycle guard, checks its own current actor and target records, and
preserves self-access/final-active-admin protection. An active target becomes BANNED; an already
banned target produces successful NO_CHANGE. An unverified target is rejected. The current User
checks and effect occur in the same owner transaction; no HTTP call runs under its lifecycle lock.

## Kafka and recovery

| Resource | Producer / writer | Consumer / reader |
| --- | --- | --- |
| `admin.user.commands`, key target UUID | Admin `admin_service` | User `user_service`, group `user-service-admin` |
| `user.admin.events`, key target UUID | User `user_service` | Admin `admin_service`, group `admin-service-user` |
| `admin.user.commands.DLT` | User | Operational read-only UI |
| `user.admin.events.DLT` | Admin | Operational read-only UI |

Normal topics have 3 partitions/7-day local retention, DLTs 1 partition/30 days. No application
receives broker-admin privileges. Core event consumers remain on their existing topics/groups.
Chat's timeline consumer/ACL remains a later owner-reviewed integration.

Admin sends `AdminUserBanRequested`; User emits `AdminUserBanApplied` (APPLIED/NO_CHANGE) or
`AdminUserBanRejected` using the existing administrative envelope. A ban result has no amount.
User atomically commits effect, immutable result, inbox, audit and outcome outbox before command
acknowledgement. Unknown/invalid/conflicting commands are privately quarantined with metadata-only
DLT signalling; they do not fabricate a business rejection. Storage/broker failures retain offsets.

Deduplication compares canonical event content and semantic operation input. A duplicate republishes
the original event/result, even if the actor has since lost access or the target was reactivated.
It never reapplies the effect. Conflicting event/operation content is retained for investigation.
Outbox leases and dispatch generations prevent an in-flight acknowledgement from losing a requested
republication. No database transaction spans broker send/acknowledgement.

Admin preserves operation/event identity while retrying, displays PENDING then UNKNOWN after the
configured deadline, and accepts only matching owner/correlation/causation/actor/target/case/order
outcomes. Terminal results cannot be reversed by older/conflicting events. CaseActionCompleted and
audit are persisted atomically; recovery exports support NO_CHANGE. The Admin lifecycle Kafka relay
is still deferred. Aggregate metrics track pending/unknown/outbox/quarantine without private labels.

## User-owned reactivation

The case GUI links to `/?view=users`. User's existing status endpoint accepts
`{"status":"ACTIVE","reason":"Reviewed appeal"}` for a banned account. A nonblank reason is now
mandatory for reactivation and is recorded in User's account audit in the same transaction.
The User GUI collects and confirms that reason. REST ban/role routes keep their existing behavior.
Reactivation never changes the historical case or previous ban outcome. There is no permanent-ban
claim. Existing stateless tokens on other services may remain valid until expiry; immediate global
revocation is not implemented by publishing a ban event.

## Runtime and verification

Standalone `USER_ADMIN_COMMANDS_ENABLED` defaults false; shared Compose prepares true and waits
for successful Kafka initialization. Admin's database configuration now also requires
`ADMIN_DB_NAME` and `ADMIN_DB_USER`, matching the other services; `.env.example`, all Compose
CI jobs and the Kafka smoke script provide them. Existing
User broker credentials are reused only by User; Admin continues to use its separate principal.
Coordinate broker/topic/ACL and consumer rollout with Jun Hui and all affected owners before
activating the shared stack. Existing databases/containers are not reset or populated with fixtures.

`python3 admin-service/scripts/runtime_smoke.py` uses a unique disposable project, real packaged
Admin/User/gateway images, private databases and authenticated Kafka. Account activation and case
eligibility are explicitly test-only setup, not proof of registration/email/Chat integration.
Reviewer independence is checked against an explicit Python timeline fixture on a private,
internal smoke-only network with no host port. Missing/unconfigured or incomplete evidence must
return 503 without creating an action before complete fixture evidence permits the unrelated
reviewer. This does not verify real Chat reconciliation or service-token validation. The fixture
never runs in the normal stack. User's self-ban backstop uses a direct test-only Kafka command:
an independent reviewer cannot also be a participant target in their own case. The reviewer is
not inserted as an errand participant to make that test pass.
Ban decisions and outcomes come from real User. Credit rejection outcomes remain test-only and
are not evidence of Credit financial processing. The optional `ADMIN_RUNTIME_UI_REVIEW=true` holds
the disposable GUI for up to five minutes and deletes its temporary credentials afterward.
By default the smoke also pauses/resumes User's consumer to verify UNKNOWN/recovery. A focused
rerun may set `ADMIN_RUNTIME_CONSUMER_OUTAGE=false` to reuse an unchanged transport phase; it
prints the skipped phase explicitly and must not be reported as a fresh outage-test pass.

Tests cover reviewer/target/reason authorization, stable receipts, mixed action history, owner-bound
outcomes, NO_CHANGE, quarantine, rollback after an audit failure, cross-ban concurrency, User's
self/final-admin guard, reactivation and original-result replay, and outbox generation races.
User entity updates write only changed fields: a regression test reproduced an unrelated profile
save restoring stale ACTIVE status after a committed ban, and verifies that the fix preserves
both the profile edit and BANNED status. This remains entirely within User persistence.
User's account controller returns validation problems directly so its protected fallback `/error`
route cannot mask a missing reactivation reason as an empty 403. A real HTTP-server regression
checks the 400 problem response without opening `/error` or changing gateway authorization.
Final-active-admin protection has a direct guard unit test and real-database cross-ban concurrency
test: with one active admin, a legitimate actor targeting that same account hits self-protection
first. Do not fabricate another eligible actor to claim a live LAST_ADMIN_PROTECTED scenario.

Manual acceptance: desktop/mobile and keyboard case-ban confirmation; readable protected-account
feedback; participant/other-reviewer read-only access; pending/UNKNOWN recovery; User reactivation
reason/focus/cancel; no duplicated account-management controls. User decides manual acceptance.
