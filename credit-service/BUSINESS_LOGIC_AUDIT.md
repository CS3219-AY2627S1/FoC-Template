# Credit business-logic audit map

## Layer boundary

`app/services/credits.py` contains transport-independent Credit rules. Its
operations accept UUIDs, amounts, and domain reasons; it does not import event
envelopes, Kafka code, HTTP schemas, or outbox helpers.

`app/services/event_handlers.py` is the application-layer adapter. It translates
incoming events into domain calls and translates domain results into outbox
events. `app/worker.py` owns retry, commit, acknowledgement, and dead lettering.

## Lazy account initialization

1. Validate the configured allocation.
2. Insert the UUID-only account with `ON CONFLICT DO NOTHING`, closing the
   missing-row race between Kafka partitions.
3. Lock the durable account row.
4. Use `initial_allocation_granted_at` as the one-time allocation marker.
5. Grant only when the one-time marker is absent and ledger the allocation in
   the caller-owned transaction.

## Reservation

1. Lock any existing reservation by its unique Order UUID.
2. Lock the requester account.
3. Ledger expected rejection instead of raising a system failure.
4. Move the amount from available to reserved without changing total credit.
5. Record the signed balance movement.

The stable lazy-flow rejection code is `INSUFFICIENT_CREDIT`.

## Transfer

1. Lock and validate the active reservation.
2. Conflict-safely insert a missing courier only after reservation validation.
3. Lock requester and courier accounts in UUID order.
4. Validate both locked accounts, then grant the courier's initial allocation
   exactly once using the allocation marker.
5. Move requester reserved credit to courier available credit.
6. Record one signed ledger row for each side with the settlement reason.

The same Credit operation supports two domain reasons:

- `ORDER_COMPLETED`
- `ORDER_CANCELLED_AFTER_PICKUP`

Credit Service does not own user lifecycle status. User Service performs the
authoritative status check for authenticated HTTP requests; Order Service must
enforce user eligibility before producing order events.

## Release

1. Lock and validate the active reservation.
2. Lock its requester account.
3. Reverse the hold without changing requester total credit.
4. Record the release ledger row.

Release is used for expiry and cancellation before pickup. Cancellation after
pickup uses transfer, not release.

## Administrator adjustment

1. Validate non-zero amount and non-blank reason. Authentication is enforced at
   the HTTP boundary rather than coupled into the domain function.
2. Lock the target account and enforce a non-negative available balance.
3. Apply the signed adjustment.
4. Record actor, absolute amount, signed delta, reason, and correlation UUID.

## Event adaptation

- `order.created` initializes the requester, calls reservation, and emits `credit.reserved` or
  `credit.reservation_failed`.
- `order.completed` validates the reservation, initializes the courier, calls
  transfer with `ORDER_COMPLETED`, and emits no event.
- `order.cancelled` from `PICKED_UP` calls transfer with
  `ORDER_CANCELLED_AFTER_PICKUP` and emits no event.
- Other `order.cancelled` events and `order.expired` call release and emit no
  event.
- `user.created` is not consumed. `order.picked_up` is ignored.

The adapter stages the inbox marker, any reservation-result outbox event, the
domain mutation, and ledger rows in one transaction. It does not modify Order
state.
