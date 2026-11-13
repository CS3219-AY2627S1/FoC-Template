# Timestamp: 2026-10-14
# Key Prompt:

F23
Support initial credit allocation for new users.
23.1
The system shall allocate a configured initial credit amount to new users.


23.1.1
The system shall initialize the user’s available balance with 100 credits.


23.1.2
The system shall initialize the reserved balance to 0 credits.
23.2
The system shall ensure initial credit allocation occurs only once per user account.


23.2.1
The system shall reject or ignore a repeated initial allocation request for an account that has already received its initial allocation.


23.2.2
The system shall preserve the user’s existing balance when a repeated initial allocation request is rejected or ignored.
F24
Support reservation of credits from the available balance.
24.1
The system shall validate a credit reservation request before creating the reservation.


24.1.1
The system shall check whether the requested amount exceeds the user’s available balance.


24.1.2
The system shall check whether the requested amount is a positive credit amount.


24.1.3
The system shall reject the credit reservation request if above checks do not pass.
24.2
The system shall reserve the credits.


24.2.1
The system shall deduct the reserved amount from the user’s available balance.


24.2.2
The system shall increase the user’s reserved balance by the same amount.
24.3
The system shall associate each credit reservation to a unique transaction identifier.


24.3.1
The system shall store the transaction identifier together with the reserved amount and originating user.


24.3.2
The system shall prevent more than one active reservation for the same transaction identifier.
24.4
The system shall prevent reserved credits from being used as available credits.


24.4.1
The system shall exclude reserved credits when evaluating subsequent reservation requests.
F26
Support release of credits from the reserved balance.
25.1
The system shall validate the release of reserved credits before releasing credits to the available balance.


25.1.1
The system shall check whether the released amount exceeds the user’s reserved balance.


25.1.2
The system shall check whether the released amount is a positive credit amount.


25.1.3
The system shall reject the credit release request if above checks do not pass.
25.2
The system shall release reserved credits.


25.2.1
The system shall deduct the reserved amount from the user’s reserved balance.


25.2.2
The system shall increase the user’s available balance by the same amount.
25.3
The system shall associate each credit release to a unique transaction identifier.


25.3.1
The system shall store the transaction identifier together with the release amount and originating user.


25.3.2
The system shall prevent more than one active credit release for the same transaction identifier.
F26
Support transfer of credits from a user’s reserved balance to another user’s available balance.
26.1
The system shall validate a credit transfer request before processing it.


26.1.1
The system shall verify that the reserved amount is sufficient for the request transfer.


26.1.2
The system shall verify that the designated recipient exists.


26.1.3
The system shall reject the credit transfer request if above checks do not pass.
26.2
The system shall transfer the credits after validation.


26.2.1
The system shall decrease the originating user’s reserved balance by the transferred amount.


26.2.2
The system shall increase the recipient’s available balance by the transferred amount.
F27
Support viewing of a user’s credit balance.
27.1
The system shall provide the user’s available credit balance.


27.1.1
The system shall return an available balance that reflects all completed reservations, releases and transfers.
27.2
The system shall provide the user’s reserved credit balance.


27.1.2
The system shall return a reserved balance that includes credits associated with active reservations.
F28
Support viewing of a user’s credit transaction history.
28.1
The system shall record each credit reservation.


28.1.1
Each reservation record shall contain its transaction identifier, user account, amount, timestamp, and transaction type.
28.2
The system shall record each credit release.


28.2.1
Each release record shall identify the reservation transaction being released.
28.3
The system shall record each credit transfer.


28.3.1
Each transfer record shall contain the originating account, recipient account, amount, transaction identifier and timestamp.
28.4
The system shall preserve a unique identifier for each recorded credit transaction.


28.4.1
The system shall allow a transaction record to be uniquely identified using its transaction identifier.

Ensure that the implementation meets the requirements above where relevant.
Implement the Credit Backend Service that manages user credit balances, reserved funds, and financial transfers between requesters and couriers.

DATA MODEL (PRISMA / POSTGRESQL)
Design the Prisma schema with three primary models:

Balance:
Fields: userId (PK), availableCredit (Int/BigInt, non-negative), reservedCredit (Int/BigInt, non-negative), status (Enum: ACTIVE, CLOSED), createdAt, updatedAt.


TransactionHistory:
Fields: id (PK), referenceKey (Unique string: service:id:type, e.g., errand:123:CREDIT_RESERVE), userId, amount, type (Enum: INITIAL_ALLOCATION, RESERVE, RELEASE, TRANSFER_OUT, TRANSFER_IN, ZERO_RESERVE), createdAt.


Settlement:
Fields: id (PK), errandId (Unique), requesterId, courierId, amount, status (Enum: COMPLETED, RELEASED, PENDING), createdAt, updatedAt.

CREDIT OPERATIONS & LIFECYCLE

- UserRegistered (Kafka Event): Create a Balance record with 100 available credits and 0 reserved credits. Logs initial allocation in history. Ignore if user account is already CLOSED.
- Errand Creation (Internal HTTP API): Move specified amount from availableCredit to reservedCredit for the requester.
- ErrandCompleted (Kafka Event): Look up the persisted reservation. Deducts reservedCredit from requester and adds availableCredit to courier. Mark settlement as COMPLETED.
- ErrandCancelled / ErrandExpired (Kafka Event): Release persisted reservation by deducting reservedCredit and restoring availableCredit for requester. Mark settlement as RELEASED.
- ErrandCreationFailed (Kafka Event):
- Normal flow: Release an existing reservation.
- Early-failure flow: If event arrives before HTTP reservation, write zero-amount RESERVE and RELEASE history records to block future reservations.

CONCURRENCY, LOCKING & DATA INTEGRITY

- Every balance modification must be wrapped in a PostgreSQL transaction ensuring balance updates, history entries, and settlement records succeed or roll back together.
- Acquire PostgreSQL advisory locks serialized by reference key (service:id:type) and affected userIds. Multi-user locks must always be acquired in sorted order (e.g., sort([requesterId, courierId])).
- Balance reservations must enforce availableCredit >= amount. Reject with an error if funds are insufficient.
- Reference keys must follow the format service:id:type. Repeating an HTTP reservation with an existing reference key shall return a HTTP 409 TRANSACTION_CONFLICT without modifying balances. Repeating a release or transfer operation should safely return early.
- If an ErrandCreationFailed event arrives before the HTTP reservation call, write 0 amount reserve and release records. Subsequent HTTP reservation requests matching this reference must immediately conflict (409 TRANSACTION_CONFLICT) and fail.

EDGE CASES

- Setting a user balance to CLOSED must preserve existing transaction history.
- If a transfer is executed where the receiving courier's account is CLOSED, do not credit spendable availableCredit. Write a PENDING settlement record for audit/manual review.
Active reservations on a CLOSED account can still be settled (transferred or released).
A late-arriving UserRegistered event for a CLOSED account must not re-open the balance or overwrite its status.

HTTP API ENDPOINTS
Internal Endpoint (Protected via Service Token):

POST /internal/credits/reserve
Body: { errandId: string, requesterId: string, amount: number }
Logic: Runs reservation transaction. 

Return 200 OK on success, 409 TRANSACTION_CONFLICT on duplicate/early-failed requests, or 400 for insufficient funds. Add additional error messages as necessary.

Public Endpoints (read only)

- Auth Requirement: Validate Cognito JWT, require verified email, and restrict queries so users can only access their own data.
- GET /api/v1/credits/balance: Returns caller's availableCredit and reservedCredit.
- GET /api/v1/credits/history: Returns paginated transaction history for the user (limit up to 100, default 20; offset default 0; ordered deterministically by createdAt DESC, id DESC).

KAFKA MESSAGING & DLQ RELIABILITY STRATEGY

- Consumers listen for user.registered, errand.completed, errand.cancelled, errand.expired, and errand.creation_failed.
- Rely on DB reference keys (service:id:type) and unique constraint checks to handle redelivered Kafka messages cleanly.
* Dead-Letter Queue (DLQ): Wrap message handlers in try/catch blocks. Invalid payload schemas or failed credit operations must be published to topic credit-service-dlq. Acknowledge (commit) the source Kafka message only after successful processing or successful publication to the DLQ. Implement an explicit retry loop specifically for DLQ publication failures.

INTEGRATION TESTS

Implement unit and integration tests verifying:
- Concurrent Spending: Parallel reservation attempts exceeding available credits are properly rejected/queued.
- Duplicate Requests: Idempotency checks return 409 or safe early exits without double-charging.
- Conflicting Outcomes: Concurrent completion and cancellation attempts do not lead to double settlement.
- Early Failures: Kafka creation failure preceding HTTP reservation blocks fund reservation.
- Account Deletion: Transfers to a closed courier produce PENDING settlements.

# Usage Scenario
Generated initial implementation, debugged implementation
