# Sprint 1 Sequence Diagrams

- `updated-overall/admin-list-orders.md` (CHANGE-057): Admin caller obtains all orders or filters by status; the Order Service authenticates the Firebase token, resolves the User Service role, then queries through the application and persistence boundaries with `Pageable`.

Authoritative source (relative to the repository root): pages 3-13 of `../../../Sprint 1/Order Service Sprint 1 Doc.pdf`.

## Initial development slice

- Sequence 7 (page 9): requester -> Order Service -> User Service/Order Data; verify requester and `DELIVERED`, then set `COMPLETED`.
- Sequence 8 (page 10): requester -> Order Service -> User Service/Order Data; verify requester and `OPEN`, then set `CANCELLED`.
- Sequence 9 (page 11, original Sprint baseline): trusted lifecycle trigger -> Order Service -> Order Data; find due unaccepted `OPEN` orders, set `EXPIRED`, record expiry checkpoint. The effective updated flow is Spring-scheduled and publishes the shared `OpenOrderRefundTaskEvent` per CHANGE-071/ADR-019, shown alongside requester cancellation in updated overall Sequence 6.
- Sequence 10 (page 12): lifecycle trigger -> Order Service -> Order Data/Supplier/Credit; check eligibility/no existing repost, validate suppliers, reserve credits, create and link one `OPEN` repost.
- Sequence 11 (page 13): requester obtains a draft without side effects, submits reviewed details, then Order Service validates suppliers, reserves credits, and creates/links one `OPEN` repost.

The Sprint 1 diagrams above are the initial implementation subset. The updated overall source `../../../Order Service Overall Doc - Updated.pdf` supersedes their Sequence 5-8 architecture with typed completion/cancellation events. CHANGE-063/ADR-013 supersedes CHANGE-053's publish-before-status implementation ordering: Order state/checkpoint/receipt and event intent commit atomically; a listener dispatches after commit and cron recovers due rows. Delivery is at least once. Under CHANGE-064/ADR-014, accepted cancellation before expiry waits for a synchronous Credit hold then reopens directly from `ACCEPTED` to `OPEN`; cancellation at/after expiry transitions to `ABORTED` and emits an event. ADR-001 still prohibits `ABORTED -> OPEN`. Under CHANGE-055/ADR-010, the assigned courier performs accepted cancellation. CHANGE-065/ADR-015 combines requester-triggered OPEN cancellation and Spring-scheduled OPEN expiry in updated overall Sequence 6; CHANGE-071/ADR-019 records that both triggers use `OpenOrderRefundTaskEvent` with distinct resulting statuses.

## Updated overall-design sequence diagrams

The following proposed diagrams expand the updated overall design's event flows. They are kept separate from the original Sprint 1 source diagrams so the older implementation baseline remains reviewable:

- [Sequence 3: accept an order with Credit courier assignment](updated-overall/sequence-3-accept-order.md) (CHANGE-068): wait for Credit to confirm the courier assignment before persisting `ACCEPTED`; real Credit route remains pending under FEEDBACK-004.

- [Sequence 5: complete an order](updated-overall/sequence-5-complete-order.md)
- [Sequence 6: cancel or expire an OPEN order](updated-overall/sequence-6-cancel-open-order.md)
- [Sequence 7: cancel an ACCEPTED order](updated-overall/sequence-7-cancel-accepted-order.md)

These diagrams reflect event-specific publisher pairs, resulting Order/repost fields without checkpoint history, topic placeholders, assumed future consumers, and Google Cloud Pub/Sub. Sequence 6 combines requester-triggered OPEN cancellation with Spring-scheduled OPEN expiry; the trigger and resulting status differ, while Credit consumes the same `OpenOrderRefundTaskEvent` and shared topic to refund/release. Sequence 5 now includes requester completion and CHANGE-072/ADR-020 automatic completion once a DELIVERED checkpoint reaches 48 hours; both publish the same completion event with overdue facts. The after-commit callback runs before the transactional service call returns, so a requester call waits for its publish attempt but no peer consumer reply. Outbox delivery is at least once; peer consumers must deduplicate and remain unverified. See CHANGE-053/054/056/063/065/067/071/072 and ADR-013/015/016/019/020.


CHANGE-077/ADR-022 updates scheduling notes: expiry every 15 minutes, pending-event recovery hourly (ADR-023), auto-completion every minute; immediate after-commit publication and all sequence interactions remain. CHANGE-073/076 configure actual dev/prod topic destinations; older placeholder/emulator references are historical.


## Central authorization — CHANGE-079 / ADR-024

See [updated-overall/order-authorization.md](updated-overall/order-authorization.md) for the production token/role annotation boundary and reuse of verified caller facts. This applies across the existing human API flows; locked Order ownership, state and scheduler/system paths remain.
