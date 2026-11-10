"""Requester-scoped, durable idempotency for order creation.

The preliminary lookup avoids contacting Supplier on a replay. The final lookup
runs under a transaction-scoped PostgreSQL advisory lock so concurrent requests
cannot create two orders before the key exists. A hash collision only serializes
unrelated requests; the stored composite key still determines identity.
"""

import hashlib
import json
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from orders.deadlines import init_window
from orders.models import ReserveCreditCommand
from orders.orm_models import (
    CreditStatus,
    ErrandRequest,
    OrderCreationKey,
    Status,
)
from orders.repository import add_credit_command, record_order_audit_log

class CreationConflict(ValueError):
    """The requester already used this key for different order contents."""


def _validate_key(idempotency_key: str) -> None:
    if not 1 <= len(idempotency_key) <= 128 or not idempotency_key.strip():
        raise ValueError("Idempotency-Key must contain 1 to 128 nonblank characters.")


def _fingerprint(
    supplier_id: UUID,
    items: list[dict],
    pickup_notes: str | None,
    credits: int,
) -> str:
    # Supplier's mutable snapshot deliberately is not part of client intent.
    payload = {
        "supplier_id": str(supplier_id),
        "items": items,
        "pickup_notes": pickup_notes,
        "credits": credits,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _lock_id(requester_id: UUID, idempotency_key: str) -> int:
    digest = hashlib.sha256(
        b"order-creation\0" + requester_id.bytes + idempotency_key.encode("utf-8")
    ).digest()
    return int.from_bytes(digest[:8], byteorder="big", signed=True)


async def lookup_creation(
    session: AsyncSession,
    requester_id: UUID,
    idempotency_key: str,
    supplier_id: UUID,
    items: list[dict],
    pickup_notes: str | None,
    credits: int,
) -> ErrandRequest | None:
    """Return the existing order, or reject reuse with changed client intent.

    Does not commit or acquire an advisory lock. Creation must always recheck
    this lookup under its lock even when this preliminary lookup found nothing.
    """
    _validate_key(idempotency_key)
    key = await session.get(OrderCreationKey, (requester_id, idempotency_key))
    if key is None:
        return None
    if key.request_fingerprint != _fingerprint(supplier_id, items, pickup_notes, credits):
        raise CreationConflict("Idempotency-Key was already used for a different order.")
    order = await session.get(ErrandRequest, key.order_id)
    if order is None:
        raise RuntimeError("Order creation key references a missing order")
    return order


async def create_order_idempotently(
    session: AsyncSession,
    requester_id: UUID,
    idempotency_key: str,
    supplier_id: UUID,
    supplier_snapshot: dict,
    items: list[dict],
    pickup_notes: str | None,
    credits: int,
) -> ErrandRequest:
    """Commit an order, its key, and its reserve command in one transaction."""
    _validate_key(idempotency_key)
    try:
        await session.execute(
            select(func.pg_advisory_xact_lock(_lock_id(requester_id, idempotency_key)))
        )
        existing = await lookup_creation(
            session, requester_id, idempotency_key, supplier_id, items, pickup_notes, credits
        )
        if existing is not None:
            await session.commit()
            await session.refresh(existing)
            return existing

        now = (await session.execute(select(func.clock_timestamp()))).scalar_one()
        order = ErrandRequest(
            id=uuid4(), requester_id=requester_id, supplier_id=supplier_id,
            supplier_snapshot=supplier_snapshot, items=items, pickup_notes=pickup_notes,
            credits=credits, status=Status.INIT, credit_status=CreditStatus.PENDING,
            courier_id=None, created_at=now, expires_at=now + init_window(), updated_at=now,
        )
        session.add(order)
        await session.flush()
        session.add(OrderCreationKey(
            requester_id=requester_id, idempotency_key=idempotency_key,
            order_id=order.id,
            request_fingerprint=_fingerprint(supplier_id, items, pickup_notes, credits),
        ))
        add_credit_command(session, ReserveCreditCommand(
            request_id=uuid4(), order_id=order.id, requester_id=requester_id, amount=credits,
        ))

        record_order_audit_log(session, order.id, Status.INIT, actor_id=requester_id)

        await session.commit()
        await session.refresh(order)
        return order
    except Exception:
        await session.rollback()
        raise
