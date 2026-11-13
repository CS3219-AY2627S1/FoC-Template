<!--
AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-04 (Asia/Singapore).
Scope: Archived exact user requests and actual outcomes for deletion/restoration.
-->

# Prompt archive — 049

## Exact user prompt

```text
## My request:
ok now let’s implement credit service’s part for the user deletion and restoration flow

User deletes the user row and archives only the email and old ID, for up to 4 years. Order blocks deletion while the user has unresolved orders or credits
- Return within 4 years: the user gets a new ID. Only the old balance carries over, with no starter credits. User sends user.restored instead of user.created.
- After 4 years: Credit does nothing and no event is sent.

Events (handlers must be safe to repeat):
- user.deleted: eventId, occurredAt, userId, deletedAt
- user.restored: eventId, occurredAt, previousUserId, userId

Credit's requirements:
1. On user.deleted: keep the balance and ledger. Deletion is normally blocked while orders are unresolved. If a race lets it through, Order flags MANUAL_REVIEW_REQUIRED and the reservations stay as they are; Credit must still allow them to be released or settled. It changes ACTIVE → DELETED, or creates a DELETED placeholder if the account doesn't exist yet. It never changes a CLOSED account, so a late or repeated event can't reopen it.
2. On user.restored:
Create an account under the new ID.
Transfer the old balance, and set the old balance to 0.
Grant no starter credits.
Don't store the old ID in anything tied to the new ID, including history and idempotency records

Credits must never be lost or doubled, and the new account must stay unlinked from old records.

The new account gets a history row, the old account doesn't. Two rows in one transaction would share created_at and the amount and have adjacent sequence_id`s, so anyone with database access could link the accounts. `credit_accounts has no timestamps, so a column there leaves no time to match.
let’s add a status column in credit_accounts, status: ACTIVE (default) → DELETED (on user.deleted) → CLOSED (on user.restored)
reserveCredits, updateReservation, getBalance, REST balance/history: ACTIVE only; otherwise ACCOUNT_NOT_FOUND.
releaseCredits and settleCredits (requester and courier): ACTIVE or DELETED, so manual review can resolve raced reservations.
GetReservation: every state.
No idempotency record for restores. The existing new account is the repeat check, so nothing in idempotency_records holds either ID for this operation.
A repeated reserveCredits or updateReservation on a now-DELETED account returns the original success, not ACCOUNT_NOT_FOUND., since it's a replay of something that already happened
Where to check status:
getBalance and reserveCredits, updateReservation, : after the existing findAccount (which runs after lockAccounts for the mutations), treat status !== 'ACTIVE' the same as missing.
releaseCredits, settleCredits: allow ACTIVE and DELETED. In settleCredits, check both requester and courier.
getUserCreditHistory reads no account today, so add a findAccount(userId) and status check before findHistoryByUser. REST balance and history go through these service methods, so rest/server.ts needs no change.

in shared/messaging/src/contracts/
- credit.ts:
- Remove creditUserArchivedSchema and creditUserRestoredSchema, plus their union entries and types.
- Remove the RESTORED balance reason, nothing uses it.
Update the header comment that mentions archive/restore confirmations.

Credit's handler needs previousUserId in userRestoredSchema, and must not require purgeAfter in userDeletedSchema. user service is handling the changed in user.ts where they delete purgeafter from userdeletedschema and add previousUserId to userrestoredschema, so we don’t need to change that file. 

Migration 011: credit-service/migrations/011_*.sql

- Add status text NOT NULL DEFAULT 'ACTIVE', CHECK IN ('ACTIVE','DELETED','CLOSED'), and CHECK that CLOSED means total_credits = 0 and reserved_credits = 0.
- Add history type BALANCE_RESTORED. Drop and re-add these constraints from migrations 006, 007 and 008:
- credit_history_type_check: allow the new type.
- credit_history_delta_check: total_amount_change >= 0 and total_reserved_change = 0. (0 allowed so every restored account has a row).
- credit_history_links_check: order_id and reservation_id both NULL, like INITIAL_GRANT.
- Replace the one-INITIAL_GRANT-per-user index with one allowing a single INITIAL_GRANT or BALANCE_RESTORED row per user

Service and consumer
CreditRepository.ts, SqlCreditRepository.ts, domains/types.ts:
- Include the new column in CreditAccount and findAccount.
- 	Add markDeleted(userId): UPDATE credit_accounts SET status = 'DELETED' WHERE user_id = $1 AND status = 'ACTIVE'. Returns whether a row changed. If no row changed, that's fine (already DELETED or CLOSED, or not created yet).
- Add closeAccount(userId): one UPDATE that sets total_credits = 0, reserved_credits = 0, status = 'CLOSED' WHERE user_id = $1 AND status IN ('ACTIVE','DELETED') AND reserved_credits = 0. Throw if rowCount !== 1. It has to be one statement, because the CLOSED ⇒ 0/0 check runs per statement.
- saveAccount must not overwrite status.
initCredits:
 If the account exists, is DELETED, and has neither INITIAL_GRANT nor BALANCE_RESTORED (a placeholder), grant as normal and keep it DELETED.

CreditService.restoreCredits({ previousUserId, userId }), in one READ COMMITTED transaction, following initCredits:
1. Validate both IDs with assertUserId. If they're equal, the error must be non-retryable.
2. Take lockKey('account', id) for both IDs in sorted order, then lockAccounts on both. This matches reserveCredits and settleCredits, so they can't deadlock.
3. Read both accounts and decide:
 New absent, old ACTIVE or DELETED with an INITIAL_GRANT or BALANCE_RESTORED row, no reserved credits → restore.
New exists, old CLOSED → already done, acknowledge.
New exists, old not CLOSED or missing → non-retryable.
New absent, old CLOSED → non-retryable.
New absent, old missing → retryable (user.created may still be queued).
New absent, old DELETED with neither row → retryable (placeholder; user.created not processed yet).
New absent, old has reserved credits → possible if deletion raced. Move nothing, throw retryable. If retries run out it dead-letters (see edge cases).
4. To do the restore:
- Create the new account with totalCredits = old.totalCredits and reservedCredits = 0.
- Call closeAccount(old), which zeroes the balance and sets CLOSED in one UPDATE.
- Append BALANCE_RESTORED on the new account, even for zero
- Write no history row on the old account.

Consumer (`events/userCreated.ts`). Today it dead-letters everything except user.created.
- user.created: unchanged.
- user.deleted: validate, then call markDeleted. Its WHERE status = 'ACTIVE' means a CLOSED or already-DELETED account is never changed. If the account doesn't exist yet, create it as DELETED with 0/0 under lockKey('account', userId). Log only the eventId.
- user.restored: validate both IDs, then call restoreCredits.
- Malformed events and the non-retryable cases above must throw NonRetryableError. Others must be left retryable. Build on the existing InitialAllocationError mapping
- You may rename the file and consumeUserCreated to fit (update `broker.ts`). Keep that rename separate from logic changes if you can.

Errors: RestoreError extends CreditOperationError, mapped to NonRetryableError next to InitialAllocationError in the consumer. Also wrap the assertUserId failure on previousUserId, as is already done for userId. Error messages must not contain IDs.

Privacy: never put both IDs in one log line or error message. Log only the eventId for restores. The current handler logs userId for user.created; that's fine there, but don't copy it for restores. The new-account history row must contain nothing derived from the old ID. Acked user.restored messages are deleted by RabbitMQ, so nothing linking the two IDs remains after processing.

Edge cases / known limitations
 Deletion races an open order, and the user returns before Order's manual review resolves it: the restore retries and then dead-letters. The old balance stays on the DELETED account and the user starts with 0 credits.
 Dead-lettered user.restored messages hold both IDs until someone removes them.
 user.deleted arrives before user.created (because of retries or parallel consumers): Credit creates a DELETED placeholder, and the later user.created grants to it.
 Balance link: a database reader could match a CLOSED account to its restored account by balance amount. This reveals nothing beyond User's 4-year archive, the records hold no personal data, and database access is restricted (N8.3.1).
 "New exists, old CLOSED" is acknowledged without checking that the two IDs belong together, since no link is stored. This is harmless because no credits move.
 Repeated reserveCredits/updateReservation on a DELETED account return the original saved result.

```

## Exact follow-up reply — shared user schemas

Assistant question:

```text
The checked-in shared user event schemas still require purgeAfter and omit previousUserId. You asked me to leave user.ts to the User service. May Credit temporarily adapt those schemas locally (omit purgeAfter for deletion and require previousUserId for restoration), so this change builds and works before their update lands?
```

User answer:

```text
No, wait for the User service schema update
```

## Exact follow-up replies — placeholder and inconsistent ACTIVE account

Assistant question:

```text
A DELETED placeholder can receive credits as a courier before its delayed user.created is processed. Should initCredits add the 10 starter credits to its existing balance and preserve reserved credits, rather than replace its balance with 10/0?
```

User answer:

```text
why would an account that has not yet been created have existing balance or reserved credits? initCredits called on a deleted user is only for the edge case where user.deleted is processed before user.created right, in which case we just add 10 to the existing balance of 0, 0, 0
```

Assistant question:

```text
For restoreCredits, what should happen if the old account is ACTIVE but has neither INITIAL_GRANT nor BALANCE_RESTORED history? You specified retrying this case for DELETED placeholders only.
```

User answer:

```text
this state should not be possible, so its a non-retryable error
```

Key response: Confirmed that deletion first creates a 0/0 placeholder. Explained
that an allowed settlement to a DELETED courier can precede the delayed creation
event. Implemented adding the 10-credit grant to the existing balance; the normal
empty placeholder still finishes at 10/0. ACTIVE without either allocation row
now raises non-retryable RestoreError.

## Exact follow-up prompt — confirm additive grant (2026-11-04 14:03 SGT)

```text
# Context from my IDE setup:

## Active file: credit-service/src/services/CreditService.ts

## Open tabs:
- CreditService.ts: credit-service/src/services/CreditService.ts
- credit-service.yaml: k8s/credit-service/credit-service.yaml
- 028-settlement-retry-fallback.md: credit-service/ai/prompts/028-settlement-retry-fallback.md
- 009-finalized-rpc-list.md: credit-service/ai/prompts/009-finalized-rpc-list.md
- credit-hpa.yaml: k8s/credit-service/credit-hpa.yaml

## My request:
for init credits, let's just set it as **grant by adding +10 to the existing total (a placeholder may already hold TRANSFER_IN credits from a settlement), don't require 0/0**

we can change it in the future after testing
```

Key response: Source already implements this behavior: total increases by 10,
reserved credits and DELETED status remain unchanged, and no 0/0 precondition
exists. Existing regression coverage receives 3 settlement credits before the
grant, checks 13 afterward, then verifies duplicate replay. Clarified README and
recorded the explicit human confirmation; no source/test changes or test rerun
were needed. Whitespace check passed. Other implementation review remains pending.

## Key responses and outcomes

- Implemented migration 011, repository lifecycle operations, status gates,
  deletion placeholders, delayed grants and atomic balance restoration with a
  single new-account history row and no restore idempotency record.
- Removed the unused Credit confirmation schemas/types and RESTORED reason.
- Shared user schemas remain untouched. Consumer integration is waiting for the
  User service schema update, as the human requested; the existing consumer still
  handles only user.created.
- Full Credit suite: 126 passing, zero failures/skips. Shared Messaging/Credit
  builds, Credit source/test and changed-contract ESLint, and whitespace checks
  passed. Tests used isolated schemas in temporary local PostgreSQL 14; the
  temporary server was stopped afterward. No live RabbitMQ lifecycle check ran.
- Per-file attribution, README and usage log updated. 
