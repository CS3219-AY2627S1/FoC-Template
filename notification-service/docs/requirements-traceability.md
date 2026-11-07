# Notification Service requirements traceability

One row per D1 Notification requirement.
The requirement text is taken from the D1 backlog (`Project-D1-Group31-Campus Errand`, Notification Service section).
Each test name is copied verbatim from the notification-service test suite and can be grepped under `tests/`.

| Requirement | Backlog text (condensed) | Where implemented (file / function) | Test |
| --- | --- | --- | --- |
| F1 | Deliver notifications to users in response to order lifecycle events | `app/services/consumer.py` `NotificationEventConsumer`, `app/services/rules.py` `build_notifications`, `app/services/channels.py` `InAppChannel.deliver` | `test_valid_event_persists_and_acks` |
| F1.1 | Subscribe to the events published by the Order Service | `app/services/consumer.py` `_consume` (declares and binds the durable queue to `foc.order.events`) | `test_valid_event_persists_and_acks` |
| F1.1.1 | Subscribe to OrderAccepted, OrderPickedUp, OrderDelivered, OrderCompleted, OrderCancelled, CourierWithdrawn, OrderExpired | `app/services/consumer.py` `ROUTING_KEYS` (all seven, plus `OrderApproved`; see Deviations), and the per-event branches in `app/services/rules.py` | `test_order_accepted_notifies_requester_F2_1`, `test_order_picked_up_F2_2`, `test_order_delivered_F2_3`, `test_order_approved_notifies_both_F2_4_F3_2`, `test_courier_withdrawn_F2_5`, `test_order_expired_F2_6`, `test_requester_cancel_notifies_courier_F3_1` |
| F1.1.2 | Consume each event asynchronously | `app/services/consumer.py` `run` (background task started from the `app/main.py` lifespan) / `_on_message` | `test_valid_event_persists_and_acks` |
| F1.1.3 | Persist each notification against the recipient's account for retrieval on next sign-in | `app/models/notification.py` `Notification`, `app/repositories/notifications.py` `insert_notifications` / `list_for_recipient`, `app/api/routes/notifications.py` `list_notifications` | `test_list_returns_items_newest_first_with_counts_F1_1_3` |
| F2.1 | On OrderAccepted, notify the requester that a courier has accepted the order | `app/services/rules.py` `build_notifications` (`OrderAccepted`) | `test_order_accepted_notifies_requester_F2_1` |
| F2.1.1 | Include the order name and the new status in each requester's notification | `app/services/rules.py` `build_notifications` (`order_status` on every draft; `name = event.order_name or f"Order {order_id[:8]}"`) | `test_missing_order_name_falls_back_to_order_id`, `test_order_accepted_notifies_requester_F2_1` |
| F2.2 | On OrderPickedUp, notify the requester that the order has been picked up | `app/services/rules.py` `build_notifications` (`OrderPickedUp`) | `test_order_picked_up_F2_2` |
| F2.3 | On OrderDelivered, notify the requester that the order is delivered and awaiting their approval | `app/services/rules.py` `build_notifications` (`OrderDelivered`) | `test_order_delivered_F2_3` |
| F2.4 | On OrderCompleted, notify the requester that the order is completed | `app/services/rules.py` `build_notifications` (`OrderApproved` / `OrderCompleted`; see Deviations) | `test_order_approved_notifies_both_F2_4_F3_2`, `test_order_completed_without_courier_notifies_requester_only` |
| F2.5 | On CourierWithdrawn, notify the requester that the courier withdrew and the order returned to open | `app/services/rules.py` `build_notifications` (`CourierWithdrawn`) | `test_courier_withdrawn_F2_5` |
| F2.6 | On OrderExpired, notify the requester that the order expired without being accepted | `app/services/rules.py` `build_notifications` (`OrderExpired`) | `test_order_expired_F2_6` |
| F3.1 | On OrderCancelled, notify the courier that the requester cancelled the assigned order | `app/services/rules.py` `build_notifications` (`OrderCancelled`, requester-cancel branch; courier only) | `test_requester_cancel_notifies_courier_F3_1`, `test_requester_cancel_without_courier_is_noop` |
| F3.1.1 | Include the order name and the cancellation reason in each courier notification | `app/services/rules.py` `build_notifications` (`OrderCancelled` body appends `Reason: {reason}`) | `test_requester_cancel_notifies_courier_F3_1` |
| F3.2 | On OrderCompleted, notify the courier that the completed order has been approved | `app/services/rules.py` `build_notifications` (`OrderApproved` / `OrderCompleted`, courier draft) | `test_order_approved_notifies_both_F2_4_F3_2` |
| F4.1 | On OrderCancelled with reason supplier-deactivation, notify both the requester and the assigned courier | `app/services/rules.py` `build_notifications` (`OrderCancelled`, `SUPPLIER_DEACTIVATION_REASON` branch) | `test_supplier_deactivation_notifies_both_F4_1` |
| F4.1.1 | State supplier deactivation as the cancellation reason in the notification | `app/services/rules.py` `build_notifications` (deactivation body states the cause and omits the raw reason / supplier id) | `test_supplier_deactivation_message_hides_supplier_id_F4_1_1` |
| N1.1 | A redelivered event does not produce a duplicate user-visible notification | `app/models/notification.py` unique `(event_id, recipient_id)`, `app/repositories/notifications.py` savepoint insert, `app/services/consumer.py` `message_id` / `_derived_id` idempotency key | `test_duplicate_message_id_inserts_once_per_recipient_N1_1` |
| N2.1 | A delay or failure in notification delivery does not block or fail the underlying order or credit operation | `app/services/consumer.py` `run` reconnect loop (broker outage never crashes the app or fails `/health`); Order Service publishes from its own transactional outbox after committing, so it never calls this service synchronously | `test_db_failure_requeues`, `test_malformed_body_is_rejected_without_requeue` |
| N2.1.1 | The underlying order or credit operation commits regardless of the notification delivery outcome | Architectural: Order Service commits the status change and its outbox row in one transaction, independent of consumption; Notification Service only reads the broker afterwards | Verified end to end: order create and accept returned HTTP 200 while notification-service was stopped, and the queued events were delivered after restart (see `event-flow.md`) |

## Deviations

Two deviations from a literal reading of the D1 backlog, both deliberate and tested.

- **`OrderCompleted` is realized as `OrderApproved`.**
  The backlog (F1.1.1, F2.4, F3.2) names `OrderCompleted`, but Order Service F3.5.1 says it publishes an order approved event, and the code emits `OrderApproved` (never `OrderCompleted`) when an order reaches `COMPLETED`.
  The consumer binds both routing keys and the rules handle them identically, so F2.4 and F3.2 are met through `OrderApproved` today while `OrderCompleted` stays bound for forward compatibility.
  Covered by `test_order_approved_notifies_both_F2_4_F3_2` and `test_order_completed_without_courier_notifies_requester_only`.

- **`order_name` added by event-carried state transfer.**
  F2.1.1 and F3.1.1 require the order name, but Order Service owns order names and Notification Service never reads the order database.
  An optional `order_name` field was therefore added to `OrderEvent` (`shared/foc_shared/events.py`) and `OrderApprovedEvent` (`order-service/app/schemas/order_approval_events.py`), so the name travels on the event itself.
  When it is absent the rules fall back to `Order <first 8 chars of order_id>`.
  Covered by `test_missing_order_name_falls_back_to_order_id`.

## Mapping notes

- F1.1.1 names seven event types.
  The consumer binds all seven plus `OrderApproved` (the live form of `OrderCompleted`); each bound type's recipient mapping is covered by the per-event rules tests listed above.
- F2.1.1 has no single id-named test; it is covered by `test_missing_order_name_falls_back_to_order_id` (order name) together with every `build_notifications` test, which all assert `order_status` on the returned drafts (the new status).
- N2.1.1 is an architectural guarantee owned by Order Service's commit-then-publish outbox; it is demonstrated end to end rather than by a notification-service unit test.
- Beyond the backlog, the read API also supports marking notifications read (`POST /notifications/{user_id}/{notification_id}/read`, `POST /notifications/{user_id}/read-all`) as UX for F1.1.3; these are guarded by `test_mark_one_marks_row_read`, `test_mark_one_owned_by_other_user_is_404`, and `test_mark_all_marks_callers_unread_and_returns_count`.
- The suite also includes `test_list_without_identity_is_401_not_403_N4_1`, `test_list_of_other_user_forbidden_for_client`, `test_admin_can_read_other_user_list`, `test_list_pagination_limit_offset`, `test_list_unread_only_filters`, and `test_unknown_event_type_is_noop`, which guard read-API authorization and the no-op branches of the rules.
