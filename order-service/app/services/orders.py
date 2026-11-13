"""Business logic for errand requests, incoming credit messages, and expiry."""

import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app.clients import Identity, SupplierServiceClient, SupplierUnavailableError
from app.events import IncomingEvent, enqueue_event, isoformat_utc, parse_incoming
from app.messaging import ORDER_TTL, RELAY_BATCH_SIZE
from app.models import Order, ProcessedEvent, utc_now
from app.schemas import DeliveryLocation, OrderCreate
from foc_observability import log_event

logger = logging.getLogger(__name__)

# Western edge includes the seeded Engineering stores (Cheers at E3 is 103.753).
# Northern edge includes University Town, which the old box cut off.
NUS_CAMPUS_BOUNDS = {
    "min_latitude": 1.288,
    "max_latitude": 1.310,
    "min_longitude": 103.750,
    "max_longitude": 103.788,
}

TERMINAL_STATUSES = frozenset({"COMPLETED", "CANCELLED", "EXPIRED", "REJECTED"})
REQUESTER_CANCELLABLE = frozenset({"PENDING_CREDIT", "OPEN", "ACCEPTED"})
DESTINATION_MUTABLE = frozenset({"PENDING_CREDIT", "OPEN", "ACCEPTED"})
EXPIRABLE = frozenset({"PENDING_CREDIT", "OPEN"})


@dataclass(frozen=True)
class CreateOrderResult:
    """Outcome of an order creation attempt."""

    order: Order
    created: bool


def hash_request(payload: OrderCreate) -> str:
    """Return a stable hash for idempotent replay comparisons."""

    encoded = json.dumps(
        payload.model_dump(mode="json"), sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def delivery_within_campus(latitude: float, longitude: float) -> bool:
    """Return whether the delivery coordinates fall within the supported campus."""

    return (
        NUS_CAMPUS_BOUNDS["min_latitude"] <= latitude <= NUS_CAMPUS_BOUNDS["max_latitude"]
        and NUS_CAMPUS_BOUNDS["min_longitude"]
        <= longitude
        <= NUS_CAMPUS_BOUNDS["max_longitude"]
    )


def normalize_idempotency_key(value: str) -> str:
    key = value.strip()
    if not key:
        raise HTTPException(status_code=422, detail="Idempotency-Key must not be blank")
    if len(key) > 128:
        raise HTTPException(
            status_code=422, detail="Idempotency-Key must be at most 128 characters"
        )
    return key


def parse_correlation_id(value: str | None) -> UUID:
    if value is None or not value.strip():
        return uuid4()
    try:
        return UUID(value.strip())
    except ValueError:
        raise HTTPException(status_code=422, detail="X-Correlation-ID must be a UUID") from None


def create_order(
    payload: OrderCreate,
    requester: Identity,
    idempotency_key: str,
    correlation_id: UUID,
    db: Session,
    supplier_directory: SupplierServiceClient,
) -> CreateOrderResult:
    """Create an errand request or replay an idempotent submission."""

    request_hash = hash_request(payload)
    existing = _find_existing(db, requester.id, idempotency_key)
    if existing is not None:
        return _replay(existing, request_hash)

    _require_active_supplier(supplier_directory, payload.pickup_supplier_id)
    if not delivery_within_campus(payload.delivery.latitude, payload.delivery.longitude):
        raise HTTPException(status_code=422, detail="Delivery location is not supported")

    now = utc_now()
    order = Order(
        requester_id=requester.id,
        pickup_supplier_id=payload.pickup_supplier_id,
        delivery_label=payload.delivery.label,
        delivery_latitude=payload.delivery.latitude,
        delivery_longitude=payload.delivery.longitude,
        delivery_details=payload.delivery.details,
        item_description=payload.item_description,
        credit_amount=payload.credit_amount,
        status="PENDING_CREDIT",
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        correlation_id=correlation_id,
        expires_at=now + ORDER_TTL,
        created_at=now,
        updated_at=now,
    )
    db.add(order)
    db.flush()
    enqueue_event(
        db,
        event_type="order.created",
        order=order,
        correlation_id=correlation_id,
        extra={"expires_at": isoformat_utc(order.expires_at)},
    )
    try:
        _commit(db)
    except IntegrityError as exc:
        db.rollback()
        replay = _find_existing(db, requester.id, idempotency_key)
        if replay is None:
            raise HTTPException(
                status_code=503, detail="Database temporarily unavailable"
            ) from exc
        return _replay(replay, request_hash)
    db.refresh(order)
    return CreateOrderResult(order=order, created=True)


def list_open_orders(
    db: Session, actor: Identity, *, limit: int, offset: int
) -> tuple[list[Order], int]:
    """Open errands other people can accept. Pending credit stays hidden."""

    filters = (Order.status == "OPEN", Order.requester_id != actor.id)
    return _page(db, filters, limit=limit, offset=offset)


def list_my_orders(
    db: Session,
    actor: Identity,
    *,
    role: str,
    statuses: list[str] | None = None,
    limit: int,
    offset: int,
) -> tuple[list[Order], int]:
    """The caller's orders in one role, optionally limited to some statuses."""

    if role == "requester":
        filters = [Order.requester_id == actor.id]
    else:
        filters = [Order.courier_id == actor.id]
    if statuses:
        filters.append(Order.status.in_(statuses))
    return _page(db, tuple(filters), limit=limit, offset=offset)


def list_all_orders(
    db: Session, *, statuses: list[str] | None, limit: int, offset: int
) -> tuple[list[Order], int]:
    """Every order, newest first, optionally limited to some statuses.

    Only for administrators; the route enforces that.
    """

    filters = (Order.status.in_(statuses),) if statuses else ()
    return _page(db, filters, limit=limit, offset=offset)


ACTIVITY_BUCKET = timedelta(hours=1)


def order_activity(db: Session, *, hours: int) -> dict:
    """Count creations, acceptances and completions per hour.

    Buckets are rolling hours ending now, oldest first, so the last bucket is
    exactly the past hour. An order counts in each bucket where one of its
    timestamps falls, whatever its current status.
    """

    window_end = utc_now()
    window_start = window_end - ACTIVITY_BUCKET * hours
    counts = {
        name: [0] * hours for name in ("created", "accepted", "completed")
    }
    for name, column in (
        ("created", Order.created_at),
        ("accepted", Order.accepted_at),
        ("completed", Order.completed_at),
    ):
        for at in db.scalars(
            select(column).where(column >= window_start, column < window_end)
        ):
            index = int((_as_utc(at) - window_start) / ACTIVITY_BUCKET)
            counts[name][min(index, hours - 1)] += 1

    return {
        "window_start": window_start,
        "window_end": window_end,
        "bucket_minutes": int(ACTIVITY_BUCKET.total_seconds() // 60),
        "buckets": [
            {
                "start": window_start + ACTIVITY_BUCKET * i,
                "end": window_start + ACTIVITY_BUCKET * (i + 1),
                "created": counts["created"][i],
                "accepted": counts["accepted"][i],
                "completed": counts["completed"][i],
            }
            for i in range(hours)
        ],
    }


def _as_utc(value: datetime) -> datetime:
    """PostgreSQL returns aware timestamps; treat a naive one as UTC."""

    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def get_order(db: Session, order_id: UUID, actor: Identity) -> Order:
    order = db.get(Order, order_id)
    if order is None or not _can_view(order, actor):
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def change_delivery(
    db: Session, order_id: UUID, actor: Identity, delivery: DeliveryLocation
) -> Order:
    order = _lock_visible(db, order_id, actor)
    if order.requester_id != actor.id:
        raise HTTPException(
            status_code=403,
            detail="Only the requester can change the delivery destination",
        )
    if order.status not in DESTINATION_MUTABLE:
        _illegal(order, "change the destination of", actor.id)
    if not delivery_within_campus(delivery.latitude, delivery.longitude):
        raise HTTPException(status_code=422, detail="Delivery location is not supported")
    order.delivery_label = delivery.label
    order.delivery_latitude = delivery.latitude
    order.delivery_longitude = delivery.longitude
    order.delivery_details = delivery.details
    order.updated_at = utc_now()
    _commit(db)
    db.refresh(order)
    return order


def accept_order(db: Session, order_id: UUID, actor: Identity) -> Order:
    order = _lock(db, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if actor.id == order.requester_id:
        raise HTTPException(
            status_code=403, detail="The requester cannot accept their own order"
        )
    if order.status == "ACCEPTED" and order.courier_id == actor.id:
        return order
    # A competing courier already saw this errand in the open feed. 409 tells
    # them they lost, which a 404 would hide.
    if order.status == "ACCEPTED":
        _illegal(order, "accept", actor.id)
    if order.status != "OPEN":
        if not _can_view(order, actor):
            raise HTTPException(status_code=404, detail="Order not found")
        _illegal(order, "accept", actor.id)
    now = utc_now()
    order.status = "ACCEPTED"
    order.courier_id = actor.id
    order.accepted_at = now
    order.updated_at = now
    enqueue_event(
        db, event_type="order.accepted", order=order, correlation_id=order.correlation_id
    )
    _commit(db)
    db.refresh(order)
    return order


def pick_up_order(db: Session, order_id: UUID, actor: Identity) -> Order:
    order = _lock_visible(db, order_id, actor)
    if order.status == "PICKED_UP" and order.courier_id == actor.id:
        return order
    if order.courier_id != actor.id:
        raise HTTPException(
            status_code=403, detail="Only the assigned courier can pick up this order"
        )
    if order.status != "ACCEPTED":
        _illegal(order, "pick up", actor.id)
    now = utc_now()
    order.status = "PICKED_UP"
    order.picked_up_at = now
    order.updated_at = now
    enqueue_event(
        db, event_type="order.picked_up", order=order, correlation_id=order.correlation_id
    )
    _commit(db)
    db.refresh(order)
    return order


def complete_order(db: Session, order_id: UUID, actor: Identity) -> Order:
    order = _lock_visible(db, order_id, actor)
    if order.status == "COMPLETED" and order.requester_id == actor.id:
        return order
    if order.requester_id != actor.id:
        raise HTTPException(
            status_code=403, detail="Only the requester can complete this order"
        )
    if order.status != "PICKED_UP":
        _illegal(order, "complete", actor.id)
    now = utc_now()
    order.status = "COMPLETED"
    order.completed_at = now
    order.updated_at = now
    enqueue_event(
        db, event_type="order.completed", order=order, correlation_id=order.correlation_id
    )
    _commit(db)
    db.refresh(order)
    return order


def cancel_order(db: Session, order_id: UUID, actor: Identity) -> Order:
    order = _lock_visible(db, order_id, actor)
    if order.status == "CANCELLED" and order.cancelled_by == actor.id:
        return order
    if order.status in TERMINAL_STATUSES:
        _illegal(order, "cancel", actor.id)
    requester_may = (
        actor.id == order.requester_id and order.status in REQUESTER_CANCELLABLE
    )
    if not requester_may and actor.role != "admin":
        if actor.id == order.requester_id and order.status == "PICKED_UP":
            raise HTTPException(
                status_code=403,
                detail="An order can only be cancelled before it is picked up",
            )
        raise HTTPException(status_code=403, detail="You cannot cancel this order")
    previous_status = order.status
    now = utc_now()
    order.status = "CANCELLED"
    order.cancelled_at = now
    order.cancelled_by = actor.id
    order.updated_at = now
    enqueue_event(
        db,
        event_type="order.cancelled",
        order=order,
        correlation_id=order.correlation_id,
        extra={"cancelled_by": str(actor.id), "previous_status": previous_status},
    )
    _commit(db)
    db.refresh(order)
    return order


def apply_incoming(db: Session, event: IncomingEvent) -> None:
    """Apply one credit message. Repeated event ids do nothing."""

    if db.get(ProcessedEvent, event.event_id) is not None:
        return
    order = db.scalar(select(Order).where(Order.id == event.order_id).with_for_update())
    if order is not None:
        if event.event_type == "credit.reserved":
            _mark_open(db, order)
        elif event.event_type == "credit.reservation_failed":
            _mark_rejected(db, order, event.reason)
    db.add(ProcessedEvent(event_id=event.event_id, processed_at=utc_now()))


def expire_overdue_orders(db: Session) -> int:
    """Expire pending and open orders whose hour has passed. Returns how many changed."""

    statement = (
        select(Order)
        .where(Order.status.in_(EXPIRABLE), Order.expires_at <= utc_now())
        .order_by(Order.expires_at, Order.id)
        .limit(RELAY_BATCH_SIZE)
    )
    if db.get_bind().dialect.name == "postgresql":
        statement = statement.with_for_update(skip_locked=True)
    overdue = list(db.scalars(statement))
    for order in overdue:
        _mark_expired(db, order)
    if overdue:
        _commit(db)
    return len(overdue)


def handle_delivery(db: Session, body: bytes) -> None:
    """Parse and apply one message, committing the result."""

    event = parse_incoming(body)
    try:
        apply_incoming(db, event)
        _commit(db)
    except IntegrityError as exc:
        db.rollback()
        if not _is_duplicate_processed_event(exc):
            raise


def _is_duplicate_processed_event(exc: IntegrityError) -> bool:
    """True only when this event id was already recorded. Other constraint failures must retry."""

    orig = exc.orig
    constraint = getattr(getattr(orig, "diag", None), "constraint_name", None)
    if constraint == "processed_events_pkey":
        return True
    return "processed_events" in str(orig).lower() and "unique" in str(orig).lower()


def _mark_open(db: Session, order: Order) -> None:
    if order.status != "PENDING_CREDIT":
        return
    order.status = "OPEN"
    order.updated_at = utc_now()
    enqueue_event(
        db, event_type="order.opened", order=order, correlation_id=order.correlation_id
    )


def _mark_rejected(db: Session, order: Order, reason: str | None) -> None:
    if order.status != "PENDING_CREDIT":
        return
    order.status = "REJECTED"
    order.rejection_reason = (reason or "insufficient balance")[:500]
    order.updated_at = utc_now()
    enqueue_event(
        db,
        event_type="order.rejected",
        order=order,
        correlation_id=order.correlation_id,
        extra={"reason": order.rejection_reason},
    )


def _mark_expired(db: Session, order: Order) -> None:
    if order.status not in EXPIRABLE:
        return
    now = utc_now()
    order.status = "EXPIRED"
    order.expired_at = now
    order.updated_at = now
    enqueue_event(
        db, event_type="order.expired", order=order, correlation_id=order.correlation_id
    )


def _page(
    db: Session, filters: tuple, *, limit: int, offset: int
) -> tuple[list[Order], int]:
    total = db.scalar(select(func.count()).select_from(Order).where(*filters)) or 0
    items = list(
        db.scalars(
            select(Order)
            .where(*filters)
            .order_by(Order.created_at.desc(), Order.id.desc())
            .limit(limit)
            .offset(offset)
        )
    )
    return items, total


def _find_existing(db: Session, requester_id: UUID, idempotency_key: str) -> Order | None:
    try:
        return db.scalar(
            select(Order).where(
                Order.requester_id == requester_id,
                Order.idempotency_key == idempotency_key,
            )
        )
    except OperationalError:
        db.rollback()
        raise


def _replay(existing: Order, request_hash: str) -> CreateOrderResult:
    if existing.request_hash != request_hash:
        raise HTTPException(
            status_code=409, detail="Idempotency key reused with different request"
        )
    return CreateOrderResult(order=existing, created=False)


def _require_active_supplier(
    supplier_directory: SupplierServiceClient, supplier_id: UUID
) -> None:
    try:
        active = supplier_directory.is_active(supplier_id)
    except SupplierUnavailableError:
        raise HTTPException(
            status_code=503, detail="Pickup locations are temporarily unavailable"
        ) from None
    if not active:
        raise HTTPException(status_code=422, detail="Pickup location is not supported")


def _lock(db: Session, order_id: UUID) -> Order | None:
    return db.scalar(select(Order).where(Order.id == order_id).with_for_update())


def _lock_visible(db: Session, order_id: UUID, actor: Identity) -> Order:
    order = _lock(db, order_id)
    if order is None or not _can_view(order, actor):
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def _can_view(order: Order, actor: Identity) -> bool:
    return (
        actor.role == "admin"
        or actor.id == order.requester_id
        or actor.id == order.courier_id
    )


def _illegal(order: Order, action: str, actor_id: UUID | None = None) -> None:
    fields = {
        "order_id": str(order.id),
        "status": order.status,
        "action": action,
    }
    if actor_id is not None:
        fields["actor_user_id"] = str(actor_id)
    log_event(
        logger,
        logging.WARNING,
        "illegal_order_transition",
        **fields,
    )
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=f"Cannot {action} an order with status {order.status}",
    )


def _commit(db: Session) -> None:
    try:
        db.commit()
    except OperationalError:
        db.rollback()
        raise
