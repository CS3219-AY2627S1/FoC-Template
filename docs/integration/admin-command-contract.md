# Administrative Kafka command contract

Machine-readable review drafts, examples and validation: [contract package](../contracts/README.md).

Status: proposed v1 wire format for Darryl (Admin/User), Eldridge (Credit), Jun Hui (broker).
Behaviour approved: Kafka effects, independent credit corrections, reversible bans. No runtime
changes here. Read [Admin](admin-service-spec.md) and [Chat/authentication](chat-admin-contract.md).

## Topics, ownership and envelope

| Topic/key | Producer | Consumer groups | Types |
| --- | --- | --- | --- |
| admin.credit.commands / targetUserId | Admin | credit-service-admin | AdminCreditCorrectionRequested |
| admin.user.commands / targetUserId | Admin | user-service-admin | AdminUserBanRequested |
| credit.admin.events / targetUserId | Credit | admin-service-credit, chat-service-timeline | AdminCreditCorrectionApplied, AdminCreditCorrectionRejected |
| user.admin.events / targetUserId | User | admin-service-user, chat-service-timeline | AdminUserBanApplied, AdminUserBanRejected |
| admin.events / caseId | Admin | chat-service-timeline | CaseOpened, CaseClaimed, CaseActionCompleted, CaseResolved |

Separate topics avoid feeding unknown administrative messages into strict existing core consumers.
Admin writes commands only; owner writes its outcomes only; Admin/Chat read outcomes in independent
groups. Jun Hui provisions three-partition normal topics, one-partition DLTs and least-privilege
ACLs. Do not grant application identities broker-admin access.

Reuse core envelope fields, with a separate administrative catalogue: eventVersion 1, aggregateType
AdminAction, aggregateId targetUserId, aggregateVersion 1 (not account/Order version). Do not apply
Order's version gate here. Admin facts use AdminCase/key caseId with monotonic case revision.
Each command data includes operationId, caseId, orderId, caseRevision, targetUserId, requestedBy,
reason; credit additionally includes amount (signed nonzero JSON integer). UUID IDs and UTC times.
Actor userId equals requestedBy, actor role ADMIN. CorrelationId is case workflow UUID; initiating
causationId null. Outcome has new eventId, command eventId as causationId, same operation/correlation.

Generate operationId/eventId once with action + outbox transaction under Admin case lock. Reason
is trimmed 1-2000 characters (proposed bound). Action retry must never allocate a new operationId.

## Validation and authoritative effects

### Admin lifecycle delivery refinement

The approved Admin producer implementation delivers original stored envelopes to `admin.events`
with case ID keys and contiguous `data.sourceSequence` order per case. It uses a fenced Kafka
transactional producer; consumers must read committed records and deduplicate original event IDs.
Database progress is recorded after Kafka commit, so a crash can repeat an identical envelope.
Admin owns durable retry/backlog recovery and blocks missing/invalid sequences rather than
inventing facts. This transport refinement does not change the draft wire fields or constitute
Chat/Credit owner approval. Chat's projection/consumer remains an external dependency.


Admin checks current active admin, reviewer, UNDER_REVIEW, historical target and reason before
publishing. Owner validates service principal/topic ACL, envelope/producer/actor and current
admin eligibility per Chat security profile. No bearer credentials in Kafka. User outage retries
authorization; it is not interpreted as permission. Case authorization remains Admin-owned.

Credit performs remote eligibility verification before opening its ledger-locking transaction.
User validates its actor from its own database, never calls its own eligibility HTTP endpoint.
Authorization reflects the current check/transaction boundary; do not promise a global atomic
role revocation across independent service transactions. Never hold database locks across HTTP.

Credit locks account and atomically commits available balance delta, immutable ledger entry,
durable operation result, inbox and outcome outbox. Reserved balance unchanged. Reject missing
account, zero/fractional amount, overflow or resulting negative available balance. Clearly label
administrative issuance/removal rather than treating it as Order settlement or reward adjustment.

User atomically commits ban, operation result, audit, inbox and outcome outbox under lifecycle
guard. Preserve self-ban/final-admin protection and reject unverified target. Already BANNED is
successful NO_CHANGE, with no repeated consequences. Reactivation remains existing User admin
API/UI, extended with mandatory reason/audit, outside new case action types. No permanent-ban claim.

Outcome data: operationId, caseId, orderId, targetUserId, requestedBy, completedAt, result
(APPLIED/NO_CHANGE/REJECTED). Credit success adds amount, availableBalance, reservedBalance,
ledgerEntryId; User success adds previousStatus/status. Credit rejection also echoes the requested
amount so Admin can verify it matches its persisted command. Rejection adds reasonCode:
ACTOR_NOT_AUTHORIZED, ACCOUNT_NOT_FOUND, INVALID_REQUEST, INSUFFICIENT_AVAILABLE_CREDITS,
NUMERIC_LIMIT, SELF_SANCTION_FORBIDDEN, LAST_ADMIN_PROTECTED or INVALID_ACCOUNT_STATE.
No raw exception or authentication data. Do not reuse core CreditAdjusted/CreditAdjustmentRejected:
those have reservation semantics. CaseActionCompleted references owner event and operation.

## Recovery and reconciliation

- Inbox deduplicates eventId plus content hash. Durable operation hash covers type/case/order/
  target/actor/reason/amount. Same operation/input returns recorded outcome; different input is
  OPERATION_ID_CONFLICT, no effect, retained for investigation. New intentional correction needs
  explicit new confirmation/operation ID.
- Record expected business rejection durably. Transient failures roll back/retry. Commit effect,
  result and outcome outbox together; broker acknowledgement only after transaction commit.
- Admin tracks PENDING, UNKNOWN, SUCCEEDED, REJECTED. Proposed configurable outcome deadline:
  30 seconds; expiration yields UNKNOWN, not failure or permission to close.
- Recover original outbox using original IDs. If reconciliation needs a new delivery eventId,
  retain operationId and identical semantic input. Owner consults stored operation before effect
  and ensures recorded outcome is republished. Prior rejection does not become success on retry.
- Invalid/conflicting messages go to DLT with metadata after configured bounded retry. Admin
  stays UNKNOWN until reconciled; no invented rejection outcome. Delayed matching outcomes update
  action state but never originate another command. Lock case to prevent resolve overtaking actions.
- Admin validates outcome producer and operation/case/target/amount before inbox/action/audit
  commit. Out-of-order duplicates cannot reverse a recorded terminal result.
- Monitor outbox pending age, UNKNOWN actions, retries and DLT by event/operation/case/correlation
  IDs. Avoid logging complete reasons, message bodies or secrets. Broker uses existing deployed
  retry policy; do not change core retries in this documentation patch.

## Ban enforcement limit and acceptance

Protected operations across User, Admin, Supplier, Order, Credit and Chat require current account
and selected-role permission; see [current authorization](current-authorization.md). Kafka
publication alone does not enforce access. Logout/password-change token invalidation remains a
separate User-owned token-session design; it is not implied by account/role revocation.

Test: correction/debit/no negative balance; reserved unchanged; duplicate/conflicting operations;
crash-after-effect; delayed/lost outcome; queued actor revoked; User unavailable; self/final-admin
ban; already banned; UNKNOWN then recovery; closure race; existing core consumers unaffected.
