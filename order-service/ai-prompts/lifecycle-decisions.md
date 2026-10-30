<!-- AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
Scope: Archived exact implementation prompts and decisions. Team review pending; see ../usage-log.md. -->

# Author prompts and decisions for this implementation

Earlier schema and setup exchanges are retained in ../usage-log.md. Each block
below records a user message; later explicit decisions supersede earlier ones.
Nonbreaking spaces from the chat are represented as ordinary spaces.

```text
All users can create orders and view all open orders, except their own order, in a main orders page to be able to then accept an errand. Within their own manage orders page, they will then be able to view the orders they created as well as errands/orders they accepted.

Duplicate submissions and retries should be handled well, only one should go through. For example if the user keeps sending "Coffee, smth smth", only the first valid order will be created. The rest will return failed to create.

Validation rules

- grpc with credit to check if number of credits the user selected is <= the credits in their account, expiry is just anytime in the future but at least 1 hour later than current time, text field is anything not blank. Supplier can dont be open for now at the expiry time but should be open when the order is created. (meaning check if supplier is CURRENTLY open)
```

```text
1. 5 minutes, all fields match.
2. Use saga to tell credit to return credits and tell user taht their order did not go through
3. Same as 3.
4. refer to the pasted text
```

The pasted text is archived verbatim in creation-api-contract.md.

```text
Can we do a 202 Pending and retry with credit? This way the user does not need to create their whole order again.
```

```text
For Question 1, distinguish between confirmed failures and uncertain failures.
If Credit Service explicitly rejects the reservation (e.g. insufficient credits), fail the creation and return an appropriate error. Do not automatically retry permanent business failures.
If Credit Service is temporarily unavailable or the reservation outcome is uncertain (e.g. timeout), preserve the pending creation and its idempotency key.
I prefer automatic backend recovery for pending creations through a background worker, with bounded retries and backoff. The worker should reconcile the reservation using Credit Service before deciding whether to complete or compensate the creation.
The frontend should receive a pending response when creation has been durably recorded, and should not need to remain open for recovery to happen. Client retries using the original Idempotency-Key should also remain supported.
Ensure retries cannot create duplicate orders or reserve credits twice. If creation expires after credits have been reserved, compensate by releasing/refunding the reservation.
Please identify what additional implementation is required, since the current retry worker only handles settlement and refund operations.
```

```text
Can we start building the create, edit and delete and expired errand lifecycle and functionality?
```

```text
Users may edit their own order that they created, before accepted by any courier. They may edit all fields but if a courier accepts at the same time as the change is happening, row lock such that only one can happen and if have to choose between both, courier accpetance prioritised.
Delete removes it from the list of errands that user view under their errands but remain in their history. User may delete their own order when the order has not been accepted by a courier.
Expiry happens during unassigned, assigned, picked up. If picked up and expired, credits will be returned back to the user.
```

```text
Yes, a row lock allows one transaction which gets it first obtain the first proceed and blocks the next one.

1. yes

2. yes. the same goes. so if new number of credits > previous, check if that amount extra can be reserved. if yes, release the previous and reserve. (should be handled by supplier i think)

3. yes
```

That message also supplied the POST /orders, POST /orders/:id/cancel and proposed
PATCH /orders/:id contracts, plus retry delays 5, 15, 45 and 135 seconds. The
assistant clarified that Credit UpdateReservation adjusts the existing hold,
that DELETE means cancellation, and that proposed settings required confirmation.

Exact follow-up approval to those four clarification points:

```text
- Yes but if both at the same time, priority goes to the courier.
- Yes
- Yes
- Yes
```

```text
If they both get to the row at the same time and attempt to row lock.
5 imes
```

After the assistant explained first-lock-wins cannot promise courier priority:

```text
Ok. Its acceptable. Lets build!
```

## Additional schema and duplicate clarification received during implementation

```text
Recommended schema
Add a separate OrderEditOperation table rather than storing temporary edit state directly in the Order table.
Field
Purpose
id
Unique operation ID for idempotency
orderId
Order being edited
requesterId
User making the edit
state
PENDING, PROCESSING, SUCCEEDED, FAILED, or RECONCILIATION_REQUIRED
expectedVersion
Credit reservation version before the edit
targetCredits
Desired new credit amount
proposedChanges
Other edited order fields, if any
attempts
Number of attempts
nextRetryAt
Next recovery attempt
leaseExpiresAt
Allows recovery after a worker crashes
lastError
Last recorded failure
createdAt, updatedAt
Audit timestamps
```

```text
We previously decided not to implement the five-minute duplicate-submission rule.
Please retain the existing unique constraint on (requesterId, idempotencyKey).
Expected behaviour:
- Same key + same body: Resume the existing creation or return the existing order.
- Same key + different body: Return 409 Conflict.
- Different key + same body: Treat as a separate order creation request.
- Different key + different body: Treat as a separate order creation request.
No additional database constraint or coordination mechanism is required for five-minute duplicate detection.
The frontend should prevent accidental double submissions by disabling the submit button while a request is processing and reusing the original Idempotency-Key when retrying an uncertain request.
Please do not introduce the five-minute rule unless the team explicitly changes this decision.
```
