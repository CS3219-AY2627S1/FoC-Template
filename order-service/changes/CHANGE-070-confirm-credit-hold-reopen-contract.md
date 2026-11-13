# CHANGE-070: Confirm the Credit hold-for-reopen contract

- Date: 2026-10-06
- Status: User-confirmed Order contract; Credit endpoint implementation pending.
- Approval: The user confirmed the synchronous hold-for-reopen flow and requested removal of the “To be discussed” label.
- Scope: Order Service documentation and contract status only. No source, test, Credit Service, or frontend changes.

## Effective contract

For an unexpired accepted-order cancellation, Order calls `POST /api/credits/orders/{orderId}/hold-for-reopen` with no request body and waits for `200 OK`. Credit locates the transaction using the Order ID, retains it without refund or transfer, and clears its courier assignment. Repeating the hold for an already-held transaction is idempotent. Order changes the status to `OPEN` only after success; otherwise it remains `ACCEPTED`.

## Implementation status

Order's mock and HTTP contract stub follow this shape. Credit Service still lacks the endpoint; the production integration is not verified. Trusted service authentication and reconciliation after a Credit-success/Order-commit-failure window remain production requirements.
