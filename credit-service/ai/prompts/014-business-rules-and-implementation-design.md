<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-20 (Asia/Singapore).
Scope: Archived the human's business rules/design verbatim and recorded bounded consistency questions and implementation scope.
-->

# Prompt archive — 014

## Exact user prompt

```text
[1] edge cases: since we want atomicity, if any step fails, the whole transaction rolls back and none of the events in the transaction should exist.&#x20;

InitCredits: this should not happen normally, so if it does, return that account already exists, don't grant, or write a new history row or change anything. though we should check why this happens, so maybe can check the user's history

GetBalance: should return account not found or uninitialised, it should not trigger creation of an account

ReserveCredits: should be ine reservation per order for its whole lifetime, enforced by a unique order_id, a released order can't be reserved again. same requester and amount should replay the original success, different requester or amount should show fail as amount changes must go through update reservation

UpdateReservation: amount is the new total held, we should work out the difference internally. version should start at 1 on reserve and each successful update, release and settle adds 1, failures and rejected requests don’t change it. stale expected version should be a failure, an identical earlier success is replayed first. for unchanged amount also reject with no version change and no history row. check order: saved result, reservation exists, status is reserved, version matches, amount changed, then enough available credits for an increase

ReleaseCredits: missing reservation should return not found, already settled should return failure, already released with no saved result should return success with the current reservation and no change

SettleCredits: missing reservation should return not found, already released should return failure. if courier has no credit account return not found, with a message naming the courier account and roll everything back . if courier equals requester, return failure but actually maybe we should check for this and ensure that courier is never equals requester in the database and the operation cannot be called. if different courier after settlement, failure because payout has already happened&#x20;

GetReservation: no reservation should return not found

History functions: page size default is 50 max is 100. invalid tokens/sizes should return invalid argument, when timestamps are equal, order by id, newest first. unknown user should return empty page with empty next page token. exclude entries added after page one on later pages



[2]

reserve → release → reserve should not be allowed. please disregard F8.9.2 as it mentions disputes, we have since taken this out of scope and are no longer implementing disputes.&#x20;



[3]

amounts: whole numbers >= 1, zero and negatives are invalid argument, missing field shd read as 0 so it is caught too

expected version: >= 1



ids: on-empty, no leading or trailing whitespace, no control characters, at most 128 characters for now I suppose, though maybe we can improve on this after testing and integration with user service



bad input, page size or token: INVALID_ARGUMENT

missing account/reservation: NOT_FOUND

insufficient available credits/ stale version/ invalid state transition/ same key diff request: FAILED_PRECONDITION

init when acct alr exists without saved result: ALREADY_EXISTS

transient failure: UNAVAILABLE, ABORTED, DEADLINE_EXCEEDED

bug: INTERNAL



since there are error categories sharing the same grpc code, let's put a short reason string in the error’s trailing metadata to allow order service to react differently&#x20;



[4]

access: credit service is internal only so we need to check the calling service’s identity in the controller, before any business logic. can we check user-level permissions at the edge or in user service through JWT/RBAC?

InitCredits: user service

GetBalance: user service, order service

Reserve, Update, Release, Settle, GetReservation: order service

order history: admin users only



[5]

implementation design:

this is what i have thought of, please suggest if you have any changes or inconsistencies you noticed



CreditService\
&#x20; initCredits({ userId }): Promise\<Balance>\
&#x20; getBalance({ userId }): Promise\<Balance>\
&#x20; reserveCredits({ orderId, requesterId, amount }): Promise\<Reservation>\
&#x20; updateReservation({ orderId, amount, expectedVersion }): Promise\<Reservation>\
&#x20; releaseCredits({ orderId }): Promise\<Reservation>\
&#x20; settleCredits({ orderId, courierId }): Promise\<Reservation>\
&#x20; getReservation({ orderId }): Promise\<Reservation>\
&#x20; getUserCreditHistory({ userId, pageSize?, pageToken? }): Promise\<CreditHistoryPage>\
&#x20; getOrderCreditHistory({ orderId, pageSize?, pageToken? }): Promise\<CreditHistoryPage>



CreditRepository\
&#x20; lockKey(namespace, key)\
&#x20; findIdempotencyRecord(operation, key) / saveIdempotencyRecord(record)\
&#x20; findAccount(userId) / lockAccounts(userIds) / createAccount(account) / saveAccount(account)\
&#x20; findReservation(orderId) / createReservation(reservation) / saveReservation(reservation)\
&#x20; appendHistory(entry)\
&#x20; findHistoryByUser(userId, beforeSequenceId, limit)\
&#x20; findHistoryByOrder(orderId, beforeSequenceId, limit)



this is what im thinking for when an order is placed

Before the transaction, Credit Service checks that the calling service is allowed to call that RPC, validates the fields (`amount` ≥ 1, valid IDs) and computes the SHA-256 request hash. Invalid input fails with `INVALID_ARGUMENT` without touching the database

1. Order Service validates the order and calls `ReserveCredits(orderId, requesterId, amount)`.
2. Credit Service begins a transaction. (READ COMMITTED)
3. It locks the idempotency key and checks for a previously completed request. A matching retry returns its saved response. same key with a different request fails with `FAILED_PRECONDITION`
4. It locks the order resource and checks for an existing reservation, preventing duplicate holds for that order. matching one returns the current reservation. A different requester or amount fails with `FAILED_PRECONDITION`
5. It locks the requester’s account row using `SELECT … FOR UPDATE`. missing account fails with `NOT_FOUND` and rolls back.
6. while holding the lock, it calculates:\
   available = total_credits − reserved_credits\
   If `available < requested amount`, the operation fails and rolls back.
7. Otherwise, it increases `reserved_credits`, creates a `RESERVED` reservation, appends history, and saves the retry result.
8. It commits and returns success. Order Service can then publish the order.





BEGIN (READ COMMITTED)

  lock retry key and order

  check previous result / existing reservation

  lock requester account

  check total − reserved >= amount

  update account: reserved += amount

  insert reservation

  insert history

  insert successful retry result

COMMIT (any failure → ROLLBACK, nothing is saved, including the retry record)



locking rules: every mutating operation takes locks in the same order: (1) the retry key, (2) the order (or the account, for init), (3) account rows in ascending user-ID order. State is read only after the locks are taken. This relies on READ COMMITTED, where each query sees what was committed before it started



layers and transaction ownership:`CreditController` checks the caller, calls `CreditService`, and maps errors to gRPC codes with a reason string. It never opens a transaction. `CreditService` owns the transaction boundary, one transaction per mutating RPC.`CreditRepository` (implemented by `SqlCreditRepository`) runs inside the current transaction and never commits or rolls back. Entities hold data only, and the rules live in `CreditService`. Read RPCs run a single query or a short transaction with no locks.



for edits: Order Service calls `UpdateReservation(orderId, amount, expectedVersion)`, where `amount` is the new total held. Credit Service locks the retry key (`orderId`, `expectedVersion`) and the order, then verifies the reservation is `RESERVED`, the version matches, and the amount has changed (an unchanged amount is rejected). It locks the requester’s account. An increase needs available credits ≥ the difference, and a decrease is always allowed. It updates `reserved_credits` by the difference, sets the new amount, increments the version, appends an update history entry and saves the retry result. A stale version fails with `FAILED_PRECONDITION` (reason `VERSION_CONFLICT`), and the caller reloads with `GetReservation`.



for signup: User Service calls `InitCredits(userId)`. In one transaction, Credit Service locks the retry key and the account, creates the account with 10 total and 0 reserved, appends an `INITIAL_GRANT` history entry and saves the retry result. A repeat returns the saved response without granting again. If the account exists but no saved response does, it returns `ALREADY_EXISTS` and changes nothing.



for completion: Order Service validates the assigned courier and calls `SettleCredits`. Credit Service locks the order, verifies that the reservation is active, and locks both accounts in a consistent user-ID order and performs these changes together, requester total_credits and reserved_credits decrease by the same amount, courier total credits goes up by that amount, reservation becomes `SETTLED`, with `courier_id` set and version +1, it also records the requester/courier `TRANSFER_OUT` and `TRANSFER_IN` history entries  and retry result in that transaction. a failure rolls back both sides of the transfer

Credit Service can’t verify the courier is the one assigned to the order, so it trusts Order Service. It only checks that the courier has an account and differs from the requester.



for cancellation/expiry: Order Service calls `ReleaseCredits`. Within one transaction, Credit Service verifies the active reservation and applies changes, requestor reserved credits are decreased and total remains the same. available credits increase automatically because they are calculated as total minus reserved. tatus change to `RELEASED`, version +1 and a `RELEASED` history row&#x20;



Settlement and release acquire the same order lock, so competing requests cannot both transition an active reservation. Once one commits, the other sees a terminal state and is rejected. Matching successful retries return their saved result without repeating the balance change.



data constraints:

- `reserved ≤ total`, and both ≥ 0.
- `UNIQUE(order_id)`.
- One initial grant per user.
- Valid status values.
- `SETTLED` if and only if `courier_id` is set.
- Courier ≠ requester.
- Append-only history.



failures and retries: any failure rolls back everything, so only successes are saved and a retry re-runs. Saved retry results are not purged while their account exists.

- Order Service creates orderID once, saves the order before the first call and reuses it on every retry.
-  it retries the same request with backoff on `UNAVAILABLE`, `ABORTED` and `DEADLINE_EXCEEDED`.
- it doesn’t retry `INVALID_ARGUMENT`, `NOT_FOUND` or `FAILED_PRECONDITION`. Insufficient credits, version conflicts and invalid state are told apart by a reason string in the error metadata.
- it shd call `GetReservation` for ambiguous failure, where `NOT_FOUND` means the reserve never committed.
- if Order Service crashes after a successful reserve and before publishing, a recovery job retries or releases unpublished orders.



so we also need to implement client retries after the main business logic: `createCreditClient` resends the identical request on `UNAVAILABLE`, `ABORTED` and `DEADLINE_EXCEEDED`. Nothing else is retried.&#x20;



concurrency tests:

- Parallel reserves from one requester, to confirm no overspend.
- Settle racing release on the same order.
- Duplicate retries.
- Opposing settlements (A→B and B→A) run in parallel, to check there is no deadlock.



request hash:

- SHA-256 over the UTF-8 bytes of a JSON array of the validated fields, in this order. The operation name comes first, so different operations can’t collide.
  - Init: `["INIT", userId]`
  - Reserve: `["RESERVE", orderId, requesterId, amount]`
  - Update: `["UPDATE", orderId, amount, expectedVersion]`
  - Release: `["RELEASE", orderId]`
  - Settle: `["SETTLE", orderId, courierId]`
- output a lowercase hex digest of 64 characters.&#x20;
- it is built from the validated values, not the raw gRPC object, so field order and default values can’t change it. IDs are compared exactly, with no normalization. Caller identity, timestamps and metadata are excluded. the retry key for Update is the JSON array `[orderId, expectedVersion]`. For the other operations it is the plain `orderId` or `userId`.
```

## Key assistant response

Recorded the supplied behaviours and implementation design without adopting the
invitation to generate architecture changes. Identified schema/contract gaps and
asked the following bounded questions before dependent implementation.

## Clarification questions (verbatim)

1. History values and pagination: the SQL CHECK currently allows init_credits, reserve, update, release, transfer, but your new flow uses INITIAL_GRANT, TRANSFER_OUT, TRANSFER_IN and RELEASED. What exact history.type values should we store (including reserve/update), and should idempotency operation_type retain its existing lowercase values? Also, your repository uses beforeSequenceId, while history.id is UUID and no sequence column exists: please specify the finalized cursor/snapshot design that excludes entries added after page one.
2. Locking and database enforcement: please specify the concrete SQL mechanism/key mapping for lockKey(namespace, key), including locking an order/account before a row exists, and how a repository receives the transaction connection. For append-only history and one initial grant per user, what database enforcement mechanism have you chosen beyond the existing account primary key? I can implement your explicit UNIQUE(order_id), SETTLED iff courier_id is non-null, and courier != requester constraints now.
3. Controller contract: what authenticates the calling service, which service may call each history RPC, and how is an admin's verified identity/role conveyed? User Service currently verifies JWTs on HTTP, while shared gRPC defaults to insecure credentials. Please also specify the trailing-metadata key and allowed reason strings (only VERSION_CONFLICT is named so far), and codes for missing/unauthorized caller identity. Do order IDs additionally require UUID validation to match the existing uuid column, or are you changing their SQL type?
4. Reserve fallback: when an existing reservation is found but its successful retry record is absent, should a matching requester/amount return the current reservation for every status (RESERVED, RELEASED, SETTLED), or only RESERVED? Your earlier wording calls for original-success replay, while step 4 calls for the current reservation; the saved-result path is clear, and this question concerns only the missing-record case.
