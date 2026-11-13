"""Application-layer adapters between integration events and Credit rules."""

from sqlalchemy.orm import Session

from app.events import IncomingEvent, OrderEvent, enqueue_credit_event
from app.models import ProcessedEvent, utc_now
from app.services.credits import (
    CreditStateConflict,
    ensure_credit_account,
    release_reserved_credits,
    reserve_credits,
    transfer_reserved_credits,
)


def _credit_payload(event: OrderEvent) -> dict[str, str | int]:
    return {
        "requester_id": str(event.requester_id),
        "credit_amount": event.credit_amount,
    }


def handle_order_created(
    db: Session, event: OrderEvent, *, initial_allocation: int
) -> None:
    """Translate order creation into a Credit reservation decision."""

    ensure_credit_account(
        db,
        user_id=event.requester_id,
        initial_allocation=initial_allocation,
        operation_id=event.event_id,
        correlation_id=event.correlation_id,
    )
    result = reserve_credits(
        db,
        order_id=event.order_id,
        requester_id=event.requester_id,
        amount=event.credit_amount,
        operation_id=event.event_id,
        correlation_id=event.correlation_id,
    )
    payload = _credit_payload(event)
    if result.outcome == "REJECTED":
        payload["reason"] = result.reason or "RESERVATION_REJECTED"
        event_type = "credit.reservation_failed"
    else:
        event_type = "credit.reserved"
    enqueue_credit_event(
        db,
        event_type=event_type,
        order_id=event.order_id,
        correlation_id=event.correlation_id,
        payload=payload,
    )


def handle_order_completed(
    db: Session, event: OrderEvent, *, initial_allocation: int
) -> None:
    """Settle a completed order without publishing another outcome event."""

    if event.courier_id is None:
        raise CreditStateConflict("Completed order has no courier")
    transfer_reserved_credits(
        db,
        order_id=event.order_id,
        requester_id=event.requester_id,
        courier_id=event.courier_id,
        amount=event.credit_amount,
        operation_id=event.event_id,
        correlation_id=event.correlation_id,
        settlement_reason="ORDER_COMPLETED",
        initial_allocation=initial_allocation,
    )


def handle_order_cancelled(
    db: Session, event: OrderEvent, *, initial_allocation: int
) -> None:
    """Release before pickup, or compensate the courier after pickup."""

    if (event.previous_status or "").upper() == "PICKED_UP":
        if event.courier_id is None:
            raise CreditStateConflict(
                "Picked-up cancellation requires the courier identifier"
            )
        transfer_reserved_credits(
            db,
            order_id=event.order_id,
            requester_id=event.requester_id,
            courier_id=event.courier_id,
            amount=event.credit_amount,
            operation_id=event.event_id,
            correlation_id=event.correlation_id,
            settlement_reason="ORDER_CANCELLED_AFTER_PICKUP",
            initial_allocation=initial_allocation,
        )
        return

    release_reserved_credits(
        db,
        order_id=event.order_id,
        requester_id=event.requester_id,
        amount=event.credit_amount,
        operation_id=event.event_id,
        correlation_id=event.correlation_id,
        release_reason="ORDER_CANCELLED",
    )


def handle_order_expired(
    db: Session, event: OrderEvent, *, initial_allocation: int
) -> None:
    """Translate expiry into release of the requester's hold."""

    release_reserved_credits(
        db,
        order_id=event.order_id,
        requester_id=event.requester_id,
        amount=event.credit_amount,
        operation_id=event.event_id,
        correlation_id=event.correlation_id,
        release_reason="ORDER_EXPIRED",
    )


def apply_order_event(
    db: Session, event: OrderEvent, *, initial_allocation: int = 100
) -> None:
    """Route an integration event without placing transport concerns in domain code."""

    handlers = {
        "order.created": handle_order_created,
        "order.completed": handle_order_completed,
        "order.cancelled": handle_order_cancelled,
        "order.expired": handle_order_expired,
    }
    try:
        handler = handlers[event.event_type]
    except KeyError as exc:
        raise CreditStateConflict(
            f"Unsupported order event: {event.event_type}"
        ) from exc
    handler(db, event, initial_allocation=initial_allocation)


def apply_incoming_event(
    db: Session, event: IncomingEvent, *, initial_allocation: int
) -> None:
    """Stage inbox, domain, audit, and outbox rows in one caller transaction."""

    if db.get(ProcessedEvent, event.event_id) is not None:
        return
    apply_order_event(db, event, initial_allocation=initial_allocation)
    db.add(
        ProcessedEvent(
            event_id=event.event_id,
            event_type=event.event_type,
            processed_at=utc_now(),
        )
    )
